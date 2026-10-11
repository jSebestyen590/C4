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
});
