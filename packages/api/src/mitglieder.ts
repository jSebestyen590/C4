import { eq } from 'drizzle-orm';
import type { MitgliedStatus } from '@c4/shared';
import type { Db } from './db/client';
import { mitglieder, type MitgliedRow } from './db/schema';

export type MitgliedDaten = Omit<MitgliedRow, 'sub' | 'aktualisiertAm' | 'status'>;

export interface MitgliederStore {
  holen(sub: string): Promise<MitgliedRow | undefined>;
  alle(): Promise<MitgliedRow[]>;
  /** Creates or replaces the row for `sub`; `statusNeu` only applies when the row is created. */
  speichern(sub: string, daten: MitgliedDaten, statusNeu?: MitgliedStatus): Promise<void>;
  /** Admin only. Returns false when the member has no profile row yet. */
  statusSetzen(sub: string, status: MitgliedStatus): Promise<boolean>;
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
  };
}
