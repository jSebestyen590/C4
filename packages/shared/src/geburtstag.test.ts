import { describe, expect, it } from 'vitest';
import {
  alterAm,
  geburtstagIn,
  geburtstageZeitraumSchema,
  geburtstageZwischen,
} from './geburtstag';
import { mitgliedAktualisierenSchema } from './schemas';

describe('geburtstagIn', () => {
  it('keeps month and day', () => {
    expect(geburtstagIn('1990-05-17', 2026)).toBe('2026-05-17');
  });
  it('moves Feb 29 to Feb 28 in non-leap years', () => {
    expect(geburtstagIn('1992-02-29', 2026)).toBe('2026-02-28');
    expect(geburtstagIn('1992-02-29', 2100)).toBe('2100-02-28');
    expect(geburtstagIn('1992-02-29', 2028)).toBe('2028-02-29');
    expect(geburtstagIn('1992-02-29', 2000)).toBe('2000-02-29');
  });
});

describe('alterAm', () => {
  it('counts full years', () => {
    expect(alterAm('1990-05-17', '2026-05-16')).toBe(35);
    expect(alterAm('1990-05-17', '2026-05-17')).toBe(36);
    expect(alterAm('1990-05-17', '2026-12-31')).toBe(36);
  });
  it('turns a Feb 29 birthday on Feb 28 in non-leap years', () => {
    expect(alterAm('1992-02-29', '2026-02-27')).toBe(33);
    expect(alterAm('1992-02-29', '2026-02-28')).toBe(34);
    expect(alterAm('1992-02-29', '2028-02-28')).toBe(35);
    expect(alterAm('1992-02-29', '2028-02-29')).toBe(36);
  });
});

describe('geburtstageZwischen', () => {
  const personen = [
    { id: 'a', geburtsdatum: '1990-01-02' },
    { id: 'b', geburtsdatum: '1985-12-30' },
    { id: 'c', geburtsdatum: '1992-02-29' },
  ];
  const kurz = (von: string, bis: string) =>
    geburtstageZwischen(personen, von, bis).map((g) => [g.datum, g.alter, g.person.id]);

  it('includes both ends of the range', () => {
    expect(kurz('2026-12-30', '2027-01-02')).toEqual([
      ['2026-12-30', 41, 'b'],
      ['2027-01-02', 37, 'a'],
    ]);
    expect(kurz('2026-12-31', '2027-01-01')).toEqual([]);
  });
  it('handles year boundaries and sorts by date', () => {
    expect(kurz('2026-12-01', '2028-01-31').map((g) => g[0])).toEqual([
      '2026-12-30',
      '2027-01-02',
      '2027-02-28',
      '2027-12-30',
      '2028-01-02',
    ]);
  });
  it('uses Feb 28 for Feb 29 birthdays in non-leap years', () => {
    expect(kurz('2026-02-01', '2026-03-01')).toEqual([['2026-02-28', 34, 'c']]);
    expect(kurz('2028-02-01', '2028-03-01')).toEqual([['2028-02-29', 36, 'c']]);
  });
  it('returns nothing for an empty range', () => {
    expect(kurz('2026-03-02', '2026-03-01')).toEqual([]);
  });
});

describe('geburtstageZeitraumSchema', () => {
  const ok = (von: string, bis: string) =>
    geburtstageZeitraumSchema.safeParse({ von, bis }).success;
  it('needs valid dates, bis >= von and at most 400 days', () => {
    expect(ok('2026-01-01', '2026-01-01')).toBe(true);
    expect(ok('2026-01-01', '2027-02-05')).toBe(true); // 400 days
    expect(ok('2026-01-01', '2027-02-06')).toBe(false); // 401 days
    expect(ok('2026-02-01', '2026-01-01')).toBe(false);
    expect(ok('2026-02-30', '2026-03-01')).toBe(false);
    expect(ok('x', '2026-03-01')).toBe(false);
  });
});

describe('geburtsdatum in the profile schema', () => {
  const basis = { vorname: 'A', nachname: 'B' };
  const parse = (extra: object) => mitgliedAktualisierenSchema.safeParse({ ...basis, ...extra });
  it('defaults to no date and a visible birthday', () => {
    const r = parse({});
    expect(r.success && r.data.geburtsdatum).toBeNull();
    expect(r.success && r.data.geburtstagImKalender).toBe(true);
  });
  it('accepts valid past dates and rejects invalid, future and pre-1900 ones', () => {
    expect(parse({ geburtsdatum: '1990-05-17' }).success).toBe(true);
    expect(parse({ geburtsdatum: '1900-01-01' }).success).toBe(true);
    expect(parse({ geburtsdatum: '1899-12-31' }).success).toBe(false);
    expect(parse({ geburtsdatum: '2999-01-01' }).success).toBe(false);
    expect(parse({ geburtsdatum: '1990-02-30' }).success).toBe(false);
    expect(parse({ geburtsdatum: '17.05.1990' }).success).toBe(false);
    expect(parse({ geburtsdatum: null }).success).toBe(true);
  });
});
