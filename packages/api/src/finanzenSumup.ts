import { randomUUID } from 'node:crypto';
import { and, eq, gte, inArray, isNotNull, lte, max, sql } from 'drizzle-orm';
import {
  SUMUP_GUTHABEN_KONTO_ID,
  pruefeBuchung,
  planeSumupBuchung,
  sumupAuszahlungen,
  sumupGeschaeftstag,
  sumupGruppen,
  type SumupAuszahlung,
  type SumupAuszahlungDto,
  type SumupBuchenErgebnis,
  type SumupEvent,
  type SumupEventDto,
  type SumupGruppeDto,
  type SumupTransaktion,
  type SumupUebersichtDto,
} from '@c4/shared';
import type { Db } from './db/client';
import { sperreBeruehren } from './db/sperren';
import {
  events,
  finBuchungen,
  finBuchungszeilen,
  finSumupAuszahlungen,
  finSumupTransaktionen,
  finSumupZuordnungen,
} from './db/schema';
import { BuchungUngueltig, type GebuchtErgebnis, type Q } from './finanzen';
import type { BelegeKern } from './finanzenBelege';
import type { SumupAuszahlungRoh, SumupTransaktionRoh } from './sumup';
import type { Tx } from './waren';

/** At least one transaction is booked already. */
export class SumupKonflikt extends Error {}
/** A transaction does not exist. */
export class SumupUnbekannt extends Error {}

export interface SumupStand {
  /** Newest transaction (ISO instant) and newest payout date; null when none stored. */
  zeitpunkt: string | null;
  datum: string | null;
  /** Last fetch (ISO instant). */
  abgerufenAm: string | null;
}

export interface SumupBuchenAuftrag {
  transaktionIds: string[];
  eventId: string | null;
  idempotenzSchluessel: string;
  erstelltVon: string;
}

/** SumUp part of `FinanzenStore` (docs/finanzen.md („SumUp“)). */
export interface SumupStore {
  /** Stores new rows (existing ids are left alone); returns how many were new. */
  sumupSpeichern(
    transaktionen: readonly SumupTransaktionRoh[],
    auszahlungen: readonly SumupAuszahlungRoh[],
  ): Promise<{ transaktionenNeu: number; auszahlungenNeu: number }>;
  sumupStand(): Promise<SumupStand>;
  sumupUebersicht(): Promise<SumupUebersichtDto>;
  /** Payouts not yet matched to a bank transaction (slice 6); currently all. */
  offeneSumupAuszahlungen(): Promise<SumupAuszahlung[]>;
  /** Books the transactions as one group. Throws SumupUnbekannt, SumupKonflikt, BuchungUngueltig. */
  sumupBuchen(auftrag: SumupBuchenAuftrag): Promise<SumupBuchenErgebnis>;
}

export type SumupKern = Pick<BelegeKern, 'einfuegen' | 'kontenMitBestand' | 'wiederholen'> & {
  vorhandene(q: Q, schluessel: string): Promise<GebuchtErgebnis | undefined>;
};

/** Event window of the overview: events around the open transactions. */
export const sumupEventFenster = (
  zeitpunkte: readonly string[],
): { von: Date; bis: Date } | null => {
  if (zeitpunkte.length === 0) return null;
  const sortiert = [...zeitpunkte].sort();
  return {
    von: new Date(Date.parse(sortiert[0]!) - 86_400_000),
    bis: new Date(Date.parse(sortiert[sortiert.length - 1]!) + 86_400_000),
  };
};

/** Pure: transactions without an active (not reversed) booking. */
export const offeneTransaktionen = <T extends { id: string }>(
  alle: readonly T[],
  gebuchteIds: ReadonlySet<string>,
): T[] => alle.filter((t) => !gebuchteIds.has(t.id));

export const sumupEventDtos = (
  liste: readonly {
    id: string;
    titel: string | null;
    beginn: string;
    ende: string;
    abgesagt: boolean;
  }[],
): SumupEventDto[] =>
  liste
    .map((e) => ({
      id: e.id,
      titel: e.titel?.trim() || null,
      beginn: e.beginn,
      ende: e.ende,
      abgesagt: e.abgesagt,
    }))
    .sort((a, b) => a.beginn.localeCompare(b.beginn));

/** Groups with the title and start of the suggested event. */
export const sumupGruppenDtos = (
  transaktionen: readonly SumupTransaktion[],
  eventListe: readonly SumupEventDto[],
): SumupGruppeDto[] => {
  const ev: readonly SumupEvent[] = eventListe;
  const nachId = new Map(eventListe.map((e) => [e.id, e]));
  return sumupGruppen(transaktionen, ev).map((g) => ({
    ...g,
    eventTitel: g.eventId ? (nachId.get(g.eventId)?.titel ?? null) : null,
    eventBeginn: g.eventId ? (nachId.get(g.eventId)?.beginn ?? null) : null,
  }));
};

export const sumupAuszahlungDtos = (
  zeilen: Parameters<typeof sumupAuszahlungen>[0],
): SumupAuszahlungDto[] =>
  // Slice 6 (bank matching) adds the status 'zugeordnet' for payouts that are matched already.
  sumupAuszahlungen(zeilen).map((a) => ({ ...a, status: 'offen' as const }));

/** The event must exist and not be cancelled; returns what the booking needs from it. */
export const sumupEventPruefen = (
  event: { titel: string | null; beginn: string; abgesagt: boolean } | undefined,
): string[] => {
  if (!event) return ['Die Veranstaltung gibt es nicht.'];
  if (event.abgesagt) return ['Die Veranstaltung ist abgesagt.'];
  return [];
};

const CHUNK = 100;
const stuecke = <T>(liste: readonly T[], n = CHUNK): T[][] => {
  const r: T[][] = [];
  for (let i = 0; i < liste.length; i += n) r.push(liste.slice(i, i + n));
  return r;
};

export function createSumupStore(db: Db, kern: SumupKern): SumupStore {
  /** Ids of transactions with an active booking (a reversed booking does not count). */
  const gebuchteIds = async (q: Q, ids?: readonly string[]): Promise<Set<string>> => {
    const zuordnungen =
      ids && ids.length > 0
        ? (
            await Promise.all(
              stuecke(ids, 500).map((teil) =>
                q
                  .select({
                    transaktionId: finSumupZuordnungen.transaktionId,
                    buchungId: finSumupZuordnungen.buchungId,
                  })
                  .from(finSumupZuordnungen)
                  .where(inArray(finSumupZuordnungen.transaktionId, teil)),
              ),
            )
          ).flat()
        : await q
            .select({
              transaktionId: finSumupZuordnungen.transaktionId,
              buchungId: finSumupZuordnungen.buchungId,
            })
            .from(finSumupZuordnungen);
    if (zuordnungen.length === 0) return new Set();
    const stornos = await q
      .select({ stornoVon: finBuchungen.stornoVon })
      .from(finBuchungen)
      .where(isNotNull(finBuchungen.stornoVon));
    const storniert = new Set(stornos.map((s) => s.stornoVon));
    return new Set(
      zuordnungen.filter((z) => !storniert.has(z.buchungId)).map((z) => z.transaktionId),
    );
  };

  const alsTransaktion = (r: {
    id: string;
    transactionCode: string;
    zeitpunkt: Date;
    betragCent: number;
    typ: string;
    status: string;
    trinkgeldCent: number;
    sumupBenutzer: string | null;
  }): SumupTransaktion => ({ ...r, zeitpunkt: r.zeitpunkt.toISOString() });

  const transaktionSpalten = {
    id: finSumupTransaktionen.id,
    transactionCode: finSumupTransaktionen.transactionCode,
    zeitpunkt: finSumupTransaktionen.zeitpunkt,
    betragCent: finSumupTransaktionen.betragCent,
    typ: finSumupTransaktionen.typ,
    status: finSumupTransaktionen.status,
    trinkgeldCent: finSumupTransaktionen.trinkgeldCent,
    sumupBenutzer: finSumupTransaktionen.sumupBenutzer,
  };

  const auszahlungSpalten = {
    id: finSumupAuszahlungen.id,
    datum: finSumupAuszahlungen.datum,
    typ: finSumupAuszahlungen.typ,
    betragCent: finSumupAuszahlungen.betragCent,
    gebuehrCent: finSumupAuszahlungen.gebuehrCent,
    transactionCode: finSumupAuszahlungen.transactionCode,
    referenz: finSumupAuszahlungen.referenz,
    status: finSumupAuszahlungen.status,
  };

  const auszahlungZeilen = (q: Q) =>
    q.select(auszahlungSpalten).from(finSumupAuszahlungen).orderBy(finSumupAuszahlungen.datum);

  const sumupStand = async (): Promise<SumupStand> => {
    const [[t], [a]] = await Promise.all([
      db
        .select({
          zeitpunkt: max(finSumupTransaktionen.zeitpunkt),
          abgerufen: max(finSumupTransaktionen.abgerufenAm),
        })
        .from(finSumupTransaktionen),
      db
        .select({
          datum: max(finSumupAuszahlungen.datum),
          abgerufen: max(finSumupAuszahlungen.abgerufenAm),
        })
        .from(finSumupAuszahlungen),
    ]);
    const abgerufen = [t?.abgerufen, a?.abgerufen].filter((d): d is Date => !!d);
    const spaetester = abgerufen.sort((x, y) => y.getTime() - x.getTime())[0];
    return {
      zeitpunkt: t?.zeitpunkt ? new Date(t.zeitpunkt).toISOString() : null,
      datum: a?.datum ?? null,
      abgerufenAm: spaetester ? spaetester.toISOString() : null,
    };
  };

  return {
    async sumupSpeichern(transaktionen, auszahlungen) {
      let transaktionenNeu = 0;
      let auszahlungenNeu = 0;
      for (const teil of stuecke(transaktionen)) {
        const neu = await db
          .insert(finSumupTransaktionen)
          .values(teil.map((t) => ({ ...t, zeitpunkt: new Date(t.zeitpunkt) })))
          .onConflictDoNothing({ target: finSumupTransaktionen.id })
          .returning({ id: finSumupTransaktionen.id });
        transaktionenNeu += neu.length;
      }
      for (const teil of stuecke(auszahlungen)) {
        const neu = await db
          .insert(finSumupAuszahlungen)
          .values(teil.map((a) => ({ ...a })))
          .onConflictDoNothing({ target: finSumupAuszahlungen.id })
          .returning({ id: finSumupAuszahlungen.id });
        auszahlungenNeu += neu.length;
      }
      return { transaktionenNeu, auszahlungenNeu };
    },

    sumupStand,

    async sumupUebersicht() {
      const [alle, gebucht, zeilen, stand, [saldo]] = await Promise.all([
        db
          .select(transaktionSpalten)
          .from(finSumupTransaktionen)
          .orderBy(finSumupTransaktionen.zeitpunkt),
        gebuchteIds(db),
        auszahlungZeilen(db),
        sumupStand(),
        db
          .select({ summe: sql<string>`coalesce(sum(${finBuchungszeilen.betragCent}), 0)` })
          .from(finBuchungszeilen)
          .where(eq(finBuchungszeilen.kontoId, SUMUP_GUTHABEN_KONTO_ID)),
      ]);
      const offen = offeneTransaktionen(alle, gebucht).map(alsTransaktion);
      const fenster = sumupEventFenster(offen.map((t) => t.zeitpunkt));
      const eventRows = fenster
        ? await db
            .select({
              id: events.id,
              titel: events.titel,
              beginn: events.beginn,
              ende: events.ende,
              abgesagt: events.abgesagt,
            })
            .from(events)
            .where(and(lte(events.beginn, fenster.bis), gte(events.ende, fenster.von)))
        : [];
      const eventListe = sumupEventDtos(
        eventRows.map((e) => ({
          ...e,
          beginn: e.beginn.toISOString(),
          ende: e.ende.toISOString(),
        })),
      );
      return {
        gruppen: sumupGruppenDtos(offen, eventListe),
        events: eventListe,
        auszahlungen: sumupAuszahlungDtos(zeilen),
        letzterAbrufAm: stand.abgerufenAm,
        saldoCent: Number(saldo?.summe ?? 0),
      };
    },

    async offeneSumupAuszahlungen() {
      // Slice 6 filters out the payouts that are matched to a bank transaction already.
      return sumupAuszahlungen(await auszahlungZeilen(db));
    },

    sumupBuchen(auftrag) {
      const ids = [...new Set(auftrag.transaktionIds)].sort();
      return kern.wiederholen(() =>
        db.transaction(async (tx: Tx) => {
          const schon = await kern.vorhandene(tx, auftrag.idempotenzSchluessel);
          if (schon) {
            const [b] = await tx
              .select({ datum: finBuchungen.datum })
              .from(finBuchungen)
              .where(eq(finBuchungen.id, schon.id));
            return { id: schon.id, seq: schon.seq, datum: b?.datum ?? '', wiederholt: true };
          }
          // DSQL has no row locks: touching one key per transaction makes parallel bookings conflict.
          await sperreBeruehren(tx, ...ids.map((i) => `sumup:${i}`));
          const rows = (
            await Promise.all(
              stuecke(ids, 500).map((teil) =>
                tx
                  .select(transaktionSpalten)
                  .from(finSumupTransaktionen)
                  .where(inArray(finSumupTransaktionen.id, teil)),
              ),
            )
          ).flat();
          if (rows.length !== ids.length)
            throw new SumupUnbekannt('Mindestens eine Zahlung gibt es nicht.');
          if ((await gebuchteIds(tx, ids)).size > 0)
            throw new SumupKonflikt('Mindestens eine Zahlung ist schon gebucht.');
          let event: { titel: string | null; beginn: string; abgesagt: boolean } | undefined;
          if (auftrag.eventId) {
            const [e] = await tx
              .select({ titel: events.titel, beginn: events.beginn, abgesagt: events.abgesagt })
              .from(events)
              .where(eq(events.id, auftrag.eventId));
            event = e && { ...e, beginn: e.beginn.toISOString() };
            const eventFehler = sumupEventPruefen(event);
            if (eventFehler.length > 0) throw new BuchungUngueltig(eventFehler);
          }
          const transaktionen = rows.map(alsTransaktion).sort((a, b) => a.id.localeCompare(b.id));
          const plan = sumupBuchungPlan(transaktionen, auftrag.eventId, event);
          const { pruef } = await kern.kontenMitBestand(tx, [
            ...new Set(plan.zeilen.map((z) => z.kontoId)),
          ]);
          const fehler = pruefeBuchung({ zeilen: plan.zeilen }, pruef);
          if (fehler.length > 0) throw new BuchungUngueltig(fehler);
          const gebucht = await kern.einfuegen(tx, {
            datum: plan.datum,
            text: plan.text,
            quelleTyp: 'sumup',
            quelleId: transaktionen[0]!.id,
            eventId: plan.eventId,
            stornoVon: null,
            erstelltVon: auftrag.erstelltVon,
            idempotenzSchluessel: auftrag.idempotenzSchluessel,
            datumVerschiebbar: true,
            zeilen: plan.zeilen,
          });
          const jetzt = new Date();
          await tx.insert(finSumupZuordnungen).values(
            transaktionen.map((t) => ({
              id: randomUUID(),
              transaktionId: t.id,
              buchungId: gebucht.id,
              erstelltAm: jetzt,
            })),
          );
          return { id: gebucht.id, seq: gebucht.seq, datum: gebucht.datum ?? plan.datum };
        }),
      );
    },
  };
}

/** Pure: the booking plan of the chosen transactions. Throws BuchungUngueltig for a sum of 0. */
export function sumupBuchungPlan(
  transaktionen: readonly SumupTransaktion[],
  eventId: string | null,
  event: { titel: string | null; beginn: string } | undefined,
) {
  const summeCent = transaktionen.reduce((s, t) => s + t.betragCent, 0);
  if (summeCent === 0)
    throw new BuchungUngueltig(['Die Summe ist 0 und kann nicht gebucht werden.']);
  const fruehester = [...transaktionen].sort((a, b) => a.zeitpunkt.localeCompare(b.zeitpunkt))[0]!;
  const geschaeftstag = sumupGeschaeftstag(event ? event.beginn : fruehester.zeitpunkt);
  return planeSumupBuchung({ geschaeftstag, summeCent }, eventId, event?.titel);
}
