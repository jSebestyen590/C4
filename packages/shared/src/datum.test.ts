import { describe, expect, it } from 'vitest';
import { datumAnzeigen } from './datum';

describe('datumAnzeigen', () => {
  it('formats as dd.MM.yyyy with leading zeros', () => {
    expect(datumAnzeigen('2026-02-03')).toBe('03.02.2026');
    expect(datumAnzeigen('2026-12-31')).toBe('31.12.2026');
  });
});
