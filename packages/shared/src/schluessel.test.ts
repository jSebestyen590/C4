import { describe, expect, it } from 'vitest';
import { halterGleich, schluesselAnlegenSchema, uebergabeSchema } from './schluessel';

describe('halterGleich', () => {
  it('compares members by sub and persons by trimmed, case-insensitive name', () => {
    expect(halterGleich({ art: 'mitglied', sub: 'a' }, { art: 'mitglied', sub: 'a' })).toBe(true);
    expect(halterGleich({ art: 'mitglied', sub: 'a' }, { art: 'mitglied', sub: 'b' })).toBe(false);
    expect(halterGleich({ art: 'person', name: 'Ute ' }, { art: 'person', name: 'ute' })).toBe(
      true,
    );
    expect(halterGleich({ art: 'person', name: 'a' }, { art: 'mitglied', sub: 'a' })).toBe(false);
    expect(halterGleich(null, null)).toBe(true);
    expect(halterGleich(null, { art: 'mitglied', sub: 'a' })).toBe(false);
  });
});

describe('schemas', () => {
  it('rejects an Übergabe to the current holder', () => {
    const a = { art: 'mitglied', sub: 'a' } as const;
    expect(uebergabeSchema.safeParse({ von: a, an: a }).success).toBe(false);
    expect(uebergabeSchema.safeParse({ von: a, an: { art: 'person', name: 'Ute' } }).success).toBe(
      true,
    );
    expect(uebergabeSchema.safeParse({ von: null, an: { art: 'person', name: ' ' } }).success).toBe(
      false,
    );
  });

  it('creates keys without holder by default', () => {
    expect(schluesselAnlegenSchema.parse({ name: 'Haupttür 1' })).toEqual({
      name: 'Haupttür 1',
      beschreibung: null,
      halter: null,
    });
  });
});
