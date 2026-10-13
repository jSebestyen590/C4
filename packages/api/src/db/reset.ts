import type pg from 'pg';

/**
 * Drops every table in the public schema, including `schema_migrations`, so the next migration run
 * rebuilds the database from scratch. All data is lost. DSQL allows one DDL statement per
 * transaction, so each table is dropped on its own. Tables referenced by foreign keys cannot be
 * dropped before their referencing tables, so failed drops are retried until nothing is left.
 */
export async function resetDatabase(pool: pg.Pool): Promise<string[]> {
  const { rows } = await pool.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
  );
  const dropped: string[] = [];
  let offen = rows.map((r) => r.table_name);
  while (offen.length > 0) {
    const uebrig: string[] = [];
    let fehler: unknown;
    for (const name of offen) {
      try {
        await pool.query(`DROP TABLE IF EXISTS "${name.replaceAll('"', '""')}"`);
        dropped.push(name);
      } catch (err) {
        fehler = err;
        uebrig.push(name);
      }
    }
    if (uebrig.length === offen.length) throw fehler;
    offen = uebrig;
  }
  return dropped;
}
