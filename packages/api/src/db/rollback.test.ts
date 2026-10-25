import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import { rollback } from './rollback';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'rollback-'));
  await mkdir(path.join(dir, 'down'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const down = (file: string, sql: string) => writeFile(path.join(dir, 'down', file), sql);

function fakePool(applied: string[]) {
  const query = vi.fn(async (sql: string) =>
    sql.startsWith('SELECT') ? { rows: applied.map((name) => ({ name })) } : { rows: [] },
  );
  return { pool: { query } as unknown as pg.Pool, query };
}

const writes = (query: ReturnType<typeof fakePool>['query']) =>
  query.mock.calls.map((c) => c[0] as string).filter((s) => !s.startsWith('SELECT'));

describe('rollback', () => {
  it('--to rolls back everything after the target in reverse order', async () => {
    await down('0002_b.down.sql', 'DROP TABLE b');
    await down('0003_c.down.1.sql', 'DROP INDEX c1');
    await down('0003_c.down.2.sql', 'DROP TABLE c');
    await down('0003_c.down.10.sql', 'DROP TABLE c10');
    const { pool, query } = fakePool(['0001_a.sql', '0002_b.sql', '0003_c.sql']);
    expect(await rollback(pool, { to: '0001_a' }, dir)).toEqual(['0003_c.sql', '0002_b.sql']);
    expect(writes(query)).toEqual([
      'DROP INDEX c1',
      'DROP TABLE c',
      'DROP TABLE c10',
      'DELETE FROM schema_migrations WHERE name = $1',
      'DROP TABLE b',
      'DELETE FROM schema_migrations WHERE name = $1',
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('DELETE'), ['0003_c.sql']);
  });

  it('--to accepts the name with .sql and is a no-op for the newest migration', async () => {
    const { pool, query } = fakePool(['0001_a.sql', '0002_b.sql']);
    expect(await rollback(pool, { to: '0002_b.sql' }, dir)).toEqual([]);
    expect(writes(query)).toEqual([]);
  });

  it('--last N rolls back the newest N migrations', async () => {
    await down('0002_b.down.sql', 'DROP TABLE b');
    const { pool, query } = fakePool(['0002_b.sql', '0001_a.sql']);
    expect(await rollback(pool, { last: 1 }, dir)).toEqual(['0002_b.sql']);
    expect(writes(query)).toEqual([
      'DROP TABLE b',
      'DELETE FROM schema_migrations WHERE name = $1',
    ]);
    expect(await rollback(pool, { last: 0 }, dir)).toEqual([]);
  });

  it('fails before changing anything when a down file is missing', async () => {
    await down('0003_c.down.sql', 'DROP TABLE c');
    const { pool, query } = fakePool(['0001_a.sql', '0002_b.sql', '0003_c.sql']);
    await expect(rollback(pool, { last: 3 }, dir)).rejects.toThrow(/0002_b\.sql, 0001_a\.sql/);
    expect(writes(query)).toEqual([]);
  });

  it('fails when the down directory does not exist', async () => {
    const { pool, query } = fakePool(['0001_a.sql']);
    await expect(rollback(pool, { last: 1 }, path.join(dir, 'nope'))).rejects.toThrow(/Missing/);
    expect(writes(query)).toEqual([]);
  });

  it('rejects an unknown target', async () => {
    const { pool, query } = fakePool(['0001_a.sql']);
    await expect(rollback(pool, { to: '0009_x' }, dir)).rejects.toThrow(/Unknown rollback target/);
    expect(writes(query)).toEqual([]);
  });
});

describe('down files', () => {
  it('exist for every migration from 0010 on', async () => {
    const migrations = path.join(import.meta.dirname, 'migrations');
    const ups = (await readdir(migrations)).filter((f) => /^\d{4}_.*\.sql$/.test(f) && f >= '0010');
    const downs = await readdir(path.join(migrations, 'down'));
    const fehlend = ups.filter((f) => {
      const base = f.replace(/\.sql$/, '');
      return !downs.some((d) => d === `${base}.down.sql` || d.startsWith(`${base}.down.`));
    });
    expect(fehlend).toEqual([]);
  });
});
