import { describe, expect, it } from 'vitest';
import { heuteBerlin, istAktuell } from './posten';

describe('istAktuell', () => {
  const heute = '2026-06-15';
  it('includes both ends and treats a missing end as open', () => {
    expect(istAktuell({ startDatum: '2026-06-15', endDatum: null }, heute)).toBe(true);
    expect(istAktuell({ startDatum: '2026-01-01', endDatum: '2026-06-15' }, heute)).toBe(true);
  });
  it('excludes future and past Besetzungen', () => {
    expect(istAktuell({ startDatum: '2026-06-16', endDatum: null }, heute)).toBe(false);
    expect(istAktuell({ startDatum: '2026-01-01', endDatum: '2026-06-14' }, heute)).toBe(false);
  });
});

describe('heuteBerlin', () => {
  it('uses the Berlin calendar day', () => {
    expect(heuteBerlin(new Date('2026-06-15T22:30:00Z'))).toBe('2026-06-16');
    expect(heuteBerlin(new Date('2026-06-15T21:30:00Z'))).toBe('2026-06-15');
  });
});
