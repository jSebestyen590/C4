import { describe, expect, it } from 'vitest';
import { datumAnzeigen, rechteZeitraum, tagVorher } from './datum';

describe('datumAnzeigen', () => {
  it('formats as dd.MM.yyyy with leading zeros', () => {
    expect(datumAnzeigen('2026-02-03')).toBe('03.02.2026');
    expect(datumAnzeigen('2026-12-31')).toBe('31.12.2026');
  });
});

describe('tagVorher', () => {
  it('handles month and year boundaries', () => {
    expect(tagVorher('2026-03-01')).toBe('2026-02-28');
    expect(tagVorher('2028-03-01')).toBe('2028-02-29');
    expect(tagVorher('2026-01-01')).toBe('2025-12-31');
  });
});

describe('rechteZeitraum', () => {
  it('starts one month before the Besetzung and ends one month after it', () => {
    expect(rechteZeitraum('2026-01-01', '2026-12-31')).toEqual({
      von: '2025-12-01',
      bis: '2027-01-31',
    });
  });
  it('keeps an open end open', () => {
    expect(rechteZeitraum('2026-03-15', null)).toEqual({ von: '2026-02-15', bis: null });
  });
  it('clamps to the length of the target month', () => {
    expect(rechteZeitraum('2026-03-31', '2026-01-31').von).toBe('2026-02-28');
    expect(rechteZeitraum('2026-03-31', '2026-01-31').bis).toBe('2026-02-28');
    expect(rechteZeitraum('2028-03-31', '2028-01-31').bis).toBe('2028-02-29');
  });
});
