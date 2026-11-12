import { loadConfig } from '../config';
import { createPool } from './client';
import { assertNotProd } from './environment';
import { resetDatabase } from './reset';

// Destructive: wipes all data of the database the DSQL_ENDPOINT points to.
if (process.env['CONFIRM_DB_RESET'] !== 'yes') {
  console.error(
    'Refusing to reset: set CONFIRM_DB_RESET=yes to confirm that all data may be lost.',
  );
  process.exit(1);
}

const pool = createPool(loadConfig());
try {
  await assertNotProd(pool, 'reset');
  const dropped = await resetDatabase(pool);
  console.log(dropped.length ? `Dropped: ${dropped.join(', ')}` : 'Database was already empty');
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
