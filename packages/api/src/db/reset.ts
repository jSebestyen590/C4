import type pg from 'pg';

/**
 * Drops every table in the public schema, including `schema_migrations`, so the next migration run
 * rebuilds the database from scratch. All data is lost. DSQL allows one DDL statement per
 * transaction, so each table is dropped on its own.
 */
export async function resetDatabase(pool: pg.Pool): Promise<string[]> {
  const { rows } = await pool.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
  );
  const dropped: string[] = [];
  for (const { table_name } of rows) {
    await pool.query(`DROP TABLE IF EXISTS "${table_name.replaceAll('"', '""')}"`);
    dropped.push(table_name);
  }
  return dropped;
}
