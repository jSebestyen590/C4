import { describe, expect, it, vi } from 'vitest';
import { createSumup, SUMUP_MAX_SEITEN } from './sumup';

const json = (daten: unknown, status = 200) =>
  new Response(JSON.stringify(daten), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const tx = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  transaction_code: `TC${id}`,
  amount: 12.5,
  currency: 'EUR',
  timestamp: '2026-11-01T20:00:00.000Z',
  status: 'SUCCESSFUL',
  type: 'PAYMENT',
  ...extra,
});

function mock(handler: (url: string) => Response) {
  const urls: string[] = [];
  const auth: (string | undefined)[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    urls.push(String(url));
    auth.push((init?.headers as Record<string, string> | undefined)?.Authorization);
    return handler(String(url));
  }) as typeof fetch;
  return { fetchFn, urls, auth };
}

describe('SumUp client', () => {
  it('pages through the history and converts amounts', async () => {
    const m = mock((url) =>
      url.includes('page=2')
        ? json({ items: [tx('b')], links: [] })
        : json({
            items: [tx('a', { tip_amount: 1.1 })],
            links: [{ rel: 'next', href: '?oldest_time=x&page=2' }],
          }),
    );
    const api = createSumup({ apiKey: 'k', merchantCode: 'MC1' }, { fetch: m.fetchFn });
    const r = await api.transaktionen(new Date('2026-11-01T00:00:00Z'));
    expect(r.vollstaendig).toBe(true);
    expect(r.transaktionen.map((t) => [t.id, t.betragCent, t.trinkgeldCent])).toEqual([
      ['a', 1250, 110],
      ['b', 1250, 0],
    ]);
    expect(m.urls[0]).toContain('/v2.1/merchants/MC1/transactions/history?oldest_time=');
    expect(m.urls[1]).toContain('page=2');
    expect(m.auth[0]).toBe('Bearer k');
    expect(JSON.parse(r.transaktionen[0]!.roh).id).toBe('a');
  });

  it('stops after the page budget', async () => {
    let n = 0;
    const m = mock(() => json({ items: [tx(`t${n++}`)], links: [{ rel: 'next', href: '?p=1' }] }));
    const api = createSumup({ apiKey: 'k', merchantCode: 'MC1' }, { fetch: m.fetchFn });
    const r = await api.transaktionen(new Date());
    expect(r.vollstaendig).toBe(false);
    expect(m.urls).toHaveLength(SUMUP_MAX_SEITEN);
  });

  it('negates refunds, skips PENDING, foreign currency and unreadable items', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = mock(() =>
      json({
        items: [
          tx('r', { type: 'REFUND', amount: 5 }),
          tx('c', { type: 'CHARGE_BACK', amount: -2 }),
          tx('p', { status: 'PENDING' }),
          tx('u', { currency: 'USD' }),
          { kaputt: true },
          tx('ok', { unbekanntesFeld: { x: 1 }, status: 'REFUNDED' }),
        ],
      }),
    );
    const api = createSumup({ apiKey: 'k', merchantCode: 'MC1' }, { fetch: m.fetchFn });
    const r = await api.transaktionen(new Date());
    expect(r.transaktionen.map((t) => [t.id, t.betragCent])).toEqual([
      ['r', -500],
      ['c', -200],
      ['ok', 1250],
    ]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('looks up the merchant code when the secret has none', async () => {
    const m = mock((url) =>
      url.endsWith('/v0.1/me')
        ? json({ merchant_profile: { merchant_code: 'MX' } })
        : json({ items: [] }),
    );
    const api = createSumup({ apiKey: 'k' }, { fetch: m.fetchFn });
    await api.transaktionen(new Date());
    await api.transaktionen(new Date());
    expect(m.urls.filter((u) => u.endsWith('/me'))).toHaveLength(1);
    expect(m.urls[1]).toContain('/merchants/MX/');
  });

  it('reads payouts (array response, ids as numbers)', async () => {
    const m = mock(() =>
      json([
        { id: 7, date: '2026-11-03', type: 'PAYOUT', amount: 97.5, fee: 2.5, status: 'SUCCESSFUL' },
        { id: 8, date: 'x', amount: 1 },
      ]),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const api = createSumup({ apiKey: 'k', merchantCode: 'MC1' }, { fetch: m.fetchFn });
    const r = await api.auszahlungen('2026-11-01', '2026-11-05');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      id: '7',
      datum: '2026-11-03',
      betragCent: 9750,
      gebuehrCent: 250,
    });
    expect(m.urls[0]).toContain('start_date=2026-11-01&end_date=2026-11-05');
    warn.mockRestore();
  });

  it('throws on an HTTP error without leaking the key', async () => {
    const m = mock(() => json({}, 401));
    const api = createSumup({ apiKey: 'geheim', merchantCode: 'MC1' }, { fetch: m.fetchFn });
    await expect(api.transaktionen(new Date())).rejects.toThrow('SumUp answered 401');
  });
});
