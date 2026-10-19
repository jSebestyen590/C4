import type pg from 'pg';

/** Tables of the Waren feature in creation order (migrations 0010-0023). */
export const WAREN_TABELLEN = [
  'lagerorte',
  'warengruppen',
  'gebinde',
  'waren',
  'ware_aliase',
  'ware_gebinde',
  'lagerort_waren',
  'bestandsvorgaenge',
  'bestandsbuchungen',
  'inventuren',
  'inventur_knoten',
  'inventur_zaehlungen',
];

/**
 * One-off maintenance: drops only the Waren tables and forgets their migrations (0010-0024), so
 * the next migration run recreates them with the current schema. Mitglieder and Posten stay
 * untouched; all Waren data is lost. DSQL allows one DDL statement per transaction, so each table is
 * dropped on its own; tables that are still referenced by a foreign key are retried.
 */
export async function warenNeu(pool: pg.Pool): Promise<string[]> {
  const dropped: string[] = [];
  let offen = [...WAREN_TABELLEN];
  while (offen.length > 0) {
    const uebrig: string[] = [];
    let fehler: unknown;
    for (const name of offen) {
      try {
        await pool.query(`DROP TABLE IF EXISTS "${name}"`);
        dropped.push(name);
      } catch (err) {
        fehler = err;
        uebrig.push(name);
      }
    }
    if (uebrig.length === offen.length) throw fehler;
    offen = uebrig;
  }
  // schema_migrations does not exist on a database that was never migrated.
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  await pool.query('DELETE FROM schema_migrations WHERE name >= $1 AND name < $2', [
    '0010_',
    '0025_',
  ]);
  return dropped;
}
