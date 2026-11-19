import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, lte, or, sql } from 'drizzle-orm';
import {
  anzahlenAus,
  berechneZaehlung,
  buchungsHash,
  kassenabrechnungBuchungstext,
  kasseKontenFehler,
  stueckelungSumme,
  type KasseAendern,
  type KasseDto,
  type KasseEingabe,
  type KasseKurzDto,
  type KassenabrechnungDetailEintrag,
  type KassenabrechnungEingabe,
  type KassenabrechnungErgebnisDto,
  type KassenabrechnungListeEintrag,
  type KassenabrechnungVorschauEintrag,
  type KassenKonto,
  type EventKassenEintrag,
  type KassenzaehlungEingabe,
  type KassenzaehlungEintrag,
  type KassenzaehlungErgebnisDto,
  KASSENDIFFERENZ_KONTO_ID,
  pruefeBestand,
  pruefeBuchung,
  pruefeGruppenregel,
  SAFE_KONTO_ID,
  saldoGesamt,
  stornoZeilen,
  stueckelungVollstaendig,
  zaehlungBuchungstext,
  type BargeldUebersichtDto,
  type BestandKonto,
  type PruefKonto,
  type ZaehlungDetailEintrag,
  type ZaehlungEingabe,
  type ZaehlungErgebnisDto,
  type ZaehlungListeEintrag,
  type BuchungDetailEintrag,
  type BuchungEingabe,
  type BuchungListeEintrag,
  type BuchungVerweisDto,
  type BuchungZeileDto,
  type HashZeile,
  type JournalAbfrage,
  type JournalEintrag,
  type BuchungRichtungDto,
  type KettenBuchung,
  type KontoArt,
  type KontoDto,
  type StornoEingabe,
} from '@c4/shared';
import type { Db } from './db/client';
import {
  eventKategorien,
  events,
  finBelege,
  finExporte,
  finBuchungen,
  finBuchungszeilen,
  finEventKassen,
  finEventKassenAngepasst,
  finKassen,
  finKassenKategorien,
  finKassenabrechnungEvents,
  finKassenabrechnungPosten,
  finKassenabrechnungen,
  finKassenabrechnungTransfers,
  finKassenGrundbestand,
  finKassenzaehlungPosten,
  finKassenzaehlungen,
  finKonten,
  finStueckelung,
  finZaehler,
  finZaehlungen,
  finZaehlungPosten,
  type FinBuchungRow,
  type FinKontoRow,
} from './db/schema';
import { mitWiederholung } from './db/wiederholung';
import {
  baueEventKassen,
  baueKasseDto,
  eventTitelAnzeige,
  kasseNutzbarFehler,
  letzteAbrechnung,
  neuesteJeEvent,
  planeKassenabrechnung,
  type AbrechnungKurz,
} from './finanzenKassen';
import { createBelegeStore, type BelegeStore } from './finanzenBelege';
import type { Tx } from './waren';

// Finanzen: chart of accounts and the append-only journal (see docs/finanzen.md). Bookings are
// only ever inserted; a correction is a Storno. `seq` is gapless because every booking increments
// the counter row `fin_zaehler` 'journal' in its own transaction: DSQL's optimistic concurrency
// control aborts one of two parallel bookings with a conflict (40001), which `mitWiederholung` retries.

/** The booking is invalid; `fehler` are German messages. */
export class BuchungUngueltig extends Error {
  constructor(readonly fehler: string[]) {
    super(fehler.join(' '));
  }
}
/** The booking is already reversed, or it is itself a reversal. */
export class StornoKonflikt extends Error {}
/** Invalid account data (unknown parent, cycle). */
export class KontoUngueltig extends Error {}
/** The change is not allowed in the current state (account already has lines). */
export class KontoKonflikt extends Error {}

export interface KontoNeu {
  name: string;
  art: KontoArt;
  parentId: string | null;
  stueckelung: boolean;
  steuersatzStandard: number | null;
}

export interface GebuchtErgebnis {
  id: string;
  seq: number;
  /** True when the idempotency key was already used: the existing booking is returned. */
  wiederholt?: boolean;
}

export interface KettenDaten {
  buchungen: KettenBuchung[];
  zaehlerWert: number;
  zaehlerHash: string;
}

export interface FinanzenStore extends BelegeStore {
  /** All accounts by name with their balance (sum of own lines). */
  konten(mitArchiv: boolean): Promise<KontoDto[]>;
  /** Throws KontoUngueltig for an unknown parent. */
  kontoAnlegen(daten: KontoNeu): Promise<string>;
  /**
   * Changes only the given fields; false when the account does not exist. Throws KontoKonflikt when
   * `art`, `stueckelung` or `parentId` change although the account has lines, KontoUngueltig for an
   * unknown parent, itself as parent or a cycle.
   */
  kontoAendern(id: string, daten: Partial<KontoNeu>): Promise<boolean>;
  /** Accounts are archived, never deleted; false when it does not exist. */
  kontoArchivieren(id: string, archiviert: boolean): Promise<boolean>;
  /** Throws BuchungUngueltig. */
  buchen(eingabe: BuchungEingabe, sub: string): Promise<GebuchtErgebnis>;
  /** Reverses a booking; undefined when it does not exist, throws StornoKonflikt. */
  stornieren(id: string, eingabe: StornoEingabe, sub: string): Promise<GebuchtErgebnis | undefined>;
  /** Newest `seq` first. */
  /** Newest first, at most `limit` entries. */
  journal(abfrage: JournalAbfrage & { limit: number }): Promise<JournalEintrag[]>;
  buchung(id: string): Promise<BuchungDetailEintrag | undefined>;
  /** The Fächer of the Safe with their stock (balance and count per denomination). */
  bargeld(): Promise<BargeldUebersichtDto>;
  /**
   * Counts a Fach: stores the protocol and books the difference to the stock, in one transaction.
   * Throws BuchungUngueltig for an unknown, archived or non-Fach account.
   */
  zaehlen(eingabe: ZaehlungEingabe, sub: string): Promise<ZaehlungErgebnisDto>;
  /** Newest first, at most `limit` entries; optionally of one Fach. */
  zaehlungen(abfrage: { kontoId?: string; limit: number }): Promise<ZaehlungListeEintrag[]>;
  zaehlung(id: string): Promise<ZaehlungDetailEintrag | undefined>;
  /** All bookings by `seq` plus the counter, read in one consistent snapshot. */
  kettenDaten(): Promise<KettenDaten>;
  /** `bis_seq` of the last export (0 when there is none yet). */
  letzterExportSeq(): Promise<number>;
  /** Records a written export. */
  exportEintragen(export_: {
    datum: string;
    vonSeq: number;
    bisSeq: number;
    kopfHash: string;
    schluessel: string;
    erstelltAm: Date;
  }): Promise<void>;
  /** The Kassen with stock, Grundbestand and open Dienst-Zählungen; archived ones only on request. */
  kassen(mitArchiv: boolean): Promise<KasseDto[]>;
  /** Creates the Fach of the Kasse and its master data; throws KontoUngueltig for unusable accounts. Returns the account id. */
  kasseAnlegen(daten: KasseEingabe): Promise<string>;
  /** Replaces Grundbestand and default accounts; false when there is no such Kasse. Throws KontoUngueltig. */
  kasseAendern(kontoId: string, daten: KasseAendern): Promise<boolean>;
  /** Stock, master data and the Dienst-Zählungen since the last Abrechnung; undefined when there is no such Kasse. */
  kassenAbrechnungVorschau(kontoId: string): Promise<KassenabrechnungVorschauEintrag | undefined>;
  /** Settles a Kasse: stores the Abrechnung and books it in one transaction. Throws BuchungUngueltig. */
  kasseAbrechnen(
    eingabe: KassenabrechnungEingabe,
    sub: string,
  ): Promise<KassenabrechnungErgebnisDto>;
  /** Newest first, at most `limit` entries; optionally of one Kasse. */
  kassenabrechnungen(abfrage: {
    kontoId?: string;
    limit: number;
  }): Promise<KassenabrechnungListeEintrag[]>;
  kassenabrechnung(id: string): Promise<KassenabrechnungDetailEintrag | undefined>;
  /** The active Kassen without any stock (for the staff). */
  kassenKurz(): Promise<KasseKurzDto[]>;
  /** The Dienst-Zählungen of an event, newest first. */
  /**
   * The Kassen section of an event: assigned Kassen (explicit list or the default of the Kategorie), counted ones,
   * their income and the sum, plus the Dienst-Zählungen. Undefined when the event does not exist.
   */
  eventKassen(eventId: string): Promise<EventKassenEintrag | undefined>;
  /** Sets the Kassen of an event explicitly, `null` goes back to the Kategorie default. False when the event does not exist. Throws BuchungUngueltig. */
  eventKassenFestlegen(eventId: string, kontoIds: string[] | null): Promise<boolean>;
  /** Stores a Dienst-Zählung (no booking); throws BuchungUngueltig for an unknown or cancelled event or an unusable Kasse. */
  kasseZaehlen(eingabe: KassenzaehlungEingabe, sub: string): Promise<KassenzaehlungErgebnisDto>;
}

/** Retries of a booking on concurrency conflicts, and the first wait. */
const BUCHEN_VERSUCHE = 8;
const BUCHEN_WARTEN_MS = 50;
/** Bookings read per page when the whole chain is verified. */
const KETTE_SEITE = 200;

export interface BuchungsEntwurf {
  datum: string;
  text: string;
  quelleTyp: string;
  quelleId: string | null;
  eventId: string | null;
  stornoVon: string | null;
  erstelltVon: string;
  /** Technical key against double posting; not part of the hash. */
  idempotenzSchluessel?: string | null;
  zeilen: Omit<HashZeile, 'pos'>[];
  /** SHA-256 of the Beleg files; part of the hash. */
  belege?: { sha256: string }[];
}

/** Numbers an entry and chains it to `prevHash`; `jetzt` has millisecond precision by itself. */
export async function buchungErzeugen(
  entwurf: BuchungsEntwurf,
  seq: number,
  prevHash: string,
  jetzt: Date,
): Promise<{ buchung: KettenBuchung; zeilenIds: string[] }> {
  const zeilen: HashZeile[] = entwurf.zeilen.map((z, i) => ({ ...z, pos: i + 1 }));
  const basis = {
    seq,
    id: randomUUID(),
    datum: entwurf.datum,
    text: entwurf.text,
    quelleTyp: entwurf.quelleTyp,
    quelleId: entwurf.quelleId,
    eventId: entwurf.eventId,
    stornoVon: entwurf.stornoVon,
    erstelltVon: entwurf.erstelltVon,
    erstelltAm: jetzt.toISOString(),
    zeilen,
    ...(entwurf.belege && entwurf.belege.length > 0 && { belege: entwurf.belege }),
  };
  const hash = await buchungsHash(prevHash, basis);
  return { buchung: { ...basis, prevHash, hash }, zeilenIds: zeilen.map(() => randomUUID()) };
}

/** The lines of a manual booking in the form that is hashed. */
export const entwurfZeilen = (eingabe: BuchungEingabe): BuchungsEntwurf['zeilen'] =>
  eingabe.zeilen.map((z) => ({
    kontoId: z.kontoId,
    betragCent: z.betragCent,
    nettoCent: z.nettoCent,
    steuerCent: z.steuerCent,
    steuersatz: z.steuersatz,
    steuerArt: z.steuerArt,
    stueckelung: (z.stueckelung ?? []).map((s) => ({
      nennwertCent: s.nennwertCent,
      anzahl: s.anzahl,
    })),
  }));

export const ohnePos = (z: HashZeile): BuchungsEntwurf['zeilen'][number] => {
  const rest: Partial<HashZeile> = { ...z };
  delete rest.pos;
  return rest as BuchungsEntwurf['zeilen'][number];
};

export const stornoText = (original: { seq: number }, begruendung: string) =>
  `Storno von Nr. ${original.seq}: ${begruendung}`;

const istDoppelt = (err: unknown): boolean => {
  const e = err as { code?: unknown; cause?: unknown } | null;
  return e?.code === '23505' || (e?.cause as { code?: unknown } | null)?.code === '23505';
};

export type Q = Pick<Db, 'select'>;

/** Why an account cannot be counted (empty = it is a countable Fach). Shared with the fake. */
export const zaehlungKontoFehler = (
  konto: Pick<PruefKonto, 'name' | 'stueckelung' | 'archiviert' | 'hatUnterkonten'> | undefined,
): string[] => {
  if (!konto) return ['Das Fach gibt es nicht.'];
  if (!konto.stueckelung || konto.hatUnterkonten)
    return [`Das Konto „${konto.name}“ ist kein Fach und kann nicht gezählt werden.`];
  if (konto.archiviert) return [`Das Fach „${konto.name}“ ist archiviert.`];
  return [];
};

/** The Bargeld overview of the given Fächer (sorted by the caller). Shared with the fake. */
export function bargeldUebersicht(faecher: BestandKonto[]): BargeldUebersichtDto {
  const summe = new Map<number, number>();
  for (const f of faecher) for (const [n, a] of f.anzahl) summe.set(n, (summe.get(n) ?? 0) + a);
  return {
    faecher: faecher.map((f) => ({
      id: f.id,
      name: f.name,
      saldoCent: f.saldoCent,
      bestand: stueckelungVollstaendig(f.anzahl),
    })),
    summeBestand: stueckelungVollstaendig(summe),
    summeCent: faecher.reduce((s, f) => s + f.saldoCent, 0),
  };
}

const zaehlungEintrag = (
  z: {
    id: string;
    kontoId: string;
    datum: string;
    gezaehltVon: string;
    gezaehltAm: Date;
    sollCent: number;
    istCent: number;
    differenzCent: number;
    buchungId: string | null;
  },
  kontoName: string,
  seq: number | null,
): ZaehlungListeEintrag => ({
  id: z.id,
  kontoId: z.kontoId,
  kontoName,
  datum: z.datum,
  gezaehltVon: z.gezaehltVon,
  gezaehltAm: z.gezaehltAm.toISOString(),
  sollCent: z.sollCent,
  istCent: z.istCent,
  differenzCent: z.differenzCent,
  buchung: z.buchungId && seq !== null ? { id: z.buchungId, seq } : null,
});

/** Per Kasse the amount of the newest Abrechnung (not reversed) that booked the event. */
function abgerechneteBetraege(
  zeilen: readonly {
    kontoId: string;
    buchungId: string | null;
    erstelltAm: Date;
    betragCent: number;
  }[],
  storniert: ReadonlySet<string | null>,
): Map<string, number> {
  const neueste = new Map<string, { erstelltAm: Date; betragCent: number }>();
  for (const z of zeilen) {
    if (z.buchungId !== null && storniert.has(z.buchungId)) continue;
    const alt = neueste.get(z.kontoId);
    if (!alt || z.erstelltAm > alt.erstelltAm) neueste.set(z.kontoId, z);
  }
  return new Map([...neueste].map(([k, v]) => [k, v.betragCent]));
}

const abrechnungEintrag = (
  a: {
    id: string;
    kontoId: string;
    datum: string;
    sollCent: number;
    istCent: number;
    einnahmeCent: number;
    fehlerCent: number;
    buchungId: string | null;
    erstelltVon: string;
    erstelltAm: Date;
  },
  kontoName: string,
  seq: number | null,
  storniert: ReadonlySet<string | null>,
): KassenabrechnungListeEintrag => ({
  id: a.id,
  kontoId: a.kontoId,
  kontoName,
  datum: a.datum,
  sollCent: a.sollCent,
  istCent: a.istCent,
  einnahmeCent: a.einnahmeCent,
  fehlerCent: a.fehlerCent,
  buchung: a.buchungId && seq !== null ? { id: a.buchungId, seq } : null,
  storniert: a.buchungId !== null && storniert.has(a.buchungId),
  erstelltVon: a.erstelltVon,
  erstelltAm: a.erstelltAm.toISOString(),
});

export function createFinanzenStore(db: Db): FinanzenStore {
  const verweise = (rows: { id: string; seq: number }[]) =>
    new Map(rows.map((r) => [r.id, { id: r.id, seq: r.seq } satisfies BuchungVerweisDto]));

  /** Volume and reversal links for a page of bookings. */
  const listeAnreichern = async (q: Q, rows: FinBuchungRow[]): Promise<BuchungListeEintrag[]> => {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const originalIds = [...new Set(rows.flatMap((r) => (r.stornoVon ? [r.stornoVon] : [])))];
    const [zeilen, stornos, originale] = await Promise.all([
      q
        .select({
          buchungId: finBuchungszeilen.buchungId,
          betragCent: finBuchungszeilen.betragCent,
        })
        .from(finBuchungszeilen)
        .where(inArray(finBuchungszeilen.buchungId, ids)),
      q
        .select({ id: finBuchungen.id, seq: finBuchungen.seq, stornoVon: finBuchungen.stornoVon })
        .from(finBuchungen)
        .where(inArray(finBuchungen.stornoVon, ids)),
      originalIds.length === 0
        ? Promise.resolve([])
        : q
            .select({ id: finBuchungen.id, seq: finBuchungen.seq })
            .from(finBuchungen)
            .where(inArray(finBuchungen.id, originalIds)),
    ]);
    const volumen = new Map<string, number>();
    for (const z of zeilen) {
      if (z.betragCent > 0)
        volumen.set(z.buchungId, (volumen.get(z.buchungId) ?? 0) + z.betragCent);
    }
    const durch = new Map(stornos.map((s) => [s.stornoVon, { id: s.id, seq: s.seq }]));
    const original = verweise(originale);
    return rows.map((r) => ({
      id: r.id,
      seq: r.seq,
      datum: r.datum,
      text: r.text,
      quelleTyp: r.quelleTyp,
      eventId: r.eventId,
      stornoVon: (r.stornoVon && original.get(r.stornoVon)) || null,
      storniertDurch: durch.get(r.id) ?? null,
      betragCent: volumen.get(r.id) ?? 0,
      erstelltVon: r.erstelltVon,
      erstelltAm: r.erstelltAm.toISOString(),
    }));
  };

  /**
   * Direction of money per booking and, for an account filter, the account's effect and running
   * balance by `seq`: the balance after a booking is the account's total up to the highest `seq`
   * of the list minus the account's lines of all newer bookings, whatever the other filters or
   * the display order are.
   */
  const richtungAnreichern = async (
    q: Q,
    liste: BuchungListeEintrag[],
    kontoId: string | undefined,
  ): Promise<JournalEintrag[]> => {
    if (liste.length === 0) return [];
    const zeilen = await q
      .select({
        buchungId: finBuchungszeilen.buchungId,
        kontoId: finBuchungszeilen.kontoId,
        kontoName: finKonten.name,
        betragCent: finBuchungszeilen.betragCent,
      })
      .from(finBuchungszeilen)
      .innerJoin(finKonten, eq(finKonten.id, finBuchungszeilen.kontoId))
      .where(
        inArray(
          finBuchungszeilen.buchungId,
          liste.map((b) => b.id),
        ),
      );
    const saldoNach = new Map<number, number>();
    if (kontoId) {
      const hoechste = Math.max(...liste.map((b) => b.seq));
      const niedrigste = Math.min(...liste.map((b) => b.seq));
      const [summe] = await q
        .select({ summe: sql<string>`coalesce(sum(${finBuchungszeilen.betragCent}), 0)` })
        .from(finBuchungszeilen)
        .innerJoin(finBuchungen, eq(finBuchungen.id, finBuchungszeilen.buchungId))
        .where(and(eq(finBuchungszeilen.kontoId, kontoId), lte(finBuchungen.seq, hoechste)));
      // The account's movement per booking between the lowest and highest `seq` of the list.
      const bewegungen = await q
        .select({ seq: finBuchungen.seq, summe: sql<string>`sum(${finBuchungszeilen.betragCent})` })
        .from(finBuchungszeilen)
        .innerJoin(finBuchungen, eq(finBuchungen.id, finBuchungszeilen.buchungId))
        .where(
          and(
            eq(finBuchungszeilen.kontoId, kontoId),
            gte(finBuchungen.seq, niedrigste),
            lte(finBuchungen.seq, hoechste),
          ),
        )
        .groupBy(finBuchungen.seq)
        .orderBy(desc(finBuchungen.seq));
      let saldo = Number(summe?.summe ?? 0);
      for (const bew of bewegungen) {
        saldoNach.set(bew.seq, saldo);
        saldo -= Number(bew.summe);
      }
    }
    return liste.map((b) => {
      const seite = (vorzeichen: 1 | -1): BuchungRichtungDto[] => {
        const proKonto = new Map<string, BuchungRichtungDto>();
        for (const z of zeilen) {
          if (z.buchungId !== b.id || Math.sign(z.betragCent) !== vorzeichen) continue;
          const alt = proKonto.get(z.kontoId);
          proKonto.set(z.kontoId, {
            kontoId: z.kontoId,
            kontoName: z.kontoName,
            betragCent: (alt?.betragCent ?? 0) + Math.abs(z.betragCent),
          });
        }
        return [...proKonto.values()];
      };
      let konto: JournalEintrag['konto'] = null;
      if (kontoId) {
        const betrag = zeilen
          .filter((z) => z.buchungId === b.id && z.kontoId === kontoId)
          .reduce((s, z) => s + z.betragCent, 0);
        konto = { betragCent: betrag, saldoNachCent: saldoNach.get(b.seq) ?? 0 };
      }
      return { ...b, abgang: seite(-1), zugang: seite(1), konto };
    });
  };

  /** Lines (with denominations) of the given bookings, by booking and `pos`. */
  const zeilenLaden = async (q: Q, buchungIds: string[]) => {
    const zeilen = await q
      .select({ zeile: finBuchungszeilen, kontoName: finKonten.name })
      .from(finBuchungszeilen)
      .innerJoin(finKonten, eq(finKonten.id, finBuchungszeilen.kontoId))
      .where(inArray(finBuchungszeilen.buchungId, buchungIds))
      .orderBy(asc(finBuchungszeilen.buchungId), asc(finBuchungszeilen.pos));
    const stueck =
      zeilen.length === 0
        ? []
        : await q
            .select()
            .from(finStueckelung)
            .where(
              inArray(
                finStueckelung.zeileId,
                zeilen.map((z) => z.zeile.id),
              ),
            )
            .orderBy(asc(finStueckelung.nennwertCent));
    return zeilen.map(({ zeile, kontoName }) => ({
      ...zeile,
      kontoName,
      stueckelung: stueck
        .filter((s) => s.zeileId === zeile.id)
        .map((s) => ({ nennwertCent: s.nennwertCent, anzahl: s.anzahl })),
    }));
  };

  /** The given accounts as the rules need them, with their stock (Bargeld accounts only). */
  const kontenMitBestand = async (
    q: Q,
    ids: string[],
  ): Promise<{ pruef: PruefKonto[]; bestand: BestandKonto[]; rows: FinKontoRow[] }> => {
    if (ids.length === 0) return { pruef: [], bestand: [], rows: [] };
    const [rows, mitKindern] = await Promise.all([
      q.select().from(finKonten).where(inArray(finKonten.id, ids)),
      q
        .select({ parentId: finKonten.parentId })
        .from(finKonten)
        .where(inArray(finKonten.parentId, ids)),
    ]);
    const gruppen = new Set(mitKindern.map((r) => r.parentId));
    const pruef = rows.map((k) => ({ ...k, hatUnterkonten: gruppen.has(k.id) }));
    const bargeld = rows.filter((k) => k.art === 'bargeld');
    const bestand = await bestandLaden(q, bargeld);
    return { pruef, bestand, rows };
  };

  const bestandLaden = async (q: Q, rows: FinKontoRow[]): Promise<BestandKonto[]> => {
    if (rows.length === 0) return [];
    const ids = rows.map((k) => k.id);
    const [salden, anzahlen] = await Promise.all([
      q
        .select({
          kontoId: finBuchungszeilen.kontoId,
          summe: sql<string>`coalesce(sum(${finBuchungszeilen.betragCent}), 0)`,
        })
        .from(finBuchungszeilen)
        .where(inArray(finBuchungszeilen.kontoId, ids))
        .groupBy(finBuchungszeilen.kontoId),
      q
        .select({
          kontoId: finBuchungszeilen.kontoId,
          nennwertCent: finStueckelung.nennwertCent,
          summe: sql<string>`sum(${finStueckelung.anzahl})`,
        })
        .from(finStueckelung)
        .innerJoin(finBuchungszeilen, eq(finBuchungszeilen.id, finStueckelung.zeileId))
        .where(inArray(finBuchungszeilen.kontoId, ids))
        .groupBy(finBuchungszeilen.kontoId, finStueckelung.nennwertCent),
    ]);
    const saldo = new Map(salden.map((r) => [r.kontoId, Number(r.summe)]));
    return rows.map((k) => ({
      id: k.id,
      name: k.name,
      art: k.art,
      stueckelung: k.stueckelung,
      saldoCent: saldo.get(k.id) ?? 0,
      anzahl: new Map(
        anzahlen.filter((a) => a.kontoId === k.id).map((a) => [a.nennwertCent, Number(a.summe)]),
      ),
    }));
  };

  const einfuegen = async (tx: Tx, entwurf: BuchungsEntwurf): Promise<GebuchtErgebnis> => {
    const [zaehler] = await tx
      .update(finZaehler)
      .set({ wert: sql`${finZaehler.wert} + 1` })
      .where(eq(finZaehler.name, 'journal'))
      .returning({ wert: finZaehler.wert, letzterHash: finZaehler.letzterHash });
    if (!zaehler) throw new Error('Der Journal-Zähler fehlt (Migration 0148).');
    const { buchung, zeilenIds } = await buchungErzeugen(
      entwurf,
      zaehler.wert,
      zaehler.letzterHash,
      new Date(),
    );
    await tx.insert(finBuchungen).values({
      id: buchung.id,
      seq: buchung.seq,
      datum: buchung.datum,
      text: buchung.text,
      quelleTyp: buchung.quelleTyp,
      quelleId: buchung.quelleId,
      eventId: buchung.eventId,
      stornoVon: buchung.stornoVon,
      erstelltVon: buchung.erstelltVon,
      erstelltAm: new Date(buchung.erstelltAm),
      prevHash: buchung.prevHash,
      hash: buchung.hash,
      idempotenzSchluessel: entwurf.idempotenzSchluessel ?? null,
    });
    await tx.insert(finBuchungszeilen).values(
      buchung.zeilen.map((z, i) => ({
        id: zeilenIds[i]!,
        buchungId: buchung.id,
        pos: z.pos,
        kontoId: z.kontoId,
        betragCent: z.betragCent,
        nettoCent: z.nettoCent,
        steuerCent: z.steuerCent,
        steuersatz: z.steuersatz,
        steuerArt: z.steuerArt,
      })),
    );
    const stueckelung = buchung.zeilen.flatMap((z, i) =>
      z.stueckelung.map((s) => ({
        zeileId: zeilenIds[i]!,
        nennwertCent: s.nennwertCent,
        anzahl: s.anzahl,
      })),
    );
    if (stueckelung.length > 0) await tx.insert(finStueckelung).values(stueckelung);
    await tx
      .update(finZaehler)
      .set({ letzterHash: buchung.hash })
      .where(eq(finZaehler.name, 'journal'));
    return { id: buchung.id, seq: buchung.seq };
  };

  /** Looks up the booking made with this idempotency key. */
  const vorhandene = async (q: Q, schluessel: string): Promise<GebuchtErgebnis | undefined> => {
    const [row] = await q
      .select({ id: finBuchungen.id, seq: finBuchungen.seq })
      .from(finBuchungen)
      .where(eq(finBuchungen.idempotenzSchluessel, schluessel));
    return row ? { id: row.id, seq: row.seq, wiederholt: true } : undefined;
  };

  const buchenTx = (eingabe: BuchungEingabe, sub: string) =>
    mitWiederholung(
      () =>
        db.transaction(async (tx) => {
          const schon = await vorhandene(tx, eingabe.idempotenzSchluessel);
          if (schon) return schon;
          const ids = [...new Set(eingabe.zeilen.map((z) => z.kontoId))];
          const { pruef, bestand } = await kontenMitBestand(tx, ids);
          const fehler = [
            ...pruefeBuchung(eingabe, pruef),
            ...pruefeBestand(eingabe.zeilen, bestand),
          ];
          if (eingabe.eventId) {
            const [event] = await tx
              .select({ id: events.id })
              .from(events)
              .where(eq(events.id, eingabe.eventId));
            if (!event) fehler.push('Die Veranstaltung gibt es nicht.');
          }
          if (fehler.length > 0) throw new BuchungUngueltig(fehler);
          return einfuegen(tx, {
            datum: eingabe.datum,
            text: eingabe.text,
            quelleTyp: eingabe.quelleTyp,
            quelleId: null,
            eventId: eingabe.eventId,
            stornoVon: null,
            erstelltVon: sub,
            idempotenzSchluessel: eingabe.idempotenzSchluessel,
            zeilen: entwurfZeilen(eingabe),
          });
        }),
      BUCHEN_VERSUCHE,
      undefined,
      BUCHEN_WARTEN_MS,
    );

  const stornierenTx = (id: string, eingabe: StornoEingabe, sub: string) =>
    mitWiederholung(
      () =>
        db.transaction(async (tx) => {
          const schon = await vorhandene(tx, eingabe.idempotenzSchluessel);
          if (schon) return schon;
          const [original] = await tx.select().from(finBuchungen).where(eq(finBuchungen.id, id));
          if (!original) return undefined;
          if (original.stornoVon !== null)
            throw new StornoKonflikt('Ein Storno kann nicht storniert werden.');
          const [doppelt] = await tx
            .select({ id: finBuchungen.id })
            .from(finBuchungen)
            .where(eq(finBuchungen.stornoVon, id));
          if (doppelt) throw new StornoKonflikt('Die Buchung ist bereits storniert.');
          const quelle: HashZeile[] = (await zeilenLaden(tx, [id])).map((z) => ({
            pos: z.pos,
            kontoId: z.kontoId,
            betragCent: z.betragCent,
            nettoCent: z.nettoCent,
            steuerCent: z.steuerCent,
            steuersatz: z.steuersatz,
            steuerArt: z.steuerArt,
            stueckelung: z.stueckelung,
          }));
          const zeilen = stornoZeilen(quelle);
          const { pruef, bestand } = await kontenMitBestand(tx, [
            ...new Set(zeilen.map((z) => z.kontoId)),
          ]);
          const fehler = [...pruefeGruppenregel(zeilen, pruef), ...pruefeBestand(zeilen, bestand)];
          if (fehler.length > 0) throw new BuchungUngueltig(fehler);
          return einfuegen(tx, {
            datum: eingabe.datum,
            text: stornoText(original, eingabe.text),
            quelleTyp: 'storno',
            quelleId: original.id,
            eventId: original.eventId,
            stornoVon: original.id,
            erstelltVon: sub,
            idempotenzSchluessel: eingabe.idempotenzSchluessel,
            zeilen: zeilen.map(ohnePos),
          });
        }),
      BUCHEN_VERSUCHE,
      undefined,
      BUCHEN_WARTEN_MS,
    );

  const zaehlungErgebnis = (
    z: { id: string; differenzCent: number; buchungId: string | null },
    seq: number | null,
    wiederholt?: boolean,
  ): ZaehlungErgebnisDto => ({
    id: z.id,
    buchungId: z.buchungId,
    buchungSeq: seq,
    differenzCent: z.differenzCent,
    ...(wiederholt && { wiederholt }),
  });

  const zaehlungVorhandene = async (q: Q, schluessel: string) => {
    const [row] = await q
      .select({
        id: finZaehlungen.id,
        differenzCent: finZaehlungen.differenzCent,
        buchungId: finZaehlungen.buchungId,
        seq: finBuchungen.seq,
      })
      .from(finZaehlungen)
      .leftJoin(finBuchungen, eq(finBuchungen.id, finZaehlungen.buchungId))
      .where(eq(finZaehlungen.idempotenzSchluessel, schluessel));
    return row ? zaehlungErgebnis(row, row.seq, true) : undefined;
  };

  const zaehlenTx = (eingabe: ZaehlungEingabe, sub: string) =>
    mitWiederholung(
      () =>
        db.transaction(async (tx) => {
          const schon = await zaehlungVorhandene(tx, eingabe.idempotenzSchluessel);
          if (schon) return schon;
          const { pruef, bestand } = await kontenMitBestand(tx, [
            eingabe.kontoId,
            KASSENDIFFERENZ_KONTO_ID,
          ]);
          const fach = pruef.find((k) => k.id === eingabe.kontoId);
          const fachBestand = bestand.find((k) => k.id === eingabe.kontoId);
          const fehler = zaehlungKontoFehler(fach);
          if (fehler.length > 0 || !fach || !fachBestand) throw new BuchungUngueltig(fehler);
          const ergebnis = berechneZaehlung(
            fach.id,
            stueckelungVollstaendig(fachBestand.anzahl),
            eingabe.ist,
          );
          const zaehlungId = randomUUID();
          let gebucht: GebuchtErgebnis | undefined;
          if (ergebnis.zeilen.length > 0) {
            const zeilen = ergebnis.zeilen.map((z) => ({
              kontoId: z.kontoId,
              betragCent: z.betragCent,
              nettoCent: null,
              steuerCent: null,
              steuersatz: null,
              steuerArt: 'keine' as const,
              stueckelung: z.stueckelung,
            }));
            const buchungFehler = pruefeBuchung({ zeilen }, pruef);
            if (buchungFehler.length > 0) throw new BuchungUngueltig(buchungFehler);
            gebucht = await einfuegen(tx, {
              datum: eingabe.datum,
              text: eingabe.text ?? zaehlungBuchungstext(fach.name, ergebnis.differenzCent),
              quelleTyp: 'zaehlung',
              quelleId: zaehlungId,
              eventId: null,
              stornoVon: null,
              erstelltVon: sub,
              zeilen,
            });
          }
          await tx.insert(finZaehlungen).values({
            id: zaehlungId,
            kontoId: fach.id,
            datum: eingabe.datum,
            text: eingabe.text,
            gezaehltVon: sub,
            gezaehltAm: new Date(),
            sollCent: ergebnis.sollCent,
            istCent: ergebnis.istCent,
            differenzCent: ergebnis.differenzCent,
            buchungId: gebucht?.id ?? null,
            idempotenzSchluessel: eingabe.idempotenzSchluessel,
          });
          await tx.insert(finZaehlungPosten).values(
            ergebnis.posten.map((p) => ({
              zaehlungId,
              nennwertCent: p.nennwertCent,
              sollAnzahl: p.sollAnzahl,
              istAnzahl: p.istAnzahl,
            })),
          );
          return zaehlungErgebnis(
            {
              id: zaehlungId,
              differenzCent: ergebnis.differenzCent,
              buchungId: gebucht?.id ?? null,
            },
            gebucht?.seq ?? null,
          );
        }),
      BUCHEN_VERSUCHE,
      undefined,
      BUCHEN_WARTEN_MS,
    );

  // ----- Barkassen

  const kassenKonten = async (
    q: Q,
    ids: string[],
  ): Promise<{ konten: KassenKonto[]; bestand: BestandKonto[] }> => {
    const { pruef, bestand, rows } = await kontenMitBestand(q, ids);
    const gruppen = new Map(pruef.map((k) => [k.id, k.hatUnterkonten]));
    return {
      konten: rows.map((k) => ({
        id: k.id,
        name: k.name,
        art: k.art,
        stueckelung: k.stueckelung,
        archiviert: k.archiviert,
        steuersatzStandard: k.steuersatzStandard,
        hatUnterkonten: gruppen.get(k.id) ?? false,
      })),
      bestand,
    };
  };

  /** Abrechnungen of the Kassen in short form, with the reversal state of their booking. */
  const abrechnungenKurz = async (q: Q, kontoIds: string[]) => {
    const rows = await q
      .select({ a: finKassenabrechnungen, seq: finBuchungen.seq })
      .from(finKassenabrechnungen)
      .leftJoin(finBuchungen, eq(finBuchungen.id, finKassenabrechnungen.buchungId))
      .where(inArray(finKassenabrechnungen.kontoId, kontoIds));
    const buchungIds = rows.flatMap((r) => (r.a.buchungId ? [r.a.buchungId] : []));
    const storniert = new Set(
      buchungIds.length === 0
        ? []
        : (
            await q
              .select({ stornoVon: finBuchungen.stornoVon })
              .from(finBuchungen)
              .where(inArray(finBuchungen.stornoVon, buchungIds))
          ).map((r) => r.stornoVon),
    );
    const nachKasse = new Map<string, AbrechnungKurz[]>();
    for (const r of rows) {
      nachKasse.set(r.a.kontoId, [
        ...(nachKasse.get(r.a.kontoId) ?? []),
        {
          id: r.a.id,
          datum: r.a.datum,
          buchung: r.a.buchungId && r.seq !== null ? { id: r.a.buchungId, seq: r.seq } : null,
          erstelltAm: r.a.erstelltAm.toISOString(),
          storniert: r.a.buchungId !== null && storniert.has(r.a.buchungId),
        },
      ]);
    }
    return { nachKasse, storniert };
  };

  /** The Kassen (one, or all) with the data of `KasseDto` and the time of the last Abrechnung. */
  const kassenLaden = async (
    q: Q,
    opts: { kontoId?: string; mitArchiv: boolean },
  ): Promise<{ dto: KasseDto; seit: string | null }[]> => {
    const rows = await q
      .select({ kasse: finKassen, konto: finKonten })
      .from(finKassen)
      .innerJoin(finKonten, eq(finKonten.id, finKassen.kontoId))
      .where(
        opts.kontoId
          ? eq(finKassen.kontoId, opts.kontoId)
          : opts.mitArchiv
            ? undefined
            : eq(finKonten.archiviert, false),
      )
      .orderBy(asc(finKonten.name));
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.kasse.kontoId);
    const verweisIds = [
      ...new Set(rows.flatMap((r) => [r.kasse.standardErloesKontoId, r.kasse.standardZielFachId])),
    ];
    const [namen, { bestand }, grund, { nachKasse }, zaehlungen, kategorien] = await Promise.all([
      q
        .select({ id: finKonten.id, name: finKonten.name })
        .from(finKonten)
        .where(inArray(finKonten.id, verweisIds)),
      kassenKonten(q, ids),
      q.select().from(finKassenGrundbestand).where(inArray(finKassenGrundbestand.kontoId, ids)),
      abrechnungenKurz(q, ids),
      q
        .select({
          id: finKassenzaehlungen.id,
          kontoId: finKassenzaehlungen.kontoId,
          eventId: finKassenzaehlungen.eventId,
          gezaehltAm: finKassenzaehlungen.gezaehltAm,
        })
        .from(finKassenzaehlungen)
        .where(inArray(finKassenzaehlungen.kontoId, ids)),
      q.select().from(finKassenKategorien).where(inArray(finKassenKategorien.kontoId, ids)),
    ]);
    const name = new Map(namen.map((n) => [n.id, n.name]));
    return rows.map(({ kasse, konto }) => {
      const abrechnungen = nachKasse.get(kasse.kontoId) ?? [];
      const dto = baueKasseDto({
        konto,
        bestand: bestand.find((b) => b.id === kasse.kontoId)!,
        grundbestand: grund
          .filter((g) => g.kontoId === kasse.kontoId)
          .map((g) => ({ nennwertCent: g.nennwertCent, anzahl: g.anzahl })),
        erloesKonto: {
          id: kasse.standardErloesKontoId,
          name: name.get(kasse.standardErloesKontoId) ?? '',
        },
        zielFach: {
          id: kasse.standardZielFachId,
          name: name.get(kasse.standardZielFachId) ?? '',
        },
        abrechnungen,
        standardKategorieIds: kategorien
          .filter((k) => k.kontoId === kasse.kontoId)
          .map((k) => k.kategorieId),
        zaehlungen: zaehlungen
          .filter((z) => z.kontoId === kasse.kontoId)
          .map((z) => ({ id: z.id, eventId: z.eventId, gezaehltAm: z.gezaehltAm.toISOString() })),
      });
      return { dto, seit: letzteAbrechnung(abrechnungen)?.erstelltAm ?? null };
    });
  };

  const zaehlungenVonEvent = async (eventId: string): Promise<KassenzaehlungEintrag[]> => {
    const rows = await db
      .select({ z: finKassenzaehlungen, kontoName: finKonten.name })
      .from(finKassenzaehlungen)
      .innerJoin(finKonten, eq(finKonten.id, finKassenzaehlungen.kontoId))
      .where(eq(finKassenzaehlungen.eventId, eventId))
      .orderBy(desc(finKassenzaehlungen.gezaehltAm), desc(finKassenzaehlungen.id));
    if (rows.length === 0) return [];
    const posten = await db
      .select()
      .from(finKassenzaehlungPosten)
      .where(
        inArray(
          finKassenzaehlungPosten.zaehlungId,
          rows.map((r) => r.z.id),
        ),
      );
    // Rows are newest first: the first of a Kasse counts, the others are replaced.
    const gilt = new Set<string>();
    return rows.map((r): KassenzaehlungEintrag => {
      const ersetzt = gilt.has(r.z.kontoId);
      gilt.add(r.z.kontoId);
      return {
        id: r.z.id,
        kontoId: r.z.kontoId,
        kontoName: r.kontoName,
        eventId: r.z.eventId,
        summeCent: r.z.summeCent,
        posten: stueckelungVollstaendig(
          new Map(
            posten
              .filter((p) => p.zaehlungId === r.z.id)
              .map((p) => [p.nennwertCent, p.anzahl] as [number, number]),
          ),
        ),
        gezaehltVon: r.z.gezaehltVon,
        gezaehltAm: r.z.gezaehltAm.toISOString(),
        ersetzt,
      };
    });
  };

  /** Replaces the standard Kategorien of a Kasse; throws KontoUngueltig for unknown Kategorien. */
  const kategorienSetzen = async (tx: Tx, kontoId: string, kategorieIds: readonly string[]) => {
    const ids = [...new Set(kategorieIds)];
    if (ids.length > 0) {
      const da = await tx
        .select({ id: eventKategorien.id })
        .from(eventKategorien)
        .where(inArray(eventKategorien.id, ids));
      if (da.length !== ids.length) throw new KontoUngueltig('Eine Event-Kategorie gibt es nicht.');
    }
    await tx.delete(finKassenKategorien).where(eq(finKassenKategorien.kontoId, kontoId));
    if (ids.length > 0)
      await tx
        .insert(finKassenKategorien)
        .values(ids.map((kategorieId) => ({ kategorieId, kontoId })));
  };

  const grundbestandZeilen = (
    kontoId: string,
    grundbestand: readonly { nennwertCent: number; anzahl: number }[],
  ) =>
    grundbestand
      .filter((g) => g.anzahl > 0)
      .map((g) => ({ kontoId, nennwertCent: g.nennwertCent, anzahl: g.anzahl }));

  /** Checks Erlöskonto and Ziel-Fach of a Kasse; throws KontoUngueltig. */
  const kasseKontenPruefen = async (
    q: Q,
    erloesId: string,
    zielId: string,
    kasseId: string | null,
  ) => {
    const { konten } = await kassenKonten(q, [erloesId, zielId]);
    const fehler = kasseKontenFehler(
      konten.find((k) => k.id === erloesId),
      konten.find((k) => k.id === zielId),
      kasseId,
    );
    if (fehler.length > 0) throw new KontoUngueltig(fehler.join(' '));
  };

  const abrechnungErgebnis = (
    a: { id: string; buchungId: string | null; einnahmeCent: number; fehlerCent: number },
    seq: number | null,
    wiederholt?: boolean,
  ): KassenabrechnungErgebnisDto => ({
    id: a.id,
    buchungId: a.buchungId,
    buchungSeq: seq,
    einnahmeCent: a.einnahmeCent,
    fehlerCent: a.fehlerCent,
    ...(wiederholt && { wiederholt }),
  });

  const abrechnungVorhandene = async (q: Q, schluessel: string) => {
    const [row] = await q
      .select({
        id: finKassenabrechnungen.id,
        buchungId: finKassenabrechnungen.buchungId,
        einnahmeCent: finKassenabrechnungen.einnahmeCent,
        fehlerCent: finKassenabrechnungen.fehlerCent,
        seq: finBuchungen.seq,
      })
      .from(finKassenabrechnungen)
      .leftJoin(finBuchungen, eq(finBuchungen.id, finKassenabrechnungen.buchungId))
      .where(eq(finKassenabrechnungen.idempotenzSchluessel, schluessel));
    return row ? abrechnungErgebnis(row, row.seq, true) : undefined;
  };

  const kasseAbrechnenTx = (eingabe: KassenabrechnungEingabe, sub: string) =>
    mitWiederholung(
      () =>
        db.transaction(async (tx) => {
          const schon = await abrechnungVorhandene(tx, eingabe.idempotenzSchluessel);
          if (schon) return schon;
          const [stamm] = await tx
            .select()
            .from(finKassen)
            .where(eq(finKassen.kontoId, eingabe.kontoId));
          const ids = [
            ...new Set([
              eingabe.kontoId,
              eingabe.erloesKontoId,
              eingabe.zielFachId,
              ...eingabe.transfers.map((t) => t.fachId),
            ]),
          ];
          const { konten, bestand } = await kassenKonten(tx, ids);
          const kasse = konten.find((k) => k.id === eingabe.kontoId);
          const nutzbar = kasseNutzbarFehler(stamm, kasse);
          if (nutzbar.length > 0) throw new BuchungUngueltig(nutzbar);
          const grund = await tx
            .select()
            .from(finKassenGrundbestand)
            .where(eq(finKassenGrundbestand.kontoId, eingabe.kontoId));
          const eventFehler: string[] = [];
          if (eingabe.events.length > 0) {
            const vorhandeneEvents = await tx
              .select({ id: events.id })
              .from(events)
              .where(
                inArray(
                  events.id,
                  eingabe.events.map((e) => e.eventId),
                ),
              );
            const da = new Set(vorhandeneEvents.map((e) => e.id));
            if (eingabe.events.some((e) => !da.has(e.eventId)))
              eventFehler.push('Ein Event der Zuordnung gibt es nicht.');
            const zIds = eingabe.events.flatMap((e) => (e.zaehlungId ? [e.zaehlungId] : []));
            if (zIds.length > 0) {
              const zRows = await tx
                .select({
                  id: finKassenzaehlungen.id,
                  kontoId: finKassenzaehlungen.kontoId,
                  eventId: finKassenzaehlungen.eventId,
                })
                .from(finKassenzaehlungen)
                .where(inArray(finKassenzaehlungen.id, zIds));
              const z = new Map(zRows.map((r) => [r.id, r]));
              for (const e of eingabe.events) {
                if (!e.zaehlungId) continue;
                const r = z.get(e.zaehlungId);
                if (!r || r.kontoId !== eingabe.kontoId || r.eventId !== e.eventId)
                  eventFehler.push(
                    'Eine Dienst-Zählung der Zuordnung passt nicht zur Kasse und zum Event.',
                  );
              }
            }
          }
          const plan = planeKassenabrechnung({
            eingabe,
            stamm: {
              kontoId: eingabe.kontoId,
              grundbestand: grund.map((g) => ({ nennwertCent: g.nennwertCent, anzahl: g.anzahl })),
            },
            konten,
            bestand,
          });
          const fehler = [...eventFehler, ...plan.fehler];
          if (fehler.length > 0 || !plan.rechnung || !kasse) throw new BuchungUngueltig(fehler);
          const r = plan.rechnung;
          const abrechnungId = randomUUID();
          const gebucht =
            r.zeilen.length > 0
              ? await einfuegen(tx, {
                  datum: eingabe.datum,
                  text: kassenabrechnungBuchungstext(kasse.name, r.einnahmeCent),
                  quelleTyp: 'kassenabrechnung',
                  quelleId: abrechnungId,
                  eventId: null,
                  stornoVon: null,
                  erstelltVon: sub,
                  zeilen: r.zeilen,
                })
              : undefined;
          await tx.insert(finKassenabrechnungen).values({
            id: abrechnungId,
            kontoId: eingabe.kontoId,
            datum: eingabe.datum,
            buchungId: gebucht?.id ?? null,
            erloesKontoId: eingabe.erloesKontoId,
            zielFachId: eingabe.zielFachId,
            sollCent: r.sollCent,
            istCent: r.istCent,
            einnahmeCent: r.einnahmeCent,
            transferCent: r.transferCent,
            fehlerCent: r.fehlerCent,
            erstelltVon: sub,
            erstelltAm: new Date(),
            idempotenzSchluessel: eingabe.idempotenzSchluessel,
          });
          await tx.insert(finKassenabrechnungPosten).values(
            r.posten.map((p) => ({
              abrechnungId,
              nennwertCent: p.nennwertCent,
              soll: p.soll,
              ist: p.ist,
              grundbestand: p.grundbestand,
              danach: p.danach,
            })),
          );
          if (eingabe.transfers.length > 0)
            await tx.insert(finKassenabrechnungTransfers).values(
              eingabe.transfers.map((t) => ({
                abrechnungId,
                fachId: t.fachId,
                nennwertCent: t.nennwertCent,
                anzahl: t.anzahl,
              })),
            );
          if (eingabe.events.length > 0)
            await tx.insert(finKassenabrechnungEvents).values(
              eingabe.events.map((e) => ({
                abrechnungId,
                eventId: e.eventId,
                zaehlungId: e.zaehlungId,
                betragCent: e.betragCent,
              })),
            );
          return abrechnungErgebnis(
            {
              id: abrechnungId,
              buchungId: gebucht?.id ?? null,
              einnahmeCent: r.einnahmeCent,
              fehlerCent: r.fehlerCent,
            },
            gebucht?.seq ?? null,
          );
        }),
      BUCHEN_VERSUCHE,
      undefined,
      BUCHEN_WARTEN_MS,
    );

  const kassenzaehlungVorhandene = async (q: Q, schluessel: string) => {
    const [row] = await q
      .select({ id: finKassenzaehlungen.id, summeCent: finKassenzaehlungen.summeCent })
      .from(finKassenzaehlungen)
      .where(eq(finKassenzaehlungen.idempotenzSchluessel, schluessel));
    return row ? ({ ...row, wiederholt: true } satisfies KassenzaehlungErgebnisDto) : undefined;
  };

  const kasseZaehlenTx = (eingabe: KassenzaehlungEingabe, sub: string) =>
    mitWiederholung(
      () =>
        db.transaction(async (tx) => {
          const schon = await kassenzaehlungVorhandene(tx, eingabe.idempotenzSchluessel);
          if (schon) return schon;
          const [kasse] = await tx
            .select({ konto: finKonten })
            .from(finKassen)
            .innerJoin(finKonten, eq(finKonten.id, finKassen.kontoId))
            .where(eq(finKassen.kontoId, eingabe.kontoId));
          const fehler = kasseNutzbarFehler(kasse, kasse?.konto);
          const [event] = await tx
            .select({ id: events.id, abgesagt: events.abgesagt })
            .from(events)
            .where(eq(events.id, eingabe.eventId));
          if (!event) fehler.push('Das Event gibt es nicht.');
          else if (event.abgesagt) fehler.push('Das Event ist abgesagt.');
          if (fehler.length > 0) throw new BuchungUngueltig(fehler);
          const id = randomUUID();
          const summeCent = stueckelungSumme(eingabe.ist);
          await tx.insert(finKassenzaehlungen).values({
            id,
            kontoId: eingabe.kontoId,
            eventId: eingabe.eventId,
            summeCent,
            gezaehltVon: sub,
            gezaehltAm: new Date(),
            idempotenzSchluessel: eingabe.idempotenzSchluessel,
          });
          const ist = anzahlenAus(eingabe.ist);
          await tx.insert(finKassenzaehlungPosten).values(
            stueckelungVollstaendig(ist).map((p) => ({
              zaehlungId: id,
              nennwertCent: p.nennwertCent,
              anzahl: p.anzahl,
            })),
          );
          return { id, summeCent } satisfies KassenzaehlungErgebnisDto;
        }),
      BUCHEN_VERSUCHE,
      undefined,
      BUCHEN_WARTEN_MS,
    );

  /** True if `kontoId` would end up below itself when `elternId` becomes its parent. */
  const ergibtZyklus = async (kontoId: string, elternId: string): Promise<boolean> => {
    const rows = await db
      .select({ id: finKonten.id, parentId: finKonten.parentId })
      .from(finKonten);
    const eltern = new Map(rows.map((r) => [r.id, r.parentId]));
    for (let id: string | null | undefined = elternId, i = 0; id && i <= rows.length; i++) {
      if (id === kontoId) return true;
      id = eltern.get(id);
    }
    return false;
  };

  /** `bisher`: the current parent; the lines rule only applies when the parent changes. */
  const parentPruefen = async (kontoId: string | null, parentId: string, bisher: string | null) => {
    if (kontoId !== null && parentId === kontoId)
      throw new KontoUngueltig('Ein Konto kann nicht sein eigenes Unterkonto sein.');
    const [parent] = await db
      .select({ id: finKonten.id, name: finKonten.name })
      .from(finKonten)
      .where(eq(finKonten.id, parentId));
    if (!parent) throw new KontoUngueltig('Das übergeordnete Konto gibt es nicht.');
    if (kontoId !== null && (await ergibtZyklus(kontoId, parentId)))
      throw new KontoUngueltig('Das übergeordnete Konto liegt selbst unter diesem Konto.');
    if (parentId !== bisher) {
      const [zeile] = await db
        .select({ id: finBuchungszeilen.id })
        .from(finBuchungszeilen)
        .where(eq(finBuchungszeilen.kontoId, parentId))
        .limit(1);
      if (zeile)
        throw new KontoKonflikt(
          `Das Konto „${parent.name}“ hat schon Buchungen und kann keine Unterkonten bekommen.`,
        );
    }
  };

  const belege = createBelegeStore(db, {
    einfuegen,
    kontenMitBestand,
    bestandLaden,
    wiederholen: (fn) => mitWiederholung(fn, BUCHEN_VERSUCHE, undefined, BUCHEN_WARTEN_MS),
  });

  return {
    ...belege,
    async konten(mitArchiv) {
      const [alle, summen] = await Promise.all([
        db.select().from(finKonten).orderBy(asc(finKonten.name)),
        db
          .select({
            kontoId: finBuchungszeilen.kontoId,
            summe: sql<string>`coalesce(sum(${finBuchungszeilen.betragCent}), 0)`,
          })
          .from(finBuchungszeilen)
          .groupBy(finBuchungszeilen.kontoId),
      ]);
      const saldo = new Map(summen.map((s) => [s.kontoId, Number(s.summe)]));
      const gesamt = saldoGesamt(
        alle.map((k) => ({ id: k.id, parentId: k.parentId, saldoCent: saldo.get(k.id) ?? 0 })),
      );
      return alle
        .filter((k) => mitArchiv || !k.archiviert)
        .map((k) => ({
          id: k.id,
          name: k.name,
          art: k.art,
          parentId: k.parentId,
          stueckelung: k.stueckelung,
          steuersatzStandard: k.steuersatzStandard,
          archiviert: k.archiviert,
          saldoCent: saldo.get(k.id) ?? 0,
          saldoGesamtCent: gesamt.get(k.id) ?? 0,
        }));
    },

    async kontoAnlegen(daten) {
      if (daten.parentId) await parentPruefen(null, daten.parentId, null);
      const id = randomUUID();
      await db.insert(finKonten).values({ id, ...daten });
      return id;
    },

    async kontoAendern(id, daten) {
      const [konto] = await db.select().from(finKonten).where(eq(finKonten.id, id));
      if (!konto) return false;
      const strukturAendert =
        (daten.art !== undefined && daten.art !== konto.art) ||
        (daten.stueckelung !== undefined && daten.stueckelung !== konto.stueckelung) ||
        (daten.parentId !== undefined && daten.parentId !== konto.parentId);
      if (strukturAendert) {
        const [zeile] = await db
          .select({ id: finBuchungszeilen.id })
          .from(finBuchungszeilen)
          .where(eq(finBuchungszeilen.kontoId, id))
          .limit(1);
        if (zeile)
          throw new KontoKonflikt(
            'Art, Stückelung und übergeordnetes Konto lassen sich nicht mehr ändern, sobald auf dem Konto gebucht wurde.',
          );
      }
      if (daten.parentId) await parentPruefen(id, daten.parentId, konto.parentId);
      await db.update(finKonten).set(daten).where(eq(finKonten.id, id));
      return true;
    },

    async kontoArchivieren(id, archiviert) {
      const rows = await db
        .update(finKonten)
        .set({ archiviert })
        .where(eq(finKonten.id, id))
        .returning({ id: finKonten.id });
      return rows.length > 0;
    },

    async buchen(eingabe, sub) {
      try {
        return await buchenTx(eingabe, sub);
      } catch (err) {
        // The unique index on idempotenz_schluessel catches two parallel requests with one key.
        if (istDoppelt(err)) {
          const schon = await vorhandene(db, eingabe.idempotenzSchluessel);
          if (schon) return schon;
        }
        throw err;
      }
    },

    async stornieren(id, eingabe, sub) {
      try {
        return await stornierenTx(id, eingabe, sub);
      } catch (err) {
        if (istDoppelt(err)) {
          const schon = await vorhandene(db, eingabe.idempotenzSchluessel);
          if (schon) return schon;
          // The unique index on storno_von catches two reversals racing each other.
          throw new StornoKonflikt('Die Buchung ist bereits storniert.');
        }
        throw err;
      }
    },

    async journal({ von, bis, kontoId, storno, limit }) {
      const rows = await db
        .select()
        .from(finBuchungen)
        .where(
          and(
            von ? gte(finBuchungen.datum, von) : undefined,
            bis ? lte(finBuchungen.datum, bis) : undefined,
            kontoId
              ? inArray(
                  finBuchungen.id,
                  db
                    .select({ id: finBuchungszeilen.buchungId })
                    .from(finBuchungszeilen)
                    .where(eq(finBuchungszeilen.kontoId, kontoId)),
                )
              : undefined,
            // Reversals and the originals they reversed.
            storno
              ? or(
                  isNotNull(finBuchungen.stornoVon),
                  inArray(
                    finBuchungen.id,
                    db
                      .select({ id: finBuchungen.stornoVon })
                      .from(finBuchungen)
                      .where(isNotNull(finBuchungen.stornoVon)),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(finBuchungen.seq))
        .limit(limit);
      return richtungAnreichern(db, await listeAnreichern(db, rows), kontoId);
    },

    async buchung(id) {
      const [row] = await db.select().from(finBuchungen).where(eq(finBuchungen.id, id));
      if (!row) return undefined;
      const [eintrag] = await listeAnreichern(db, [row]);
      const zeilen = await zeilenLaden(db, [id]);
      return {
        ...eintrag!,
        quelleId: row.quelleId,
        prevHash: row.prevHash,
        hash: row.hash,
        zeilen: zeilen.map((z): BuchungZeileDto => ({
          id: z.id,
          pos: z.pos,
          kontoId: z.kontoId,
          kontoName: z.kontoName,
          betragCent: z.betragCent,
          nettoCent: z.nettoCent,
          steuerCent: z.steuerCent,
          steuersatz: z.steuersatz,
          steuerArt: z.steuerArt,
          stueckelung: z.stueckelung,
        })),
      };
    },

    async bargeld() {
      const faecher = await db
        .select()
        .from(finKonten)
        .where(
          and(
            eq(finKonten.parentId, SAFE_KONTO_ID),
            eq(finKonten.stueckelung, true),
            eq(finKonten.archiviert, false),
          ),
        )
        .orderBy(asc(finKonten.name));
      return bargeldUebersicht(await bestandLaden(db, faecher));
    },

    async zaehlen(eingabe, sub) {
      try {
        return await zaehlenTx(eingabe, sub);
      } catch (err) {
        if (istDoppelt(err)) {
          const schon = await zaehlungVorhandene(db, eingabe.idempotenzSchluessel);
          if (schon) return schon;
        }
        throw err;
      }
    },

    async zaehlungen({ kontoId, limit }) {
      const rows = await db
        .select({ z: finZaehlungen, kontoName: finKonten.name, seq: finBuchungen.seq })
        .from(finZaehlungen)
        .innerJoin(finKonten, eq(finKonten.id, finZaehlungen.kontoId))
        .leftJoin(finBuchungen, eq(finBuchungen.id, finZaehlungen.buchungId))
        .where(kontoId ? eq(finZaehlungen.kontoId, kontoId) : undefined)
        .orderBy(desc(finZaehlungen.gezaehltAm), desc(finZaehlungen.id))
        .limit(limit);
      return rows.map((r) => zaehlungEintrag(r.z, r.kontoName, r.seq));
    },

    async zaehlung(id) {
      const [r] = await db
        .select({ z: finZaehlungen, kontoName: finKonten.name, seq: finBuchungen.seq })
        .from(finZaehlungen)
        .innerJoin(finKonten, eq(finKonten.id, finZaehlungen.kontoId))
        .leftJoin(finBuchungen, eq(finBuchungen.id, finZaehlungen.buchungId))
        .where(eq(finZaehlungen.id, id));
      if (!r) return undefined;
      const posten = await db
        .select()
        .from(finZaehlungPosten)
        .where(eq(finZaehlungPosten.zaehlungId, id))
        .orderBy(asc(finZaehlungPosten.nennwertCent));
      return {
        ...zaehlungEintrag(r.z, r.kontoName, r.seq),
        text: r.z.text,
        posten: posten.map((p) => ({
          nennwertCent: p.nennwertCent,
          sollAnzahl: p.sollAnzahl,
          istAnzahl: p.istAnzahl,
          differenzAnzahl: p.istAnzahl - p.sollAnzahl,
        })),
      };
    },

    async kassen(mitArchiv) {
      return (await kassenLaden(db, { mitArchiv })).map((k) => k.dto);
    },

    async kasseAnlegen(daten) {
      return mitWiederholung(() =>
        db.transaction(async (tx) => {
          await kasseKontenPruefen(tx, daten.standardErloesKontoId, daten.standardZielFachId, null);
          const id = randomUUID();
          await tx.insert(finKonten).values({
            id,
            name: daten.name,
            art: 'bargeld',
            parentId: SAFE_KONTO_ID,
            stueckelung: true,
            steuersatzStandard: null,
          });
          await tx.insert(finKassen).values({
            kontoId: id,
            standardErloesKontoId: daten.standardErloesKontoId,
            standardZielFachId: daten.standardZielFachId,
            geaendertAm: new Date(),
          });
          const zeilen = grundbestandZeilen(id, daten.grundbestand);
          if (zeilen.length > 0) await tx.insert(finKassenGrundbestand).values(zeilen);
          await kategorienSetzen(tx, id, daten.standardKategorieIds);
          return id;
        }),
      );
    },

    async kasseAendern(kontoId, daten) {
      return mitWiederholung(() =>
        db.transaction(async (tx) => {
          const [stamm] = await tx.select().from(finKassen).where(eq(finKassen.kontoId, kontoId));
          if (!stamm) return false;
          await kasseKontenPruefen(
            tx,
            daten.standardErloesKontoId,
            daten.standardZielFachId,
            kontoId,
          );
          if (daten.name !== undefined)
            await tx.update(finKonten).set({ name: daten.name }).where(eq(finKonten.id, kontoId));
          await tx
            .update(finKassen)
            .set({
              standardErloesKontoId: daten.standardErloesKontoId,
              standardZielFachId: daten.standardZielFachId,
              geaendertAm: new Date(),
            })
            .where(eq(finKassen.kontoId, kontoId));
          await tx.delete(finKassenGrundbestand).where(eq(finKassenGrundbestand.kontoId, kontoId));
          const zeilen = grundbestandZeilen(kontoId, daten.grundbestand);
          if (zeilen.length > 0) await tx.insert(finKassenGrundbestand).values(zeilen);
          if (daten.standardKategorieIds !== undefined)
            await kategorienSetzen(tx, kontoId, daten.standardKategorieIds);
          return true;
        }),
      );
    },

    async kassenAbrechnungVorschau(kontoId) {
      const [kasse] = await kassenLaden(db, { kontoId, mitArchiv: true });
      if (!kasse) return undefined;
      const rows = await db
        .select({
          z: finKassenzaehlungen,
          eventTitel: events.titel,
          eventBeginn: events.beginn,
          kategorie: eventKategorien.name,
        })
        .from(finKassenzaehlungen)
        .innerJoin(events, eq(events.id, finKassenzaehlungen.eventId))
        .innerJoin(eventKategorien, eq(eventKategorien.id, events.kategorieId))
        .where(
          and(
            eq(finKassenzaehlungen.kontoId, kontoId),
            kasse.seit ? gt(finKassenzaehlungen.gezaehltAm, new Date(kasse.seit)) : undefined,
          ),
        );
      const neueste = neuesteJeEvent(
        rows.map((r) => ({
          id: r.z.id,
          eventId: r.z.eventId,
          gezaehltAm: r.z.gezaehltAm.toISOString(),
          eintrag: {
            id: r.z.id,
            eventId: r.z.eventId,
            eventTitel: eventTitelAnzeige(r.eventTitel, r.kategorie),
            eventBeginn: r.eventBeginn.toISOString(),
            summeCent: r.z.summeCent,
            gezaehltVon: r.z.gezaehltVon,
            gezaehltAm: r.z.gezaehltAm.toISOString(),
          },
        })),
      )
        .map((x) => x.eintrag)
        .sort(
          (a, b) =>
            a.eventBeginn.localeCompare(b.eventBeginn) || a.eventId.localeCompare(b.eventId),
        );
      return { kasse: kasse.dto, zaehlungen: neueste };
    },

    async kasseAbrechnen(eingabe, sub) {
      try {
        return await kasseAbrechnenTx(eingabe, sub);
      } catch (err) {
        if (istDoppelt(err)) {
          const schon = await abrechnungVorhandene(db, eingabe.idempotenzSchluessel);
          if (schon) return schon;
        }
        throw err;
      }
    },

    async kassenabrechnungen({ kontoId, limit }) {
      const rows = await db
        .select({ a: finKassenabrechnungen, kontoName: finKonten.name, seq: finBuchungen.seq })
        .from(finKassenabrechnungen)
        .innerJoin(finKonten, eq(finKonten.id, finKassenabrechnungen.kontoId))
        .leftJoin(finBuchungen, eq(finBuchungen.id, finKassenabrechnungen.buchungId))
        .where(kontoId ? eq(finKassenabrechnungen.kontoId, kontoId) : undefined)
        .orderBy(desc(finKassenabrechnungen.erstelltAm), desc(finKassenabrechnungen.id))
        .limit(limit);
      const { storniert } = rows.length
        ? await abrechnungenKurz(db, [...new Set(rows.map((r) => r.a.kontoId))])
        : { storniert: new Set<string | null>() };
      return rows.map((r) => abrechnungEintrag(r.a, r.kontoName, r.seq, storniert));
    },

    async kassenabrechnung(id) {
      const [r] = await db
        .select({ a: finKassenabrechnungen, kontoName: finKonten.name, seq: finBuchungen.seq })
        .from(finKassenabrechnungen)
        .innerJoin(finKonten, eq(finKonten.id, finKassenabrechnungen.kontoId))
        .leftJoin(finBuchungen, eq(finBuchungen.id, finKassenabrechnungen.buchungId))
        .where(eq(finKassenabrechnungen.id, id));
      if (!r) return undefined;
      const [posten, transfers, ereignisse, namen, { storniert }] = await Promise.all([
        db
          .select()
          .from(finKassenabrechnungPosten)
          .where(eq(finKassenabrechnungPosten.abrechnungId, id))
          .orderBy(asc(finKassenabrechnungPosten.nennwertCent)),
        db
          .select({ t: finKassenabrechnungTransfers, fachName: finKonten.name })
          .from(finKassenabrechnungTransfers)
          .innerJoin(finKonten, eq(finKonten.id, finKassenabrechnungTransfers.fachId))
          .where(eq(finKassenabrechnungTransfers.abrechnungId, id))
          .orderBy(
            asc(finKassenabrechnungTransfers.fachId),
            asc(finKassenabrechnungTransfers.nennwertCent),
          ),
        db
          .select({
            e: finKassenabrechnungEvents,
            titel: events.titel,
            beginn: events.beginn,
            kategorie: eventKategorien.name,
          })
          .from(finKassenabrechnungEvents)
          .innerJoin(events, eq(events.id, finKassenabrechnungEvents.eventId))
          .innerJoin(eventKategorien, eq(eventKategorien.id, events.kategorieId))
          .where(eq(finKassenabrechnungEvents.abrechnungId, id)),
        db
          .select({ id: finKonten.id, name: finKonten.name })
          .from(finKonten)
          .where(inArray(finKonten.id, [r.a.erloesKontoId, r.a.zielFachId])),
        abrechnungenKurz(db, [r.a.kontoId]),
      ]);
      const name = new Map(namen.map((n) => [n.id, n.name]));
      return {
        ...abrechnungEintrag(r.a, r.kontoName, r.seq, storniert),
        erloesKonto: { id: r.a.erloesKontoId, name: name.get(r.a.erloesKontoId) ?? '' },
        zielFach: { id: r.a.zielFachId, name: name.get(r.a.zielFachId) ?? '' },
        transferCent: r.a.transferCent,
        posten: posten.map((p) => ({
          nennwertCent: p.nennwertCent,
          soll: p.soll,
          ist: p.ist,
          grundbestand: p.grundbestand,
          danach: p.danach,
        })),
        transfers: transfers.map((t) => ({
          fachId: t.t.fachId,
          fachName: t.fachName,
          nennwertCent: t.t.nennwertCent,
          anzahl: t.t.anzahl,
        })),
        events: ereignisse
          .map((e) => ({
            eventId: e.e.eventId,
            eventTitel: eventTitelAnzeige(e.titel, e.kategorie),
            eventBeginn: e.beginn.toISOString(),
            zaehlungId: e.e.zaehlungId,
            betragCent: e.e.betragCent,
          }))
          .sort((a, b) => a.eventBeginn.localeCompare(b.eventBeginn)),
      };
    },

    async kassenKurz() {
      const rows = await db
        .select({ kontoId: finKonten.id, name: finKonten.name })
        .from(finKassen)
        .innerJoin(finKonten, eq(finKonten.id, finKassen.kontoId))
        .where(eq(finKonten.archiviert, false))
        .orderBy(asc(finKonten.name));
      return rows;
    },

    async eventKassen(eventId) {
      const [ev] = await db
        .select({ kategorieId: events.kategorieId })
        .from(events)
        .where(eq(events.id, eventId));
      if (!ev) return undefined;
      const [aktive, markiert, zaehlungen] = await Promise.all([
        kassenLaden(db, { mitArchiv: false }),
        db
          .select()
          .from(finEventKassenAngepasst)
          .where(eq(finEventKassenAngepasst.eventId, eventId)),
        zaehlungenVonEvent(eventId),
      ]);
      const angepasst = markiert.length > 0;
      const zugewiesen = (
        angepasst
          ? await db
              .select({ k: finEventKassen.kontoId })
              .from(finEventKassen)
              .where(eq(finEventKassen.eventId, eventId))
          : await db
              .select({ k: finKassenKategorien.kontoId })
              .from(finKassenKategorien)
              .where(eq(finKassenKategorien.kategorieId, ev.kategorieId))
      ).map((r) => r.k);
      const ids = aktive.map((k) => k.dto.kontoId);
      if (ids.length === 0)
        return { angepasst, kassen: [], summeCent: 0, unvollstaendig: false, zaehlungen: [] };
      const [alle, abgerechnet, { storniert }] = await Promise.all([
        db
          .select({
            id: finKassenzaehlungen.id,
            kontoId: finKassenzaehlungen.kontoId,
            eventId: finKassenzaehlungen.eventId,
            summeCent: finKassenzaehlungen.summeCent,
            gezaehltAm: finKassenzaehlungen.gezaehltAm,
            eventBeginn: events.beginn,
          })
          .from(finKassenzaehlungen)
          .innerJoin(events, eq(events.id, finKassenzaehlungen.eventId))
          .where(inArray(finKassenzaehlungen.kontoId, ids)),
        db
          .select({
            kontoId: finKassenabrechnungen.kontoId,
            buchungId: finKassenabrechnungen.buchungId,
            erstelltAm: finKassenabrechnungen.erstelltAm,
            betragCent: finKassenabrechnungEvents.betragCent,
          })
          .from(finKassenabrechnungEvents)
          .innerJoin(
            finKassenabrechnungen,
            eq(finKassenabrechnungen.id, finKassenabrechnungEvents.abrechnungId),
          )
          .where(
            and(
              eq(finKassenabrechnungEvents.eventId, eventId),
              inArray(finKassenabrechnungen.kontoId, ids),
            ),
          ),
        abrechnungenKurz(db, ids),
      ]);
      const gueltig = abgerechneteBetraege(abgerechnet, storniert);
      const dto = baueEventKassen({
        eventId,
        kassen: aktive.map((k) => ({
          kontoId: k.dto.kontoId,
          name: k.dto.name,
          saldoCent: k.dto.saldoCent,
          seit: k.seit,
        })),
        zugewiesen: new Set(zugewiesen),
        zaehlungen: alle.map((z) => ({
          id: z.id,
          kontoId: z.kontoId,
          eventId: z.eventId,
          summeCent: z.summeCent,
          gezaehltAm: z.gezaehltAm.toISOString(),
          eventBeginn: z.eventBeginn.toISOString(),
        })),
        abgerechnet: gueltig,
      });
      return {
        angepasst,
        ...dto,
        zaehlungen: zaehlungen.filter((z) => ids.includes(z.kontoId)),
      };
    },

    async eventKassenFestlegen(eventId, kontoIds) {
      return mitWiederholung(() =>
        db.transaction(async (tx) => {
          const [ev] = await tx
            .select({ id: events.id })
            .from(events)
            .where(eq(events.id, eventId));
          if (!ev) return false;
          const ids = [...new Set(kontoIds ?? [])];
          if (ids.length > 0) {
            const aktiv = await tx
              .select({ id: finKassen.kontoId })
              .from(finKassen)
              .innerJoin(finKonten, eq(finKonten.id, finKassen.kontoId))
              .where(and(inArray(finKassen.kontoId, ids), eq(finKonten.archiviert, false)));
            if (aktiv.length !== ids.length)
              throw new BuchungUngueltig(['Eine Kasse gibt es nicht oder sie ist archiviert.']);
          }
          await tx.delete(finEventKassen).where(eq(finEventKassen.eventId, eventId));
          await tx
            .delete(finEventKassenAngepasst)
            .where(eq(finEventKassenAngepasst.eventId, eventId));
          if (kontoIds !== null) {
            await tx.insert(finEventKassenAngepasst).values({ eventId });
            if (ids.length > 0)
              await tx.insert(finEventKassen).values(ids.map((kontoId) => ({ eventId, kontoId })));
          }
          return true;
        }),
      );
    },

    async kasseZaehlen(eingabe, sub) {
      try {
        return await kasseZaehlenTx(eingabe, sub);
      } catch (err) {
        if (istDoppelt(err)) {
          const schon = await kassenzaehlungVorhandene(db, eingabe.idempotenzSchluessel);
          if (schon) return schon;
        }
        throw err;
      }
    },

    async letzterExportSeq() {
      const [r] = await db
        .select({ bisSeq: finExporte.bisSeq })
        .from(finExporte)
        .orderBy(desc(finExporte.bisSeq))
        .limit(1);
      return r?.bisSeq ?? 0;
    },

    async exportEintragen(e) {
      await db.insert(finExporte).values({ id: randomUUID(), ...e });
    },

    async kettenDaten() {
      // DSQL transactions read from one snapshot, so the counter matches the bookings read.
      return db.transaction(async (tx) => {
        const buchungen: KettenBuchung[] = [];
        for (let nach = 0; ;) {
          const seite = await tx
            .select()
            .from(finBuchungen)
            .where(gt(finBuchungen.seq, nach))
            .orderBy(asc(finBuchungen.seq))
            .limit(KETTE_SEITE);
          if (seite.length === 0) break;
          const zeilen = await zeilenLaden(
            tx,
            seite.map((b) => b.id),
          );
          const belegIds = seite.flatMap((b) =>
            b.quelleTyp === 'beleg' && b.quelleId ? [b.quelleId] : [],
          );
          const dateien =
            belegIds.length === 0
              ? []
              : await tx
                  .select({ id: finBelege.id, sha256: finBelege.dateiSha256 })
                  .from(finBelege)
                  .where(inArray(finBelege.id, belegIds));
          for (const b of seite) {
            const sha256 = dateien.find((d) => d.id === b.quelleId)?.sha256;
            buchungen.push({
              seq: b.seq,
              id: b.id,
              datum: b.datum,
              text: b.text,
              quelleTyp: b.quelleTyp,
              quelleId: b.quelleId,
              eventId: b.eventId,
              stornoVon: b.stornoVon,
              erstelltVon: b.erstelltVon,
              erstelltAm: b.erstelltAm.toISOString(),
              prevHash: b.prevHash,
              hash: b.hash,
              ...(b.quelleTyp === 'beleg' && sha256 && { belege: [{ sha256 }] }),
              zeilen: zeilen
                .filter((z) => z.buchungId === b.id)
                .map((z) => ({
                  pos: z.pos,
                  kontoId: z.kontoId,
                  betragCent: z.betragCent,
                  nettoCent: z.nettoCent,
                  steuerCent: z.steuerCent,
                  steuersatz: z.steuersatz,
                  steuerArt: z.steuerArt,
                  stueckelung: z.stueckelung,
                })),
            });
          }
          nach = seite[seite.length - 1]!.seq;
        }
        const [zaehler] = await tx.select().from(finZaehler).where(eq(finZaehler.name, 'journal'));
        return {
          buchungen,
          zaehlerWert: zaehler?.wert ?? 0,
          zaehlerHash: zaehler?.letzterHash ?? '',
        };
      });
    },
  };
}
