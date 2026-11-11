import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gt, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import {
  buchungsHash,
  pruefeBuchung,
  stornoZeilen,
  type BuchungDetailEintrag,
  type BuchungEingabe,
  type BuchungListeEintrag,
  type BuchungVerweisDto,
  type BuchungZeileDto,
  type HashZeile,
  type JournalAbfrage,
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
  type FinBuchungRow,
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
  journal(abfrage: JournalAbfrage): Promise<BuchungListeEintrag[]>;
  buchung(id: string): Promise<BuchungDetailEintrag | undefined>;
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

export const stornoText = (original: { seq: number; text: string }, text: string | null) =>
  text ?? `Storno von Nr. ${original.seq}: ${original.text}`;

const istDoppelt = (err: unknown): boolean => {
  const e = err as { code?: unknown; cause?: unknown } | null;
  return e?.code === '23505' || (e?.cause as { code?: unknown } | null)?.code === '23505';
};

type Q = Pick<Db, 'select'>;

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

  const einfuegen = async (tx: Tx, entwurf: BuchungsEntwurf): Promise<GebuchtErgebnis> => {
    const [zaehler] = await tx
      .update(finZaehler)
      .set({ wert: sql`${finZaehler.wert} + 1` })
      .where(eq(finZaehler.name, 'journal'))
      .returning({ wert: finZaehler.wert, letzterHash: finZaehler.letzterHash });
    if (!zaehler) throw new Error('Der Journal-Zähler fehlt (Migration 0144).');
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
          const konten = await tx.select().from(finKonten).where(inArray(finKonten.id, ids));
          const fehler = pruefeBuchung(eingabe, konten);
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
          return einfuegen(tx, {
            datum: eingabe.datum,
            text: stornoText(original, eingabe.text),
            quelleTyp: 'storno',
            quelleId: original.id,
            eventId: original.eventId,
            stornoVon: original.id,
            erstelltVon: sub,
            idempotenzSchluessel: eingabe.idempotenzSchluessel,
            zeilen: stornoZeilen(quelle).map(ohnePos),
          });
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

  const parentPruefen = async (kontoId: string | null, parentId: string) => {
    if (kontoId !== null && parentId === kontoId)
      throw new KontoUngueltig('Ein Konto kann nicht sein eigenes Unterkonto sein.');
    const [parent] = await db
      .select({ id: finKonten.id })
      .from(finKonten)
      .where(eq(finKonten.id, parentId));
    if (!parent) throw new KontoUngueltig('Das übergeordnete Konto gibt es nicht.');
    if (kontoId !== null && (await ergibtZyklus(kontoId, parentId)))
      throw new KontoUngueltig('Das übergeordnete Konto liegt selbst unter diesem Konto.');
  };

  return {
    async konten(mitArchiv) {
      const [rows, summen] = await Promise.all([
        db
          .select()
          .from(finKonten)
          .where(mitArchiv ? undefined : eq(finKonten.archiviert, false))
          .orderBy(asc(finKonten.name)),
        db
          .select({
            kontoId: finBuchungszeilen.kontoId,
            summe: sql<string>`coalesce(sum(${finBuchungszeilen.betragCent}), 0)`,
          })
          .from(finBuchungszeilen)
          .groupBy(finBuchungszeilen.kontoId),
      ]);
      const saldo = new Map(summen.map((s) => [s.kontoId, Number(s.summe)]));
      return rows.map((k) => ({
        id: k.id,
        name: k.name,
        art: k.art,
        parentId: k.parentId,
        stueckelung: k.stueckelung,
        steuersatzStandard: k.steuersatzStandard,
        archiviert: k.archiviert,
        saldoCent: saldo.get(k.id) ?? 0,
      }));
    },

    async kontoAnlegen(daten) {
      if (daten.parentId) await parentPruefen(null, daten.parentId);
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
      if (daten.parentId) await parentPruefen(id, daten.parentId);
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

    async journal({ von, bis, kontoId, limit, vorSeq }) {
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
            vorSeq !== undefined ? lt(finBuchungen.seq, vorSeq) : undefined,
          ),
        )
        .orderBy(desc(finBuchungen.seq))
        .limit(limit);
      return listeAnreichern(db, rows);
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
