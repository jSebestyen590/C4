import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  aktuellerStatus,
  heuteBerlin,
  KONTAKTKANAELE,
  statusVerlaufSortieren,
  type Kontaktkanal,
  type MitgliedStatus,
  type StatusEintrag,
  type StatusEintragEingabe,
} from '@c4/shared';
import type { Db } from './db/client';
import { mitglieder, mitgliedStatusVerlauf, type MitgliedRow } from './db/schema';

/** Another status entry of the member already starts on that day. */
export class StatusDatumDoppelt extends Error {}

/** The last remaining status entry cannot be deleted. */
export class LetzterStatusEintrag extends Error {}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export type MitgliedDaten = Omit<
  MitgliedRow,
  'sub' | 'aktualisiertAm' | 'status' | 'deaktiviertAm'
>;

/** Comma-separated database value -> known channels in their canonical order. */
export const kanaeleLesen = (wert: string | null): Kontaktkanal[] => {
  const gewaehlt = new Set((wert ?? '').split(','));
  return KONTAKTKANAELE.filter((k) => gewaehlt.has(k));
};

/** Channels -> comma-separated database value; null when empty. */
export const kanaeleSchreiben = (kanaele: readonly Kontaktkanal[]): string | null => {
  const wert = KONTAKTKANAELE.filter((k) => kanaele.includes(k)).join(',');
  return wert === '' ? null : wert;
};

/** Whether other members may see the birthday: only an explicit "no" hides it. */
export const geburtstagSichtbar = (row: Pick<MitgliedRow, 'geburtstagImKalender'> | undefined) =>
  row?.geburtstagImKalender !== false;

export interface MitgliederStore {
  holen(sub: string): Promise<MitgliedRow | undefined>;
  alle(): Promise<MitgliedRow[]>;
  /**
   * Creates or replaces the row for `sub`; `statusNeu` and `ab` (start of the first status entry,
   * default today) only apply when the row is created.
   */
  speichern(
    sub: string,
    daten: MitgliedDaten,
    statusNeu?: MitgliedStatus,
    ab?: string,
  ): Promise<void>;
  /**
   * Admin only. Adds a history entry starting `ab` (or overwrites the one with the same day) and
   * syncs `mitglieder.status`. Returns false when the member has no profile row yet.
   */
  statusSetzen(sub: string, status: MitgliedStatus, ab?: string): Promise<boolean>;
  /** Status history, oldest first (undated entries first). */
  statusVerlauf(sub: string): Promise<StatusEintrag[]>;
  /** Returns the new id, undefined when the member does not exist. Throws StatusDatumDoppelt. */
  statusEintragAnlegen(sub: string, daten: StatusEintragEingabe): Promise<string | undefined>;
  /** False when the entry does not exist. Throws StatusDatumDoppelt. */
  statusEintragAendern(sub: string, id: string, daten: StatusEintragEingabe): Promise<boolean>;
  /** False when the entry does not exist. Throws LetzterStatusEintrag. */
  statusEintragLoeschen(sub: string, id: string): Promise<boolean>;
  /**
   * Admin only. Sets or clears `deaktiviert_am`. A member without a profile row gets an empty one
   * (default status), like in the invite flow.
   */
  deaktiviertSetzen(sub: string, deaktiviert: boolean): Promise<void>;
}

/** Whether the profile row belongs to a deactivated account. */
export const istDeaktiviert = (row: Pick<MitgliedRow, 'deaktiviertAm'> | undefined) =>
  !!row?.deaktiviertAm;

async function verlaufLesen(tx: Tx | Db, sub: string) {
  const rows = await tx
    .select()
    .from(mitgliedStatusVerlauf)
    .where(eq(mitgliedStatusVerlauf.mitgliedSub, sub))
    .orderBy(mitgliedStatusVerlauf.erstelltAm);
  return statusVerlaufSortieren(rows);
}

/** Writes the status of the newest history entry to `mitglieder.status`. */
async function statusAbgleichen(tx: Tx, sub: string) {
  const aktuell = aktuellerStatus(await verlaufLesen(tx, sub));
  if (!aktuell) return;
  await tx
    .update(mitglieder)
    .set({ status: aktuell.status, aktualisiertAm: new Date() })
    .where(eq(mitglieder.sub, sub));
}

/** Throws unless no other entry of the member starts on `ab`. */
async function datumFrei(tx: Tx, sub: string, ab: string, ausser?: string) {
  const andere = await verlaufLesen(tx, sub);
  if (andere.some((e) => e.ab === ab && e.id !== ausser)) throw new StatusDatumDoppelt();
}

export function createMitgliederStore(db: Db): MitgliederStore {
  return {
    async holen(sub) {
      const [row] = await db.select().from(mitglieder).where(eq(mitglieder.sub, sub));
      return row;
    },
    async alle() {
      return db.select().from(mitglieder).orderBy(mitglieder.nachname, mitglieder.vorname);
    },
    async speichern(sub, daten, statusNeu = 'anwaerter', ab = heuteBerlin()) {
      const werte = { ...daten, aktualisiertAm: new Date() };
      await db.transaction(async (tx) => {
        const [vorhanden] = await tx
          .select({ sub: mitglieder.sub })
          .from(mitglieder)
          .where(eq(mitglieder.sub, sub));
        if (vorhanden) {
          await tx.update(mitglieder).set(werte).where(eq(mitglieder.sub, sub));
          return;
        }
        await tx.insert(mitglieder).values({ sub, ...werte, status: statusNeu });
        await tx.insert(mitgliedStatusVerlauf).values({
          id: randomUUID(),
          mitgliedSub: sub,
          status: statusNeu,
          ab,
        });
      });
    },
    async statusSetzen(sub, status, ab = heuteBerlin()) {
      return db.transaction(async (tx) => {
        const [vorhanden] = await tx
          .select({ sub: mitglieder.sub })
          .from(mitglieder)
          .where(eq(mitglieder.sub, sub));
        if (!vorhanden) return false;
        const [gleicherTag] = await tx
          .select({ id: mitgliedStatusVerlauf.id })
          .from(mitgliedStatusVerlauf)
          .where(and(eq(mitgliedStatusVerlauf.mitgliedSub, sub), eq(mitgliedStatusVerlauf.ab, ab)));
        if (gleicherTag) {
          await tx
            .update(mitgliedStatusVerlauf)
            .set({ status })
            .where(eq(mitgliedStatusVerlauf.id, gleicherTag.id));
        } else {
          await tx
            .insert(mitgliedStatusVerlauf)
            .values({ id: randomUUID(), mitgliedSub: sub, status, ab });
        }
        await statusAbgleichen(tx, sub);
        return true;
      });
    },
    async statusVerlauf(sub) {
      const rows = await verlaufLesen(db, sub);
      return rows.map(({ id, status, ab }) => ({ id, status, ab }));
    },
    async statusEintragAnlegen(sub, daten) {
      return db.transaction(async (tx) => {
        const [vorhanden] = await tx
          .select({ sub: mitglieder.sub })
          .from(mitglieder)
          .where(eq(mitglieder.sub, sub));
        if (!vorhanden) return undefined;
        await datumFrei(tx, sub, daten.ab);
        const id = randomUUID();
        await tx.insert(mitgliedStatusVerlauf).values({ id, mitgliedSub: sub, ...daten });
        await statusAbgleichen(tx, sub);
        return id;
      });
    },
    async statusEintragAendern(sub, id, daten) {
      return db.transaction(async (tx) => {
        const [eintrag] = await tx
          .select({ id: mitgliedStatusVerlauf.id })
          .from(mitgliedStatusVerlauf)
          .where(and(eq(mitgliedStatusVerlauf.id, id), eq(mitgliedStatusVerlauf.mitgliedSub, sub)));
        if (!eintrag) return false;
        await datumFrei(tx, sub, daten.ab, id);
        await tx.update(mitgliedStatusVerlauf).set(daten).where(eq(mitgliedStatusVerlauf.id, id));
        await statusAbgleichen(tx, sub);
        return true;
      });
    },
    async statusEintragLoeschen(sub, id) {
      return db.transaction(async (tx) => {
        const eintraege = await verlaufLesen(tx, sub);
        if (!eintraege.some((e) => e.id === id)) return false;
        if (eintraege.length <= 1) throw new LetzterStatusEintrag();
        await tx.delete(mitgliedStatusVerlauf).where(eq(mitgliedStatusVerlauf.id, id));
        await statusAbgleichen(tx, sub);
        return true;
      });
    },
    async deaktiviertSetzen(sub, deaktiviert) {
      const jetzt = new Date();
      const deaktiviertAm = deaktiviert ? jetzt : null;
      await db.transaction(async (tx) => {
        const [vorhanden] = await tx
          .select({ sub: mitglieder.sub })
          .from(mitglieder)
          .where(eq(mitglieder.sub, sub));
        if (vorhanden) {
          await tx
            .update(mitglieder)
            .set({ deaktiviertAm, aktualisiertAm: jetzt })
            .where(eq(mitglieder.sub, sub));
          return;
        }
        await tx.insert(mitglieder).values({ sub, vorname: '', nachname: '', deaktiviertAm });
        await tx.insert(mitgliedStatusVerlauf).values({
          id: randomUUID(),
          mitgliedSub: sub,
          status: 'anwaerter',
          ab: heuteBerlin(),
        });
      });
    },
  };
}
