import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, notInArray } from 'drizzle-orm';
import {
  erinnerungenKodieren,
  erinnerungenLesen,
  teilnahmeKreisKodieren,
  teilnahmeKreisLesen,
  type OptionTermin,
  type Stimme,
  type UmfrageErgebnisse,
  type UmfrageKreis,
  type UmfrageTermin,
} from '@c4/shared';
import type { Db } from './db/client';
import {
  umfrageAbgaben,
  umfrageFragen,
  umfrageKreis,
  umfrageOptionen,
  umfrageOptionTermine,
  umfragen,
  umfrageStimmen,
  umfrageTermine,
  type UmfrageRow,
} from './db/schema';

// Polls (see docs/umfragen.md). Votes are stored with the member's sub so that everybody votes once
// and gets reminders; for anonymous polls the API never hands the subs out.

export interface UmfrageFrage {
  id: string;
  text: string;
  freitext: boolean;
  maxAntworten: number | null;
  /** `termin` is the date of the answer in scheduling polls, else null. */
  optionen: { id: string; text: string; termin: OptionTermin | null }[];
}

/** What is stored when creating or editing; all questions and options carry their (new) ids. */
export interface UmfrageSpeichern {
  titel: string;
  beschreibung: string | null;
  endetAm: string;
  anonym: boolean;
  ergebnisse: UmfrageErgebnisse;
  pflicht: UmfrageKreis;
  optional: UmfrageKreis;
  erinnerungenPflicht: number[];
  erinnerungenOptional: number[];
  fragen: UmfrageFrage[];
  /** Scheduling polls only. */
  termin: UmfrageTermin | null;
  /** Scheduling without an event: free-text dates, "an keinem der Termine" allowed. */
  terminFrei: boolean;
}

export interface Abgabe {
  sub: string;
  abgegebenAm: Date;
  erneutNoetig: boolean;
}

export interface UmfrageDaten extends UmfrageSpeichern {
  id: string;
  erstellerSub: string;
  erstelltAm: Date;
  beendetAm: Date | null;
  abgaben: Abgabe[];
  /** The event created from a scheduling poll, and the answer it was created for. */
  eventId: string | null;
  eventOptionId: string | null;
}

export interface UmfrageDetails extends UmfrageDaten {
  stimmen: Stimme[];
}

export interface UmfragenStore {
  /** All polls with their questions and who voted (without the answers), newest first. */
  alle(): Promise<UmfrageDaten[]>;
  holen(id: string): Promise<UmfrageDetails | undefined>;
  anlegen(daten: UmfrageSpeichern, ersteller: string): Promise<string>;
  /**
   * Replaces data, circles, questions and options; first deletes the answers in `loeschen`, then
   * marks the votes of `erneut` as to be repeated. False when the poll does not exist.
   */
  aktualisieren(
    id: string,
    daten: UmfrageSpeichern,
    aenderung: { loeschen: readonly string[]; erneut: readonly string[] },
  ): Promise<boolean>;
  beenden(id: string, zeitpunkt: Date): Promise<boolean>;
  loeschen(id: string): Promise<boolean>;
  /** Records the event created from the chosen date. False when the poll has no scheduling settings. */
  eventSetzen(id: string, eventId: string, optionId: string): Promise<boolean>;
  /** Replaces the member's answers and records a valid vote. */
  abstimmen(
    id: string,
    sub: string,
    antworten: readonly { frageId: string; optionId: string | null; freitext: string | null }[],
  ): Promise<void>;
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const kreisZeilen = (umfrageId: string, kreis: UmfrageKreis, pflicht: boolean) => [
  ...kreis.posten.map((ref) => ({ umfrageId, pflicht, art: 'posten' as const, ref })),
  ...kreis.personen.map((ref) => ({ umfrageId, pflicht, art: 'person' as const, ref })),
];

const zeileSpalten = (d: UmfrageSpeichern) => ({
  titel: d.titel,
  beschreibung: d.beschreibung,
  endetAm: d.endetAm,
  anonym: d.anonym,
  ergebnisse: d.ergebnisse,
  pflichtStatus: teilnahmeKreisKodieren(d.pflicht.status) ?? '',
  optionalStatus: teilnahmeKreisKodieren(d.optional.status) ?? '',
  erinnerungenPflicht: erinnerungenKodieren(d.erinnerungenPflicht),
  erinnerungenOptional: erinnerungenKodieren(d.erinnerungenOptional),
  terminFrei: d.terminFrei,
});

/** Writes circles, questions and options; existing ids are updated, new ones inserted. */
async function inhaltSchreiben(tx: Tx, id: string, d: UmfrageSpeichern) {
  await tx.delete(umfrageKreis).where(eq(umfrageKreis.umfrageId, id));
  const kreis = [...kreisZeilen(id, d.pflicht, true), ...kreisZeilen(id, d.optional, false)];
  if (kreis.length > 0) await tx.insert(umfrageKreis).values(kreis);

  for (const [position, f] of d.fragen.entries()) {
    await tx
      .insert(umfrageFragen)
      .values({
        id: f.id,
        umfrageId: id,
        position,
        text: f.text,
        freitext: f.freitext,
        maxAntworten: f.maxAntworten,
      })
      .onConflictDoUpdate({
        target: umfrageFragen.id,
        set: { position, text: f.text, freitext: f.freitext, maxAntworten: f.maxAntworten },
      });
    for (const [opos, o] of f.optionen.entries()) {
      await tx
        .insert(umfrageOptionen)
        .values({ id: o.id, frageId: f.id, position: opos, text: o.text })
        .onConflictDoUpdate({ target: umfrageOptionen.id, set: { position: opos, text: o.text } });
      await tx.delete(umfrageOptionTermine).where(eq(umfrageOptionTermine.optionId, o.id));
      if (o.termin) await tx.insert(umfrageOptionTermine).values({ optionId: o.id, ...o.termin });
    }
  }

  if (!d.termin) {
    await tx.delete(umfrageTermine).where(eq(umfrageTermine.umfrageId, id));
    return;
  }
  // The created event stays attached when the settings change.
  const termin = {
    kategorieId: d.termin.kategorieId,
    vorlageId: d.termin.vorlageId,
    jeTermin: d.termin.jeTermin,
    beginn: d.termin.beginn,
    ende: d.termin.ende,
    dienstformId: d.termin.bedarf?.dienstformId ?? null,
    minimum: d.termin.bedarf?.minimum ?? null,
    wunsch: d.termin.bedarf?.wunsch ?? null,
  };
  await tx
    .insert(umfrageTermine)
    .values({ umfrageId: id, ...termin })
    .onConflictDoUpdate({ target: umfrageTermine.umfrageId, set: termin });
}

/** Deletes options together with their dates. */
async function optionenLoeschen(tx: Tx, ids: readonly string[]) {
  if (ids.length === 0) return;
  await tx.delete(umfrageOptionTermine).where(inArray(umfrageOptionTermine.optionId, [...ids]));
  await tx.delete(umfrageOptionen).where(inArray(umfrageOptionen.id, [...ids]));
}

type TerminRow = typeof umfrageTermine.$inferSelect;

const terminAus = (t: TerminRow | undefined): UmfrageTermin | null =>
  t
    ? {
        kategorieId: t.kategorieId,
        vorlageId: t.vorlageId,
        jeTermin: t.jeTermin,
        beginn: t.beginn,
        ende: t.ende,
        bedarf:
          t.dienstformId !== null && t.minimum !== null && t.wunsch !== null
            ? { dienstformId: t.dienstformId, minimum: t.minimum, wunsch: t.wunsch }
            : null,
      }
    : null;

function alsDaten(
  row: UmfrageRow,
  kreis: { pflicht: boolean; art: 'posten' | 'person'; ref: string }[],
  fragen: UmfrageFrage[],
  abgaben: Abgabe[],
  termin: TerminRow | undefined,
): UmfrageDaten {
  const kreisVon = (pflicht: boolean, status: string): UmfrageKreis => ({
    status: teilnahmeKreisLesen(status) ?? [],
    posten: kreis.filter((k) => k.pflicht === pflicht && k.art === 'posten').map((k) => k.ref),
    personen: kreis.filter((k) => k.pflicht === pflicht && k.art === 'person').map((k) => k.ref),
  });
  return {
    id: row.id,
    titel: row.titel,
    beschreibung: row.beschreibung,
    erstellerSub: row.erstellerSub,
    erstelltAm: row.erstelltAm,
    endetAm: row.endetAm,
    beendetAm: row.beendetAm,
    anonym: row.anonym,
    ergebnisse: row.ergebnisse,
    pflicht: kreisVon(true, row.pflichtStatus),
    optional: kreisVon(false, row.optionalStatus),
    erinnerungenPflicht: erinnerungenLesen(row.erinnerungenPflicht),
    erinnerungenOptional: erinnerungenLesen(row.erinnerungenOptional),
    fragen,
    abgaben,
    termin: terminAus(termin),
    terminFrei: row.terminFrei ?? false,
    eventId: termin?.eventId ?? null,
    eventOptionId: termin?.optionId ?? null,
  };
}

export function createUmfragenStore(db: Db): UmfragenStore {
  /** Loads everything that belongs to the given poll rows. */
  async function vervollstaendigen(rows: UmfrageRow[]): Promise<UmfrageDaten[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [kreis, fragen, abgaben, termine] = await Promise.all([
      db.select().from(umfrageKreis).where(inArray(umfrageKreis.umfrageId, ids)),
      db
        .select()
        .from(umfrageFragen)
        .where(inArray(umfrageFragen.umfrageId, ids))
        .orderBy(asc(umfrageFragen.position)),
      db.select().from(umfrageAbgaben).where(inArray(umfrageAbgaben.umfrageId, ids)),
      db.select().from(umfrageTermine).where(inArray(umfrageTermine.umfrageId, ids)),
    ]);
    const optionen =
      fragen.length === 0
        ? []
        : await db
            .select()
            .from(umfrageOptionen)
            .where(
              inArray(
                umfrageOptionen.frageId,
                fragen.map((f) => f.id),
              ),
            )
            .orderBy(asc(umfrageOptionen.position));
    const optionTermine =
      optionen.length === 0 || (termine.length === 0 && !rows.some((r) => r.terminFrei))
        ? []
        : await db
            .select()
            .from(umfrageOptionTermine)
            .where(
              inArray(
                umfrageOptionTermine.optionId,
                optionen.map((o) => o.id),
              ),
            );
    const terminVon = new Map(optionTermine.map((t) => [t.optionId, t]));
    return rows.map((r) =>
      alsDaten(
        r,
        kreis.filter((k) => k.umfrageId === r.id),
        fragen
          .filter((f) => f.umfrageId === r.id)
          .map((f) => ({
            id: f.id,
            text: f.text,
            freitext: f.freitext,
            maxAntworten: f.maxAntworten,
            optionen: optionen
              .filter((o) => o.frageId === f.id)
              .map((o) => {
                const t = terminVon.get(o.id);
                return {
                  id: o.id,
                  text: o.text,
                  termin: t
                    ? { datum: t.datum, bis: t.bis, beginn: t.beginn, ende: t.ende, name: t.name }
                    : null,
                };
              }),
          })),
        abgaben
          .filter((a) => a.umfrageId === r.id)
          .map((a) => ({
            sub: a.mitgliedSub,
            abgegebenAm: a.abgegebenAm,
            erneutNoetig: a.erneutNoetig,
          })),
        termine.find((t) => t.umfrageId === r.id),
      ),
    );
  }

  return {
    async alle() {
      const rows = await db.select().from(umfragen);
      const daten = await vervollstaendigen(rows);
      return daten.sort((a, b) => b.erstelltAm.getTime() - a.erstelltAm.getTime());
    },

    async holen(id) {
      const [row] = await db.select().from(umfragen).where(eq(umfragen.id, id));
      if (!row) return undefined;
      const [[daten], stimmen] = await Promise.all([
        vervollstaendigen([row]),
        db.select().from(umfrageStimmen).where(eq(umfrageStimmen.umfrageId, id)),
      ]);
      return {
        ...daten!,
        stimmen: stimmen.map((s) => ({
          id: s.id,
          frageId: s.frageId,
          sub: s.mitgliedSub,
          optionId: s.optionId,
          freitext: s.freitext,
        })),
      };
    },

    async anlegen(daten, ersteller) {
      const id = randomUUID();
      await db.transaction(async (tx) => {
        await tx.insert(umfragen).values({ id, erstellerSub: ersteller, ...zeileSpalten(daten) });
        await inhaltSchreiben(tx, id, daten);
      });
      return id;
    },

    async aktualisieren(id, daten, aenderung) {
      return db.transaction(async (tx) => {
        const rows = await tx
          .update(umfragen)
          .set(zeileSpalten(daten))
          .where(eq(umfragen.id, id))
          .returning({ id: umfragen.id });
        if (rows.length === 0) return false;
        if (aenderung.loeschen.length > 0) {
          await tx
            .delete(umfrageStimmen)
            .where(
              and(
                eq(umfrageStimmen.umfrageId, id),
                inArray(umfrageStimmen.id, [...aenderung.loeschen]),
              ),
            );
        }
        const fragenIds = daten.fragen.map((f) => f.id);
        const alteFragen = await tx
          .select({ id: umfrageFragen.id })
          .from(umfrageFragen)
          .where(eq(umfrageFragen.umfrageId, id));
        const optionIds = daten.fragen.flatMap((f) => f.optionen.map((o) => o.id));
        if (alteFragen.length > 0) {
          const alteIds = alteFragen.map((f) => f.id);
          const weggefallen = await tx
            .select({ id: umfrageOptionen.id })
            .from(umfrageOptionen)
            .where(
              and(
                inArray(umfrageOptionen.frageId, alteIds),
                optionIds.length > 0 ? notInArray(umfrageOptionen.id, optionIds) : undefined,
              ),
            );
          await optionenLoeschen(
            tx,
            weggefallen.map((o) => o.id),
          );
          const weg = alteIds.filter((f) => !fragenIds.includes(f));
          if (weg.length > 0) await tx.delete(umfrageFragen).where(inArray(umfrageFragen.id, weg));
        }
        await inhaltSchreiben(tx, id, daten);
        if (aenderung.erneut.length > 0) {
          await tx
            .update(umfrageAbgaben)
            .set({ erneutNoetig: true })
            .where(
              and(
                eq(umfrageAbgaben.umfrageId, id),
                inArray(umfrageAbgaben.mitgliedSub, [...aenderung.erneut]),
              ),
            );
        }
        return true;
      });
    },

    async beenden(id, zeitpunkt) {
      const rows = await db
        .update(umfragen)
        .set({ beendetAm: zeitpunkt })
        .where(eq(umfragen.id, id))
        .returning({ id: umfragen.id });
      return rows.length > 0;
    },

    async loeschen(id) {
      return db.transaction(async (tx) => {
        const fragen = await tx
          .select({ id: umfrageFragen.id })
          .from(umfrageFragen)
          .where(eq(umfrageFragen.umfrageId, id));
        await tx.delete(umfrageStimmen).where(eq(umfrageStimmen.umfrageId, id));
        await tx.delete(umfrageAbgaben).where(eq(umfrageAbgaben.umfrageId, id));
        if (fragen.length > 0) {
          const optionen = await tx
            .select({ id: umfrageOptionen.id })
            .from(umfrageOptionen)
            .where(
              inArray(
                umfrageOptionen.frageId,
                fragen.map((f) => f.id),
              ),
            );
          await optionenLoeschen(
            tx,
            optionen.map((o) => o.id),
          );
        }
        await tx.delete(umfrageFragen).where(eq(umfrageFragen.umfrageId, id));
        await tx.delete(umfrageKreis).where(eq(umfrageKreis.umfrageId, id));
        await tx.delete(umfrageTermine).where(eq(umfrageTermine.umfrageId, id));
        const rows = await tx
          .delete(umfragen)
          .where(eq(umfragen.id, id))
          .returning({ id: umfragen.id });
        return rows.length > 0;
      });
    },

    async eventSetzen(id, eventId, optionId) {
      const rows = await db
        .update(umfrageTermine)
        .set({ eventId, optionId })
        .where(eq(umfrageTermine.umfrageId, id))
        .returning({ id: umfrageTermine.umfrageId });
      return rows.length > 0;
    },

    async abstimmen(id, sub, antworten) {
      await db.transaction(async (tx) => {
        await tx
          .delete(umfrageStimmen)
          .where(and(eq(umfrageStimmen.umfrageId, id), eq(umfrageStimmen.mitgliedSub, sub)));
        if (antworten.length > 0) {
          await tx.insert(umfrageStimmen).values(
            antworten.map((a) => ({
              id: randomUUID(),
              umfrageId: id,
              frageId: a.frageId,
              mitgliedSub: sub,
              optionId: a.optionId,
              freitext: a.freitext,
            })),
          );
        }
        const abgegebenAm = new Date();
        await tx
          .insert(umfrageAbgaben)
          .values({ umfrageId: id, mitgliedSub: sub, abgegebenAm, erneutNoetig: false })
          .onConflictDoUpdate({
            target: [umfrageAbgaben.umfrageId, umfrageAbgaben.mitgliedSub],
            set: { abgegebenAm, erneutNoetig: false },
          });
      });
    },
  };
}
