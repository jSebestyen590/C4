import { describe, expect, it } from 'vitest';
import { createFakeFinanzenStore } from './finanzen.fake';
import { sumupAbrufen } from './finanzenSumupJob';
import { createFakeSumup } from './sumup.fake';
import type { SumupAuszahlungRoh, SumupTransaktionRoh } from './sumup';

const tx = (id: string, zeitpunkt: string): SumupTransaktionRoh => ({
  id,
  transactionCode: `TC${id}`,
  zeitpunkt,
  betragCent: 1000,
  typ: 'PAYMENT',
  status: 'SUCCESSFUL',
  trinkgeldCent: 0,
  sumupBenutzer: null,
  roh: '{}',
});
const az = (id: string, datum: string): SumupAuszahlungRoh => ({
  id,
  datum,
  typ: 'PAYOUT',
  betragCent: 900,
  gebuehrCent: 100,
  transactionCode: null,
  referenz: null,
  status: 'SUCCESSFUL',
  roh: '{}',
});

const JETZT = new Date('2026-11-10T10:00:00Z');

describe('sumupAbrufen', () => {
  it('skips without a secret', async () => {
    const { store } = createFakeFinanzenStore();
    const api = createFakeSumup();
    const r = await sumupAbrufen({ secret: async () => undefined, api: () => api, store })(JETZT);
    expect(r).toMatchObject({ uebersprungen: true, transaktionenNeu: 0 });
    expect(api.state.aufrufe).toHaveLength(0);
  });

  it('stores new rows, starts at abDatum and overlaps afterwards', async () => {
    const { store } = createFakeFinanzenStore();
    const api = createFakeSumup({
      transaktionen: [tx('a', '2026-11-01T20:00:00.000Z'), tx('alt', '2026-10-01T20:00:00.000Z')],
      auszahlungen: [az('p1', '2026-11-03')],
    });
    const job = sumupAbrufen({
      secret: async () => ({ apiKey: 'k', abDatum: '2026-10-15' }),
      api: () => api,
      store,
    });
    const r1 = await job(JETZT);
    expect(r1).toEqual({ transaktionenNeu: 1, auszahlungenNeu: 1, vollstaendig: true });
    expect(api.state.aufrufe[0]!.von).toBe('2026-10-15T00:00:00.000Z');
    expect(api.state.aufrufe[1]).toMatchObject({ von: '2026-10-15', bis: '2026-11-10' });

    api.state.aufrufe.length = 0;
    api.state.transaktionen.push(tx('b', '2026-11-05T20:00:00.000Z'));
    const r2 = await job(JETZT);
    expect(r2).toMatchObject({ transaktionenNeu: 1, auszahlungenNeu: 0 });
    expect(api.state.aufrufe[0]!.von).toBe('2026-10-29T20:00:00.000Z');
    expect(api.state.aufrufe[1]).toMatchObject({ von: '2026-10-27' });
    expect((await store.sumupStand()).zeitpunkt).toBe('2026-11-05T20:00:00.000Z');
  });

  it('passes on an incomplete run', async () => {
    const { store } = createFakeFinanzenStore();
    const api = createFakeSumup({ vollstaendig: false });
    const r = await sumupAbrufen({
      secret: async () => ({ apiKey: 'k', abDatum: '2026-10-15' }),
      api: () => api,
      store,
    })(JETZT);
    expect(r.vollstaendig).toBe(false);
  });
});
