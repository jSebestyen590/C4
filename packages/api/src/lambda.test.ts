import { beforeEach, describe, expect, it, vi } from 'vitest';

const pingDb = vi.fn<() => Promise<void>>();

vi.mock('./bootstrap', () => ({
  createProduction: () => ({ app: {}, pingDb, mailJob: vi.fn(), pushJob: vi.fn() }),
}));
vi.mock('@hono/aws-lambda', () => ({ handle: () => async () => ({ statusCode: 200 }) }));

describe('lambda handler', () => {
  beforeEach(() => {
    pingDb.mockReset();
    pingDb.mockResolvedValue();
  });

  it('health event pings the database', async () => {
    const { handler } = await import('./lambda');
    expect(await handler({ c4: 'health' }, {})).toEqual({ ok: true });
    expect(pingDb).toHaveBeenCalledTimes(1);
  });

  it('health event throws when the database is down', async () => {
    const { handler } = await import('./lambda');
    pingDb.mockRejectedValue(new Error('down'));
    await expect(handler({ c4: 'health' }, {})).rejects.toThrow('down');
  });

  it('other events go to the HTTP handler', async () => {
    const { handler } = await import('./lambda');
    expect(await handler({ rawPath: '/api/health' }, {})).toEqual({ statusCode: 200 });
    expect(pingDb).not.toHaveBeenCalled();
  });
});
