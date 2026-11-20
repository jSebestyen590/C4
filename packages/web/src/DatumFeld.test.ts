import { describe, expect, it } from 'vitest';
import { datumParsen } from './DatumFeld';

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
