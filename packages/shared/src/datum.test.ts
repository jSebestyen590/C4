import { describe, expect, it } from 'vitest';
import { datumAnzeigen, tagVorher } from './datum';

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
