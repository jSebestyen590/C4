// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unwrap, useApi } from './api';
import { ApiFehler } from './warenApi';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const auth = {
  getAccessToken: vi.fn<() => string | null>(),
  refreshAccessToken: vi.fn<() => Promise<string | null>>(),
  kontoDeaktiviert: vi.fn(),
};
vi.mock('./auth', () => ({ useAuth: () => auth }));

const antwort = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('unwrap', () => {
  it('returns the parsed body for 2xx', async () => {
    await expect(unwrap(antwort(200, { a: 1 }) as never)).resolves.toEqual({ a: 1 });
  });

  it('throws an ApiFehler with the API error text', async () => {
    const fehler = await unwrap(antwort(409, { error: 'Schon vergeben.' }) as never).catch(
      (e: unknown) => e,
    );
    expect(fehler).toBeInstanceOf(ApiFehler);
    expect(fehler).toMatchObject({ status: 409, message: 'Schon vergeben.' });
  });

  it.each([
    ['no error field', () => antwort(500, {}), 500],
    ['a non-string error', () => antwort(500, { error: { x: 1 } }), 500],
    ['an empty error', () => antwort(500, { error: '' }), 500],
    ['a non-JSON body', () => new Response('<html>', { status: 502 }), 502],
  ])('falls back to the generic text for %s', async (_name, res, status) => {
    const fehler = await unwrap(res() as never).catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(ApiFehler);
    expect(fehler).toMatchObject({
      status,
      message: 'Das hat nicht geklappt. Bitte versuch es noch einmal.',
    });
  });
});

describe('useApi 401 handling', () => {
  const fetchMock = vi.fn();
  let aufraeumen: () => void;
  let api: { me: { $get: () => Promise<Response> } };

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    auth.getAccessToken.mockReset().mockReturnValue('alt');
    auth.refreshAccessToken.mockReset();
    auth.kontoDeaktiviert.mockReset();
    function Harness() {
      api = useApi() as never;
      return null;
    }
    const root = createRoot(document.createElement('div'));
    act(() => root.render(<Harness />));
    aufraeumen = () => act(() => root.unmount());
  });
  afterEach(() => {
    aufraeumen();
    vi.unstubAllGlobals();
  });

  const token = (call: number) =>
    new Headers((fetchMock.mock.calls[call]![1] as RequestInit).headers).get('authorization');

  it('passes a successful response through without refreshing', async () => {
    fetchMock.mockResolvedValueOnce(antwort(200));
    const res = await api.me.$get();
    expect(res.status).toBe(200);
    expect(auth.refreshAccessToken).not.toHaveBeenCalled();
    expect(token(0)).toBe('Bearer alt');
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    fetchMock.mockResolvedValueOnce(antwort(401)).mockResolvedValueOnce(antwort(200, { ok: 1 }));
    auth.refreshAccessToken.mockResolvedValue('neu');
    const res = await api.me.$get();
    expect(res.status).toBe(200);
    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(token(1)).toBe('Bearer neu');
  });

  it('does not retry a second time when the retry is a 401 again', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(antwort(401)));
    auth.refreshAccessToken.mockResolvedValue('neu');
    const res = await api.me.$get();
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it('returns the 401 without retry when the refresh fails', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(antwort(401)));
    auth.refreshAccessToken.mockResolvedValue(null);
    const res = await api.me.$get();
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows the lock page on 403 deaktiviert', async () => {
    fetchMock.mockResolvedValueOnce(antwort(403, { deaktiviert: true }));
    const res = await api.me.$get();
    expect(res.status).toBe(403);
    expect(auth.kontoDeaktiviert).toHaveBeenCalledTimes(1);
  });
});
