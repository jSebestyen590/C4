import { describe, expect, it } from 'vitest';
import {
  ifcoPlatzFehler,
  ifcoPlatzMarkierenFehler,
  ifcoPlatzMasseSchema,
  ifcoPlatzText,
  ifcoTypSchema,
  ifcoTypText,
  ifcosPassen,
  MAX_IFCOS_JE_PLATZ,
  nochPlatzFuer,
  passtIfco,
  type IfcoMass,
} from './ifco';

const gross = (hoeheCm: number): IfcoMass => ({ grundflaeche: 'gross', hoeheCm });
const klein = (hoeheCm: number): IfcoMass => ({ grundflaeche: 'klein', hoeheCm });
const platz = (hoeheCm: number, stellflaechen: number) => ({ hoeheCm, stellflaechen });

describe('ifcosPassen', () => {
  it('fits nothing onto any place', () => {
    expect(ifcosPassen(platz(20, 1), [])).toBe(true);
  });

  it('stacks two large Ifcos of half the height, but not three', () => {
    expect(ifcosPassen(platz(20, 1), [gross(10), gross(10)])).toBe(true);
    expect(ifcosPassen(platz(20, 1), [gross(10), gross(10), gross(10)])).toBe(false);
  });

  it('lets a large and two small Ifcos share one Stellfläche', () => {
    expect(ifcosPassen(platz(20, 1), [gross(10), klein(10), klein(10)])).toBe(true);
  });

  it('rejects when the small Ifcos together exceed one half-column', () => {
    // half-columns [10 + 10, 10 + 12 = 22]
    expect(ifcosPassen(platz(20, 1), [gross(10), klein(10), klein(12)])).toBe(false);
    expect(ifcosPassen(platz(20, 1.5), [gross(10), klein(10), klein(12)])).toBe(true);
  });

  it('rejects an Ifco that is higher than the place', () => {
    expect(ifcosPassen(platz(20, 1), [klein(20.1)])).toBe(false);
    expect(ifcosPassen(platz(20, 1), [klein(20)])).toBe(true);
  });

  it('needs two half-columns for a large Ifco', () => {
    expect(ifcosPassen(platz(20, 0.5), [gross(10)])).toBe(false);
    expect(ifcosPassen(platz(20, 0.5), [klein(10), klein(10)])).toBe(true);
    expect(ifcosPassen(platz(20, 0.5), [klein(10), klein(10), klein(10)])).toBe(false);
    expect(ifcosPassen(platz(20, 1.5), [gross(20), gross(20)])).toBe(false);
    expect(ifcosPassen(platz(20, 2), [gross(20), gross(20)])).toBe(true);
  });

  it('allows any two half-columns for a large Ifco (position is irrelevant)', () => {
    // 3 half-columns of 20: a large 15 takes columns 1+2, a large 5 takes 3 + the rest of 2.
    expect(ifcosPassen(platz(20, 1.5), [gross(15), gross(5), klein(15)])).toBe(true);
    expect(ifcosPassen(platz(20, 1.5), [gross(15), gross(15)])).toBe(false);
    expect(ifcosPassen(platz(20, 1.5), [gross(10), gross(10)])).toBe(true);
    expect(ifcosPassen(platz(20, 1.5), [gross(15), gross(15), klein(10)])).toBe(false);
  });

  it('is independent of the order of the Ifcos', () => {
    const liste = [klein(12), gross(10), klein(10), gross(6), klein(4)];
    const umgekehrt = [...liste].reverse();
    for (const stell of [1, 1.5, 2]) {
      expect(ifcosPassen(platz(20, stell), liste)).toBe(ifcosPassen(platz(20, stell), umgekehrt));
    }
  });

  it('packs tightly when a greedy placement would fail', () => {
    // columns of 10: heights 6,6,4,4 -> {6,4} {6,4}; a greedy first-fit of 6,6,4,4 also works,
    // but 7,3,5,5 needs {7,3} {5,5}.
    expect(ifcosPassen(platz(10, 1), [klein(7), klein(3), klein(5), klein(5)])).toBe(true);
    expect(ifcosPassen(platz(10, 1), [klein(7), klein(5), klein(5), klein(4)])).toBe(false);
  });

  it('handles decimal heights without rounding errors', () => {
    expect(ifcosPassen(platz(20.3, 1), [klein(10.1), klein(10.2)])).toBe(true);
    expect(ifcosPassen(platz(20.3, 0.5), [klein(10.1), klein(10.2)])).toBe(true);
    expect(ifcosPassen(platz(20.2, 0.5), [klein(10.1), klein(10.2)])).toBe(false);
  });

  it('rejects more Ifcos than the cap', () => {
    const viele = Array.from({ length: MAX_IFCOS_JE_PLATZ + 1 }, () => klein(1));
    expect(ifcosPassen(platz(100, 10), viele)).toBe(false);
    expect(ifcosPassen(platz(100, 10), viele.slice(1))).toBe(true);
  });

  it('decides an infeasible full place quickly', () => {
    // 10 half-columns of 30 cm hold at most one 16 cm Ifco each: 11 never fit (pigeonhole).
    const t0 = Date.now();
    const zuViele = [...Array.from({ length: 11 }, () => klein(16)), gross(5), gross(5)];
    expect(ifcosPassen(platz(30, 5), zuViele)).toBe(false);
    const passend = [...Array.from({ length: 8 }, () => klein(16)), gross(5), gross(5)];
    expect(ifcosPassen(platz(30, 5), passend)).toBe(true);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

describe('nochPlatzFuer', () => {
  const typen = [
    { id: 'a', name: '6410', grundflaeche: 'gross' as const, hoeheCm: 10 },
    { id: 'b', name: '4310', grundflaeche: 'klein' as const, hoeheCm: 10 },
    { id: 'c', name: '6416', grundflaeche: 'gross' as const, hoeheCm: 16 },
    { id: 'x', name: 'alt', grundflaeche: 'klein' as const, hoeheCm: 5, archiviert: true },
  ];

  it('counts the further Ifcos per non-archived type', () => {
    expect(nochPlatzFuer(platz(20, 1), [], typen)).toEqual([
      { typId: 'a', anzahl: 2 },
      { typId: 'b', anzahl: 4 },
      { typId: 'c', anzahl: 1 },
    ]);
  });

  it('takes the standing Ifcos into account', () => {
    expect(nochPlatzFuer(platz(20, 1), [gross(10)], typen)).toEqual([
      { typId: 'a', anzahl: 1 },
      { typId: 'b', anzahl: 2 },
      { typId: 'c', anzahl: 0 },
    ]);
  });

  it('returns 0 everywhere on a full place', () => {
    const voll = nochPlatzFuer(platz(20, 1), [gross(10), gross(10)], typen);
    expect(voll.every((v) => v.anzahl === 0)).toBe(true);
  });
});

describe('passtIfco', () => {
  it('is false without a type', () => {
    expect(passtIfco(platz(20, 1), [], null)).toBe(false);
    expect(passtIfco(platz(20, 1), [gross(10)], gross(10))).toBe(true);
    expect(passtIfco(platz(20, 1), [gross(10), gross(10)], klein(10))).toBe(false);
  });
});

describe('ifcoPlatzFehler', () => {
  const typ = (name: string, g: 'gross' | 'klein', h: number) => ({
    name,
    grundflaeche: g,
    hoeheCm: h,
  });

  it('is null when everything fits', () => {
    expect(
      ifcoPlatzFehler(
        'HR11',
        platz(20, 1),
        [{ name: 'Kiste', typ: typ('6410', 'gross', 10) }],
        [{ name: 'Neu', typ: typ('6410', 'gross', 10) }],
      ),
    ).toBeNull();
  });

  it('names the place, what stands there and what does not fit', () => {
    const fehler = ifcoPlatzFehler(
      'HR11',
      platz(20, 1),
      [
        { name: 'Spanngurtkiste', typ: typ('6410', 'gross', 10) },
        { name: 'Werkzeugkiste', typ: typ('6410', 'gross', 10) },
      ],
      [{ name: 'Strom-Ifco', typ: typ('6416', 'gross', 16) }],
    );
    expect(fehler).toBe(
      'Passt nicht auf „HR11“ (20 cm hoch, 1 Stellfläche): dort stehen Spanngurtkiste (6410, 10 cm), Werkzeugkiste (6410, 10 cm); „Strom-Ifco“ (6416, 16 cm) hat keinen Platz mehr.',
    );
  });

  it('handles an empty place and plural Stellflächen', () => {
    expect(
      ifcoPlatzFehler('B1', platz(10, 1.5), [], [{ name: 'Hoch', typ: typ('6422', 'gross', 22) }]),
    ).toBe(
      'Passt nicht auf „B1“ (10 cm hoch, 1,5 Stellflächen): „Hoch“ (6422, 22 cm) hat keinen Platz.',
    );
  });

  it('demands a type', () => {
    expect(ifcoPlatzFehler('B1', platz(10, 1), [], [{ name: 'Ohne', typ: null }])).toContain(
      '„Ohne“ hat keinen Typ.',
    );
  });
});

describe('texts and schemas', () => {
  it('formats place and type', () => {
    expect(ifcoPlatzText(platz(20, 1))).toBe('20 cm hoch · 1 Stellfläche');
    expect(ifcoPlatzText(platz(13.5, 2.5))).toBe('13,5 cm hoch · 2,5 Stellflächen');
    expect(ifcoTypText({ name: '6410', grundflaeche: 'gross', hoeheCm: 10 })).toBe(
      '6410 · 60×40 · 10 cm',
    );
  });

  it('validates the Ifco type', () => {
    expect(
      ifcoTypSchema.safeParse({ name: ' 6410 ', grundflaeche: 'gross', hoeheCm: 10.5 }).data,
    ).toEqual({
      name: '6410',
      grundflaeche: 'gross',
      hoeheCm: 10.5,
    });
    for (const hoeheCm of [0, -1, 10.55, 500]) {
      expect(ifcoTypSchema.safeParse({ name: 'x', grundflaeche: 'gross', hoeheCm }).success).toBe(
        false,
      );
    }
    expect(
      ifcoTypSchema.safeParse({ name: 'x', grundflaeche: 'mittel', hoeheCm: 10 }).success,
    ).toBe(false);
    expect(ifcoTypSchema.safeParse({ name: ' ', grundflaeche: 'klein', hoeheCm: 10 }).success).toBe(
      false,
    );
  });

  it('validates the place dimensions in steps of 0.5', () => {
    expect(ifcoPlatzMasseSchema.safeParse({ hoeheCm: 20, stellflaechen: 1.5 }).success).toBe(true);
    expect(ifcoPlatzMasseSchema.safeParse({ hoeheCm: 20, stellflaechen: 0.5 }).success).toBe(true);
    for (const stellflaechen of [0, 0.25, 1.2, 11]) {
      expect(ifcoPlatzMasseSchema.safeParse({ hoeheCm: 20, stellflaechen }).success).toBe(false);
    }
    expect(ifcoPlatzMasseSchema.safeParse({ hoeheCm: 0, stellflaechen: 1 }).success).toBe(false);
  });

  it('allows marking only places without children that are not a Regal', () => {
    expect(ifcoPlatzMarkierenFehler(null, 0)).toBeNull();
    expect(ifcoPlatzMarkierenFehler('regalboden', 0)).toBeNull();
    expect(ifcoPlatzMarkierenFehler(null, 2)).toContain('Unterebenen');
    expect(ifcoPlatzMarkierenFehler('regal', 0)).toContain('Regal');
  });
});
