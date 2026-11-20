import { describe, expect, it } from 'vitest';
import {
  kategorieOptionenMitVorschlaegen,
  standardGebindeWaehlen,
  vorgeschlageneKategorie,
  wareFilter,
} from './belegAuswahl';

const konten = [
  { id: 'k1', name: 'Deko' },
  { id: 'k2', name: 'Material' },
  { id: 'k3', name: 'Getränke' },
];
const vorschlaege = [
  {
    steuersatz: null,
    artikel: 'Luftballons',
    kategorien: [
      { kategorieId: 'k2', anzahl: 5 },
      { kategorieId: 'k1', anzahl: 2 },
      { kategorieId: 'kX', anzahl: 1 },
    ],
  },
];

describe('kategorieOptionenMitVorschlaegen', () => {
  it('groups suggestions above the rest, ignoring case and edge spaces', () => {
    const r = kategorieOptionenMitVorschlaegen(konten, vorschlaege, '  luftBALLONS ');
    expect(r).toEqual([
      {
        group: 'Vorschläge',
        items: [
          { value: 'k2', label: 'Material' },
          { value: 'k1', label: 'Deko' },
        ],
      },
      { group: 'Alle Kategorien', items: [{ value: 'k3', label: 'Getränke' }] },
    ]);
  });
  it('is flat without suggestions', () => {
    expect(kategorieOptionenMitVorschlaegen(konten, vorschlaege, 'Unbekannt')).toHaveLength(3);
  });
});

describe('vorgeschlageneKategorie', () => {
  it('returns the most frequent known Kategorie', () => {
    expect(vorgeschlageneKategorie(konten, vorschlaege, 'luftballons')).toBe('k2');
    expect(vorgeschlageneKategorie(konten, vorschlaege, '')).toBeNull();
  });
});

describe('standardGebindeWaehlen', () => {
  const g = (id: string, pfand: number | null) => ({ id, pfandGesamtCent: pfand });
  it('prefers the standard, then the only Gebinde', () => {
    expect(
      standardGebindeWaehlen({ gebinde: [g('a', 8), g('b', 150)], standardGebindeId: 'b' }),
    ).toEqual({
      gebindeId: 'b',
      pfandCent: 150,
    });
    expect(standardGebindeWaehlen({ gebinde: [g('a', null)], standardGebindeId: null })).toEqual({
      gebindeId: 'a',
      pfandCent: null,
    });
    expect(
      standardGebindeWaehlen({ gebinde: [g('a', 8), g('b', 9)], standardGebindeId: null }),
    ).toEqual({
      gebindeId: null,
      pfandCent: null,
    });
    expect(standardGebindeWaehlen(undefined).gebindeId).toBeNull();
  });
});

describe('wareFilter', () => {
  it('finds by alias and shows it', () => {
    const waren = [
      { id: 'w1', name: 'Sternburg Export', aliase: ['Sterni'] },
      { id: 'w2', name: 'Cola' },
    ];
    const options = waren.map((w) => ({ value: w.id, label: w.name }));
    const r = wareFilter(waren)({ options, search: 'sterni', limit: 50 });
    expect(r).toEqual([{ value: 'w1', label: 'Sternburg Export (Sterni)' }]);
  });
});
