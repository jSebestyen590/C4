import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, lte, or, sql } from 'drizzle-orm';
import {
  berechneZaehlung,
  buchungsHash,
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
  events,
  finBuchungen,
  finBuchungszeilen,
  finKonten,
  finStueckelung,
  finZaehler,
  finZaehlungen,
  finZaehlungPosten,
  type FinBuchungRow,
  type FinKontoRow,
} from './db/schema';
import { mitWiederholung } from './db/wiederholung';
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

export interface FinanzenStore {
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

type Q = Pick<Db, 'select'>;

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

  return {
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
          for (const b of seite) {
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
