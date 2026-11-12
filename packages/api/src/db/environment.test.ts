import { describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import { assertNotProd, markEnvironment } from './environment';

const pool = (query: unknown) => ({ query }) as unknown as pg.Pool;

describe('assertNotProd', () => {
  it('refuses when the database is marked prod', async () => {
    const query = vi.fn(async () => ({ rows: [{ value: 'prod' }] }));
    await expect(assertNotProd(pool(query), 'reset')).rejects.toThrow(/marked as prod/);
  });

  it('proceeds for dev, for a missing row and for a missing table', async () => {
    await expect(
      assertNotProd(
        pool(async () => ({ rows: [{ value: 'dev' }] })),
        'reset',
      ),
    ).resolves.toBeUndefined();
    await expect(
      assertNotProd(
        pool(async () => ({ rows: [] })),
        'reset',
      ),
    ).resolves.toBeUndefined();
    const missing = async () => {
      throw Object.assign(new Error('relation "app_info" does not exist'), { code: '42P01' });
    };
    await expect(assertNotProd(pool(missing), 'reset')).resolves.toBeUndefined();
  });

  it('rethrows other errors', async () => {
    const query = async () => {
      throw new Error('connection lost');
    };
    await expect(assertNotProd(pool(query), 'reset')).rejects.toThrow('connection lost');
  });
});

describe('markEnvironment', () => {
  it('upserts the env row', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await markEnvironment(pool(query), 'prod');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (key) DO UPDATE'), [
      'prod',
    ]);
  });
});
