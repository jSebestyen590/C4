import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type pg from 'pg';
import { mitWiederholung } from './migrate';

const MIGRATIONS_DIR = path.join(import.meta.dirname, 'migrations');

export type RollbackTarget = { to: string } | { last: number };

const withSql = (name: string) => (name.endsWith('.sql') ? name : `${name}.sql`);

/**
 * Reads the down statements of a migration from `<dir>/down`: `<basename>.down.sql` (one statement)
 * or `<basename>.down.1.sql`, `<basename>.down.2.sql`, ... (executed in numeric order). Returns an
 * empty list when there is no down file.
 */
async function readDownStatements(downDir: string, migration: string): Promise<string[]> {
  const base = migration.replace(/\.sql$/, '');
  let entries: string[];
  try {
    entries = await readdir(downDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const single = `${base}.down.sql`;
  const numbered = entries
    .map((f) => ({
      f,
      m: f.startsWith(`${base}.down.`) ? /^\.(\d+)\.sql$/.exec(f.slice(base.length + 5)) : null,
    }))
    .filter((e): e is { f: string; m: RegExpExecArray } => e.m !== null)
    .sort((a, b) => Number(a.m[1]) - Number(b.m[1]))
    .map((e) => e.f);
  const files = entries.includes(single) ? [single] : numbered;
  return Promise.all(files.map((f) => readFile(path.join(downDir, f), 'utf8')));
}

/**
 * Rolls applied migrations back in reverse name order, either everything applied after the migration
 * `to` or the `last` N migrations. Each migration's down statements run one query at a time (DSQL
 * allows one DDL statement per transaction), then its `schema_migrations` row is deleted. Every
 * migration to roll back must have a down file; this is checked before anything is changed.
 */
export async function rollback(
  pool: pg.Pool,
  target: RollbackTarget,
  dir = MIGRATIONS_DIR,
): Promise<string[]> {
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = rows.map((r) => r.name).sort((a, b) => a.localeCompare(b));

  let toRollBack: string[];
  if ('to' in target) {
    const name = withSql(target.to);
    const idx = applied.indexOf(name);
    if (idx === -1) throw new Error(`Unknown rollback target (not applied): ${name}`);
    toRollBack = applied.slice(idx + 1);
  } else {
    if (!Number.isInteger(target.last) || target.last < 0)
      throw new Error(`Invalid --last value: ${target.last}`);
    toRollBack = target.last === 0 ? [] : applied.slice(-target.last);
  }
  toRollBack.reverse();

  const downDir = path.join(dir, 'down');
  const plan = new Map<string, string[]>();
  for (const name of toRollBack) plan.set(name, await readDownStatements(downDir, name));
  const missing = toRollBack.filter((n) => plan.get(n)!.length === 0);
  if (missing.length > 0)
    throw new Error(`Missing down migration for: ${missing.join(', ')} (expected in ${downDir})`);

  for (const name of toRollBack) {
    for (const sql of plan.get(name)!) await mitWiederholung(() => pool.query(sql));
    await mitWiederholung(() =>
      pool.query('DELETE FROM schema_migrations WHERE name = $1', [name]),
    );
  }
  return toRollBack;
}
