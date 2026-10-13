import { describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import { resetDatabase } from './reset';

describe('resetDatabase', () => {
  it('drops each public table on its own and quotes the names', async () => {
    const query = vi.fn(async (sql: string) =>
      sql.startsWith('SELECT')
        ? { rows: [{ table_name: 'mitglieder' }, { table_name: 'we"ird' }] }
        : { rows: [] },
    );
    const dropped = await resetDatabase({ query } as unknown as pg.Pool);
    expect(dropped).toEqual(['mitglieder', 'we"ird']);
    expect(query).toHaveBeenCalledWith('DROP TABLE IF EXISTS "mitglieder"');
    expect(query).toHaveBeenCalledWith('DROP TABLE IF EXISTS "we""ird"');
  });

  it('retries tables that are still referenced by a foreign key', async () => {
    const dropped: string[] = [];
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith('SELECT'))
        return { rows: [{ table_name: 'posten' }, { table_name: 'besetzungen' }] };
      if (sql.includes('"posten"') && !dropped.includes('besetzungen'))
        throw new Error('referenced');
      dropped.push(sql.match(/"(.+)"/)![1]!);
      return { rows: [] };
    });
    expect(await resetDatabase({ query } as unknown as pg.Pool)).toEqual(['besetzungen', 'posten']);
  });
});
