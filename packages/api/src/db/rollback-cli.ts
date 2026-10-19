import { parseArgs } from 'node:util';
import { loadConfig } from '../config';
import { createPool } from './client';
import { rollback, type RollbackTarget } from './rollback';

const { values } = parseArgs({
  options: { to: { type: 'string' }, last: { type: 'string' } },
});

if ((values.to === undefined) === (values.last === undefined)) {
  console.error('Usage: pnpm db:rollback --to <migration-name> | --last <N>');
  process.exit(1);
}

// Destructive: drops what the down migrations drop in the database the DSQL_ENDPOINT points to.
if (process.env['CONFIRM_DB_ROLLBACK'] !== 'yes') {
  console.error(
    'Refusing to roll back: set CONFIRM_DB_ROLLBACK=yes to confirm that data may be lost.',
  );
  process.exit(1);
}

const target: RollbackTarget =
  values.to !== undefined ? { to: values.to } : { last: Number(values.last) };

const pool = createPool(loadConfig());
try {
  const rolledBack = await rollback(pool, target);
  console.log(rolledBack.length ? `Rolled back: ${rolledBack.join(', ')}` : 'Nothing to roll back');
} finally {
  await pool.end();
}
