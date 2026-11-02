import { eq } from 'drizzle-orm';
import { KONTAKTKANAELE, type Kontaktkanal, type MitgliedStatus } from '@c4/shared';
import type { Db } from './db/client';
import { mitglieder, type MitgliedRow } from './db/schema';

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
  /** Creates or replaces the row for `sub`; `statusNeu` only applies when the row is created. */
  speichern(sub: string, daten: MitgliedDaten, statusNeu?: MitgliedStatus): Promise<void>;
  /** Admin only. Returns false when the member has no profile row yet. */
  statusSetzen(sub: string, status: MitgliedStatus): Promise<boolean>;
  /**
   * Admin only. Sets or clears `deaktiviert_am`. A member without a profile row gets an empty one
   * (default status), like in the invite flow.
   */
  deaktiviertSetzen(sub: string, deaktiviert: boolean): Promise<void>;
}

/** Whether the profile row belongs to a deactivated account. */
export const istDeaktiviert = (row: Pick<MitgliedRow, 'deaktiviertAm'> | undefined) =>
  !!row?.deaktiviertAm;

export function createMitgliederStore(db: Db): MitgliederStore {
  return {
    async holen(sub) {
      const [row] = await db.select().from(mitglieder).where(eq(mitglieder.sub, sub));
      return row;
    },
    async alle() {
      return db.select().from(mitglieder).orderBy(mitglieder.nachname, mitglieder.vorname);
    },
    async speichern(sub, daten, statusNeu = 'anwaerter') {
      const werte = { ...daten, aktualisiertAm: new Date() };
      await db
        .insert(mitglieder)
        .values({ sub, ...werte, status: statusNeu })
        .onConflictDoUpdate({ target: mitglieder.sub, set: werte });
    },
    async statusSetzen(sub, status) {
      const rows = await db
        .update(mitglieder)
        .set({ status, aktualisiertAm: new Date() })
        .where(eq(mitglieder.sub, sub))
        .returning({ sub: mitglieder.sub });
      return rows.length > 0;
    },
    async deaktiviertSetzen(sub, deaktiviert) {
      const jetzt = new Date();
      const deaktiviertAm = deaktiviert ? jetzt : null;
      await db
        .insert(mitglieder)
        .values({ sub, vorname: '', nachname: '', deaktiviertAm })
        .onConflictDoUpdate({
          target: mitglieder.sub,
          set: { deaktiviertAm, aktualisiertAm: jetzt },
        });
    },
  };
}
