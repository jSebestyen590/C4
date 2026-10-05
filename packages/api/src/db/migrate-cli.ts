import { loadConfig } from '../config';
import { createPool } from './client';
import { migrate } from './migrate';

const pool = createPool(loadConfig());
try {
  const applied = await migrate(pool);
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date');
} finally {
  await pool.end();
}
