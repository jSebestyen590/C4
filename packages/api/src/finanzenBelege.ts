import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNotNull, sql, type SQL } from 'drizzle-orm';
import {
  AUSLAGEN_KONTO_ID,
  BELEG_BETRAG_WARNUNG_CENT,
  belegBerechnen,
  belegBuchungstext,
  belegBuchungszeilen,
  belegEntwurfDatenSchema,
  belegNummer,
  belegPruefen,
  erstattungBuchungstext,
  erstattungBuchungszeilen,
  formatEuro,
  offeneAuslagen,
  pruefeBestand,
  pruefeBuchung,
  saldoWarnungen,
  type AuslageBelegEintrag,
  type AuslageMitgliedEintrag,
  type BelegBuchen,
  type BelegDateiInfo,
  type BelegDetailEintrag,
  type BelegEntwurfDaten,
  type BelegEntwurfEintrag,
  type BelegeAbfrage,
  type BelegGebuchtDto,
  type BelegListeEintrag,
  type BelegStatus,
  type BelegWarnungDto,
  type BelegZeile,
  type BestandKonto,
  type ErstattungEingabe,
  type ErstattungErgebnisDto,
  type KontoArt,
  type PruefKonto,
  type RechnungsstellerDto,
} from '@c4/shared';
import type { Db } from './db/client';
import {
  finBelege,
  finBelegEntwuerfe,
  finBelegKorrekturen,
  finBelegposten,
  finBuchungen,
  finErstattungBelege,
  finErstattungen,
  finKonten,
  finRechnungssteller,
  finZaehler,
  type FinBelegRow,
  type FinKontoRow,
} from './db/schema';
import { sperreBeruehren } from './db/sperren';
import {
  BuchungUngueltig,
  zaehlungKontoFehler,
  type BuchungsEntwurf,
  type GebuchtErgebnis,
} from './finanzen';
import type { Tx } from './waren';

// Finanzen Belege (see docs/finanzen.md): drafts, booking a Beleg and the Sammelerstattung of
// Auslagen. The planning (validation, journal lines, warnings) is pure and shared with the fake.

/** Booking was refused because warnings have not been confirmed; `warnungen` are the open ones. */
export class BelegWarnungenOffen extends Error {
  constructor(readonly warnungen: BelegWarnungDto[]) {
    super('Bitte bestätige die Warnungen.');
  }
}

/** Date (`YYYY-MM-DD`) of an instant in Berlin. */
export const datumBerlin = (jetzt: Date): string =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(jetzt);

type Q = Pick<Db, 'select'>;

export interface BelegKonto extends PruefKonto {
  art: KontoArt;
}

export interface RechnungsstellerKurz {
  id: string;
  name: string;
  archiviert: boolean;
}

/** What the planning of a Beleg needs to know about the world. */
export interface BelegPlanKontext {
  konten: readonly BelegKonto[];
  bestand: readonly BestandKonto[];
  rechnungssteller: RechnungsstellerKurz | undefined;
}

export interface BelegPlan {
  fehler: string[];
  /** Set when `fehler` is empty. */
  buchung?: { zeilen: BelegZeile[]; summeCent: number; datum: string; rechnungssteller: string };
}

/** Accounts the planning needs: the Kategorien of the items, the Fach and the Gegenkonto. */
export const belegKontoIds = (daten: BelegEntwurfDaten): string[] => [
  ...new Set([
    ...daten.posten.flatMap((p) => (p.kategorieId ? [p.kategorieId] : [])),
    ...(daten.fachId ? [daten.fachId] : []),
    'bank',
    AUSLAGEN_KONTO_ID,
  ]),
];

/** Validates a draft against the accounts and builds the journal lines of the Beleg. */
export function planeBeleg(daten: BelegEntwurfDaten, kontext: BelegPlanKontext): BelegPlan {
  const fehler = belegPruefen(daten).map((f) => f.meldung);
  const steller = kontext.rechnungssteller;
  if (daten.rechnungsstellerId && !steller) fehler.push('Den Rechnungssteller gibt es nicht.');
  else if (steller?.archiviert)
    fehler.push(`Der Rechnungssteller „${steller.name}“ ist archiviert.`);
  const konten = new Map(kontext.konten.map((k) => [k.id, k]));
  for (const id of new Set(daten.posten.flatMap((p) => (p.kategorieId ? [p.kategorieId] : [])))) {
    const k = konten.get(id);
    if (!k) fehler.push('Eine Kategorie gibt es nicht.');
    else if (k.art !== 'aufwand') fehler.push(`„${k.name}“ ist keine Aufwandskategorie.`);
  }
  if (daten.zahlweg === 'bar' && daten.fachId)
    fehler.push(...zaehlungKontoFehler(konten.get(daten.fachId)));
  if (fehler.length > 0 || !daten.zahlweg || !daten.belegdatum) return { fehler };
  const gegenKontoId =
    daten.zahlweg === 'bar' ? daten.fachId! : daten.zahlweg === 'bank' ? 'bank' : AUSLAGEN_KONTO_ID;
  const posten = daten.posten.map((p) => ({ ...p, kategorieId: p.kategorieId! }));
  const rechnung = belegBerechnen(daten);
  const zeilen = belegBuchungszeilen(
    { modus: daten.modus, posten, korrekturen: daten.korrekturen },
    {
      kontoId: gegenKontoId,
      ...(daten.zahlweg === 'bar' && { stueckelung: daten.stueckelung }),
    },
  );
  const geprueft = [
    ...pruefeBuchung({ zeilen: zeilen.map((z) => ({ ...z })) }, kontext.konten),
    ...pruefeBestand(zeilen, kontext.bestand),
  ];
  if (geprueft.length > 0) return { fehler: geprueft };
  return {
    fehler: [],
    buchung: {
      zeilen,
      summeCent: rechnung.summe,
      datum: daten.zahlweg === 'auslage' ? daten.belegdatum : daten.bezahldatum!,
      rechnungssteller: steller!.name,
    },
  };
}

/** The non-blocking warnings before booking; every one must be confirmed by its `code`. */
export function belegWarnungenBilden(p: {
  daten: BelegEntwurfDaten;
  summeCent: number | null;
  heute: string;
  dateiDoppelt: boolean;
  belegDoppelt: boolean;
  saldo: readonly string[];
}): BelegWarnungDto[] {
  const w: BelegWarnungDto[] = [];
  const { belegdatum, bezahldatum } = p.daten;
  if ((belegdatum && belegdatum > p.heute) || (bezahldatum && bezahldatum > p.heute))
    w.push({ code: 'zukunft', text: 'Ein Datum liegt in der Zukunft.' });
  if (p.dateiDoppelt)
    w.push({
      code: 'datei_doppelt',
      text: 'Dieselbe Datei gehört schon zu einem gebuchten Beleg.',
    });
  if (p.belegDoppelt)
    w.push({
      code: 'beleg_doppelt',
      text: 'Es gibt schon einen gebuchten Beleg desselben Rechnungsstellers mit gleichem Datum und gleicher Summe.',
    });
  if (p.summeCent !== null && p.summeCent > BELEG_BETRAG_WARNUNG_CENT)
    w.push({
      code: 'hoher_betrag',
      text: `Der Betrag ist hoch (${formatEuro(p.summeCent)}). Bitte prüfe ihn.`,
    });
  p.saldo.forEach((text, i) => w.push({ code: `saldo:${i}`, text }));
  return w;
}

export interface ErstattungPlanKontext {
  konten: readonly BelegKonto[];
  bestand: readonly BestandKonto[];
  /** The open Auslagen of the member. */
  offen: readonly AuslageBelegEintrag[];
  mitgliedName: string;
}

/** Validates an Erstattung and builds its journal lines; `fehler` empty = fine. */
export function planeErstattung(
  eingabe: ErstattungEingabe,
  kontext: ErstattungPlanKontext,
): { fehler: string[]; zeilen: BelegZeile[]; summeCent: number; text: string } {
  const offen = new Map(kontext.offen.map((b) => [b.id, b]));
  const ids = [...new Set(eingabe.belegIds)];
  const fehler: string[] = [];
  if (ids.some((id) => !offen.has(id)))
    fehler.push('Ein Beleg ist nicht (mehr) als Auslage dieses Mitglieds offen.');
  const summeCent = ids.reduce((s, id) => s + (offen.get(id)?.summeCent ?? 0), 0);
  const zielId = eingabe.zahlweg === 'bar' ? eingabe.fachId! : 'bank';
  const zeilen = erstattungBuchungszeilen(summeCent, {
    kontoId: zielId,
    ...(eingabe.zahlweg === 'bar' && { stueckelung: eingabe.stueckelung }),
  });
  if (fehler.length === 0) {
    if (summeCent <= 0) fehler.push('Die Summe der Erstattung muss größer als 0 sein.');
    if (eingabe.zahlweg === 'bar') {
      const fach = kontext.konten.find((k) => k.id === zielId);
      fehler.push(...zaehlungKontoFehler(fach));
    }
    fehler.push(
      ...pruefeBuchung({ zeilen: zeilen.map((z) => ({ ...z })) }, kontext.konten),
      ...pruefeBestand(zeilen, kontext.bestand),
    );
  }
  return {
    fehler,
    zeilen,
    summeCent,
    text: erstattungBuchungstext(kontext.mitgliedName, ids.length),
  };
}

// ----- Store

/** Belege part of `FinanzenStore`. Subs are Cognito subs; the routes turn them into member DTOs. */
export interface BelegeStore {
  /** By name; archived ones only on request. */
  rechnungssteller(mitArchiv: boolean): Promise<RechnungsstellerDto[]>;
  /** Throws BuchungUngueltig when the name exists already (case-insensitive). Returns the id. */
  rechnungsstellerAnlegen(name: string): Promise<string>;
  /** False when it does not exist; throws BuchungUngueltig for a name that exists already. */
  rechnungsstellerAendern(
    id: string,
    daten: { name?: string; archiviert?: boolean },
  ): Promise<boolean>;
  /** Drafts first, then booked Belege newest first, at most `limit` booked ones. */
  belege(abfrage: BelegeAbfrage & { limit: number }): Promise<BelegListeEintrag[]>;
  beleg(id: string): Promise<BelegDetailEintrag | undefined>;
  entwurfAnlegen(daten: BelegEntwurfDaten, sub: string): Promise<string>;
  entwurf(id: string): Promise<BelegEntwurfEintrag | undefined>;
  /** False when the draft does not exist (e.g. already booked). */
  entwurfSpeichern(id: string, daten: BelegEntwurfDaten): Promise<boolean>;
  entwurfLoeschen(id: string): Promise<boolean>;
  /** The warnings before booking; undefined when the draft does not exist. */
  belegWarnungen(id: string): Promise<BelegWarnungDto[] | undefined>;
  /**
   * Books a draft in one transaction (number, Beleg, booking; the draft is deleted). Undefined when
   * the draft does not exist and the key is new. Throws BuchungUngueltig and BelegWarnungenOffen.
   */
  entwurfBuchen(
    id: string,
    eingabe: BelegBuchen,
    sub: string,
  ): Promise<BelegGebuchtDto | undefined>;
  /** New draft with the data and the file of a booked Beleg; undefined when it does not exist. */
  entwurfKopieren(belegId: string, sub: string): Promise<string | undefined>;
  /** A booked, not reversed Beleg with this file. */
  dateiGebucht(sha256: string): Promise<{ id: string; nummer: string } | null>;
  /** The open Auslagen per member. */
  auslagen(): Promise<AuslageMitgliedEintrag[]>;
  /** Books the Sammelerstattung; throws BuchungUngueltig, e.g. for a Beleg that is not open. */
  erstatten(
    eingabe: ErstattungEingabe,
    sub: string,
    mitgliedName: string,
  ): Promise<ErstattungErgebnisDto>;
}

/** The parts of the journal store the Belege code builds on. */
export interface BelegeKern {
  einfuegen(tx: Tx, entwurf: BuchungsEntwurf): Promise<GebuchtErgebnis>;
  kontenMitBestand(
    q: Q,
    ids: string[],
  ): Promise<{ pruef: PruefKonto[]; bestand: BestandKonto[]; rows: FinKontoRow[] }>;
  bestandLaden(q: Q, rows: FinKontoRow[]): Promise<BestandKonto[]>;
  /** Retry on concurrency conflicts, see `finanzen.ts`. */
  wiederholen<T>(fn: () => Promise<T>): Promise<T>;
}

const gleicherName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const datenAusRow = (json: string): BelegEntwurfDaten =>
  belegEntwurfDatenSchema.parse(JSON.parse(json));

export function createBelegeStore(db: Db, kern: BelegeKern): BelegeStore {
  const istDoppelt = (err: unknown): boolean => {
    const e = err as { code?: unknown; cause?: unknown } | null;
    return e?.code === '23505' || (e?.cause as { code?: unknown } | null)?.code === '23505';
  };

  const stornierte = async (q: Q, buchungIds: string[]): Promise<Set<string>> => {
    if (buchungIds.length === 0) return new Set();
    const rows = await q
      .select({ stornoVon: finBuchungen.stornoVon })
      .from(finBuchungen)
      .where(inArray(finBuchungen.stornoVon, buchungIds));
    return new Set(rows.flatMap((r) => (r.stornoVon ? [r.stornoVon] : [])));
  };

  const stellerNamen = async (q: Q): Promise<Map<string, string>> =>
    new Map(
      (await q.select().from(finRechnungssteller)).map((r) => [r.id, r.name] as [string, string]),
    );

  const planKontext = async (q: Q, daten: BelegEntwurfDaten): Promise<BelegPlanKontext> => {
    const { pruef, bestand, rows } = await kern.kontenMitBestand(q, belegKontoIds(daten));
    const art = new Map(rows.map((k) => [k.id, k.art]));
    const [steller] = daten.rechnungsstellerId
      ? await q
          .select()
          .from(finRechnungssteller)
          .where(eq(finRechnungssteller.id, daten.rechnungsstellerId))
      : [];
    return {
      konten: pruef.map((k) => ({ ...k, art: art.get(k.id)! })),
      bestand,
      rechnungssteller: steller,
    };
  };

  /** Warnings of a draft; `plan` gives the lines for the balance warnings when it is valid. */
  const warnungenFuer = async (q: Q, daten: BelegEntwurfDaten): Promise<BelegWarnungDto[]> => {
    const summe = daten.posten.length > 0 ? belegBerechnen(daten).summe : null;
    const kontext = await planKontext(q, daten);
    const plan = planeBeleg(daten, kontext);
    let saldo: string[] = [];
    if (plan.buchung) {
      const ids = [...new Set(plan.buchung.zeilen.map((z) => z.kontoId))];
      const rows = await q.select().from(finKonten).where(inArray(finKonten.id, ids));
      saldo = saldoWarnungen(plan.buchung.zeilen, await kern.bestandLaden(q, rows));
    }
    const gebucht = async (bedingung: SQL) => {
      const rows = await q
        .select({ buchungId: finBelege.buchungId })
        .from(finBelege)
        .where(bedingung);
      const storno = await stornierte(
        q,
        rows.map((r) => r.buchungId),
      );
      return rows.some((r) => !storno.has(r.buchungId));
    };
    const dateiDoppelt = daten.datei
      ? await gebucht(eq(finBelege.dateiSha256, daten.datei.sha256))
      : false;
    const belegDoppelt =
      daten.rechnungsstellerId && daten.belegdatum && summe !== null
        ? await gebucht(
            and(
              eq(finBelege.rechnungsstellerId, daten.rechnungsstellerId),
              eq(finBelege.belegdatum, daten.belegdatum),
              eq(finBelege.summeCent, summe),
            )!,
          )
        : false;
    return belegWarnungenBilden({
      daten,
      summeCent: summe,
      heute: datumBerlin(new Date()),
      dateiDoppelt,
      belegDoppelt,
      saldo,
    });
  };

  const gebuchtErgebnis = async (q: Q, row: FinBelegRow, wiederholt?: boolean) => {
    const [b] = await q
      .select({ seq: finBuchungen.seq })
      .from(finBuchungen)
      .where(eq(finBuchungen.id, row.buchungId));
    return {
      id: row.id,
      nummer: row.nummer,
      buchungId: row.buchungId,
      buchungSeq: b?.seq ?? 0,
      ...(wiederholt && { wiederholt }),
    } satisfies BelegGebuchtDto;
  };

  const belegVorhanden = async (q: Q, schluessel: string) => {
    const [row] = await q
      .select()
      .from(finBelege)
      .where(eq(finBelege.idempotenzSchluessel, schluessel));
    return row ? gebuchtErgebnis(q, row, true) : undefined;
  };

  /** Next number `B-YYYY-NNNN` of the year in `jetzt` (gapless: the counter row is written in the booking transaction). */
  const naechsteNummer = async (tx: Tx, jahr: number): Promise<string> => {
    const name = `beleg:${jahr}`;
    await sperreBeruehren(tx, `beleg-zaehler:${jahr}`);
    const [zeile] = await tx.select().from(finZaehler).where(eq(finZaehler.name, name));
    if (zeile) {
      await tx
        .update(finZaehler)
        .set({ wert: sql`${finZaehler.wert} + 1` })
        .where(eq(finZaehler.name, name));
      return belegNummer(jahr, zeile.wert + 1);
    }
    await tx.insert(finZaehler).values({ name, wert: 1, letzterHash: '' });
    return belegNummer(jahr, 1);
  };

  const entwurfBuchenTx = (id: string, eingabe: BelegBuchen, sub: string) =>
    kern.wiederholen(() =>
      db.transaction(async (tx) => {
        const schon = await belegVorhanden(tx, eingabe.idempotenzSchluessel);
        if (schon) return schon;
        const [entwurf] = await tx
          .select()
          .from(finBelegEntwuerfe)
          .where(eq(finBelegEntwuerfe.id, id));
        if (!entwurf) return undefined;
        const daten = datenAusRow(entwurf.daten);
        const plan = planeBeleg(daten, await planKontext(tx, daten));
        if (!plan.buchung) throw new BuchungUngueltig(plan.fehler);
        const offen = (await warnungenFuer(tx, daten)).filter(
          (w) => !eingabe.bestaetigt.includes(w.code),
        );
        if (offen.length > 0) throw new BelegWarnungenOffen(offen);
        const jetzt = new Date();
        const nummer = await naechsteNummer(tx, Number(datumBerlin(jetzt).slice(0, 4)));
        const belegId = randomUUID();
        const gebucht = await kern.einfuegen(tx, {
          datum: plan.buchung.datum,
          text: belegBuchungstext(nummer, plan.buchung.rechnungssteller),
          quelleTyp: 'beleg',
          quelleId: belegId,
          eventId: null,
          stornoVon: null,
          erstelltVon: sub,
          zeilen: plan.buchung.zeilen,
          belege: daten.datei ? [{ sha256: daten.datei.sha256 }] : [],
        });
        await tx.insert(finBelege).values({
          id: belegId,
          nummer,
          rechnungsstellerId: daten.rechnungsstellerId!,
          belegdatum: daten.belegdatum!,
          modus: daten.modus,
          zahlweg: daten.zahlweg!,
          bezahldatum: daten.zahlweg === 'auslage' ? null : daten.bezahldatum,
          mitgliedId: daten.zahlweg === 'auslage' ? daten.mitgliedId : null,
          eigenbelegBegruendung: daten.datei ? null : daten.eigenbelegBegruendung,
          dateiSha256: daten.datei?.sha256 ?? null,
          dateiSchluessel: daten.datei?.schluessel ?? null,
          dateiTyp: daten.datei?.typ ?? null,
          dateiName: daten.datei?.name ?? null,
          summeCent: plan.buchung.summeCent,
          buchungId: gebucht.id,
          idempotenzSchluessel: eingabe.idempotenzSchluessel,
          erstelltVon: sub,
          erstelltAm: jetzt,
        });
        await tx.insert(finBelegposten).values(
          daten.posten.map((p, i) => ({
            belegId,
            pos: i + 1,
            kategorieId: p.kategorieId!,
            text: p.text,
            anzahlMilli: p.anzahlMilli,
            einzelpreisCent: p.einzelpreisCent,
            steuersatz: p.steuersatz,
            betragCent: belegBerechnen(daten).postenBetraege[i]!,
          })),
        );
        const korrekturen = daten.korrekturen.filter(
          (k) => k.nettoCent !== 0 || k.steuerCent !== 0,
        );
        if (korrekturen.length > 0)
          await tx.insert(finBelegKorrekturen).values(korrekturen.map((k) => ({ belegId, ...k })));
        await tx.delete(finBelegEntwuerfe).where(eq(finBelegEntwuerfe.id, id));
        return { id: belegId, nummer, buchungId: gebucht.id, buchungSeq: gebucht.seq };
      }),
    );

  const entwurfEintrag = (r: typeof finBelegEntwuerfe.$inferSelect): BelegEntwurfEintrag => ({
    id: r.id,
    daten: datenAusRow(r.daten),
    erstelltVon: r.erstelltVon,
    erstelltAm: r.erstelltAm.toISOString(),
    geaendertAm: r.geaendertAm.toISOString(),
  });

  const dateiSpalten = (daten: BelegEntwurfDaten) => ({
    dateiSha256: daten.datei?.sha256 ?? null,
    dateiSchluessel: daten.datei?.schluessel ?? null,
    dateiTyp: daten.datei?.typ ?? null,
    dateiName: daten.datei?.name ?? null,
  });

  /** All booked Belege of Zahlweg Auslage plus the Erstattungen, for the open Auslagen. */
  const auslageDaten = async (q: Q, mitgliedId?: string) => {
    const belege = await q
      .select({ beleg: finBelege, steller: finRechnungssteller.name })
      .from(finBelege)
      .innerJoin(finRechnungssteller, eq(finRechnungssteller.id, finBelege.rechnungsstellerId))
      .where(
        mitgliedId
          ? and(eq(finBelege.zahlweg, 'auslage'), eq(finBelege.mitgliedId, mitgliedId))
          : eq(finBelege.zahlweg, 'auslage'),
      )
      .orderBy(asc(finBelege.belegdatum), asc(finBelege.nummer));
    const belegIds = belege.map((b) => b.beleg.id);
    const links =
      belegIds.length === 0
        ? []
        : await q
            .select({
              erstattungId: finErstattungBelege.erstattungId,
              belegId: finErstattungBelege.belegId,
              buchungId: finErstattungen.buchungId,
            })
            .from(finErstattungBelege)
            .innerJoin(finErstattungen, eq(finErstattungen.id, finErstattungBelege.erstattungId))
            .where(inArray(finErstattungBelege.belegId, belegIds));
    const storno = await stornierte(q, [
      ...belege.map((b) => b.beleg.buchungId),
      ...links.map((l) => l.buchungId),
    ]);
    const jeErstattung = new Map<string, { buchungId: string; belegIds: string[] }>();
    for (const l of links) {
      const e = jeErstattung.get(l.erstattungId) ?? { buchungId: l.buchungId, belegIds: [] };
      e.belegIds.push(l.belegId);
      jeErstattung.set(l.erstattungId, e);
    }
    const eintraege: AuslageBelegEintrag[] = belege.map(({ beleg, steller }) => ({
      id: beleg.id,
      mitgliedId: beleg.mitgliedId,
      zahlweg: beleg.zahlweg,
      summeCent: beleg.summeCent,
      buchungId: beleg.buchungId,
      nummer: beleg.nummer,
      rechnungssteller: steller,
      belegdatum: beleg.belegdatum,
    }));
    return offeneAuslagen(eintraege, [...jeErstattung.values()], storno);
  };

  const erstattenTx = (eingabe: ErstattungEingabe, sub: string, mitgliedName: string) =>
    kern.wiederholen(() =>
      db.transaction(async (tx) => {
        const vorher = async () => {
          const [row] = await tx
            .select({
              id: finErstattungen.id,
              buchungId: finErstattungen.buchungId,
              summeCent: finErstattungen.summeCent,
              seq: finBuchungen.seq,
            })
            .from(finErstattungen)
            .innerJoin(finBuchungen, eq(finBuchungen.id, finErstattungen.buchungId))
            .where(eq(finErstattungen.idempotenzSchluessel, eingabe.idempotenzSchluessel));
          return row
            ? ({
                id: row.id,
                buchungId: row.buchungId,
                buchungSeq: row.seq,
                summeCent: row.summeCent,
                wiederholt: true,
              } satisfies ErstattungErgebnisDto)
            : undefined;
        };
        const schon = await vorher();
        if (schon) return schon;
        // Two Erstattungen of the same member must not cover the same Beleg.
        await sperreBeruehren(tx, `erstattung:${eingabe.mitgliedId}`);
        const offen = (await auslageDaten(tx, eingabe.mitgliedId)).flatMap((m) => m.belege);
        const ids = [AUSLAGEN_KONTO_ID, eingabe.zahlweg === 'bar' ? eingabe.fachId! : 'bank'];
        const { pruef, bestand, rows } = await kern.kontenMitBestand(tx, ids);
        const art = new Map(rows.map((k) => [k.id, k.art]));
        const plan = planeErstattung(eingabe, {
          konten: pruef.map((k) => ({ ...k, art: art.get(k.id)! })),
          bestand,
          offen,
          mitgliedName,
        });
        if (plan.fehler.length > 0) throw new BuchungUngueltig(plan.fehler);
        const erstattungId = randomUUID();
        const gebucht = await kern.einfuegen(tx, {
          datum: eingabe.datum,
          text: plan.text,
          quelleTyp: 'erstattung',
          quelleId: erstattungId,
          eventId: null,
          stornoVon: null,
          erstelltVon: sub,
          zeilen: plan.zeilen,
        });
        await tx.insert(finErstattungen).values({
          id: erstattungId,
          mitgliedId: eingabe.mitgliedId,
          datum: eingabe.datum,
          zahlweg: eingabe.zahlweg,
          summeCent: plan.summeCent,
          buchungId: gebucht.id,
          idempotenzSchluessel: eingabe.idempotenzSchluessel,
          erstelltVon: sub,
          erstelltAm: new Date(),
        });
        await tx
          .insert(finErstattungBelege)
          .values([...new Set(eingabe.belegIds)].map((belegId) => ({ erstattungId, belegId })));
        return {
          id: erstattungId,
          buchungId: gebucht.id,
          buchungSeq: gebucht.seq,
          summeCent: plan.summeCent,
        } satisfies ErstattungErgebnisDto;
      }),
    );

  const store: BelegeStore = {
    async rechnungssteller(mitArchiv) {
      const [rows, zuletzt] = await Promise.all([
        db.select().from(finRechnungssteller).orderBy(asc(finRechnungssteller.name)),
        db
          .select({
            id: finBelege.rechnungsstellerId,
            zuletzt: sql<string | null>`max(${finBelege.erstelltAm})`,
          })
          .from(finBelege)
          .groupBy(finBelege.rechnungsstellerId),
      ]);
      const am = new Map(
        zuletzt.map((z) => [z.id, z.zuletzt ? new Date(z.zuletzt).toISOString() : null]),
      );
      return rows
        .filter((r) => mitArchiv || !r.archiviert)
        .map((r) => ({ ...r, zuletztAm: am.get(r.id) ?? null }));
    },

    async rechnungsstellerAnlegen(name) {
      return kern.wiederholen(() =>
        db.transaction(async (tx) => {
          await sperreBeruehren(tx, 'rechnungssteller');
          const alle = await tx.select().from(finRechnungssteller);
          if (alle.some((r) => gleicherName(r.name, name)))
            throw new BuchungUngueltig(['Diesen Rechnungssteller gibt es schon.']);
          const id = randomUUID();
          await tx.insert(finRechnungssteller).values({ id, name: name.trim() });
          return id;
        }),
      );
    },

    async rechnungsstellerAendern(id, daten) {
      return kern.wiederholen(() =>
        db.transaction(async (tx) => {
          await sperreBeruehren(tx, 'rechnungssteller');
          const alle = await tx.select().from(finRechnungssteller);
          if (!alle.some((r) => r.id === id)) return false;
          if (
            daten.name !== undefined &&
            alle.some((r) => r.id !== id && gleicherName(r.name, daten.name!))
          )
            throw new BuchungUngueltig(['Diesen Rechnungssteller gibt es schon.']);
          await tx
            .update(finRechnungssteller)
            .set({
              ...(daten.name !== undefined && { name: daten.name.trim() }),
              ...(daten.archiviert !== undefined && { archiviert: daten.archiviert }),
            })
            .where(eq(finRechnungssteller.id, id));
          return true;
        }),
      );
    },

    async belege(abfrage) {
      const namen = await stellerNamen(db);
      const passt = (s: {
        rechnungsstellerId: string | null;
        belegdatum: string | null;
        zahlweg: string | null;
        mitgliedId: string | null;
      }) =>
        (!abfrage.rechnungsstellerId || s.rechnungsstellerId === abfrage.rechnungsstellerId) &&
        (!abfrage.zahlweg || s.zahlweg === abfrage.zahlweg) &&
        (!abfrage.mitgliedId || s.mitgliedId === abfrage.mitgliedId) &&
        (!abfrage.von || (s.belegdatum !== null && s.belegdatum >= abfrage.von)) &&
        (!abfrage.bis || (s.belegdatum !== null && s.belegdatum <= abfrage.bis));
      const liste: BelegListeEintrag[] = [];
      if (!abfrage.status || abfrage.status === 'entwurf') {
        const entwuerfe = await db
          .select()
          .from(finBelegEntwuerfe)
          .orderBy(desc(finBelegEntwuerfe.geaendertAm));
        for (const e of entwuerfe) {
          const d = datenAusRow(e.daten);
          const eintrag: BelegListeEintrag = {
            id: e.id,
            status: 'entwurf',
            nummer: null,
            rechnungsstellerId: d.rechnungsstellerId,
            rechnungssteller: d.rechnungsstellerId
              ? (namen.get(d.rechnungsstellerId) ?? null)
              : null,
            belegdatum: d.belegdatum,
            summeCent: d.posten.length > 0 ? belegBerechnen(d).summe : null,
            zahlweg: d.zahlweg,
            mitgliedId: d.mitgliedId,
            hatDatei: d.datei !== null,
            erstelltAm: e.erstelltAm.toISOString(),
          };
          if (passt(eintrag)) liste.push(eintrag);
        }
      }
      if (abfrage.status !== 'entwurf') {
        const rows = await db
          .select()
          .from(finBelege)
          .orderBy(desc(finBelege.belegdatum), desc(finBelege.nummer));
        const storno = await stornierte(
          db,
          rows.map((r) => r.buchungId),
        );
        const gebucht = rows.flatMap((r): BelegListeEintrag[] => {
          const status: BelegStatus = storno.has(r.buchungId) ? 'storniert' : 'gebucht';
          const eintrag: BelegListeEintrag = {
            id: r.id,
            status,
            nummer: r.nummer,
            rechnungsstellerId: r.rechnungsstellerId,
            rechnungssteller: namen.get(r.rechnungsstellerId) ?? null,
            belegdatum: r.belegdatum,
            summeCent: r.summeCent,
            zahlweg: r.zahlweg,
            mitgliedId: r.mitgliedId,
            hatDatei: r.dateiSchluessel !== null,
            erstelltAm: r.erstelltAm.toISOString(),
          };
          return passt(eintrag) && (!abfrage.status || abfrage.status === status) ? [eintrag] : [];
        });
        liste.push(...gebucht.slice(0, abfrage.limit));
      }
      return liste;
    },

    async beleg(id) {
      const [row] = await db
        .select({ beleg: finBelege, steller: finRechnungssteller.name })
        .from(finBelege)
        .innerJoin(finRechnungssteller, eq(finRechnungssteller.id, finBelege.rechnungsstellerId))
        .where(eq(finBelege.id, id));
      if (!row) return undefined;
      const b = row.beleg;
      const [posten, korrekturen, [buchung], erstattungen] = await Promise.all([
        db
          .select({ p: finBelegposten, kategorie: finKonten.name })
          .from(finBelegposten)
          .innerJoin(finKonten, eq(finKonten.id, finBelegposten.kategorieId))
          .where(eq(finBelegposten.belegId, id))
          .orderBy(asc(finBelegposten.pos)),
        db.select().from(finBelegKorrekturen).where(eq(finBelegKorrekturen.belegId, id)),
        db
          .select({ seq: finBuchungen.seq })
          .from(finBuchungen)
          .where(eq(finBuchungen.id, b.buchungId)),
        db
          .select({ e: finErstattungen, seq: finBuchungen.seq })
          .from(finErstattungBelege)
          .innerJoin(finErstattungen, eq(finErstattungen.id, finErstattungBelege.erstattungId))
          .innerJoin(finBuchungen, eq(finBuchungen.id, finErstattungen.buchungId))
          .where(eq(finErstattungBelege.belegId, id)),
      ]);
      const storno = await stornierte(db, [b.buchungId, ...erstattungen.map((e) => e.e.buchungId)]);
      const aktiv = erstattungen.find((e) => !storno.has(e.e.buchungId));
      const rechnung = belegBerechnen({
        modus: b.modus,
        posten: posten.map((x) => x.p),
        korrekturen,
      });
      return {
        id: b.id,
        nummer: b.nummer,
        rechnungsstellerId: b.rechnungsstellerId,
        rechnungssteller: row.steller,
        belegdatum: b.belegdatum,
        modus: b.modus,
        zahlweg: b.zahlweg,
        bezahldatum: b.zahlweg === 'auslage' ? (aktiv?.e.datum ?? null) : b.bezahldatum,
        mitgliedId: b.mitgliedId,
        eigenbelegBegruendung: b.eigenbelegBegruendung,
        datei:
          b.dateiSha256 && b.dateiSchluessel && b.dateiTyp && b.dateiName
            ? {
                sha256: b.dateiSha256,
                schluessel: b.dateiSchluessel,
                typ: b.dateiTyp as BelegDateiInfo['typ'],
                name: b.dateiName,
              }
            : null,
        posten: posten.map(({ p, kategorie }) => ({
          pos: p.pos,
          kategorieId: p.kategorieId,
          kategorieName: kategorie,
          text: p.text,
          anzahlMilli: p.anzahlMilli,
          einzelpreisCent: p.einzelpreisCent,
          steuersatz: p.steuersatz,
          betragCent: p.betragCent,
        })),
        korrekturen: korrekturen.map((k) => ({
          steuersatz: k.steuersatz,
          nettoCent: k.nettoCent,
          steuerCent: k.steuerCent,
        })),
        jeSteuersatz: rechnung.jeSteuersatz,
        summeCent: b.summeCent,
        buchung: { id: b.buchungId, seq: buchung?.seq ?? 0 },
        storniert: storno.has(b.buchungId),
        erstattung: aktiv
          ? {
              id: aktiv.e.id,
              datum: aktiv.e.datum,
              buchung: { id: aktiv.e.buchungId, seq: aktiv.seq },
            }
          : null,
        erstelltVon: b.erstelltVon,
        erstelltAm: b.erstelltAm.toISOString(),
      };
    },

    async entwurfAnlegen(daten, sub) {
      const id = randomUUID();
      const jetzt = new Date();
      await db.insert(finBelegEntwuerfe).values({
        id,
        daten: JSON.stringify(daten),
        ...dateiSpalten(daten),
        erstelltVon: sub,
        erstelltAm: jetzt,
        geaendertAm: jetzt,
      });
      return id;
    },

    async entwurf(id) {
      const [row] = await db.select().from(finBelegEntwuerfe).where(eq(finBelegEntwuerfe.id, id));
      return row ? entwurfEintrag(row) : undefined;
    },

    async entwurfSpeichern(id, daten) {
      const rows = await db
        .update(finBelegEntwuerfe)
        .set({ daten: JSON.stringify(daten), ...dateiSpalten(daten), geaendertAm: new Date() })
        .where(eq(finBelegEntwuerfe.id, id))
        .returning({ id: finBelegEntwuerfe.id });
      return rows.length > 0;
    },

    async entwurfLoeschen(id) {
      const rows = await db
        .delete(finBelegEntwuerfe)
        .where(eq(finBelegEntwuerfe.id, id))
        .returning({ id: finBelegEntwuerfe.id });
      return rows.length > 0;
    },

    async belegWarnungen(id) {
      const [row] = await db.select().from(finBelegEntwuerfe).where(eq(finBelegEntwuerfe.id, id));
      return row ? warnungenFuer(db, datenAusRow(row.daten)) : undefined;
    },

    async entwurfBuchen(id, eingabe, sub) {
      try {
        return await entwurfBuchenTx(id, eingabe, sub);
      } catch (err) {
        // The unique index on idempotenz_schluessel catches two parallel requests with one key.
        if (istDoppelt(err)) {
          const schon = await belegVorhanden(db, eingabe.idempotenzSchluessel);
          if (schon) return schon;
        }
        throw err;
      }
    },

    async entwurfKopieren(belegId, sub) {
      const detail = await store.beleg(belegId);
      if (!detail) return undefined;
      const daten = belegEntwurfDatenSchema.parse({
        rechnungsstellerId: detail.rechnungsstellerId,
        belegdatum: detail.belegdatum,
        modus: detail.modus,
        posten: detail.posten.map((p) => ({
          kategorieId: p.kategorieId,
          text: p.text,
          anzahlMilli: p.anzahlMilli,
          einzelpreisCent: p.einzelpreisCent,
          steuersatz: p.steuersatz,
        })),
        korrekturen: detail.korrekturen,
        zahlweg: detail.zahlweg,
        bezahldatum: detail.zahlweg === 'auslage' ? null : detail.bezahldatum,
        mitgliedId: detail.mitgliedId,
        eigenbelegBegruendung: detail.eigenbelegBegruendung,
        datei: detail.datei,
      });
      return store.entwurfAnlegen(daten, sub);
    },

    async dateiGebucht(sha256) {
      const rows = await db
        .select({ id: finBelege.id, nummer: finBelege.nummer, buchungId: finBelege.buchungId })
        .from(finBelege)
        .where(and(eq(finBelege.dateiSha256, sha256), isNotNull(finBelege.dateiSchluessel)));
      const storno = await stornierte(
        db,
        rows.map((r) => r.buchungId),
      );
      const treffer = rows.find((r) => !storno.has(r.buchungId));
      return treffer ? { id: treffer.id, nummer: treffer.nummer } : null;
    },

    auslagen: () => auslageDaten(db),

    async erstatten(eingabe, sub, mitgliedName) {
      try {
        return await erstattenTx(eingabe, sub, mitgliedName);
      } catch (err) {
        if (istDoppelt(err)) {
          const [row] = await db
            .select({
              id: finErstattungen.id,
              buchungId: finErstattungen.buchungId,
              summeCent: finErstattungen.summeCent,
              seq: finBuchungen.seq,
            })
            .from(finErstattungen)
            .innerJoin(finBuchungen, eq(finBuchungen.id, finErstattungen.buchungId))
            .where(eq(finErstattungen.idempotenzSchluessel, eingabe.idempotenzSchluessel));
          if (row)
            return {
              id: row.id,
              buchungId: row.buchungId,
              buchungSeq: row.seq,
              summeCent: row.summeCent,
              wiederholt: true,
            };
        }
        throw err;
      }
    },
  };
  return store;
}
