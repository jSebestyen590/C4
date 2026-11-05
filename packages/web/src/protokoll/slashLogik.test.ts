import { describe, expect, it } from 'vitest';
import { bausteinLeer } from '@c4/shared';
import { normalisieren, slashEintraege, slashStufe, type SlashDaten } from './slashLogik';

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
      'Vergangenes Event',
      'Anwärter:in',
      'Beschluss',
      'Neues EM',
      'Erscheint',
      'Geht',
      'Zitat',
    ]);
  });
  it('filters by name prefix, word prefix and alias', () => {
    expect(titel('ev')).toEqual(['Event', 'Vergangenes Event']);
    expect(titel('verg')).toEqual(['Vergangenes Event']);
    expect(titel('anwärter')).toEqual(['Anwärter:in']);
    expect(titel('anwaerter')).toEqual(['Anwärter:in']);
    expect(titel('abstimm')).toEqual(['Beschluss']);
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
  it('inserts Anwärter and Beschluss directly', () => {
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
});
