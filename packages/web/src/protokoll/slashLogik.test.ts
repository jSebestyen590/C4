import { describe, expect, it } from 'vitest';
import { bausteinLeer } from '@c4/shared';
import {
  dienstEintraege,
  slashRohFilter,
  anwesenheitPerson,
  auswahlNachAenderung,
  bausteinEintraege,
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
      daten: { eventId: 'e1', name: 'Sommerfest', datum: '2026-06-01', bisDatum: null },
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
      'Austritt',
      'Todo',
      'Erscheint',
      'Geht',
      'Bild',
      'Zitat',
      'Überarbeiten',
      'Ende der Sitzung',
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
    expect(titel('em')).toEqual(['Austritt']);
    expect(titel('ehrenmitglied')).toEqual(['Austritt']);
    expect(titel('neues em')).toEqual(['Austritt']);
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
  it('opens the second stage for Abstimmung with Ja / Nein and Mehrere Möglichkeiten', () => {
    expect(slashEintraege('abstimm', daten)[0]?.aktion).toEqual({
      art: 'weiter',
      text: 'abstimmung ',
    });
    expect(slashEintraege('beschluss', daten)[0]?.aktion).toEqual({
      art: 'weiter',
      text: 'abstimmung ',
    });
    expect(titel('abstimmung ')).toEqual(['Ja / Nein', 'Mehrere Möglichkeiten']);
    expect(titel('beschluss ')).toEqual(['Ja / Nein', 'Mehrere Möglichkeiten']);
    expect(titel('abstimmung meh')).toEqual(['Mehrere Möglichkeiten']);
    expect(titel('abstimmung ja')).toEqual(['Ja / Nein']);
    expect(slashEintraege('abstimmung ', daten)[0]?.aktion).toMatchObject({
      art: 'einfuegen',
      wahl: { typ: 'bausteinBeschluss' },
    });
    expect(slashEintraege('abstimmung meh', daten)[0]?.aktion).toMatchObject({
      art: 'einfuegen',
      wahl: { typ: 'bausteinAuswahl', daten: { frage: '', anzahl: 1, optionen: [] } },
    });
    // Not offered inside a vote.
    expect(slashEintraege('abstimmung ', daten, true)).toEqual([]);
  });
  it('inserts an Auswahl directly by its aliases, but does not list it without a query', () => {
    for (const alias of ['auswahl', 'mehrfach', 'mehrfachauswahl']) {
      expect(slashEintraege(alias, daten)[0]?.aktion, alias).toMatchObject({
        art: 'einfuegen',
        wahl: { typ: 'bausteinAuswahl' },
      });
      expect(slashEintraege(alias, daten, true)).toEqual([]);
    }
    expect(titel('')).not.toContain('Abstimmung (Mehrere Möglichkeiten)');
    expect(titel('abstimm')).toEqual(['Abstimmung']);
  });
  it('inserts Meinungsbild and Aufnahme directly with empty fields', () => {
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
  it('inserts a Todo, found by todo, aufgabe and aufgaben, but not inside a vote or a Todo', () => {
    for (const q of ['todo', 'aufgabe', 'aufgaben']) {
      const treffer = slashEintraege(q, daten);
      expect(treffer.map((e) => e.titel)).toEqual(['Todo']);
      expect(treffer[0]!.symbol).toBe('todo');
      expect(treffer[0]!.aktion).toMatchObject({
        art: 'einfuegen',
        wahl: { typ: 'bausteinTodo', daten: { titel: '', zustaendig: [], faelligAm: null } },
      });
      // `ohneVerschachtelt` also covers the notes of a Todo (it is one of the nestable Bausteine).
      expect(slashEintraege(q, daten, true)).toEqual([]);
    }
    expect(slashEintraege('', daten, true).map((e) => e.titel)).not.toContain('Todo');
  });
  it('leaves out the Todo at the top level of a section, also by its aliases', () => {
    expect(slashEintraege('', daten, false, true).map((e) => e.titel)).not.toContain('Todo');
    expect(bausteinEintraege('', false, true).map((e) => e.titel)).not.toContain('Todo');
    for (const q of ['todo', 'aufgabe', 'aufgaben']) {
      expect(slashEintraege(q, daten, false, true)).toEqual([]);
    }
    // The other Bausteine stay.
    expect(slashEintraege('', daten, false, true).map((e) => e.titel)).toContain('Abstimmung');
  });
  it('offers the quote everywhere', () => {
    expect(slashEintraege('', daten, true, true).map((e) => e.titel)).toContain('Zitat');
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
    // After the matches come the entries that add the typed name as guest / EM.
    expect(titel('erscheint jul').slice(0, 1)).toEqual(['Julia']);
    expect(titel('geht alt').slice(0, 1)).toEqual(['Anna']);
    expect(titel('erscheint julia')).toEqual(['Julia']);
  });
  it('creates the Anwesenheit block with person and time', () => {
    expect(slashEintraege('erscheint jul', daten)[0]?.aktion).toEqual({
      art: 'einfuegen',
      wahl: {
        typ: 'bausteinAnwesenheit',
        daten: { art: 'erscheint', sub: 'j', name: '', uhrzeit: '21:15' },
      },
    });
  });
  it('names the person of an Erscheint block only', () => {
    const wahl = (art: 'erscheint' | 'geht', sub: string | null) =>
      ({ typ: 'bausteinAnwesenheit', daten: { art, sub, name: '', uhrzeit: '' } }) as const;
    expect(anwesenheitPerson(wahl('erscheint', 'j'))).toBe('j');
    expect(anwesenheitPerson(wahl('erscheint', null))).toBeNull();
    expect(anwesenheitPerson(wahl('geht', 'j'))).toBe('j');
  });
});

describe('external people for Erscheint and Geht', () => {
  const extern: SlashDaten = {
    ...daten,
    personen: [
      ...(daten.personen ?? []),
      {
        sub: '',
        extern: 'em',
        name: 'Ralle',
        titel: 'Ralle',
        beschreibung: 'EM (extern)',
        mitglied: false,
        da: true,
      },
      {
        sub: '',
        extern: 'gast',
        name: 'Gerd',
        titel: 'Gerd',
        beschreibung: 'Gast',
        mitglied: false,
        da: true,
      },
    ],
  };
  it('lists chips like persons and creates a block with the name', () => {
    const eintraege = slashEintraege('erscheint ralle', extern);
    expect(eintraege.map((e) => e.titel)).toEqual(['Ralle']);
    expect(eintraege[0]?.beschreibung).toBe('EM (extern)');
    expect(eintraege[0]?.aktion).toEqual({
      art: 'einfuegen',
      wahl: {
        typ: 'bausteinAnwesenheit',
        daten: { art: 'erscheint', sub: null, name: 'Ralle', uhrzeit: '21:15' },
      },
    });
  });
  it('offers to add an unknown name as guest or EM, with the typed spelling', () => {
    const eintraege = slashEintraege('erscheint Jürgen', extern);
    expect(eintraege.map((e) => e.titel)).toEqual([
      '„Jürgen“ als Gast hinzufügen',
      '„Jürgen“ als EM hinzufügen',
    ]);
    expect(eintraege[0]?.aktion).toEqual({
      art: 'einfuegen',
      wahl: {
        typ: 'bausteinAnwesenheit',
        daten: { art: 'erscheint', sub: null, name: 'Jürgen', uhrzeit: '21:15' },
      },
      neuerExterner: { art: 'gast', name: 'Jürgen' },
    });
    expect(eintraege[1]?.aktion).toMatchObject({ neuerExterner: { art: 'em', name: 'Jürgen' } });
  });
  it('adds nothing for an exact match or without a name', () => {
    expect(titel('geht ')).not.toContain('„“ als Gast hinzufügen');
    expect(slashEintraege('geht Gerd', extern).map((e) => e.titel)).toEqual(['Gerd']);
    expect(slashRohFilter('geht  Ralf Müller ')).toBe('Ralf Müller');
  });
});

describe('Ende', () => {
  it('is found by name and alias and has its own action', () => {
    for (const q of ['ende', 'schluss', 'beend']) {
      expect(slashEintraege(q, daten)[0]?.aktion).toEqual({ art: 'ende' });
    }
  });
  it('is not part of the toolbar menu', () => {
    expect(bausteinEintraege('').some((e) => e.aktion.art === 'ende')).toBe(false);
  });
});

describe('Zitat second stage', () => {
  it('offers "Als Absatz" first and "Im Text"', () => {
    expect(slashStufe('zitat ')).toEqual({ stufe: 'zitat', filter: '' });
    const eintraege = slashEintraege('zitat ', daten);
    expect(eintraege.map((e) => e.titel)).toEqual(['Als Absatz', 'Im Text']);
    expect(eintraege[0]?.aktion).toEqual({ art: 'zitat' });
    expect(eintraege[1]?.aktion).toEqual({ art: 'zitat', imText: true });
    expect(slashEintraege('zitat im', daten).map((e) => e.titel)).toEqual(['Im Text']);
  });
});

describe('Merker', () => {
  it('is found by its aliases in the Baustein group', () => {
    for (const q of ['ueberarbeiten', 'überarbeiten', 'merker', 'markieren', 'nacharbeiten']) {
      expect(slashEintraege(q, daten)[0]).toMatchObject({
        titel: 'Überarbeiten',
        symbol: 'merker',
        aktion: { art: 'einfuegen', wahl: { typ: 'bausteinMerker' } },
      });
    }
    expect(bausteinEintraege('').some((e) => e.symbol === 'merker')).toBe(true);
  });
});

describe('Dienst', () => {
  const event = {
    ...bausteinLeer('bausteinEvent'),
    beginnZeit: '20:00',
    endeZeit: '04:00',
  };
  const mitEvent: SlashDaten = {
    ...daten,
    dienstformen: [
      { id: 'bar', name: 'Bar' },
      { id: 'kasse', name: 'Kasse' },
    ],
  };
  const eintraege = (q: string) => slashEintraege(q, mitEvent, false, false, { event });

  it('is only offered next to an Event block', () => {
    expect(slashEintraege('dienst', mitEvent).map((e) => e.titel)).not.toContain('Dienst');
    expect(slashEintraege('dienst', mitEvent, false, false, { event })[0]).toMatchObject({
      titel: 'Dienst',
      aktion: { art: 'weiter', text: 'dienst ' },
    });
    expect(bausteinEintraege('dienst').length).toBe(0);
    expect(eintraege('dienst ')).not.toEqual([]);
    expect(slashEintraege('dienst ', mitEvent)).toEqual([]);
  });
  it('stage 1: the whole event time or a typed span', () => {
    expect(eintraege('dienst ').map((e) => e.titel)).toEqual(['Gesamt (Eventzeit)']);
    expect(eintraege('dienst ')[0]?.beschreibung).toBe('20:00–04:00');
    expect(eintraege('dienst ')[0]?.aktion).toEqual({ art: 'weiter', text: 'dienst gesamt › ' });
    expect(eintraege('dienst 18-22').map((e) => e.titel)).toEqual(['18:00–22:00']);
    expect(eintraege('dienst 18:00 - 22:30')[0]?.aktion).toEqual({
      art: 'weiter',
      text: 'dienst 18:00-22:30 › ',
    });
    expect(eintraege('dienst 25-26').map((e) => e.titel)).toEqual(['Uhrzeit eingeben']);
  });
  it('stage 2: the Dienstformen, then Aufbau and Putzen', () => {
    expect(eintraege('dienst gesamt › ').map((e) => e.titel)).toEqual([
      'Bar',
      'Kasse',
      'Aufbau',
      'Putzen',
    ]);
    expect(eintraege('dienst gesamt › ka').map((e) => e.titel)).toEqual(['Kasse']);
    expect(eintraege('dienst gesamt › ba')[0]?.aktion).toEqual({
      art: 'weiter',
      text: 'dienst gesamt › bar › ',
    });
    expect(eintraege('dienst 18:00-22:00 › auf')[0]?.aktion).toEqual({
      art: 'weiter',
      text: 'dienst 18:00-22:00 › ~aufbau › ',
    });
  });
  it('stage 3: without a person or a person', () => {
    const e = eintraege('dienst 18:00-22:00 › bar › ');
    expect(e.map((x) => x.titel)).toEqual(['Ohne Personen', 'Anna', 'Julia', 'Emil']);
    expect(e[0]?.aktion).toEqual({
      art: 'dienst',
      eingabe: { zeiten: { beginnZeit: '18:00', endeZeit: '22:00' }, dienst: 'bar', sub: null },
    });
    expect(eintraege('dienst gesamt › bar › jul')[0]?.aktion).toEqual({
      art: 'dienst',
      eingabe: { zeiten: null, dienst: 'bar', sub: 'j' },
      weiter: 'dienst gesamt › bar › ',
    });
    expect(eintraege('dienst gesamt › ~putzen › ')[0]?.aktion).toMatchObject({
      eingabe: { dienst: 'putzen' },
    });
    expect(eintraege('dienst gesamt › unbekannt › ')).toEqual([]);
  });
  it('keeps external people out of the person choice', () => {
    const f = dienstEintraege(
      'gesamt › bar › ',
      event,
      [{ id: 'bar', name: 'Bar' }],
      [
        {
          sub: '',
          extern: 'gast',
          name: 'Gerd',
          titel: 'Gerd',
          beschreibung: 'Gast',
          mitglied: false,
          da: true,
        },
      ],
    );
    expect(f.map((x) => x.titel)).toEqual(['Ohne Personen']);
  });
});

describe('Schicht', () => {
  const event = { ...bausteinLeer('bausteinEvent'), beginnZeit: '20:00', endeZeit: '04:00' };
  const mitEvent: SlashDaten = {
    ...daten,
    dienstformen: [
      { id: 'bar', name: 'Bar' },
      { id: 'kasse', name: 'Kasse' },
    ],
  };
  const eintraege = (q: string) => slashEintraege(q, mitEvent, false, false, { event });

  it('is a separate entry with the same gating as /dienst', () => {
    expect(slashEintraege('schicht', mitEvent).map((e) => e.titel)).not.toContain('Schicht');
    expect(slashEintraege('schicht', mitEvent, false, false, { event })[0]).toMatchObject({
      titel: 'Schicht',
      aktion: { art: 'weiter', text: 'schicht ' },
    });
    expect(
      slashEintraege('schicht', mitEvent, false, false, { event, eventIstTeilnahme: true }),
    ).toEqual([]);
    expect(slashEintraege('schicht ', mitEvent)).toEqual([]);
    // No longer an alias of /dienst.
    expect(
      slashEintraege('dienst', mitEvent, false, false, { event }).map((e) => e.titel),
    ).toEqual(['Dienst']);
  });
  it('stage 1: the whole event time or a typed span', () => {
    expect(eintraege('schicht ')[0]?.aktion).toEqual({ art: 'weiter', text: 'schicht gesamt › ' });
    expect(eintraege('schicht 18-22')[0]?.aktion).toEqual({
      art: 'weiter',
      text: 'schicht 18:00-22:00 › ',
    });
  });
  it('stage 2: the Art enters the Schicht without a person', () => {
    expect(eintraege('schicht gesamt › ').map((e) => e.titel)).toEqual([
      'Bar',
      'Kasse',
      'Aufbau',
      'Putzen',
    ]);
    expect(eintraege('schicht 18:00-22:00 › ba')[0]?.aktion).toEqual({
      art: 'dienst',
      eingabe: { zeiten: { beginnZeit: '18:00', endeZeit: '22:00' }, dienst: 'bar', sub: null },
    });
    expect(eintraege('schicht gesamt › bar 2/3')[0]?.aktion).toEqual({
      art: 'dienst',
      eingabe: { zeiten: null, dienst: 'bar', sub: null, minimum: 2, wunsch: 3 },
    });
    expect(eintraege('schicht gesamt › auf')[0]?.aktion).toMatchObject({
      eingabe: { dienst: 'aufbau', sub: null },
    });
  });
  it('has no person stage', () => {
    expect(eintraege('schicht gesamt › bar › ')).toEqual([]);
  });
});

describe('auswahlNachAenderung', () => {
  const liste = (query: string, ...schluessel: string[]) => ({ query, schluessel });

  it('resets to the first match when the query changes', () => {
    expect(auswahlNachAenderung(liste('', 'alle', 'a', 'b'), liste('Mitgl', 'm1', 'm2'), 2)).toBe(
      0,
    );
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
