import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type pg from 'pg';

const MIGRATIONS_DIR = path.join(import.meta.dirname, 'migrations');

/** DSQL's optimistic concurrency error (e.g. OC001 "schema has been updated by another transaction"). */
const istKonflikt = (err: unknown): boolean => (err as { code?: unknown }).code === '40001';

/**
 * Runs a query and retries it on DSQL concurrency conflicts, which happen when the schema changed
 * right before (e.g. the running app or the previous migration). Migrations are idempotent
 * (`IF NOT EXISTS`, `ON CONFLICT`), so a retry is safe.
 */
export async function mitWiederholung<T>(
  aktion: () => Promise<T>,
  versuche = 5,
  warten = (ms: number) => new Promise((r) => setTimeout(r, ms)),
): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await aktion();
    } catch (err) {
      if (!istKonflikt(err) || i >= versuche) throw err;
      await warten(500 * 2 ** (i - 1));
    }
  }
}

/**
 * Applies *.sql files in name order. Aurora DSQL allows only one DDL statement per
 * transaction, so every file must contain a single statement (or only DML); each runs on its own.
 */
export async function migrate(pool: pg.Pool, dir = MIGRATIONS_DIR): Promise<string[]> {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
  const done = new Set(rows.map((r) => r.name));
  const files = (await readdir(dir))
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(path.join(dir, file), 'utf8');
    await mitWiederholung(() => pool.query(sql));
    await mitWiederholung(() =>
      pool.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [
        file,
      ]),
    );
    applied.push(file);
  }
  return applied;
}
