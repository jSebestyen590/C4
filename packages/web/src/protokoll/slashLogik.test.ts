import { describe, expect, it } from 'vitest';
import { bausteinLeer } from '@c4/shared';
import {
  anwesenheitPerson,
  auswahlNachAenderung,
  normalisieren,
  slashEintraege,
  slashStufe,
  type SlashDaten,
} from './slashLogik';

const daten: SlashDaten = {
  vorlagen: [
    {
      id: 'a',
      titel: 'Barabend',
      beschreibung: '',
      daten: { ...bausteinLeer('bausteinEvent'), name: 'Barabend', vorlageId: 'a' },
    },
    {
      id: 'b',
      titel: 'Kinoabend',
      beschreibung: '',
      daten: { ...bausteinLeer('bausteinEvent'), name: 'Kinoabend', vorlageId: 'b' },
    },
  ],
  vergangene: [
    {
      id: 'e1',
      titel: 'Sommerfest',
      beschreibung: '01.06.2026',
      daten: { eventId: 'e1', name: 'Sommerfest', datum: '2026-06-01' },
    },
  ],
  personen: [
    { sub: 'a', titel: 'Anna', beschreibung: 'Anna Alt · Mitglied', mitglied: true, da: true },
    { sub: 'j', titel: 'Julia', beschreibung: 'Julia Jung · Mitglied', mitglied: true, da: false },
    { sub: 'e', titel: 'Emil', beschreibung: 'Emil Eck · EM', mitglied: false, da: false },
  ],
  uhrzeit: () => '21:15',
};
const titel = (q: string) => slashEintraege(q, daten).map((e) => e.titel);

describe('normalisieren', () => {
  it('spells out umlauts', () => {
    expect(normalisieren('Anwärter:IN')).toBe('anwaerter:in');
  });
});

describe('slashStufe', () => {
  it('detects the stages', () => {
    expect(slashStufe('')).toEqual({ stufe: 'bausteine', filter: '' });
    expect(slashStufe('ev')).toEqual({ stufe: 'bausteine', filter: 'ev' });
    expect(slashStufe('event ')).toEqual({ stufe: 'vorlagen', filter: '' });
    expect(slashStufe('Event bar')).toEqual({ stufe: 'vorlagen', filter: 'bar' });
    expect(slashStufe('vergangenes event som')).toEqual({ stufe: 'events', filter: 'som' });
    expect(slashStufe('vergangenes ')).toEqual({ stufe: 'events', filter: '' });
  });
});

describe('first stage', () => {
  it('lists everything without a query', () => {
    expect(titel('')).toEqual([
      'Event',
      'Thema',
      'Vergangenes Event',
      'Anwärter:in',
      'Aufnahme',
      'Abstimmung',
      'Meinungsbild',
      'Wahl',
      'Neues EM',
      'Erscheint',
      'Geht',
      'Bild',
      'Zitat',
    ]);
  });
  it('filters by name prefix, word prefix and alias', () => {
    expect(titel('ev')).toEqual(['Event', 'Vergangenes Event']);
    expect(titel('verg')).toEqual(['Vergangenes Event']);
    expect(titel('anwärter')).toEqual(['Anwärter:in']);
    expect(titel('anwaerter')).toEqual(['Anwärter:in']);
    expect(titel('abstimm')).toEqual(['Abstimmung']);
    expect(titel('beschluss')).toEqual(['Abstimmung']);
    expect(titel('mein')).toEqual(['Meinungsbild']);
    expect(titel('stimmungsbild')).toEqual(['Meinungsbild']);
    expect(titel('aufn')).toEqual(['Aufnahme']);
    for (const alias of ['wah', 'waehlen', 'wählen', 'wahlen', 'postenwahl']) {
      expect(titel(alias), alias).toEqual(['Wahl']);
    }
    expect(titel('em')).toEqual(['Neues EM']);
    expect(titel('ehrenmitglied')).toEqual(['Neues EM']);
    expect(titel('neues em')).toEqual(['Neues EM']);
    expect(titel('xyz')).toEqual([]);
  });
  it('finds Zitat by name and alias and applies it at the cursor', () => {
    expect(titel('zit')).toEqual(['Zitat']);
    expect(titel('quote')).toEqual(['Zitat']);
    expect(titel('block')).toEqual(['Zitat']);
    expect(slashEintraege('zit', daten)[0]).toMatchObject({
      symbol: 'zitat',
      aktion: { art: 'zitat' },
    });
  });
  it('switches stage on Enter for Event and Vergangenes Event', () => {
    const [event, vergangen] = slashEintraege('ev', daten);
    expect(event?.aktion).toEqual({ art: 'weiter', text: 'event ' });
    expect(vergangen?.aktion).toEqual({ art: 'weiter', text: 'vergangenes ' });
  });
  it('inserts Abstimmung, Meinungsbild and Aufnahme directly with empty fields', () => {
    expect(slashEintraege('abstimm', daten)[0]?.aktion).toMatchObject({
      art: 'einfuegen',
      wahl: { typ: 'bausteinBeschluss' },
    });
    expect(slashEintraege('mein', daten)[0]?.aktion).toMatchObject({
      art: 'einfuegen',
      wahl: {
        typ: 'bausteinMeinungsbild',
        daten: { frage: '', optionen: [{ text: 'Ja' }, { text: 'Nein' }, { text: 'Enthaltung' }] },
      },
    });
    expect(slashEintraege('wahl', daten)[0]?.aktion).toMatchObject({
      art: 'einfuegen',
      wahl: { typ: 'bausteinWahl', daten: { posten: '', anzahl: 1, kandidaten: [] } },
    });
    expect(slashEintraege('aufn', daten)[0]?.aktion).toMatchObject({
      art: 'einfuegen',
      wahl: { typ: 'bausteinAufnahme', daten: { sub: null, abstimmung: { ja: 0 } } },
    });
  });
  it('leaves out Abstimmung and Meinungsbild inside one of them', () => {
    const innen = slashEintraege('', daten, true).map((e) => e.titel);
    expect(innen).not.toContain('Abstimmung');
    expect(innen).not.toContain('Meinungsbild');
    expect(innen).not.toContain('Wahl');
    expect(innen).toContain('Aufnahme');
    expect(innen).toContain('Zitat');
    expect(slashEintraege('abstimm', daten, true)).toEqual([]);
    expect(slashEintraege('stimmungsbild', daten, true)).toEqual([]);
  });
  it('inserts a Thema directly, found by its aliases, also inside votes', () => {
    for (const q of ['thema', 'punkt', 'top']) {
      const treffer = slashEintraege(q, daten);
      expect(treffer.map((e) => e.titel)).toEqual(['Thema']);
      expect(treffer[0]!.aktion).toEqual({
        art: 'einfuegen',
        wahl: { typ: 'bausteinThema', daten: { titel: '' } },
      });
    }
    // Not one of the nestable Bausteine (that rule is in the editor schema), so the menu keeps it.
    expect(slashEintraege('', daten, true).map((e) => e.titel)).toContain('Thema');
  });
  it('leaves out the quote inside a list item', () => {
    expect(slashEintraege('', daten, false, true).map((e) => e.titel)).not.toContain('Zitat');
    expect(slashEintraege('zit', daten, false, true)).toEqual([]);
    expect(slashEintraege('zit', daten)).toHaveLength(1);
  });
  it('inserts Anwärter and Abstimmung directly', () => {
    const [a] = slashEintraege('anw', daten);
    expect(a?.aktion).toMatchObject({ art: 'einfuegen', wahl: { typ: 'bausteinAnwaerter' } });
    const [em] = slashEintraege('em', daten);
    expect(em?.aktion).toMatchObject({
      art: 'einfuegen',
      wahl: { typ: 'bausteinEm', daten: { sub: null, name: '', abstimmung: null } },
    });
  });
});

describe('second stage', () => {
  it('offers Ohne Vorlage first, then the Vorlagen', () => {
    expect(titel('event ')).toEqual(['Ohne Vorlage', 'Barabend', 'Kinoabend']);
  });
  it('filters Vorlagen by text', () => {
    expect(titel('event bar')).toEqual(['Barabend']);
    expect(titel('event ABEND')).toEqual(['Barabend', 'Kinoabend']);
    expect(titel('event ohne')).toEqual(['Ohne Vorlage']);
  });
  it('carries the Vorlage fields', () => {
    const e = slashEintraege('event kino', daten)[0];
    expect(e?.aktion).toMatchObject({
      art: 'einfuegen',
      wahl: { typ: 'bausteinEvent', daten: { vorlageId: 'b', name: 'Kinoabend' } },
    });
  });
  it('lists past events', () => {
    expect(titel('vergangenes ')).toEqual(['Ohne Kalender-Event', 'Sommerfest']);
    expect(titel('vergangenes event som')).toEqual(['Sommerfest']);
  });
});

describe('Erscheint and Geht', () => {
  it('finds them by name and alias and switches stage', () => {
    expect(titel('erschei')).toEqual(['Erscheint']);
    expect(titel('kommt')).toEqual(['Erscheint']);
    expect(titel('verlässt')).toEqual(['Geht']);
    expect(slashEintraege('geh', daten)[0]?.aktion).toEqual({ art: 'weiter', text: 'geht ' });
    expect(slashStufe('erscheint jul')).toEqual({ stufe: 'erscheint', filter: 'jul' });
    expect(slashStufe('Geht ')).toEqual({ stufe: 'geht', filter: '' });
  });
  it('lists those not yet present first for Erscheint, present ones first for Geht', () => {
    expect(titel('erscheint ')).toEqual(['Julia', 'Emil', 'Anna']);
    expect(titel('geht ')).toEqual(['Anna', 'Julia', 'Emil']);
  });
  it('filters by username and full name', () => {
    expect(titel('erscheint jul')).toEqual(['Julia']);
    expect(titel('geht alt')).toEqual(['Anna']);
  });
  it('creates the Anwesenheit block with person and time', () => {
    expect(slashEintraege('erscheint jul', daten)[0]?.aktion).toEqual({
      art: 'einfuegen',
      wahl: {
        typ: 'bausteinAnwesenheit',
        daten: { art: 'erscheint', sub: 'j', uhrzeit: '21:15' },
      },
    });
  });
  it('names the person of an Erscheint block only', () => {
    const wahl = (art: 'erscheint' | 'geht', sub: string | null) =>
      ({ typ: 'bausteinAnwesenheit', daten: { art, sub, uhrzeit: '' } }) as const;
    expect(anwesenheitPerson(wahl('erscheint', 'j'))).toBe('j');
    expect(anwesenheitPerson(wahl('erscheint', null))).toBeNull();
    expect(anwesenheitPerson(wahl('geht', 'j'))).toBe('j');
  });
});

describe('auswahlNachAenderung', () => {
  const liste = (query: string, ...schluessel: string[]) => ({ query, schluessel });

  it('resets to the first match when the query changes', () => {
    expect(auswahlNachAenderung(liste('', 'alle', 'a', 'b'), liste('Mitgl', 'm1', 'm2'), 2)).toBe(0);
  });

  it('resets when the entries change although the query does not', () => {
    expect(auswahlNachAenderung(liste('x', 'a', 'b'), liste('x', 'a', 'b', 'c'), 1)).toBe(0);
  });

  it('keeps the selection when nothing changed and clamps it', () => {
    expect(auswahlNachAenderung(liste('x', 'a', 'b'), liste('x', 'a', 'b'), 1)).toBe(1);
    expect(auswahlNachAenderung(liste('x', 'a', 'b'), liste('x', 'a', 'b'), 5)).toBe(1);
  });

  it('starts at 0 for a new or empty list', () => {
    expect(auswahlNachAenderung(null, liste('', 'a'), 3)).toBe(0);
    expect(auswahlNachAenderung(liste('', 'a'), null, 3)).toBe(0);
  });
});
