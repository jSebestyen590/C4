import { describe, expect, it } from 'vitest';
import { datumParsen, datumTextAlsIso, datumWertAlsIso } from './DatumFeld';

const heute = new Date(2026, 10, 20);
const iso = (d: Date | null) =>
  d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : null;

describe('datumParsen', () => {
  it('reads the German short forms', () => {
    expect(iso(datumParsen('20.11.2026', heute))).toBe('2026-11-20');
    expect(iso(datumParsen('20.11.26', heute))).toBe('2026-11-20');
    expect(iso(datumParsen('2.3.', heute))).toBe('2026-3-2');
    expect(iso(datumParsen('20112026', heute))).toBe('2026-11-20');
    expect(iso(datumParsen(' 5.1.27 ', heute))).toBe('2027-1-5');
  });
  it('rejects things that are no date', () => {
    expect(datumParsen('31.02.2026', heute)).toBeNull();
    expect(datumParsen('abc', heute)).toBeNull();
    expect(datumParsen('', heute)).toBeNull();
  });
});

describe('ISO output', () => {
  it('parses typed text to YYYY-MM-DD only', () => {
    expect(datumTextAlsIso('20.11.26', heute)).toBe('2026-11-20');
    expect(datumTextAlsIso('2.3.', heute)).toBe('2026-03-02');
    expect(datumTextAlsIso('20.11.2', heute)).toBeNull();
  });
  it('normalises whatever the DateInput emits', () => {
    expect(datumWertAlsIso('2026-11-20')).toBe('2026-11-20');
    expect(datumWertAlsIso('2026-11-20 00:00:00')).toBe('2026-11-20');
    expect(datumWertAlsIso(new Date(2026, 10, 20))).toBe('2026-11-20');
    expect(datumWertAlsIso(null)).toBe('');
    expect(datumWertAlsIso('20.11.2026')).toBe('');
  });
});
