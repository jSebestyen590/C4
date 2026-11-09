import { describe, expect, it } from 'vitest';
import { heuteBerlin, tagNachher } from './datum';
import {
  anfrageAnlegenSchema,
  erwarteteHalter,
  halterGleich,
  schluesselAnlegenSchema,
  uebergabeSchema,
  zeitfensterAnzeigen,
  zeitfensterSchema,
} from './schluessel';

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

describe('zeitfensterSchema', () => {
  const heute = heuteBerlin();

  it('accepts a day with optional times and a note', () => {
    const r = zeitfensterSchema.safeParse({
      datum: heute,
      ab: '16:00',
      bis: '18:00',
      notiz: ' Tür ',
    });
    expect(r.success && r.data).toEqual({ datum: heute, ab: '16:00', bis: '18:00', notiz: 'Tür' });
    const leer = zeitfensterSchema.safeParse({ datum: heute });
    expect(leer.success && leer.data).toEqual({ datum: heute, ab: null, bis: null, notiz: null });
  });

  it('rejects bis before ab, bad times and past days', () => {
    expect(zeitfensterSchema.safeParse({ datum: heute, ab: '18:00', bis: '16:00' }).success).toBe(
      false,
    );
    expect(zeitfensterSchema.safeParse({ datum: heute, ab: '25:00' }).success).toBe(false);
    expect(zeitfensterSchema.safeParse({ datum: tagNachher(heute, -1) }).success).toBe(false);
  });

  it('needs a key for an Abgabe but not for a Bedarf', () => {
    expect(anfrageAnlegenSchema.safeParse({ art: 'abgabe', datum: heute }).success).toBe(false);
    expect(
      anfrageAnlegenSchema.safeParse({ art: 'abgabe', datum: heute, schluesselId: 's1' }).success,
    ).toBe(true);
    expect(anfrageAnlegenSchema.safeParse({ art: 'bedarf', datum: heute }).success).toBe(true);
  });
});

describe('zeitfensterAnzeigen', () => {
  const heute = '2026-11-11'; // Wednesday

  it('uses heute / morgen and weekday plus date otherwise', () => {
    expect(zeitfensterAnzeigen({ datum: '2026-11-11', ab: '18:00', bis: null }, heute)).toBe(
      'heute ab 18:00',
    );
    expect(zeitfensterAnzeigen({ datum: '2026-11-12', ab: null, bis: null }, heute)).toBe(
      'morgen im Laufe des Tages',
    );
    expect(zeitfensterAnzeigen({ datum: '2026-11-13', ab: '16:00', bis: '18:00' }, heute)).toBe(
      'Fr, 13.11. 16:00–18:00',
    );
    expect(zeitfensterAnzeigen({ datum: '2026-11-13', ab: null, bis: '12:00' }, heute)).toBe(
      'Fr, 13.11. bis 12:00',
    );
  });
});

describe('erwarteteHalter', () => {
  const key = { halterSub: 'A' };
  const plan = (anSub: string, datum: string, ab: string | null = null) => ({ anSub, datum, ab });
  const kette = [plan('B', '2030-01-02'), plan('C', '2030-01-03')];

  it('follows the chain of planned handovers', () => {
    expect(erwarteteHalter(key, kette, { datum: '2030-01-01', ab: null })).toEqual(['A']);
    expect(erwarteteHalter(key, kette, { datum: '2030-01-02', ab: null })).toEqual(['A', 'B']);
    expect(erwarteteHalter(key, kette, { datum: '2030-01-04', ab: null })).toEqual(['C']);
  });

  it('is not sensitive to the order of the plans', () => {
    expect(erwarteteHalter(key, [...kette].reverse(), { datum: '2030-01-04', ab: null })).toEqual([
      'C',
    ]);
  });

  it('compares times on the same day when both sides have one', () => {
    const p = [plan('B', '2030-01-02', '12:00')];
    expect(erwarteteHalter(key, p, { datum: '2030-01-02', ab: '10:00' })).toEqual(['A']);
    expect(erwarteteHalter(key, p, { datum: '2030-01-02', ab: '12:00' })).toEqual(['B']);
    expect(erwarteteHalter(key, p, { datum: '2030-01-02', ab: '14:00' })).toEqual(['B']);
  });

  it('asks both when the order on the same day is unclear', () => {
    expect(
      erwarteteHalter(key, [plan('B', '2030-01-02', '12:00')], { datum: '2030-01-02', ab: null }),
    ).toEqual(['A', 'B']);
    expect(
      erwarteteHalter(key, [plan('B', '2030-01-02')], { datum: '2030-01-02', ab: '14:00' }),
    ).toEqual(['A', 'B']);
  });

  it('ignores a holder that is not a member', () => {
    expect(erwarteteHalter({ halterSub: null }, kette, { datum: '2030-01-01', ab: null })).toEqual(
      [],
    );
    expect(erwarteteHalter({ halterSub: null }, kette, { datum: '2030-01-02', ab: null })).toEqual([
      'B',
    ]);
  });
});
