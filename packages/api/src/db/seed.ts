import { loadConfig } from '../config';
import { createDb, createPool } from './client';
import { appInfo, dienstformen } from './schema';

/** Fixed ids make the seed idempotent: re-running it never duplicates rows. */
const FORMEN = [
  { id: 'bar', name: 'Bar' },
  { id: 'dienstform-technik', name: 'Technik' },
];

const pool = createPool(loadConfig());
try {
  const db = createDb(pool);
  await db
    .insert(appInfo)
    .values({ key: 'seeded', value: new Date().toISOString() })
    .onConflictDoNothing();

  // Kalender: Dienstformen (Kategorien, Vorlagen and Serien are set up in the Einrichtung).
  await db
    .insert(dienstformen)
    .values(FORMEN.map((f, reihenfolge) => ({ ...f, reihenfolge })))
    .onConflictDoNothing();
  console.log('Seed data written');
} finally {
  await pool.end();
}
