import { eq } from 'drizzle-orm';
import type { Db } from './db/client';
import { mitglieder, type MitgliedRow } from './db/schema';

export type MitgliedDaten = Omit<MitgliedRow, 'sub' | 'aktualisiertAm'>;

export interface MitgliederStore {
  holen(sub: string): Promise<MitgliedRow | undefined>;
  alle(): Promise<MitgliedRow[]>;
  /** Creates or replaces the row for `sub`. */
  speichern(sub: string, daten: MitgliedDaten): Promise<void>;
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
    async speichern(sub, daten) {
      const werte = { ...daten, aktualisiertAm: new Date() };
      await db
        .insert(mitglieder)
        .values({ sub, ...werte })
        .onConflictDoUpdate({ target: mitglieder.sub, set: werte });
    },
  };
}
