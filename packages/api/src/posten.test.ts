import { describe, expect, it } from 'vitest';
import { istAktuell, rechteAktiv, ueberschneiden } from './posten';

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

describe('ueberschneiden', () => {
  const z = (startDatum: string, endDatum: string | null) => ({ startDatum, endDatum });
  it('allows disjoint periods, even when adjacent', () => {
    expect(ueberschneiden(z('2020-01-01', '2020-12-31'), z('2024-01-01', '2025-12-31'))).toBe(
      false,
    );
    expect(ueberschneiden(z('2020-01-01', '2020-12-31'), z('2021-01-01', null))).toBe(false);
  });
  it('detects shared days, including open ends and a single shared day', () => {
    expect(ueberschneiden(z('2020-01-01', '2020-12-31'), z('2020-12-31', '2021-06-30'))).toBe(true);
    expect(ueberschneiden(z('2020-01-01', null), z('2030-01-01', '2030-12-31'))).toBe(true);
    expect(ueberschneiden(z('2020-03-01', '2020-04-01'), z('2020-01-01', '2020-12-31'))).toBe(true);
  });
});

describe('rechteAktiv', () => {
  const finanzer = { startDatum: '2026-01-01', endDatum: '2026-12-31' };
  it('applies from one month before the start until one month after the end', () => {
    expect(rechteAktiv(finanzer, '2025-12-01')).toBe(true);
    expect(rechteAktiv(finanzer, '2027-01-31')).toBe(true);
    expect(rechteAktiv(finanzer, '2025-11-30')).toBe(false);
    expect(rechteAktiv(finanzer, '2027-02-01')).toBe(false);
  });
  it('has no upper limit for an open end', () => {
    expect(rechteAktiv({ ...finanzer, endDatum: null }, '2040-01-01')).toBe(true);
  });
});
