import { describe, expect, it } from 'vitest';
import {
  durchgangEingabeSchema,
  jahreMitEintraegen,
  koenige,
  literZuMl,
  mlZuLiter,
  rangliste,
  sortiereRangliste,
  trichterAendernSchema,
  trichterEingabeSchema,
} from './trichter';

describe('Umrechnung', () => {
  it('rechnet Liter und Milliliter ineinander um', () => {
    expect(literZuMl(2.5)).toBe(2500);
    expect(literZuMl(0.07)).toBe(70);
    expect(literZuMl(1.15)).toBe(1150);
    expect(mlZuLiter(2500)).toBe(2.5);
  });
});

describe('schemas', () => {
  it('prüft Trichter', () => {
    expect(
      trichterEingabeSchema.safeParse({ name: 'Dicker', volumenL: 2.25, auslaesse: 3 }).success,
    ).toBe(true);
    expect(trichterEingabeSchema.safeParse({ name: 'X', volumenL: 0, auslaesse: 3 }).success).toBe(
      false,
    );
    expect(
      trichterEingabeSchema.safeParse({ name: 'X', volumenL: 1.005, auslaesse: 3 }).success,
    ).toBe(false);
    expect(trichterEingabeSchema.safeParse({ name: 'X', volumenL: 1, auslaesse: 0 }).success).toBe(
      false,
    );
    expect(trichterEingabeSchema.safeParse({ name: 'X', volumenL: 1, auslaesse: 21 }).success).toBe(
      false,
    );
    expect(trichterAendernSchema.safeParse({ archiviert: true }).success).toBe(true);
  });

  it('prüft Durchgänge', () => {
    const ok = { trichterId: 't', volumenL: 1.5, teilnehmende: ['a', 'b'] };
    expect(durchgangEingabeSchema.safeParse(ok).success).toBe(true);
    expect(durchgangEingabeSchema.safeParse({ ...ok, teilnehmende: [] }).success).toBe(false);
    expect(durchgangEingabeSchema.safeParse({ ...ok, teilnehmende: ['a', 'a'] }).success).toBe(
      false,
    );
    expect(durchgangEingabeSchema.safeParse({ ...ok, volumenL: -1 }).success).toBe(false);
    const frueh = new Date(Date.now() - 3_600_000).toISOString();
    const spaet = new Date(Date.now() + 3_600_000).toISOString();
    expect(durchgangEingabeSchema.safeParse({ ...ok, zeitpunkt: frueh }).success).toBe(true);
    expect(durchgangEingabeSchema.safeParse({ ...ok, zeitpunkt: spaet }).success).toBe(false);
  });
});

describe('rangliste', () => {
  const durchgaenge = [
    { zeitpunkt: '2025-12-31T23:30:00Z', volumenMl: 2000, teilnehmende: ['a', 'b'] },
    { zeitpunkt: '2026-03-01T12:00:00Z', volumenMl: 3000, teilnehmende: ['a'] },
    { zeitpunkt: new Date('2026-05-01T12:00:00Z'), volumenMl: 3000, teilnehmende: ['b', 'c', 'd'] },
  ];

  it('teilt das Volumen durch die Teilnehmenden', () => {
    expect(rangliste(durchgaenge, null)).toEqual([
      { sub: 'a', anzahl: 2, ml: 4000 },
      { sub: 'b', anzahl: 2, ml: 2000 },
      { sub: 'c', anzahl: 1, ml: 1000 },
      { sub: 'd', anzahl: 1, ml: 1000 },
    ]);
  });

  it('filtert nach Kalenderjahr in Berlin', () => {
    // 23:30 UTC on 31.12. is already 2026 in Berlin.
    expect(rangliste(durchgaenge, 2026).find((z) => z.sub === 'a')).toEqual({
      sub: 'a',
      anzahl: 2,
      ml: 4000,
    });
    expect(rangliste(durchgaenge, 2025)).toEqual([]);
    expect(jahreMitEintraegen(durchgaenge)).toEqual([2026]);
    expect(
      jahreMitEintraegen([
        ...durchgaenge,
        { zeitpunkt: '2024-06-01T10:00:00Z', volumenMl: 1, teilnehmende: ['a'] },
      ]),
    ).toEqual([2026, 2024]);
  });
});

describe('koenige', () => {
  it('nimmt zuerst die Anzahl, dann die Menge', () => {
    expect(
      koenige([
        { sub: 'a', anzahl: 3, ml: 100 },
        { sub: 'b', anzahl: 2, ml: 900 },
      ]),
    ).toEqual(['a']);
    expect(
      koenige([
        { sub: 'a', anzahl: 3, ml: 100 },
        { sub: 'b', anzahl: 3, ml: 900 },
      ]),
    ).toEqual(['b']);
  });
  it('nennt bei vollem Gleichstand alle', () => {
    expect(
      koenige([
        { sub: 'a', anzahl: 3, ml: 100 },
        { sub: 'b', anzahl: 3, ml: 100 },
        { sub: 'c', anzahl: 1, ml: 5 },
      ]),
    ).toEqual(['a', 'b']);
  });
  it('ist leer ohne Einträge', () => {
    expect(koenige([])).toEqual([]);
  });
});

describe('sortiereRangliste', () => {
  const zeilen = [
    { n: 'Zoe', anzahl: 2, ml: 1000 },
    { n: 'Anna', anzahl: 2, ml: 3000 },
    { n: 'Ben', anzahl: 5, ml: 500 },
  ];
  const name = (z: { n: string }) => z.n;
  const namen = (l: { n: string }[]) => l.map((z) => z.n);

  it('sortiert nach Anzahl mit Liter als Tie-Break', () => {
    expect(namen(sortiereRangliste(zeilen, 'anzahl', 'ab', name))).toEqual(['Ben', 'Anna', 'Zoe']);
    expect(namen(sortiereRangliste(zeilen, 'anzahl', 'auf', name))).toEqual(['Zoe', 'Anna', 'Ben']);
  });
  it('sortiert nach Liter', () => {
    expect(namen(sortiereRangliste(zeilen, 'liter', 'ab', name))).toEqual(['Anna', 'Zoe', 'Ben']);
  });
  it('sortiert nach Name und verändert das Original nicht', () => {
    expect(namen(sortiereRangliste(zeilen, 'name', 'auf', name))).toEqual(['Anna', 'Ben', 'Zoe']);
    expect(namen(sortiereRangliste(zeilen, 'name', 'ab', name))).toEqual(['Zoe', 'Ben', 'Anna']);
    expect(namen(zeilen)).toEqual(['Zoe', 'Anna', 'Ben']);
  });
});
