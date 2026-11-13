import { loadConfig } from '../config';
import { createPool } from './client';
import { markEnvironment } from './environment';
import { migrate } from './migrate';

const pool = createPool(loadConfig());
try {
  const applied = await migrate(pool);
  const env = process.env['C4_ENV'];
  if (env) await markEnvironment(pool, env);
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date');
} finally {
  await pool.end();
}
