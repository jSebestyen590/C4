import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { ProtokollStatus } from '@c4/shared';
import type { Db } from './db/client';
import { protokolle, type ProtokollRow } from './db/schema';
import { istEindeutigVerletzt } from './kalender';

// Meeting minutes (see docs/protokolle.md). The store keeps `inhalt` and `kopf` as JSON text; the app
// validates and (de)serializes them.

export type ProtokollDaten = ProtokollRow;

/** A protocol without its text, for the list. */
export type ProtokollKurz = Omit<ProtokollRow, 'inhalt' | 'kopf'>;

/** There already is a protocol for the Sitzung. */
export class ProtokollExistiert extends Error {}
/** Somebody saved in the meantime; `version` is the current one. */
export class ProtokollVeraltet extends Error {
  constructor(readonly version: number) {
    super('Jemand anderes hat das Protokoll inzwischen geändert.');
  }
}
/** The protocol is closed and cannot be changed or deleted. */
export class ProtokollAbgeschlossen extends Error {
  constructor() {
    super('Das Protokoll ist abgeschlossen.');
  }
}

export interface ProtokollSpeicherErgebnis {
  version: number;
  geaendertAm: Date;
}

export interface ProtokollStore {
  /** All protocols without their text. */
  alle(): Promise<ProtokollKurz[]>;
  holen(id: string): Promise<ProtokollDaten | undefined>;
  nachEvent(eventId: string): Promise<ProtokollDaten | undefined>;
  /** Throws ProtokollExistiert when the event has a protocol already. */
  anlegen(daten: { eventId: string; inhalt: string; kopf: string }, von: string): Promise<string>;
  /**
   * Saves a draft if `daten.version` is the stored one. Undefined when missing; throws
   * ProtokollAbgeschlossen for closed protocols and ProtokollVeraltet for another version.
   */
  speichern(
    id: string,
    daten: { inhalt: string; kopf: string; version: number },
    von: string,
  ): Promise<ProtokollSpeicherErgebnis | undefined>;
  /**
   * Sets the status together with the `kopf` (snapshot) if `version` is the stored one. Undefined
   * when missing; throws ProtokollVeraltet for another version.
   */
  statusSetzen(
    id: string,
    status: ProtokollStatus,
    kopf: string,
    version: number,
    von: string,
  ): Promise<ProtokollSpeicherErgebnis | undefined>;
  /** False when missing; throws ProtokollAbgeschlossen for closed protocols. */
  loeschen(id: string): Promise<boolean>;
}

export function createProtokolleStore(db: Db): ProtokollStore {
  /** After a failed conditional update: why it failed. */
  const warumNicht = async (id: string, nurEntwurf: boolean): Promise<never | undefined> => {
    const [row] = await db
      .select({ status: protokolle.status, version: protokolle.version })
      .from(protokolle)
      .where(eq(protokolle.id, id));
    if (!row) return undefined;
    if (nurEntwurf && row.status === 'abgeschlossen') throw new ProtokollAbgeschlossen();
    throw new ProtokollVeraltet(row.version);
  };

  const aendern = async (
    id: string,
    version: number,
    nurEntwurf: boolean,
    werte: Partial<typeof protokolle.$inferInsert>,
    von: string,
  ): Promise<ProtokollSpeicherErgebnis | undefined> => {
    const rows = await db
      .update(protokolle)
      .set({
        ...werte,
        version: sql`${protokolle.version} + 1`,
        geaendertVon: von,
        geaendertAm: new Date(),
      })
      .where(
        and(
          eq(protokolle.id, id),
          eq(protokolle.version, version),
          nurEntwurf ? eq(protokolle.status, 'entwurf') : undefined,
        ),
      )
      .returning({ version: protokolle.version, geaendertAm: protokolle.geaendertAm });
    if (rows[0]) return rows[0];
    return warumNicht(id, nurEntwurf);
  };

  return {
    async alle() {
      return db
        .select({
          id: protokolle.id,
          eventId: protokolle.eventId,
          status: protokolle.status,
          version: protokolle.version,
          erstelltVon: protokolle.erstelltVon,
          erstelltAm: protokolle.erstelltAm,
          geaendertVon: protokolle.geaendertVon,
          geaendertAm: protokolle.geaendertAm,
        })
        .from(protokolle);
    },

    async holen(id) {
      const [row] = await db.select().from(protokolle).where(eq(protokolle.id, id));
      return row;
    },

    async nachEvent(eventId) {
      const [row] = await db.select().from(protokolle).where(eq(protokolle.eventId, eventId));
      return row;
    },

    async anlegen(daten, von) {
      const id = randomUUID();
      const jetzt = new Date();
      try {
        await db.insert(protokolle).values({
          id,
          eventId: daten.eventId,
          inhalt: daten.inhalt,
          kopf: daten.kopf,
          erstelltVon: von,
          erstelltAm: jetzt,
          geaendertVon: von,
          geaendertAm: jetzt,
        });
      } catch (err) {
        if (istEindeutigVerletzt(err)) throw new ProtokollExistiert();
        throw err;
      }
      return id;
    },

    speichern(id, daten, von) {
      return aendern(id, daten.version, true, { inhalt: daten.inhalt, kopf: daten.kopf }, von);
    },

    statusSetzen(id, status, kopf, version, von) {
      return aendern(id, version, false, { status, kopf }, von);
    },

    async loeschen(id) {
      const rows = await db
        .delete(protokolle)
        .where(and(eq(protokolle.id, id), eq(protokolle.status, 'entwurf')))
        .returning({ id: protokolle.id });
      if (rows.length > 0) return true;
      const [row] = await db
        .select({ id: protokolle.id })
        .from(protokolle)
        .where(eq(protokolle.id, id));
      if (row) throw new ProtokollAbgeschlossen();
      return false;
    },
  };
}
