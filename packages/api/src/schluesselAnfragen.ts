import { randomUUID } from 'node:crypto';
import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import { heuteBerlin, type AnfrageArt, type AnfrageStatus, type AntwortArt } from '@c4/shared';
import type { Db } from './db/client';
import {
  schluesselAnfragen,
  schluesselAntworten,
  schluesselPlanungen,
  type SchluesselAnfrageRow,
  type SchluesselAntwortRow,
  type SchluesselPlanungRow,
} from './db/schema';

// Key requests (Bedarf / Abgabe), their answers and planned handovers (see docs/schluessel.md).

export interface Zeitfenster {
  /** `YYYY-MM-DD` (Berlin). */
  datum: string;
  /** `HH:MM`; both null = all day. */
  ab: string | null;
  bis: string | null;
  notiz: string | null;
}

export interface AnfrageDaten extends Zeitfenster {
  id: string;
  art: AnfrageArt;
  erstellerSub: string;
  /** Null for a Bedarf of "irgendeiner". */
  schluesselId: string | null;
  status: AnfrageStatus;
  erstellt: Date;
  /** When the push (or its hourly repeat) last went out. */
  erinnert: Date;
}

export interface AntwortDaten {
  id: string;
  anfrageId: string;
  sub: string;
  art: AntwortArt;
  /** Time window of a Gegenvorschlag; null otherwise (the note may still be set). */
  datum: string | null;
  ab: string | null;
  bis: string | null;
  notiz: string | null;
  schluesselId: string | null;
  erstellt: Date;
}

export interface AnfrageMitAntworten extends AnfrageDaten {
  antworten: AntwortDaten[];
}

export interface PlanungDaten extends Zeitfenster {
  id: string;
  schluesselId: string;
  anSub: string;
  anfrageId: string | null;
  /** Sub of the member who created it. */
  erstelltVon: string;
  erstellt: Date;
}

export interface AnfrageEingabe extends Zeitfenster {
  art: AnfrageArt;
  erstellerSub: string;
  schluesselId: string | null;
}

export interface AntwortEingabe {
  sub: string;
  art: AntwortArt;
  datum: string | null;
  ab: string | null;
  bis: string | null;
  notiz: string | null;
  schluesselId: string | null;
}

export interface PlanungEingabe extends Zeitfenster {
  schluesselId: string;
  anSub: string;
  anfrageId: string | null;
  erstelltVon: string;
}

/** The request is no longer open (already assigned, withdrawn). */
export class AnfrageKonflikt extends Error {}

/** Chronological order of plans: day, then start (all day first), then creation. */
export const planungSortieren = <T extends Zeitfenster & { erstellt: Date }>(liste: T[]): T[] =>
  [...liste].sort(
    (a, b) =>
      a.datum.localeCompare(b.datum) ||
      (a.ab ?? '00:00').localeCompare(b.ab ?? '00:00') ||
      a.erstellt.getTime() - b.erstellt.getTime(),
  );

export interface SchluesselAnfragenStore {
  /** Every request with its answers (the API filters old ones). */
  anfragen(): Promise<AnfrageMitAntworten[]>;
  anfrage(id: string): Promise<AnfrageMitAntworten | undefined>;
  anlegen(daten: AnfrageEingabe): Promise<string>;
  /** False when the request does not exist or is no longer open. */
  zurueckziehen(id: string): Promise<boolean>;
  /** Stamps `erinnert` of the given requests (hourly repeat). */
  erinnertSetzen(ids: readonly string[], wann: Date): Promise<void>;
  /**
   * Stores (replaces) the answer of `antwort.sub`. With `planung` (a Zusage) the request becomes
   * `vergeben` and the plan is created in the same transaction. Returns undefined when the request
   * does not exist; throws AnfrageKonflikt when it is not open any more (the first Zusage wins).
   */
  antwortSpeichern(
    anfrageId: string,
    antwort: AntwortEingabe,
    planung: PlanungEingabe | null,
  ): Promise<{ planungId: string | null } | undefined>;
  /** The creator accepts a Gegenvorschlag: the request becomes `vergeben` and `planung` is created. */
  gegenvorschlagAnnehmen(
    anfrageId: string,
    planung: PlanungEingabe,
  ): Promise<{ planungId: string } | undefined>;
  /** All plans in time order, optionally of one key. */
  /** Current Planungen only: those dated before today have expired and are not returned. */
  planungen(schluesselId?: string): Promise<PlanungDaten[]>;
  planung(id: string): Promise<PlanungDaten | undefined>;
  planungAnlegen(daten: PlanungEingabe): Promise<string>;
  planungAendern(id: string, daten: Zeitfenster & { anSub: string }): Promise<boolean>;
  planungLoeschen(id: string): Promise<boolean>;
}

const alsAnfrage = (r: SchluesselAnfrageRow): AnfrageDaten => ({
  id: r.id,
  art: r.art,
  erstellerSub: r.erstellerSub,
  schluesselId: r.schluesselId,
  datum: r.datum,
  ab: r.ab,
  bis: r.bis,
  notiz: r.notiz,
  status: r.status,
  erstellt: r.erstellt,
  erinnert: r.erinnert,
});

const alsAntwort = (r: SchluesselAntwortRow): AntwortDaten => ({
  id: r.id,
  anfrageId: r.anfrageId,
  sub: r.sub,
  art: r.art,
  datum: r.datum,
  ab: r.ab,
  bis: r.bis,
  notiz: r.notiz,
  schluesselId: r.schluesselId,
  erstellt: r.erstellt,
});

const alsPlanung = (r: SchluesselPlanungRow): PlanungDaten => ({
  id: r.id,
  schluesselId: r.schluesselId,
  anSub: r.anSub,
  datum: r.datum,
  ab: r.ab,
  bis: r.bis,
  notiz: r.notiz,
  anfrageId: r.anfrageId,
  erstelltVon: r.erstelltVon,
  erstellt: r.erstellt,
});

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

async function planungEinfuegen(tx: Tx, p: PlanungEingabe, jetzt: Date): Promise<string> {
  const id = randomUUID();
  await tx.insert(schluesselPlanungen).values({
    id,
    schluesselId: p.schluesselId,
    anSub: p.anSub,
    datum: p.datum,
    ab: p.ab,
    bis: p.bis,
    notiz: p.notiz,
    anfrageId: p.anfrageId,
    erstelltVon: p.erstelltVon,
    erstellt: jetzt,
  });
  return id;
}

export function createSchluesselAnfragenStore(db: Db): SchluesselAnfragenStore {
  const mitAntworten = async (rows: SchluesselAnfrageRow[]): Promise<AnfrageMitAntworten[]> => {
    if (rows.length === 0) return [];
    const antworten = await db
      .select()
      .from(schluesselAntworten)
      .where(
        inArray(
          schluesselAntworten.anfrageId,
          rows.map((r) => r.id),
        ),
      )
      .orderBy(asc(schluesselAntworten.erstellt));
    return rows.map((r) => ({
      ...alsAnfrage(r),
      antworten: antworten.filter((a) => a.anfrageId === r.id).map(alsAntwort),
    }));
  };

  return {
    async anfragen() {
      return mitAntworten(await db.select().from(schluesselAnfragen));
    },

    async anfrage(id) {
      const rows = await db.select().from(schluesselAnfragen).where(eq(schluesselAnfragen.id, id));
      return (await mitAntworten(rows))[0];
    },

    async anlegen(daten) {
      const id = randomUUID();
      const jetzt = new Date();
      await db.insert(schluesselAnfragen).values({
        id,
        art: daten.art,
        erstellerSub: daten.erstellerSub,
        schluesselId: daten.schluesselId,
        datum: daten.datum,
        ab: daten.ab,
        bis: daten.bis,
        notiz: daten.notiz,
        status: 'offen',
        erstellt: jetzt,
        erinnert: jetzt,
      });
      return id;
    },

    async zurueckziehen(id) {
      const rows = await db
        .update(schluesselAnfragen)
        .set({ status: 'zurueckgezogen' })
        .where(and(eq(schluesselAnfragen.id, id), eq(schluesselAnfragen.status, 'offen')))
        .returning({ id: schluesselAnfragen.id });
      return rows.length > 0;
    },

    async erinnertSetzen(ids, wann) {
      if (ids.length === 0) return;
      await db
        .update(schluesselAnfragen)
        .set({ erinnert: wann })
        .where(inArray(schluesselAnfragen.id, [...ids]));
    },

    async antwortSpeichern(anfrageId, antwort, planung) {
      return db.transaction(async (tx) => {
        const [anfrage] = await tx
          .select()
          .from(schluesselAnfragen)
          .where(eq(schluesselAnfragen.id, anfrageId));
        if (!anfrage) return undefined;
        if (anfrage.status !== 'offen') throw new AnfrageKonflikt();
        const jetzt = new Date();
        await tx
          .delete(schluesselAntworten)
          .where(
            and(
              eq(schluesselAntworten.anfrageId, anfrageId),
              eq(schluesselAntworten.sub, antwort.sub),
            ),
          );
        await tx.insert(schluesselAntworten).values({
          id: randomUUID(),
          anfrageId,
          sub: antwort.sub,
          art: antwort.art,
          datum: antwort.datum,
          ab: antwort.ab,
          bis: antwort.bis,
          notiz: antwort.notiz,
          schluesselId: antwort.schluesselId,
          erstellt: jetzt,
        });
        if (!planung) return { planungId: null };
        const planungId = await planungEinfuegen(tx, planung, jetzt);
        await tx
          .update(schluesselAnfragen)
          .set({ status: 'vergeben' })
          .where(eq(schluesselAnfragen.id, anfrageId));
        return { planungId };
      });
    },

    async gegenvorschlagAnnehmen(anfrageId, planung) {
      return db.transaction(async (tx) => {
        const [anfrage] = await tx
          .select()
          .from(schluesselAnfragen)
          .where(eq(schluesselAnfragen.id, anfrageId));
        if (!anfrage) return undefined;
        if (anfrage.status !== 'offen') throw new AnfrageKonflikt();
        const planungId = await planungEinfuegen(tx, planung, new Date());
        await tx
          .update(schluesselAnfragen)
          .set({ status: 'vergeben' })
          .where(eq(schluesselAnfragen.id, anfrageId));
        return { planungId };
      });
    },

    async planungen(schluesselId) {
      const rows = await db
        .select()
        .from(schluesselPlanungen)
        .where(
          and(
            schluesselId ? eq(schluesselPlanungen.schluesselId, schluesselId) : undefined,
            // A Planung expires one day after its date.
            gte(schluesselPlanungen.datum, heuteBerlin()),
          ),
        );
      return planungSortieren(rows.map(alsPlanung));
    },

    async planung(id) {
      const [row] = await db
        .select()
        .from(schluesselPlanungen)
        .where(eq(schluesselPlanungen.id, id));
      return row && alsPlanung(row);
    },

    async planungAnlegen(daten) {
      return db.transaction((tx) => planungEinfuegen(tx, daten, new Date()));
    },

    async planungAendern(id, daten) {
      const rows = await db
        .update(schluesselPlanungen)
        .set({
          anSub: daten.anSub,
          datum: daten.datum,
          ab: daten.ab,
          bis: daten.bis,
          notiz: daten.notiz,
        })
        .where(eq(schluesselPlanungen.id, id))
        .returning({ id: schluesselPlanungen.id });
      return rows.length > 0;
    },

    async planungLoeschen(id) {
      const rows = await db
        .delete(schluesselPlanungen)
        .where(eq(schluesselPlanungen.id, id))
        .returning({ id: schluesselPlanungen.id });
      return rows.length > 0;
    },
  };
}
