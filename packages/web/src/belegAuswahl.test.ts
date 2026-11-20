// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  artikelPatch,
  enterWaehltErsteOption,
  artikelSteuersatz,
  istNeueWareText,
  NEUE_WARE,
  neueWareLabel,
  wareOptionen,
  wareWahl,
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

describe('Neue Ware anlegen', () => {
  const waren = [
    { id: 'w1', name: 'Köstritzer', aliase: [] },
    { id: 'w2', name: 'Sternburg Export', aliase: ['Sterni'] },
  ];
  const filter = (suche: string, mitNeuer = true) =>
    (
      wareFilter(waren)({ options: wareOptionen(waren, mitNeuer), search: suche, limit: 50 }) as {
        value: string;
        label: string;
      }[]
    ).map((o) => [o.value, o.label]);

  it('is the last option, only when allowed', () => {
    expect(wareOptionen(waren).map((o) => o.value)).toEqual(['w1', 'w2']);
    expect(wareOptionen(waren, true).map((o) => o.value)).toEqual(['w1', 'w2', NEUE_WARE]);
  });
  it('stays last and names the search text whatever is typed', () => {
    expect(filter('')).toEqual([
      ['w1', 'Köstritzer'],
      ['w2', 'Sternburg Export'],
      [NEUE_WARE, 'Neue Ware anlegen'],
    ]);
    expect(filter('  Köstr ')).toEqual([
      ['w1', 'Köstritzer'],
      [NEUE_WARE, '„Köstr“ als neue Ware anlegen'],
    ]);
    expect(filter('xyz')).toEqual([[NEUE_WARE, '„xyz“ als neue Ware anlegen']]);
  });
  it('recognises its own label (Mantine writes it into the search field)', () => {
    expect(istNeueWareText(neueWareLabel(''))).toBe(true);
    expect(istNeueWareText(neueWareLabel('Bier'))).toBe(true);
    expect(istNeueWareText('Köstritzer')).toBe(false);
  });
});

describe('Artikel-Steuersatz', () => {
  const v = [
    { artikel: 'Deko', steuersatz: 700, kategorien: [{ kategorieId: 'k1', anzahl: 1 }] },
    { artikel: 'Seltsam', steuersatz: 1234, kategorien: [] },
    { artikel: 'Ohne', steuersatz: null, kategorien: [] },
  ];
  it('finds the rate of a known Artikel, ignoring case and edge spaces', () => {
    expect(artikelSteuersatz(v, ' deko ')).toBe(700);
    expect(artikelSteuersatz(v, 'Seltsam')).toBeNull();
    expect(artikelSteuersatz(v, 'Ohne')).toBeNull();
    expect(artikelSteuersatz(v, 'Unbekannt')).toBeNull();
  });
  it('wins over the standard rate of the suggested Kategorie', () => {
    const aufwand = [{ id: 'k1', steuersatzStandard: 1900 }] as unknown as Parameters<
      typeof artikelPatch
    >[1];
    expect(artikelPatch({ kategorieId: null }, aufwand, v, 'Deko')).toEqual({
      text: 'Deko',
      kategorieId: 'k1',
      steuersatz: 700,
    });
  });
});

describe('wareWahl', () => {
  it('opens the dialog only for a deliberate pick, never when the field is left', () => {
    expect(wareWahl(NEUE_WARE, false, true)).toBe('neue-oeffnen');
    expect(wareWahl(NEUE_WARE, false, false)).toBe('neue-merken');
  });
  it('ignores the option the blur picks after the dialog took the focus', () => {
    expect(wareWahl('w1', true, false)).toBe('ignorieren');
    expect(wareWahl('w1', false, true)).toBe('waehlen');
    expect(wareWahl(null, false, true)).toBe('waehlen');
  });
});

describe('enterWaehltErsteOption', () => {
  const aufbau = (selected: boolean) => {
    document.body.innerHTML = `<ul id="l"><li data-combobox-option ${selected ? 'data-combobox-selected' : ''}>A</li></ul>
      <input id="i" aria-controls="l" aria-expanded="true">`;
    const klicks: string[] = [];
    document.querySelector('li')!.addEventListener('click', () => klicks.push('A'));
    let verhindert = false;
    const e = {
      key: 'Enter',
      nativeEvent: { isComposing: false },
      target: document.getElementById('i')!,
      preventDefault: () => (verhindert = true),
      stopPropagation: () => {},
    };
    return { e, klicks, verhindert: () => verhindert };
  };
  it('picks the first option when none is highlighted', () => {
    const t = aufbau(false);
    enterWaehltErsteOption(t.e);
    expect(t.klicks).toEqual(['A']);
    expect(t.verhindert()).toBe(true);
  });
  it('leaves a highlighted option to Mantine', () => {
    const t = aufbau(true);
    enterWaehltErsteOption(t.e);
    expect(t.klicks).toEqual([]);
  });
});
