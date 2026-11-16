import { randomUUID } from 'node:crypto';
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import type { ProtokollStatus } from '@c4/shared';
import type { Db } from './db/client';
import { protokolle, type ProtokollRow } from './db/schema';
import { istEindeutigVerletzt } from './kalender';

// Meeting minutes (see docs/protokolle.md). The store keeps `inhalt` and `kopf` as JSON text; the app
// validates and (de)serializes them.

export type ProtokollDaten = ProtokollRow;

/** A protocol without its text, for the list. */
export type ProtokollKurz = Omit<
  ProtokollRow,
  'inhalt' | 'kopf' | 'sperreSub' | 'sperreTab' | 'sperreBis'
>;

/** There already is a protocol for the Sitzung. */
export class ProtokollExistiert extends Error {}
/** Somebody saved in the meantime; `version` is the current one, `geaendertVon` the last editor. */
export class ProtokollVeraltet extends Error {
  constructor(
    readonly version: number,
    readonly geaendertVon: string | null = null,
    message = 'Jemand anderes hat das Protokoll inzwischen geändert.',
  ) {
    super(message);
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

/** The edit lock expires this long after the last heartbeat. */
export const PROTOKOLL_SPERRE_MS = 2 * 60_000;

/** Result of taking the edit lock: `erhalten` tells whether the caller holds it now, otherwise it is the holder's. */
export interface ProtokollSperreErgebnis {
  erhalten: boolean;
  sub: string | null;
  tab: string | null;
  bis: Date | null;
}

/** The edit lock of a protocol row is held by (sub, tab) as of `jetzt`. */
export const sperreGehoert = (
  p: Pick<ProtokollRow, 'sperreSub' | 'sperreTab' | 'sperreBis'>,
  sub: string,
  tab: string,
  jetzt: Date,
): boolean =>
  p.sperreSub === sub &&
  p.sperreTab === tab &&
  p.sperreBis !== null &&
  p.sperreBis.getTime() > jetzt.getTime();

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
    /** Also replaces the document (what the Aktionen wrote back); left out = unchanged. */
    inhalt?: string,
  ): Promise<ProtokollSpeicherErgebnis | undefined>;
  /**
   * Claims a status change before its Aktionen run: ONE conditional update (`version` and the
   * opposite status) that sets `status` and `kopf`, ends the edit lock and counts the version up.
   * Undefined when missing; throws ProtokollVeraltet (409) when somebody was faster.
   */
  statusBelegen(
    id: string,
    version: number,
    von: string,
    nach: ProtokollDaten['status'],
    kopf: string,
  ): Promise<ProtokollSpeicherErgebnis | undefined>;
  /**
   * Claims a closed protocol for a run of Aktionen: counts the version up if `version` is the
   * stored one. Undefined when missing; throws ProtokollVeraltet when somebody was faster or the
   * protocol is not closed.
   */
  aktionenBelegen(
    id: string,
    version: number,
    von: string,
  ): Promise<ProtokollSpeicherErgebnis | undefined>;
  /**
   * Replaces document and `kopf` of a protocol in any status (the results of Aktionen, see
   * docs/protokolle.md) if `version` is the stored one. Undefined when missing; throws
   * ProtokollVeraltet for another version.
   */
  ergebnisSpeichern(
    id: string,
    daten: { inhalt: string; kopf: string; version: number },
    von: string,
  ): Promise<ProtokollSpeicherErgebnis | undefined>;
  /** False when missing; throws ProtokollAbgeschlossen for closed protocols. */
  loeschen(id: string): Promise<boolean>;
  /**
   * Takes or extends the edit lock of a draft until `bis`: succeeds when it is free, expired (before
   * `jetzt`) or already held by the same (sub, tab). Undefined when missing; throws
   * ProtokollAbgeschlossen for closed protocols. Does not change `version`.
   */
  sperreNehmen(
    id: string,
    sub: string,
    tab: string,
    jetzt: Date,
    bis: Date,
  ): Promise<ProtokollSperreErgebnis | undefined>;
  /** Releases the lock if (sub, tab) holds it; otherwise nothing happens. */
  sperreLoesen(id: string, sub: string, tab: string): Promise<void>;
}

const BELEGT_MELDUNG = 'Das Protokoll wurde inzwischen geändert. Bitte lade es neu.';

export function createProtokolleStore(db: Db): ProtokollStore {
  /** After a failed conditional update: why it failed. */
  const warumNicht = async (
    id: string,
    nurEntwurf: boolean,
    meldung?: string,
  ): Promise<never | undefined> => {
    const [row] = await db
      .select({
        status: protokolle.status,
        version: protokolle.version,
        geaendertVon: protokolle.geaendertVon,
      })
      .from(protokolle)
      .where(eq(protokolle.id, id));
    if (!row) return undefined;
    if (nurEntwurf && row.status === 'abgeschlossen') throw new ProtokollAbgeschlossen();
    throw new ProtokollVeraltet(row.version, row.geaendertVon, meldung);
  };

  const aendern = async (
    id: string,
    version: number,
    nurEntwurf: boolean,
    werte: Partial<typeof protokolle.$inferInsert>,
    von: string,
    bedingung?: { status: ProtokollDaten['status']; meldung: string },
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
          bedingung ? eq(protokolle.status, bedingung.status) : undefined,
        ),
      )
      .returning({ version: protokolle.version, geaendertAm: protokolle.geaendertAm });
    if (rows[0]) return rows[0];
    return warumNicht(id, nurEntwurf, bedingung?.meldung);
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

    statusSetzen(id, status, kopf, version, von, inhalt) {
      return aendern(
        id,
        version,
        false,
        {
          status,
          kopf,
          ...(inhalt === undefined ? {} : { inhalt }),
          // Closing or reopening ends any edit lock.
          sperreSub: null,
          sperreTab: null,
          sperreBis: null,
        },
        von,
      );
    },

    statusBelegen(id, version, von, nach, kopf) {
      return aendern(
        id,
        version,
        false,
        { status: nach, kopf, sperreSub: null, sperreTab: null, sperreBis: null },
        von,
        { status: nach === 'abgeschlossen' ? 'entwurf' : 'abgeschlossen', meldung: BELEGT_MELDUNG },
      );
    },

    aktionenBelegen(id, version, von) {
      return aendern(id, version, false, {}, von, {
        status: 'abgeschlossen',
        meldung: BELEGT_MELDUNG,
      });
    },

    ergebnisSpeichern(id, daten, von) {
      return aendern(id, daten.version, false, { inhalt: daten.inhalt, kopf: daten.kopf }, von);
    },

    async sperreNehmen(id, sub, tab, jetzt, bis) {
      // One conditional UPDATE on the row: concurrent acquires conflict (40001) instead of both winning.
      const rows = await db
        .update(protokolle)
        .set({ sperreSub: sub, sperreTab: tab, sperreBis: bis })
        .where(
          and(
            eq(protokolle.id, id),
            eq(protokolle.status, 'entwurf'),
            or(
              isNull(protokolle.sperreBis),
              lte(protokolle.sperreBis, jetzt),
              and(eq(protokolle.sperreSub, sub), eq(protokolle.sperreTab, tab)),
            ),
          ),
        )
        .returning({ id: protokolle.id });
      if (rows.length > 0) return { erhalten: true, sub, tab, bis };
      const [row] = await db.select().from(protokolle).where(eq(protokolle.id, id));
      if (!row) return undefined;
      if (row.status === 'abgeschlossen') throw new ProtokollAbgeschlossen();
      return { erhalten: false, sub: row.sperreSub, tab: row.sperreTab, bis: row.sperreBis };
    },

    async sperreLoesen(id, sub, tab) {
      await db
        .update(protokolle)
        .set({ sperreSub: null, sperreTab: null, sperreBis: null })
        .where(
          and(eq(protokolle.id, id), eq(protokolle.sperreSub, sub), eq(protokolle.sperreTab, tab)),
        );
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
