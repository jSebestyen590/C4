import { loadConfig } from '../config';
import { createDb, createPool } from './client';
import { appInfo } from './schema';

const pool = createPool(loadConfig());
try {
  await createDb(pool)
    .insert(appInfo)
    .values({ key: 'seeded', value: new Date().toISOString() })
    .onConflictDoNothing();
  console.log('Seed data written');
} finally {
  await pool.end();
}
