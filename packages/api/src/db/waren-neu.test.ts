import { describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import { WAREN_TABELLEN, warenNeu } from './waren-neu';

describe('warenNeu', () => {
  it('drops only the Waren tables and forgets migrations 0010-0024', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const dropped = await warenNeu({ query } as unknown as pg.Pool);
    expect(dropped).toEqual(WAREN_TABELLEN);
    const sqls = query.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(sqls.filter((s) => s.startsWith('DROP'))).toHaveLength(WAREN_TABELLEN.length);
    expect(sqls.join('\n')).not.toMatch(/mitglieder|posten/);
    expect(query).toHaveBeenCalledWith(
      'DELETE FROM schema_migrations WHERE name >= $1 AND name < $2',
      ['0010_', '0025_'],
    );
  });

  it('retries tables that are still referenced by a foreign key', async () => {
    const dropped: string[] = [];
    const query = vi.fn(async (sql: string) => {
      const name = sql.match(/^DROP TABLE IF EXISTS "(.+)"$/)?.[1];
      if (name === 'gebinde' && !dropped.includes('bestandsbuchungen'))
        throw new Error('referenced');
      if (name) dropped.push(name);
      return { rows: [] };
    });
    const result = await warenNeu({ query } as unknown as pg.Pool);
    expect(result.indexOf('gebinde')).toBeGreaterThan(result.indexOf('bestandsbuchungen'));
    expect(result).toHaveLength(WAREN_TABELLEN.length);
  });

  it('gives up when nothing can be dropped', async () => {
    const query = vi.fn(async () => {
      throw new Error('boom');
    });
    await expect(warenNeu({ query } as unknown as pg.Pool)).rejects.toThrow('boom');
  });
});
