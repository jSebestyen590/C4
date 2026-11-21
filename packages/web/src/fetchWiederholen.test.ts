import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMitWiederholung } from './fetchWiederholen';

const fetchMock = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const antwort = (status: number) => new Response(null, { status });

describe('fetchMitWiederholung', () => {
  it('retries a GET on 503 and then succeeds', async () => {
    fetchMock.mockResolvedValueOnce(antwort(503)).mockResolvedValueOnce(antwort(200));
    const p = fetchMitWiederholung('/api/x');
    await vi.runAllTimersAsync();
    expect((await p).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries on a network error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(antwort(200));
    const p = fetchMitWiederholung('/api/x');
    await vi.runAllTimersAsync();
    expect((await p).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after 2 retries and returns the last 503', async () => {
    fetchMock.mockResolvedValue(antwort(503));
    const p = fetchMitWiederholung('/api/x');
    await vi.runAllTimersAsync();
    expect((await p).status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a POST', async () => {
    fetchMock.mockResolvedValue(antwort(503));
    const res = await fetchMitWiederholung('/api/x', { method: 'POST' });
    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([401, 404])('does not retry %i', async (status) => {
    fetchMock.mockResolvedValue(antwort(status));
    const res = await fetchMitWiederholung('/api/x');
    expect(res.status).toBe(status);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
