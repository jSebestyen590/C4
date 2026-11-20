// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  artikelPatch,
  enterWaehltErsteOption,
  blurWaehltMarkierte,
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
    steuersatzArt: null,
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

const SAETZE = { regel: 1900, ermaessigt: 700 };

describe('Artikel-Steuersatz', () => {
  const v = [
    {
      artikel: 'Deko',
      steuersatzArt: 'ermaessigt' as const,
      kategorien: [{ kategorieId: 'k1', anzahl: 1 }],
    },
    { artikel: 'Ohne', steuersatzArt: null, kategorien: [] },
  ];
  it('finds the rate of a known Artikel, ignoring case and edge spaces', () => {
    expect(artikelSteuersatz(v, ' deko ', SAETZE)).toBe(700);
    expect(artikelSteuersatz(v, ' deko ', { regel: 1600, ermaessigt: 500 })).toBe(500);
    expect(artikelSteuersatz(v, 'Ohne', SAETZE)).toBeNull();
    expect(artikelSteuersatz(v, 'Unbekannt', SAETZE)).toBeNull();
  });
  it('wins over the standard rate of the suggested Kategorie', () => {
    const aufwand = [{ id: 'k1', steuersatzArt: 'regel' }] as unknown as Parameters<
      typeof artikelPatch
    >[1];
    expect(artikelPatch({ kategorieId: null }, aufwand, v, 'Deko', SAETZE)).toEqual({
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
  it('ignores the blur pick after a Ware was picked, but not a new pick with focus', () => {
    expect(wareWahl('w1', false, false, true)).toBe('ignorieren');
    expect(wareWahl('w2', false, true, true)).toBe('waehlen');
    expect(wareWahl('w1', false, false, false)).toBe('waehlen');
  });
});

describe('enterWaehltErsteOption', () => {
  const aufbau = (selected: boolean) => {
    document.body.innerHTML = `<ul id="l"><li data-combobox-option>A</li><li data-combobox-option ${selected ? 'data-combobox-selected' : ''}>B</li></ul>
      <input id="i" aria-controls="l" aria-expanded="true">`;
    const klicks: string[] = [];
    document
      .querySelectorAll('li')
      .forEach((li) => li.addEventListener('click', () => klicks.push(li.textContent!)));
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
  it('picks the highlighted option', () => {
    const t = aufbau(true);
    enterWaehltErsteOption(t.e);
    expect(t.klicks).toEqual(['B']);
    expect(t.verhindert()).toBe(true);
  });
});

describe('Pfeiltasten und Blur', () => {
  const aufbau = (selected: number | null, texte = ['A', 'B', 'C']) => {
    document.body.innerHTML = `<ul id="l">${texte
      .map(
        (x, i) =>
          `<li id="o${i}" data-combobox-option ${i === selected ? 'data-combobox-selected' : ''}>${x}</li>`,
      )
      .join('')}</ul><input id="i" aria-controls="l" aria-expanded="true">`;
    const klicks: string[] = [];
    document
      .querySelectorAll('li')
      .forEach((li) => li.addEventListener('click', () => klicks.push(li.textContent!)));
    const input = document.getElementById('i')!;
    const taste = (key: string) => {
      const r = { verhindert: false, gestoppt: false };
      enterWaehltErsteOption({
        key,
        nativeEvent: { isComposing: false },
        target: input,
        preventDefault: () => (r.verhindert = true),
        stopPropagation: () => (r.gestoppt = true),
      });
      return r;
    };
    const markiert = () =>
      [...document.querySelectorAll('li')].findIndex((li) =>
        li.hasAttribute('data-combobox-selected'),
      );
    return { input, klicks, taste, markiert };
  };
  it('ArrowDown starts at the first option and moves on, wrapping', () => {
    const t = aufbau(null);
    expect(t.taste('ArrowDown').gestoppt).toBe(true);
    expect(t.markiert()).toBe(0);
    t.taste('ArrowDown');
    t.taste('ArrowDown');
    expect(t.markiert()).toBe(2);
    t.taste('ArrowDown');
    expect(t.markiert()).toBe(0);
    expect(t.input.getAttribute('aria-activedescendant')).toBe('o0');
  });
  it('ArrowUp moves up and starts at the last option', () => {
    const t = aufbau(1);
    t.taste('ArrowUp');
    expect(t.markiert()).toBe(0);
    const u = aufbau(null);
    u.taste('ArrowUp');
    expect(u.markiert()).toBe(2);
  });
  it('Enter after ArrowDown picks the moved-to option', () => {
    const t = aufbau(0);
    t.taste('ArrowDown');
    t.taste('Enter');
    expect(t.klicks).toEqual(['B']);
  });
  it('leaves the keys alone when the list is closed', () => {
    const t = aufbau(null);
    document.getElementById('l')!.id = 'x';
    expect(t.taste('ArrowDown').gestoppt).toBe(false);
  });
  it('blur picks the highlighted option, nothing when none or the list is closed', () => {
    const t = aufbau(1);
    blurWaehltMarkierte({ target: t.input });
    expect(t.klicks).toEqual(['B']);
    const n = aufbau(null);
    blurWaehltMarkierte({ target: n.input });
    expect(n.klicks).toEqual([]);
    const z = aufbau(1);
    z.input.setAttribute('aria-expanded', 'false');
    blurWaehltMarkierte({ target: z.input });
    expect(z.klicks).toEqual([]);
  });
  it('blur never picks "Neue Ware anlegen"', () => {
    const t = aufbau(1, ['A', '„Sterni“ als neue Ware anlegen']);
    blurWaehltMarkierte({ target: t.input });
    expect(t.klicks).toEqual([]);
  });
});
