import { loadConfig } from '../config';
import { createPool } from './client';
import { warenNeu } from './waren-neu';

// Destructive: deletes all Waren data of the database the DSQL_ENDPOINT points to.
if (process.env['CONFIRM_WAREN_RESET'] !== 'yes') {
  console.error(
    'Refusing to reset: set CONFIRM_WAREN_RESET=yes to confirm that all Waren data may be lost.',
  );
  process.exit(1);
}

const pool = createPool(loadConfig());
try {
  const dropped = await warenNeu(pool);
  console.log(`Dropped: ${dropped.join(', ')}. Run the migrations to recreate the tables.`);
} finally {
  await pool.end();
}
