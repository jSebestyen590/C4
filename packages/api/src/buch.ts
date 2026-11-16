import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  eintragWirkungCent,
  stornoWerte,
  type BuchStornoEingabe,
  type BuchTarifEingabe,
} from '@c4/shared';
import type { Db } from './db/client';
import { sperreBeruehren } from './db/sperren';
import {
  buchAbrechnungen,
  buchEintraege,
  buchSeiten,
  buchTarife,
  type BuchEintragRow,
  type BuchSeiteRow,
  type BuchTarifRow,
} from './db/schema';
import { mitWiederholung } from './db/wiederholung';

// Buch (Strichliste): sub-ledger without journal bookings (see docs/buch.md). Entries are only
// ever inserted, a correction is a Storno entry. DSQL has no row locks, so check-then-insert steps
// touch a `sperren` key first (see `db/sperren.ts`).

/** The input is invalid in the current state (maps to 400). */
export class BuchUngueltig extends Error {}
/** The change collides with existing data (number taken, already reversed, ...; maps to 409). */
export class BuchKonflikt extends Error {}

export interface BuchSeiteMitSaldo {
  seite: BuchSeiteRow;
  saldoCent: number;
}

/** One row of an Abrechnung with the Strichwert the caller determined from the tarif. */
export interface BuchAbrechnungZeile {
  seiteId: string;
  striche: number;
  strichwertCent: number;
  barCent: number;
  abzahlungCent: number;
}

export interface BuchAbrechnungEintrag {
  id: string;
  abrechnungId: string;
  seiteId: string;
}

export interface BuchAbrechnungErgebnis {
  id: string;
  eintraege: number;
  /** Balance of every page touched by the Abrechnung after it. */
  saldi: { seiteId: string; nummer: number; saldoCent: number }[];
  wiederholt?: boolean;
}

export interface BuchStornoErgebnis {
  id: string;
  seiteId: string;
  wiederholt?: boolean;
}

export interface BuchRanglisteRow {
  mitgliedSub: string | null;
  externName: string | null;
  seiteId: string;
  erstelltAm: Date;
  striche: number;
  strichwertCent: number;
  barCent: number;
}

export interface BuchVerlaufEintrag {
  row: BuchEintragRow;
  storniert: boolean;
}

export interface BuchStore {
  /** Active (or archived) pages with their balance, sorted by number. */
  seiten(archiviert: boolean): Promise<BuchSeiteMitSaldo[]>;
  seite(id: string): Promise<BuchSeiteMitSaldo | undefined>;
  /** The active pages of a member. */
  seitenVon(sub: string): Promise<BuchSeiteMitSaldo[]>;
  /** Throws BuchKonflikt when the number is taken or the member already has an active page. */
  seiteAnlegen(
    daten: { nummer: number; mitgliedSub: string | null; externName: string | null },
    sub: string,
  ): Promise<string>;
  /** False when the page does not exist; archiving an archived page is a no-op. */
  seiteArchivieren(id: string): Promise<boolean>;
  /** Entries of a page, newest first. */
  verlauf(seiteId: string): Promise<BuchVerlaufEintrag[]>;
  /** All tarife, newest `gueltigAb` first. */
  tarife(): Promise<BuchTarifRow[]>;
  tarifAnlegen(daten: BuchTarifEingabe, sub: string): Promise<string>;
  /** Throws BuchKonflikt for an unknown or archived page. Rows must not be empty. */
  abrechnen(
    eingabe: { idempotenzSchluessel: string; zeilen: BuchAbrechnungZeile[] },
    sub: string,
  ): Promise<BuchAbrechnungErgebnis>;
  /** Undefined when the entry does not exist; throws BuchKonflikt when it cannot be reversed. */
  stornieren(
    eintragId: string,
    eingabe: BuchStornoEingabe,
    sub: string,
  ): Promise<BuchStornoErgebnis | undefined>;
  /** Every entry with the owner of its page, for the ranking. */
  fuerRangliste(): Promise<BuchRanglisteRow[]>;
}

export const SEITE_NUMMER_VERGEBEN = 'Die Nummer ist bei einer aktiven Seite schon vergeben.';
export const SEITE_MITGLIED_VORHANDEN = 'Das Mitglied hat schon eine aktive Seite.';
export const EINTRAG_SCHON_STORNIERT = 'Der Eintrag ist bereits storniert.';
export const STORNO_NICHT_STORNIERBAR = 'Ein Storno kann nicht storniert werden.';
export const SEITE_NICHT_AKTIV = 'Eine der Seiten gibt es nicht oder sie ist archiviert.';

/** The reversal of `e` as an insertable entry (shared with the fake). */
export const stornoEintrag = (
  e: Pick<
    BuchEintragRow,
    'id' | 'seiteId' | 'striche' | 'strichwertCent' | 'barCent' | 'abzahlungCent'
  >,
  eingabe: BuchStornoEingabe,
  sub: string,
  jetzt: Date,
): BuchEintragRow => {
  const w = stornoWerte(e);
  return {
    id: randomUUID(),
    seiteId: e.seiteId,
    abrechnungId: null,
    stornoVon: e.id,
    striche: w.striche,
    strichwertCent: w.strichwertCent,
    barCent: w.barCent,
    abzahlungCent: w.abzahlungCent,
    betragCent: eintragWirkungCent(w),
    text: eingabe.text,
    idempotenzSchluessel: eingabe.idempotenzSchluessel,
    erstelltVon: sub,
    erstelltAm: jetzt,
  };
};

/** The entry of one Abrechnung row (shared with the fake). */
export const abrechnungsEintrag = (
  z: BuchAbrechnungZeile,
  abrechnungId: string,
  sub: string,
  jetzt: Date,
): BuchEintragRow => ({
  id: randomUUID(),
  seiteId: z.seiteId,
  abrechnungId,
  stornoVon: null,
  striche: z.striche,
  strichwertCent: z.strichwertCent,
  barCent: z.barCent,
  abzahlungCent: z.abzahlungCent,
  betragCent: eintragWirkungCent(z),
  text: null,
  idempotenzSchluessel: null,
  erstelltVon: sub,
  erstelltAm: jetzt,
});

const VERSUCHE = 8;
const WARTEN_MS = 50;

type Q = Pick<Db, 'select'>;

export function createBuchStore(db: Db): BuchStore {
  const salden = async (q: Q, ids?: string[]): Promise<Map<string, number>> => {
    if (ids && ids.length === 0) return new Map();
    const rows = await q
      .select({
        seiteId: buchEintraege.seiteId,
        summe: sql<string>`coalesce(sum(${buchEintraege.betragCent}), 0)`,
      })
      .from(buchEintraege)
      .where(ids ? inArray(buchEintraege.seiteId, ids) : undefined)
      .groupBy(buchEintraege.seiteId);
    return new Map(rows.map((r) => [r.seiteId, Number(r.summe)]));
  };

  const mitSaldo = async (q: Q, rows: BuchSeiteRow[]): Promise<BuchSeiteMitSaldo[]> => {
    const s = await salden(
      q,
      rows.map((r) => r.id),
    );
    return rows
      .map((seite) => ({ seite, saldoCent: s.get(seite.id) ?? 0 }))
      .sort((a, b) => a.seite.nummer - b.seite.nummer);
  };

  const aktive = (q: Q) => q.select().from(buchSeiten).where(isNull(buchSeiten.archiviertAm));

  const abrechnungVorhanden = async (
    tx: Q,
    schluessel: string,
  ): Promise<BuchAbrechnungErgebnis | undefined> => {
    const [a] = await tx
      .select({ id: buchAbrechnungen.id })
      .from(buchAbrechnungen)
      .where(eq(buchAbrechnungen.idempotenzSchluessel, schluessel));
    if (!a) return undefined;
    const eintraege = await tx
      .select({ seiteId: buchEintraege.seiteId })
      .from(buchEintraege)
      .where(eq(buchEintraege.abrechnungId, a.id));
    const ids = [...new Set(eintraege.map((e) => e.seiteId))];
    const [seiten, s] = await Promise.all([
      ids.length === 0
        ? Promise.resolve([])
        : tx.select().from(buchSeiten).where(inArray(buchSeiten.id, ids)),
      salden(tx, ids),
    ]);
    return {
      id: a.id,
      eintraege: eintraege.length,
      saldi: seiten.map((x) => ({
        seiteId: x.id,
        nummer: x.nummer,
        saldoCent: s.get(x.id) ?? 0,
      })),
      wiederholt: true,
    };
  };

  return {
    async seiten(archiviert) {
      const rows = await db
        .select()
        .from(buchSeiten)
        .where(archiviert ? isNotNull(buchSeiten.archiviertAm) : isNull(buchSeiten.archiviertAm));
      return mitSaldo(db, rows);
    },

    async seite(id) {
      const [row] = await db.select().from(buchSeiten).where(eq(buchSeiten.id, id));
      return row ? (await mitSaldo(db, [row]))[0] : undefined;
    },

    async seitenVon(sub) {
      const rows = await db
        .select()
        .from(buchSeiten)
        .where(and(eq(buchSeiten.mitgliedSub, sub), isNull(buchSeiten.archiviertAm)));
      return mitSaldo(db, rows);
    },

    seiteAnlegen: (daten, sub) =>
      mitWiederholung(
        () =>
          db.transaction(async (tx) => {
            await sperreBeruehren(
              tx,
              `buchseite:nummer:${daten.nummer}`,
              ...(daten.mitgliedSub ? [`buchseite:mitglied:${daten.mitgliedSub}`] : []),
            );
            const offen = await aktive(tx);
            if (offen.some((s) => s.nummer === daten.nummer))
              throw new BuchKonflikt(SEITE_NUMMER_VERGEBEN);
            if (daten.mitgliedSub && offen.some((s) => s.mitgliedSub === daten.mitgliedSub))
              throw new BuchKonflikt(SEITE_MITGLIED_VORHANDEN);
            const id = randomUUID();
            await tx.insert(buchSeiten).values({
              id,
              nummer: daten.nummer,
              mitgliedSub: daten.mitgliedSub,
              externName: daten.externName,
              angelegtVon: sub,
              angelegtAm: new Date(),
              archiviertAm: null,
            });
            return id;
          }),
        VERSUCHE,
        undefined,
        WARTEN_MS,
      ),

    async seiteArchivieren(id) {
      const [row] = await db.select().from(buchSeiten).where(eq(buchSeiten.id, id));
      if (!row) return false;
      if (row.archiviertAm === null) {
        await db
          .update(buchSeiten)
          .set({ archiviertAm: new Date() })
          .where(and(eq(buchSeiten.id, id), isNull(buchSeiten.archiviertAm)));
      }
      return true;
    },

    async verlauf(seiteId) {
      const rows = await db
        .select()
        .from(buchEintraege)
        .where(eq(buchEintraege.seiteId, seiteId))
        .orderBy(desc(buchEintraege.erstelltAm), desc(buchEintraege.id));
      const storniert = new Set(rows.flatMap((r) => (r.stornoVon ? [r.stornoVon] : [])));
      return rows.map((row) => ({ row, storniert: storniert.has(row.id) }));
    },

    tarife() {
      return db
        .select()
        .from(buchTarife)
        .orderBy(desc(buchTarife.gueltigAb), desc(buchTarife.erstelltAm));
    },

    async tarifAnlegen(daten, sub) {
      const id = randomUUID();
      await db.insert(buchTarife).values({
        id,
        status: daten.status,
        strichwertCent: daten.strichwertCent,
        maxUeberzugCent: daten.maxUeberzugCent,
        gueltigAb: daten.gueltigAb,
        erstelltVon: sub,
        erstelltAm: new Date(),
      });
      return id;
    },

    abrechnen: (eingabe, sub) =>
      mitWiederholung(
        () =>
          db.transaction(async (tx) => {
            await sperreBeruehren(tx, `buchabrechnung:${eingabe.idempotenzSchluessel}`);
            const schon = await abrechnungVorhanden(tx, eingabe.idempotenzSchluessel);
            if (schon) return schon;
            const ids = eingabe.zeilen.map((z) => z.seiteId);
            const seiten = await tx
              .select()
              .from(buchSeiten)
              .where(and(inArray(buchSeiten.id, ids), isNull(buchSeiten.archiviertAm)));
            if (seiten.length !== new Set(ids).size) throw new BuchKonflikt(SEITE_NICHT_AKTIV);
            const jetzt = new Date();
            const abrechnungId = randomUUID();
            await tx.insert(buchAbrechnungen).values({
              id: abrechnungId,
              idempotenzSchluessel: eingabe.idempotenzSchluessel,
              erstelltVon: sub,
              erstelltAm: jetzt,
            });
            await tx
              .insert(buchEintraege)
              .values(eingabe.zeilen.map((z) => abrechnungsEintrag(z, abrechnungId, sub, jetzt)));
            const s = await salden(tx, ids);
            return {
              id: abrechnungId,
              eintraege: eingabe.zeilen.length,
              saldi: seiten.map((x) => ({
                seiteId: x.id,
                nummer: x.nummer,
                saldoCent: s.get(x.id) ?? 0,
              })),
            };
          }),
        VERSUCHE,
        undefined,
        WARTEN_MS,
      ),

    stornieren: (eintragId, eingabe, sub) =>
      mitWiederholung(
        () =>
          db.transaction(async (tx) => {
            await sperreBeruehren(tx, `buchstorno:${eintragId}`);
            const [schon] = await tx
              .select({ id: buchEintraege.id, seiteId: buchEintraege.seiteId })
              .from(buchEintraege)
              .where(eq(buchEintraege.idempotenzSchluessel, eingabe.idempotenzSchluessel));
            if (schon) return { ...schon, wiederholt: true };
            const [original] = await tx
              .select()
              .from(buchEintraege)
              .where(eq(buchEintraege.id, eintragId));
            if (!original) return undefined;
            if (original.stornoVon !== null) throw new BuchKonflikt(STORNO_NICHT_STORNIERBAR);
            const [doppelt] = await tx
              .select({ id: buchEintraege.id })
              .from(buchEintraege)
              .where(eq(buchEintraege.stornoVon, eintragId));
            if (doppelt) throw new BuchKonflikt(EINTRAG_SCHON_STORNIERT);
            const neu = stornoEintrag(original, eingabe, sub, new Date());
            await tx.insert(buchEintraege).values(neu);
            return { id: neu.id, seiteId: neu.seiteId };
          }),
        VERSUCHE,
        undefined,
        WARTEN_MS,
      ),

    async fuerRangliste() {
      const rows = await db
        .select({
          mitgliedSub: buchSeiten.mitgliedSub,
          externName: buchSeiten.externName,
          seiteId: buchEintraege.seiteId,
          erstelltAm: buchEintraege.erstelltAm,
          striche: buchEintraege.striche,
          strichwertCent: buchEintraege.strichwertCent,
          barCent: buchEintraege.barCent,
        })
        .from(buchEintraege)
        .innerJoin(buchSeiten, eq(buchSeiten.id, buchEintraege.seiteId));
      return rows;
    },
  };
}
