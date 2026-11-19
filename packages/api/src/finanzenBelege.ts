import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNotNull, sql, type SQL } from 'drizzle-orm';
import {
  AUSLAGEN_KONTO_ID,
  PFAND_KONTO_ID,
  BELEG_BETRAG_WARNUNG_CENT,
  belegBerechnen,
  belegBuchungstext,
  belegBuchungszeilen,
  belegEntwurfDatenSchema,
  belegNummer,
  belegPruefen,
  gebindeBezeichnung,
  pfandGesamtCent,
  warengruppeKategorie,
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
  type BelegDatei,
  type BelegDateiInfo,
  type EinreichungDto,
  einreichungStatus,
  type BelegDetailEintrag,
  type BelegEntwurfDaten,
  type BelegEntwurfEintrag,
  type BelegeAbfrage,
  type BelegGebuchtDto,
  type BelegWareDto,
  type WarengruppeKategorieDto,
  type Gebinde,
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
  postenBetrag,
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
  gebinde,
  wareGebinde,
  waren,
  warengruppen,
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

/** What `einreichungWarePosten` needs to know about a Ware. */
export interface EinreichungWare {
  archiviert: boolean;
  /** Ids of the non-archived Gebinde of the Ware. */
  gebindeIds: string[];
  /** Kategorie suggested by the Warengruppe (inherited); null without an assignment. */
  kategorieId: string | null;
}

/**
 * Checks the Ware items a member submits (Ware exists and is not archived, Gebinde belongs to it)
 * and fills their Kategorie from the Warengruppe; without an assignment it stays empty and
 * `belegPruefen` flags it when booking.
 */
export function einreichungWarePosten(
  daten: BelegEntwurfDaten,
  ware: (id: string) => EinreichungWare | undefined,
): { daten: BelegEntwurfDaten; fehler: string[] } {
  const fehler: string[] = [];
  const posten = daten.posten.map((p, i) => {
    if (p.art !== 'ware') return p;
    const n = `Posten ${i + 1}`;
    const w = p.wareId ? ware(p.wareId) : undefined;
    if (!w) fehler.push(`${n}: Die Ware gibt es nicht.`);
    else if (w.archiviert) fehler.push(`${n}: Die Ware ist archiviert.`);
    else if (!p.gebindeId || !w.gebindeIds.includes(p.gebindeId))
      fehler.push(`${n}: Dieses Gebinde gehört nicht zur Ware.`);
    return { ...p, kategorieId: p.kategorieId ?? w?.kategorieId ?? null };
  });
  return { daten: { ...daten, posten }, fehler };
}

type Q = Pick<Db, 'select'>;

export interface BelegKonto extends PruefKonto {
  art: KontoArt;
}

/** A Ware as the planning of Ware items sees it. */
export interface BelegWare {
  id: string;
  name: string;
  archiviert: boolean;
  /** Gebinde of the Ware; `archiviert` ones cannot be booked on. */
  gebinde: readonly { id: string; archiviert: boolean }[];
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
  /** The Waren of the Ware items of the draft. */
  waren: readonly BelegWare[];
}

export interface BelegPlan {
  fehler: string[];
  /** Set when `fehler` is empty. */
  buchung?: {
    zeilen: BelegZeile[];
    summeCent: number;
    datum: string;
    rechnungssteller: string;
    /** Text per item: the typed text, for Ware items the name of the Ware by default. */
    postenTexte: string[];
  };
}

/** Accounts the planning needs: the Kategorien of the items, the Fach and the Gegenkonto. */
export const belegKontoIds = (daten: BelegEntwurfDaten): string[] => [
  ...new Set([
    ...daten.posten.flatMap((p) => (p.art !== 'leergut' && p.kategorieId ? [p.kategorieId] : [])),
    ...(daten.posten.some((p) => p.art === 'leergut' || (p.art === 'ware' && p.pfandCent))
      ? [PFAND_KONTO_ID]
      : []),
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
  for (const id of new Set(
    daten.posten.flatMap((p) => (p.art !== 'leergut' && p.kategorieId ? [p.kategorieId] : [])),
  )) {
    const k = konten.get(id);
    if (!k) fehler.push('Eine Kategorie gibt es nicht.');
    else if (k.art !== 'aufwand') fehler.push(`„${k.name}“ ist keine Aufwandskategorie.`);
  }
  const waren = new Map(kontext.waren.map((w) => [w.id, w]));
  daten.posten.forEach((p, i) => {
    if (p.art !== 'ware' || !p.wareId || !p.gebindeId) return;
    const w = waren.get(p.wareId);
    const g = w?.gebinde.find((x) => x.id === p.gebindeId);
    const n = `Posten ${i + 1}`;
    if (!w) fehler.push(`${n}: Die Ware gibt es nicht.`);
    else if (w.archiviert) fehler.push(`${n}: Die Ware „${w.name}“ ist archiviert.`);
    else if (!g) fehler.push(`${n}: Dieses Gebinde gehört nicht zur Ware „${w.name}“.`);
    else if (g.archiviert) fehler.push(`${n}: Das Gebinde ist archiviert.`);
  });
  if (daten.zahlweg === 'bar' && daten.fachId)
    fehler.push(...zaehlungKontoFehler(konten.get(daten.fachId)));
  if (fehler.length > 0 || !daten.zahlweg || !daten.belegdatum) return { fehler };
  const gegenKontoId =
    daten.zahlweg === 'bar' ? daten.fachId! : daten.zahlweg === 'bank' ? 'bank' : AUSLAGEN_KONTO_ID;
  const rechnung = belegBerechnen(daten);
  const zeilen = belegBuchungszeilen(
    { modus: daten.modus, posten: daten.posten, korrekturen: daten.korrekturen },
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
      postenTexte: daten.posten.map((p) =>
        p.art === 'ware' && !p.text ? (waren.get(p.wareId!)?.name ?? '') : p.text,
      ),
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
  const eingereicht = p.daten.eingereichtBetragCent;
  if (eingereicht !== null && p.summeCent !== null && eingereicht !== p.summeCent)
    w.push({
      code: 'betrag_abweichung',
      text: `Der eingereichte Betrag (${formatEuro(eingereicht)}) weicht von der Summe der Posten (${formatEuro(p.summeCent)}) ab.`,
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

export type EinreichungAktion = 'ok' | 'fehlt' | 'nicht_eingereicht';

/** An own submission: the DTO plus the file reference (the route adds the presigned URL). */
export interface EinreichungEintrag extends EinreichungDto {
  datei: BelegDatei | null;
  posten: {
    kategorieId: string | null;
    text: string;
    betragCent: number;
    steuersatz: number;
    /** Ware items only. */
    wareId: string | null;
    gebindeId: string | null;
    anzahlMilli: number | null;
  }[];
}

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
  /** New draft submitted by a member (status `eingereicht`). */
  einreichungAnlegen(daten: BelegEntwurfDaten, sub: string): Promise<string>;
  /** Rejects a submitted draft with a reason; 'nicht_eingereicht' when it is in another state. */
  entwurfVerwerfen(id: string, grund: string, sub: string): Promise<EinreichungAktion>;
  /** Withdraws an own submission while it is `eingereicht`; 'fehlt' for foreign or missing ones. */
  einreichungZurueckziehen(id: string, sub: string): Promise<EinreichungAktion>;
  /** Own submissions (open drafts, rejected, booked), newest first. */
  einreichungen(sub: string): Promise<EinreichungEintrag[]>;
  /** One own submission by draft id or Beleg id; undefined when missing or foreign. */
  einreichung(id: string, sub: string): Promise<EinreichungEintrag | undefined>;
  /** Submitter and amount of the submitted ones among these Belege (for the Erstattung push). */
  eingereichteBelege(belegIds: string[]): Promise<{ eingereichtVon: string; summeCent: number }[]>;
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
  /** All Warengruppen with their assigned and effective Kategorie. */
  warengruppenKategorien(): Promise<WarengruppeKategorieDto[]>;
  /**
   * Assigns (or removes, `null`) the Kategorie of a Warengruppe. False when the group does not exist;
   * throws BuchungUngueltig when the Konto is no active Aufwand Konto.
   */
  warengruppeKategorieSetzen(id: string, kategorieId: string | null): Promise<boolean>;
  /** Non-archived Waren with their Gebinde, deposit and suggested Kategorie, for the Beleg form. */
  belegWaren(): Promise<BelegWareDto[]>;
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
    const wareIds = [
      ...new Set(daten.posten.flatMap((p) => (p.art === 'ware' && p.wareId ? [p.wareId] : []))),
    ];
    const wareRows = wareIds.length
      ? await q.select().from(waren).where(inArray(waren.id, wareIds))
      : [];
    const verknuepft = wareIds.length
      ? await q
          .select({
            wareId: wareGebinde.wareId,
            gebindeId: wareGebinde.gebindeId,
            archiviert: gebinde.archiviert,
          })
          .from(wareGebinde)
          .innerJoin(gebinde, eq(gebinde.id, wareGebinde.gebindeId))
          .where(inArray(wareGebinde.wareId, wareIds))
      : [];
    return {
      konten: pruef.map((k) => ({ ...k, art: art.get(k.id)! })),
      bestand,
      rechnungssteller: steller,
      waren: wareRows.map((w) => ({
        id: w.id,
        name: w.name,
        archiviert: w.archiviert,
        gebinde: verknuepft
          .filter((v) => v.wareId === w.id)
          .map((v) => ({ id: v.gebindeId, archiviert: v.archiviert })),
      })),
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
        if (entwurf.status === 'verworfen')
          throw new BuchungUngueltig(['Die Einreichung wurde verworfen.']);
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
          // A submitted draft: keep who submitted it, when and which amount they stated.
          eingereichtVon: entwurf.eingereichtVon,
          eingereichtAm: entwurf.eingereichtAm,
          eingereichtBetragCent: daten.eingereichtBetragCent,
        });
        const rechnung = belegBerechnen(daten);
        await tx.insert(finBelegposten).values(
          daten.posten.map((p, i) => ({
            belegId,
            pos: i + 1,
            art: p.art,
            kategorieId: p.art === 'leergut' ? PFAND_KONTO_ID : p.kategorieId!,
            wareId: p.art === 'ware' ? p.wareId : null,
            gebindeId: p.art === 'ware' ? p.gebindeId : null,
            pfandCent: p.art === 'ware' ? p.pfandCent : null,
            pfandBetragCent:
              p.art === 'ware' && p.pfandCent !== null ? rechnung.pfandBetraege[i]! : null,
            text: plan.buchung!.postenTexte[i]!,
            anzahlMilli: p.anzahlMilli,
            einzelpreisCent: p.einzelpreisCent,
            steuersatz: p.steuersatz,
            betragCent: rechnung.postenBetraege[i]!,
          })),
        );
        const korrekturen = daten.korrekturen.filter(
          (k) => k.nettoCent !== 0 || k.steuerCent !== 0,
        );
        if (korrekturen.length > 0)
          await tx.insert(finBelegKorrekturen).values(korrekturen.map((k) => ({ belegId, ...k })));
        await tx.delete(finBelegEntwuerfe).where(eq(finBelegEntwuerfe.id, id));
        // The route sends the push `belege.status` (gebucht) to `eingereichtVon` after this returns.
        return { id: belegId, nummer, buchungId: gebucht.id, buchungSeq: gebucht.seq };
      }),
    );

  const entwurfEintrag = (r: typeof finBelegEntwuerfe.$inferSelect): BelegEntwurfEintrag => ({
    id: r.id,
    daten: datenAusRow(r.daten),
    status: r.status ?? 'entwurf',
    eingereichtVon: r.eingereichtVon,
    eingereichtAm: r.eingereichtAm?.toISOString() ?? null,
    verworfenGrund: r.verworfenGrund,
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

  const dateiAus = (r: {
    dateiSha256: string | null;
    dateiSchluessel: string | null;
    dateiTyp: string | null;
    dateiName: string | null;
  }): BelegDatei | null =>
    r.dateiSha256 && r.dateiSchluessel && r.dateiTyp && r.dateiName
      ? ({
          sha256: r.dateiSha256,
          schluessel: r.dateiSchluessel,
          typ: r.dateiTyp,
          name: r.dateiName,
        } as BelegDatei)
      : null;

  /** The own submissions: drafts still in the review plus the booked Belege that came from members. */
  const einreichungenAus = async (sub: string, id?: string): Promise<EinreichungEintrag[]> => {
    const namen = await stellerNamen(db);
    const entwuerfe = await db
      .select()
      .from(finBelegEntwuerfe)
      .where(
        and(
          eq(finBelegEntwuerfe.eingereichtVon, sub),
          id ? eq(finBelegEntwuerfe.id, id) : undefined,
        ),
      );
    const eintraege: EinreichungEintrag[] = entwuerfe.map((e) => {
      const d = datenAusRow(e.daten);
      return {
        id: e.id,
        status: einreichungStatus({ entwurfStatus: e.status ?? 'entwurf', beleg: null }),
        belegdatum: d.belegdatum,
        betragCent: d.eingereichtBetragCent,
        rechnungssteller: d.rechnungsstellerId
          ? (namen.get(d.rechnungsstellerId) ?? null)
          : (d.rechnungsstellerName ?? null),
        notiz: d.notiz,
        verworfenGrund: e.verworfenGrund,
        belegNummer: null,
        eingereichtAm: e.eingereichtAm?.toISOString() ?? null,
        datei: d.datei,
        posten: d.posten.map((p) => ({
          kategorieId: 'kategorieId' in p ? (p.kategorieId ?? null) : null,
          text: p.text,
          betragCent: postenBetrag(p),
          steuersatz: p.steuersatz,
          wareId: p.art === 'ware' ? (p.wareId ?? null) : null,
          gebindeId: p.art === 'ware' ? (p.gebindeId ?? null) : null,
          anzahlMilli: p.art === 'ware' ? p.anzahlMilli : null,
        })),
      };
    });
    const belege = await db
      .select()
      .from(finBelege)
      .where(and(eq(finBelege.eingereichtVon, sub), id ? eq(finBelege.id, id) : undefined));
    if (belege.length > 0) {
      const postenRows = await db
        .select()
        .from(finBelegposten)
        .where(
          inArray(
            finBelegposten.belegId,
            belege.map((b) => b.id),
          ),
        )
        .orderBy(asc(finBelegposten.pos));
      const links = await db
        .select({
          belegId: finErstattungBelege.belegId,
          buchungId: finErstattungen.buchungId,
        })
        .from(finErstattungBelege)
        .innerJoin(finErstattungen, eq(finErstattungen.id, finErstattungBelege.erstattungId))
        .where(
          inArray(
            finErstattungBelege.belegId,
            belege.map((b) => b.id),
          ),
        );
      const storno = await stornierte(db, [
        ...belege.map((b) => b.buchungId),
        ...links.map((l) => l.buchungId),
      ]);
      for (const b of belege)
        eintraege.push({
          id: b.id,
          status: einreichungStatus({
            entwurfStatus: null,
            beleg: {
              storniert: storno.has(b.buchungId),
              erstattet: links.some((l) => l.belegId === b.id && !storno.has(l.buchungId)),
            },
          }),
          belegdatum: b.belegdatum,
          betragCent: b.eingereichtBetragCent ?? b.summeCent,
          rechnungssteller: namen.get(b.rechnungsstellerId) ?? null,
          notiz: null,
          verworfenGrund: null,
          belegNummer: b.nummer,
          eingereichtAm: b.eingereichtAm?.toISOString() ?? null,
          datei: dateiAus(b),
          posten: postenRows
            .filter((p) => p.belegId === b.id)
            .map((p) => ({
              kategorieId: p.kategorieId,
              text: p.text,
              betragCent: p.betragCent,
              steuersatz: p.steuersatz,
              wareId: p.art === 'ware' ? p.wareId : null,
              gebindeId: p.art === 'ware' ? p.gebindeId : null,
              anzahlMilli: p.art === 'ware' ? p.anzahlMilli : null,
            })),
        });
    }
    return eintraege.sort((a, b) => (b.eingereichtAm ?? '').localeCompare(a.eingereichtAm ?? ''));
  };

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
          if (e.status === 'verworfen') continue;
          const d = datenAusRow(e.daten);
          const eintrag: BelegListeEintrag = {
            id: e.id,
            status: 'entwurf',
            nummer: null,
            rechnungsstellerId: d.rechnungsstellerId,
            rechnungssteller: d.rechnungsstellerId
              ? (namen.get(d.rechnungsstellerId) ?? null)
              : null,
            rechnungsstellerName: d.rechnungsstellerName ?? null,
            belegdatum: d.belegdatum,
            summeCent: d.posten.length > 0 ? belegBerechnen(d).summe : null,
            zahlweg: d.zahlweg,
            mitgliedId: d.mitgliedId,
            hatDatei: d.datei !== null,
            erstelltAm: e.erstelltAm.toISOString(),
            entwurfStatus: e.status === 'eingereicht' ? 'eingereicht' : 'entwurf',
            eingereichtVon: e.eingereichtVon,
            eingereichtAm: e.eingereichtAm?.toISOString() ?? null,
            eingereichtBetragCent: d.eingereichtBetragCent,
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
            rechnungsstellerName: null,
            belegdatum: r.belegdatum,
            summeCent: r.summeCent,
            zahlweg: r.zahlweg,
            mitgliedId: r.mitgliedId,
            hatDatei: r.dateiSchluessel !== null,
            erstelltAm: r.erstelltAm.toISOString(),
            entwurfStatus: null,
            eingereichtVon: r.eingereichtVon,
            eingereichtAm: r.eingereichtAm?.toISOString() ?? null,
            eingereichtBetragCent: r.eingereichtBetragCent,
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
          .select({ p: finBelegposten, kategorie: finKonten.name, ware: waren.name })
          .from(finBelegposten)
          .innerJoin(finKonten, eq(finKonten.id, finBelegposten.kategorieId))
          .leftJoin(waren, eq(waren.id, finBelegposten.wareId))
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
        posten: posten.map(({ p, kategorie, ware }) => ({
          pos: p.pos,
          art: p.art ?? 'kategorie',
          kategorieId: p.kategorieId,
          kategorieName: kategorie,
          wareId: p.wareId,
          wareName: ware,
          gebindeId: p.gebindeId,
          pfandCent: p.pfandCent,
          pfandBetragCent: p.pfandBetragCent,
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
        eingereichtVon: b.eingereichtVon,
        eingereichtAm: b.eingereichtAm?.toISOString() ?? null,
        eingereichtBetragCent: b.eingereichtBetragCent,
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

    async einreichungAnlegen(eingabe, sub) {
      const [gruppen, wareRows, verknuepft, alleGebinde] = await Promise.all([
        db.select().from(warengruppen),
        db.select().from(waren),
        db.select().from(wareGebinde),
        db.select().from(gebinde),
      ]);
      const { daten, fehler } = einreichungWarePosten(eingabe, (wid) => {
        const w = wareRows.find((x) => x.id === wid);
        return w
          ? {
              archiviert: w.archiviert,
              gebindeIds: verknuepft
                .filter((v) => v.wareId === wid)
                .map((v) => v.gebindeId)
                .filter((gid) => !alleGebinde.find((g) => g.id === gid)?.archiviert),
              kategorieId: warengruppeKategorie(gruppen, w.warengruppeId),
            }
          : undefined;
      });
      if (fehler.length > 0) throw new BuchungUngueltig(fehler);
      const id = randomUUID();
      const jetzt = new Date();
      await db.insert(finBelegEntwuerfe).values({
        id,
        daten: JSON.stringify(daten),
        ...dateiSpalten(daten),
        status: 'eingereicht',
        eingereichtVon: sub,
        eingereichtAm: jetzt,
        erstelltVon: sub,
        erstelltAm: jetzt,
        geaendertAm: jetzt,
      });
      return id;
    },

    async entwurfVerwerfen(id, grund, sub) {
      const [row] = await db.select().from(finBelegEntwuerfe).where(eq(finBelegEntwuerfe.id, id));
      if (!row) return 'fehlt';
      const jetzt = new Date();
      const rows = await db
        .update(finBelegEntwuerfe)
        .set({
          status: 'verworfen',
          verworfenGrund: grund,
          verworfenVon: sub,
          verworfenAm: jetzt,
          geaendertAm: jetzt,
        })
        .where(and(eq(finBelegEntwuerfe.id, id), eq(finBelegEntwuerfe.status, 'eingereicht')))
        .returning({ id: finBelegEntwuerfe.id });
      return rows.length > 0 ? 'ok' : 'nicht_eingereicht';
    },

    async einreichungZurueckziehen(id, sub) {
      const [row] = await db.select().from(finBelegEntwuerfe).where(eq(finBelegEntwuerfe.id, id));
      if (!row || row.eingereichtVon !== sub) return 'fehlt';
      const rows = await db
        .delete(finBelegEntwuerfe)
        .where(and(eq(finBelegEntwuerfe.id, id), eq(finBelegEntwuerfe.status, 'eingereicht')))
        .returning({ id: finBelegEntwuerfe.id });
      return rows.length > 0 ? 'ok' : 'nicht_eingereicht';
    },

    einreichungen: (sub) => einreichungenAus(sub),

    async einreichung(id, sub) {
      return (await einreichungenAus(sub, id))[0];
    },

    async eingereichteBelege(belegIds) {
      if (belegIds.length === 0) return [];
      const rows = await db
        .select({
          eingereichtVon: finBelege.eingereichtVon,
          summeCent: finBelege.summeCent,
          eingereichtBetragCent: finBelege.eingereichtBetragCent,
        })
        .from(finBelege)
        .where(and(inArray(finBelege.id, belegIds), isNotNull(finBelege.eingereichtVon)));
      return rows.map((r) => ({
        eingereichtVon: r.eingereichtVon!,
        summeCent: r.eingereichtBetragCent ?? r.summeCent,
      }));
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
          art: p.art,
          kategorieId: p.kategorieId,
          wareId: p.wareId,
          gebindeId: p.gebindeId,
          pfandCent: p.pfandCent,
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

    async warengruppenKategorien() {
      const rows = await db.select().from(warengruppen).orderBy(asc(warengruppen.name));
      return rows.map((g) => ({
        id: g.id,
        name: g.name,
        parentId: g.parentId,
        archiviert: g.archiviert,
        kategorieId: g.kategorieId,
        wirksamKategorieId: warengruppeKategorie(rows, g.id),
      }));
    },

    async warengruppeKategorieSetzen(id, kategorieId) {
      return kern.wiederholen(() =>
        db.transaction(async (tx) => {
          const [gruppe] = await tx.select().from(warengruppen).where(eq(warengruppen.id, id));
          if (!gruppe) return false;
          if (kategorieId) {
            const [konto] = await tx.select().from(finKonten).where(eq(finKonten.id, kategorieId));
            if (!konto) throw new BuchungUngueltig(['Die Kategorie gibt es nicht.']);
            if (konto.art !== 'aufwand')
              throw new BuchungUngueltig([`„${konto.name}“ ist keine Aufwandskategorie.`]);
            if (konto.archiviert)
              throw new BuchungUngueltig([`Die Kategorie „${konto.name}“ ist archiviert.`]);
          }
          await tx.update(warengruppen).set({ kategorieId }).where(eq(warengruppen.id, id));
          return true;
        }),
      );
    },

    async belegWaren() {
      const [gruppen, wareRows, verknuepft, alleGebinde] = await Promise.all([
        db.select().from(warengruppen),
        db.select().from(waren).where(eq(waren.archiviert, false)).orderBy(asc(waren.name)),
        db.select().from(wareGebinde),
        db.select().from(gebinde),
      ]);
      const alle = alleGebinde as Gebinde[];
      return wareRows.map((w) => ({
        id: w.id,
        name: w.name,
        warengruppeId: w.warengruppeId,
        kategorieId: warengruppeKategorie(gruppen, w.warengruppeId),
        gebinde: verknuepft
          .filter((v) => v.wareId === w.id)
          .flatMap((v) => {
            const g = alleGebinde.find((x) => x.id === v.gebindeId);
            return g && !g.archiviert
              ? [
                  {
                    id: g.id,
                    bezeichnung: gebindeBezeichnung(g as Gebinde, alle),
                    pfandGesamtCent: pfandGesamtCent(g as Gebinde, alle),
                  },
                ]
              : [];
          }),
      }));
    },

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
