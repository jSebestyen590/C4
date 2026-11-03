import { describe, expect, it } from 'vitest';
import type { BilderOrdnerDto } from '@c4/shared';
import { bilderDatum, bilderNachJahr } from './bilderAnzeige';

describe('bilderDatum', () => {
  it('formats single days and ranges', () => {
    expect(bilderDatum('2025-06-14', '2025-06-14')).toBe('14.06.2025');
    expect(bilderDatum('2025-06-14', null)).toBe('14.06.2025');
    expect(bilderDatum('2025-07-18', '2025-07-20')).toBe('18.–20.07.2025');
    expect(bilderDatum('2025-07-30', '2025-08-02')).toBe('30.07.–02.08.2025');
    expect(bilderDatum('2025-12-30', '2026-01-02')).toBe('30.12.2025–02.01.2026');
  });
  it('formats year and month precision', () => {
    expect(bilderDatum('2025-01-01', '2025-12-31', 'jahr')).toBe('2025');
    expect(bilderDatum('2025-07-01', '2025-07-31', 'monat')).toBe('Juli 2025');
    expect(bilderDatum('2025-03-01', '2025-03-31', 'monat')).toBe('März 2025');
  });
  it('returns null without a date', () => {
    expect(bilderDatum(null, null)).toBeNull();
  });
});

const ordner = (name: string, von: string | null): BilderOrdnerDto => ({
  id: name,
  name,
  webUrl: 'https://x',
  von,
  bis: von,
  eventName: name,
  genauigkeit: 'tag',
  freigabeUrl: null,
  eventId: null,
});

describe('bilderNachJahr', () => {
  it('groups by year and keeps undated folders last', () => {
    const gruppen = bilderNachJahr([
      ordner('a', '2026-01-01'),
      ordner('b', '2025-05-01'),
      ordner('c', '2025-01-01'),
      ordner('d', null),
    ]);
    expect(gruppen.map((g) => [g.jahr, g.ordner.length])).toEqual([
      ['2026', 1],
      ['2025', 2],
      ['Ohne Datum', 1],
    ]);
  });
});
