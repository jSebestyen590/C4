import { loadConfig } from '../config';
import { createPool } from './client';
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
  const dropped = await resetDatabase(pool);
  console.log(dropped.length ? `Dropped: ${dropped.join(', ')}` : 'Database was already empty');
} finally {
  await pool.end();
}
