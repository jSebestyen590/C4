import { describe, expect, it } from 'vitest';
import { darfSehen, type Aufrufer } from './umfrageAnsicht';
import type { UmfrageDaten } from './umfragen';

describe('darfSehen', () => {
  const umfrage = { erstellerSub: 'ersteller', abgaben: [] } as unknown as UmfrageDaten;
  const aufrufer = (extra: Partial<Aufrufer> = {}): Aufrufer => ({
    sub: 'fremd',
    verwaltung: false,
    ...extra,
  });

  it('hides a poll from someone outside the circle', () => {
    expect(darfSehen(umfrage, new Map(), aufrufer())).toBe(false);
  });

  it('shows the poll of a Privatparty to holders of privatpartys:verwalten outside the circle', () => {
    expect(darfSehen(umfrage, new Map(), aufrufer({ privatpartys: true }))).toBe(true);
  });
});
