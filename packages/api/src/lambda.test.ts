import { beforeEach, describe, expect, it, vi } from 'vitest';

const pingDb = vi.fn<() => Promise<void>>();
const finanzExportJob = vi.fn(async () => ({ neu: 2, bisSeq: 5 }));
const datenexportJob = vi.fn<(e: unknown) => Promise<{ ok: boolean; id: string }>>(async () => ({
  ok: true,
  id: 'x1',
}));

vi.mock('./bootstrap', () => ({
  createProduction: () => ({
    app: {},
    pingDb,
    mailJob: vi.fn(),
    finanzExportJob,
    datenexportJob,
    pushJob: vi.fn(),
  }),
}));
vi.mock('@hono/aws-lambda', () => ({ handle: () => async () => ({ statusCode: 200 }) }));

describe('lambda handler', () => {
  beforeEach(() => {
    pingDb.mockReset();
    pingDb.mockResolvedValue();
  });

  it('datenexport event runs the export job with the event as order', async () => {
    const { handler } = await import('./lambda');
    const auftrag = { c4: 'datenexport', id: 'x1', von: '2025-01-01', bis: '2025-12-31', sub: 'a' };
    expect(await handler(auftrag, {})).toEqual({ ok: true, id: 'x1' });
    expect(datenexportJob).toHaveBeenCalledWith(auftrag);
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

  it('finanz-export event runs the export job', async () => {
    const { handler } = await import('./lambda');
    expect(await handler({ c4: 'finanz-export' }, {})).toEqual({ ok: true, neu: 2, bisSeq: 5 });
    expect(finanzExportJob).toHaveBeenCalledTimes(1);
  });

  it('other events go to the HTTP handler', async () => {
    const { handler } = await import('./lambda');
    expect(await handler({ rawPath: '/api/health' }, {})).toEqual({ statusCode: 200 });
    expect(pingDb).not.toHaveBeenCalled();
  });
});
