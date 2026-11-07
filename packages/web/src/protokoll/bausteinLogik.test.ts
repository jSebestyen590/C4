import { describe, expect, it } from 'vitest';
import {
  bausteinLeer,
  eventDatenAusKalender,
  vorlageSchichtSchema,
  type VorlageSchicht,
} from '@c4/shared';
import {
  anzahlSetzen,
  bedarfSetzen,
  dokumentNormalisieren,
  ersterLeererFeld,
  todoNurEinePerson,
  todoZustaendigAusWert,
  todoZustaendigSetzen,
  todoZustaendigWert,
  eventBisSetzen,
  eventDatenAusVorlage,
  eventDatumSetzen,
  kalenderEventFuerBaustein,
  kommendeEvents,
  optionEntfernen,
  optionHinzufuegen,
  optionSetzen,
  personenAnwesendText,
  schichtKurz,
  schichtZeitSetzen,
  stimmeSetzen,
  annahmeSetzen,
  nichtAngetretenSetzen,
  kandidatEntfernen,
  kandidatHinzufuegen,
  kandidatSetzen,
  stichwahlEntfernen,
  stichwahlHinzufuegen,
  stichwahlSetzen,
  annahmeSchalterIds,
  auswahlOptionEntfernen,
  auswahlOptionHinzufuegen,
  auswahlOptionSetzen,
  ueberzaehligeStichwahlenEntfernen,
  wahlAnzahlSetzen,
  wahlStimmenProPersonSetzen,
  vergangeneEvents,
  zeitWert,
  bausteinNeu,
  notizenVorlage,
} from './bausteinLogik';

const betrieb: VorlageSchicht = {
  art: 'betrieb',
  beginnZeit: '20:00',
  endeZeit: '04:00',
  bedarfe: [
    { dienstformId: 'bar', minimum: 2, wunsch: 3 },
    { dienstformId: 'kasse', minimum: 1, wunsch: 1 },
  ],
};
const aufbau: VorlageSchicht = {
  art: 'aufbau',
  tagVersatz: 0,
  beginnZeit: '16:00',
  endeZeit: '18:00',
  minimum: 2,
  wunsch: 4,
};

describe('eventDatenAusVorlage', () => {
  const vorlage = {
    id: 'v1',
    beginnZeit: '20:00',
    endeZeit: '04:00',
    schichten: [betrieb, aufbau],
  };
  it('copies name, times and Schichten, leaves the date empty', () => {
    const d = eventDatenAusVorlage(vorlage, { art: 'dienste', dauer: 'eintaegig' }, 'Barabend');
    expect(d).toMatchObject({
      vorlageId: 'v1',
      name: 'Barabend',
      datum: null,
      beginnZeit: '20:00',
    });
    expect(d.schichten).toEqual([betrieb, aufbau]);
    expect(d.schichten).not.toBe(vorlage.schichten);
  });
  it('drops times of whole-day and Schichten of participation Kategorien', () => {
    expect(
      eventDatenAusVorlage(vorlage, { art: 'dienste', dauer: 'ganztaegig' }, 'x').beginnZeit,
    ).toBeNull();
    expect(
      eventDatenAusVorlage(vorlage, { art: 'teilnahme', dauer: 'eintaegig' }, 'x').schichten,
    ).toEqual([]);
  });
});

describe('Datum', () => {
  const basis = eventDatenAusVorlage(
    { id: 'v', beginnZeit: '10:00', endeZeit: '12:00', schichten: [] },
    undefined,
    'x',
  );
  it('keeps a one-day event on one day', () => {
    expect(eventDatumSetzen(basis, '2026-05-01', 'eintaegig', 3).bisDatum).toBeNull();
  });
  it('derives the last day from the Vorlage for multi-day events', () => {
    expect(eventDatumSetzen(basis, '2026-05-01', 'mehrtaegig', 3).bisDatum).toBe('2026-05-03');
  });
  it('keeps a valid last day, replaces an invalid one', () => {
    const mit = { ...basis, bisDatum: '2026-05-10' };
    expect(eventDatumSetzen(mit, '2026-05-01', 'mehrtaegig', 3).bisDatum).toBe('2026-05-10');
    expect(eventDatumSetzen(mit, '2026-05-12', 'mehrtaegig', 2).bisDatum).toBe('2026-05-13');
  });
  it('never puts the last day before the date', () => {
    const mit = { ...basis, datum: '2026-05-05' };
    expect(eventBisSetzen(mit, '2026-05-01').bisDatum).toBe('2026-05-05');
  });
});

describe('zeitWert', () => {
  it('accepts HH:MM and empty, rejects the rest', () => {
    expect(zeitWert('09:30')).toBe('09:30');
    expect(zeitWert('')).toBeNull();
    expect(zeitWert('9:30')).toBeUndefined();
    expect(zeitWert('24:00')).toBeUndefined();
  });
});

describe('Schichten stay valid', () => {
  it('ignores invalid times', () => {
    expect(schichtZeitSetzen(betrieb, 'beginnZeit', '25:00')).toBe(betrieb);
    expect(schichtZeitSetzen(betrieb, 'beginnZeit', '21:15')).toMatchObject({
      beginnZeit: '21:15',
    });
  });
  it('pulls wunsch up with the minimum and the minimum down with wunsch', () => {
    const a = bedarfSetzen(betrieb, 0, { minimum: 5 });
    expect(a.art === 'betrieb' && a.bedarfe[0]).toEqual({
      dienstformId: 'bar',
      minimum: 5,
      wunsch: 5,
    });
    const b = bedarfSetzen(betrieb, 0, { wunsch: 1 });
    expect(b.art === 'betrieb' && b.bedarfe[0]).toEqual({
      dienstformId: 'bar',
      minimum: 1,
      wunsch: 1,
    });
  });
  it('keeps the Betrieb minimum at 1 and the Aufbau minimum at 0', () => {
    const a = bedarfSetzen(betrieb, 1, { minimum: 0 });
    expect(a.art === 'betrieb' && a.bedarfe[1]?.minimum).toBe(1);
    const b = anzahlSetzen(aufbau, { minimum: 0, wunsch: 0 });
    expect(b).toMatchObject({ minimum: 0, wunsch: 1 });
  });
  it('always passes the shared schema', () => {
    for (const s of [betrieb, aufbau]) {
      for (const n of [0, 1, 2, 7]) {
        const kandidaten = [
          s.art === 'betrieb'
            ? bedarfSetzen(s, 0, { minimum: n })
            : anzahlSetzen(s, { minimum: n }),
          s.art === 'betrieb' ? bedarfSetzen(s, 0, { wunsch: n }) : anzahlSetzen(s, { wunsch: n }),
        ];
        for (const k of kandidaten) expect(vorlageSchichtSchema.safeParse(k).success).toBe(true);
      }
    }
  });
  it('formats a line', () => {
    const name = (id: string) => (id === 'bar' ? 'Bar' : 'Kasse');
    expect(schichtKurz(betrieb, name)).toBe('Betrieb 20:00–04:00 · Bar 2/3, Kasse 1/1');
    expect(schichtKurz(aufbau, name)).toBe('Aufbau 16:00–18:00 · 2/4');
  });
});

describe('stimmeSetzen', () => {
  const leer = { antrag: '', ja: 0, nein: 0, enthaltung: 0, ergebnis: null } as const;
  it('suggests the result from the votes', () => {
    const a = stimmeSetzen(leer, 'ja', 5);
    expect(a.ergebnis).toBe('angenommen');
    expect(stimmeSetzen(a, 'nein', 7).ergebnis).toBe('abgelehnt');
  });
  it('keeps a manual choice', () => {
    const manuell = { ...leer, ja: 5, nein: 1, ergebnis: 'abgelehnt' } as const;
    expect(stimmeSetzen(manuell, 'ja', 6).ergebnis).toBe('abgelehnt');
  });
  it('leaves the result alone while nobody voted yes or no', () => {
    expect(stimmeSetzen(leer, 'enthaltung', 3).ergebnis).toBeNull();
  });
  it('does not count Enthaltungen for the suggestion', () => {
    const ja = stimmeSetzen(leer, 'ja', 1);
    expect(stimmeSetzen(ja, 'enthaltung', 10).ergebnis).toBe('angenommen');
  });
  it('ignores negative or fractional counts', () => {
    expect(stimmeSetzen(leer, 'ja', -1)).toBe(leer);
    expect(stimmeSetzen(leer, 'ja', 1.5)).toBe(leer);
  });
});

describe('Meinungsbild options', () => {
  const daten = bausteinLeer('bausteinMeinungsbild');
  it('adds an empty option up to 12', () => {
    const mehr = optionHinzufuegen(daten);
    expect(mehr.optionen).toHaveLength(4);
    expect(mehr.optionen[3]).toEqual({ text: '', stimmen: 0 });
    let voll = daten;
    for (let i = 0; i < 20; i++) voll = optionHinzufuegen(voll);
    expect(voll.optionen).toHaveLength(12);
    expect(optionHinzufuegen(voll)).toBe(voll);
  });
  it('removes an option by index', () => {
    expect(optionEntfernen(daten, 1).optionen.map((o) => o.text)).toEqual(['Ja', 'Enthaltung']);
  });
  it('sets text and votes of one option, ignoring invalid counts', () => {
    const a = optionSetzen(daten, 0, { text: 'Ernst', stimmen: 4 });
    expect(a.optionen[0]).toEqual({ text: 'Ernst', stimmen: 4 });
    expect(a.optionen[1]).toEqual({ text: 'Nein', stimmen: 0 });
    expect(optionSetzen(daten, 0, { stimmen: -1 })).toBe(daten);
    expect(optionSetzen(daten, 0, { stimmen: 1.5 })).toBe(daten);
  });
  it('words the head count', () => {
    expect(personenAnwesendText(1)).toBe('Anwesend: 1 Person (ohne Gäste)');
    expect(personenAnwesendText(12)).toBe('Anwesend: 12 Personen (ohne Gäste)');
  });
});

describe('annahmeSchalterIds', () => {
  it('keeps the order of the candidates when one declines', () => {
    const daten = {
      ...bausteinLeer('bausteinWahl'),
      anzahl: 2,
      kandidaten: [
        { id: 'a', sub: null, name: 'A', stimmen: 5 },
        { id: 'b', sub: null, name: 'B', stimmen: 4 },
        { id: 'c', sub: null, name: 'C', stimmen: 3 },
        { id: 'd', sub: null, name: 'D', stimmen: 0 },
      ],
    };
    expect(annahmeSchalterIds(daten)).toEqual(['a', 'b']);
    // A declines: C moves up, A is declined; the order does not follow the result.
    expect(annahmeSchalterIds({ ...daten, annahme: { a: false } })).toEqual(['a', 'b', 'c']);
  });
});

describe('Auswahl', () => {
  const leer = bausteinLeer('bausteinAuswahl');
  it('adds, edits and removes options (also from the runoff rounds)', () => {
    const eins = auswahlOptionHinzufuegen(leer, 'a');
    const zwei = auswahlOptionHinzufuegen(eins, 'b');
    expect(zwei.optionen.map((o) => o.id)).toEqual(['a', 'b']);
    const mit = auswahlOptionSetzen(auswahlOptionSetzen(zwei, 'a', { text: 'Ja' }), 'a', {
      stimmen: 3,
    });
    expect(mit.optionen[0]).toEqual({ id: 'a', text: 'Ja', stimmen: 3 });
    expect(auswahlOptionSetzen(mit, 'a', { stimmen: -1 })).toBe(mit);
    const runde = { ...mit, stichwahlen: [{ stimmen: { a: 2, b: 1 }, enthaltung: 0 }] };
    const ohne = auswahlOptionEntfernen(runde, 'a');
    expect(ohne.optionen.map((o) => o.id)).toEqual(['b']);
    expect(ohne.stichwahlen[0]!.stimmen).toEqual({ b: 1 });
  });
  it('adds a runoff for a tie and drops superfluous ones', () => {
    const gleich = {
      ...leer,
      optionen: [
        { id: 'a', text: 'A', stimmen: 2 },
        { id: 'b', text: 'B', stimmen: 2 },
      ],
    };
    const mit = stichwahlHinzufuegen(gleich);
    expect(mit.stichwahlen).toHaveLength(1);
    expect(stichwahlHinzufuegen(mit)).toBe(mit);
    const geklaert = { ...mit, optionen: [{ ...mit.optionen[0]!, stimmen: 3 }, mit.optionen[1]!] };
    expect(ueberzaehligeStichwahlenEntfernen(geklaert).stichwahlen).toEqual([]);
    expect(wahlAnzahlSetzen(leer, 2).anzahl).toBe(2);
    expect(wahlStimmenProPersonSetzen(leer, 3).stimmenProPerson).toBe(3);
  });
});

describe('Wahl', () => {
  const leer = bausteinLeer('bausteinWahl');
  const mit = (stimmen: number[], anzahl = 1) => ({
    ...leer,
    anzahl,
    kandidaten: stimmen.map((n, i) => ({ id: `k${i}`, sub: null, name: `K${i}`, stimmen: n })),
  });

  it('starts without Posten link and date', () => {
    expect(leer).toMatchObject({ postenId: null, gueltigAb: '' });
  });

  it('adds candidates up to 30 and removes them (also from the runoff rounds)', () => {
    const eins = kandidatHinzufuegen(leer, 'a');
    expect(eins.kandidaten).toEqual([{ id: 'a', sub: null, name: '', stimmen: 0 }]);
    let voll = leer;
    for (let i = 0; i < 40; i++) voll = kandidatHinzufuegen(voll, `k${i}`);
    expect(voll.kandidaten).toHaveLength(30);
    const runde = { ...eins, stichwahlen: [{ stimmen: { a: 2, b: 1 }, enthaltung: 0 }] };
    const ohne = kandidatEntfernen(runde, 'a');
    expect(ohne.kandidaten).toEqual([]);
    expect(ohne.stichwahlen[0]!.stimmen).toEqual({ b: 1 });
  });

  it('stores a decline as false and accepting again removes the entry', () => {
    const nein = annahmeSetzen(leer, 'a', false);
    expect(nein.annahme).toEqual({ a: false });
    expect(annahmeSetzen(nein, 'a', true).annahme).toEqual({});
    const mit = annahmeSetzen(kandidatHinzufuegen(leer, 'a'), 'a', false);
    expect(kandidatEntfernen(mit, 'a').annahme).toEqual({});
  });

  it('sets the persons that do not run without duplicates', () => {
    expect(nichtAngetretenSetzen(leer, ['x', 'y', 'x']).nichtAngetreten).toEqual(['x', 'y']);
  });

  it('sets a candidate, ignoring invalid counts', () => {
    const d = kandidatHinzufuegen(leer, 'a');
    expect(kandidatSetzen(d, 'a', { name: 'Max', stimmen: 3 }).kandidaten[0]).toMatchObject({
      name: 'Max',
      stimmen: 3,
    });
    expect(kandidatSetzen(d, 'a', { stimmen: -1 })).toBe(d);
    expect(kandidatSetzen(d, 'a', { stimmen: 1.5 })).toBe(d);
  });

  it('keeps the number of seats between 1 and 20', () => {
    expect(wahlAnzahlSetzen(leer, 3).anzahl).toBe(3);
    expect(wahlAnzahlSetzen(leer, 0)).toBe(leer);
    expect(wahlAnzahlSetzen(leer, 21)).toBe(leer);
  });

  it('sets the votes per person between 1 and 20 and keeps null until then', () => {
    expect(leer.stimmenProPerson).toBeNull();
    expect(wahlStimmenProPersonSetzen(leer, 2).stimmenProPerson).toBe(2);
    expect(wahlStimmenProPersonSetzen(leer, 0)).toBe(leer);
    expect(wahlStimmenProPersonSetzen(leer, 21)).toBe(leer);
    expect(wahlStimmenProPersonSetzen(leer, 1.5)).toBe(leer);
  });

  it('adds a Stichwahl only when a tie needs one, and removes it with the later ones', () => {
    const klar = mit([5, 3]);
    expect(stichwahlHinzufuegen(klar)).toBe(klar);
    const gleich = mit([3, 3]);
    const eine = stichwahlHinzufuegen(gleich);
    expect(eine.stichwahlen).toEqual([{ stimmen: {}, enthaltung: 0 }]);
    // An empty round is waiting for its votes: no second one yet.
    expect(stichwahlHinzufuegen(eine)).toBe(eine);
    const stimmen = stichwahlSetzen(eine, 0, 'k0', 2);
    expect(stimmen.stichwahlen[0]!.stimmen).toEqual({ k0: 2 });
    expect(stichwahlSetzen(stimmen, 0, 'enthaltung', 4).stichwahlen[0]!.enthaltung).toBe(4);
    expect(stichwahlSetzen(stimmen, 0, 'k0', -1)).toBe(stimmen);
    expect(stichwahlSetzen(stimmen, 5, 'k0', 1)).toBe(stimmen);
    expect(stichwahlEntfernen(stimmen, 0).stichwahlen).toEqual([]);
  });

  it('drops runoff rounds that the votes no longer need', () => {
    const d = { ...mit([5, 3]), stichwahlen: [{ stimmen: { k0: 1 }, enthaltung: 0 }] };
    expect(ueberzaehligeStichwahlenEntfernen(d).stichwahlen).toEqual([]);
    const noetig = { ...mit([3, 3]), stichwahlen: [{ stimmen: { k0: 1 }, enthaltung: 0 }] };
    expect(ueberzaehligeStichwahlenEntfernen(noetig)).toEqual(noetig);
  });

  it('focuses the Posten first', () => {
    expect(ersterLeererFeld('bausteinWahl', { posten: '' })).toBe('posten');
    expect(ersterLeererFeld('bausteinWahl', { posten: 'Finanzen' })).toBe('text');
  });
});

describe('ersterLeererFeld', () => {
  it('picks Datum when a Vorlage filled the name, else Name', () => {
    expect(ersterLeererFeld('bausteinEvent', { name: 'Bar', datum: null })).toBe('datum');
    expect(ersterLeererFeld('bausteinEvent', { name: '', datum: null })).toBe('name');
    expect(ersterLeererFeld('bausteinEvent', { name: 'Bar', datum: '2026-05-01' })).toBe('text');
  });
  it('handles the other Bausteine', () => {
    expect(
      ersterLeererFeld('bausteinVergangenesEvent', { eventId: 'e', name: 'x', datum: null }),
    ).toBe('text');
    expect(
      ersterLeererFeld('bausteinVergangenesEvent', { eventId: null, name: '', datum: null }),
    ).toBe('name');
    expect(ersterLeererFeld('bausteinAnwaerter', { vorname: '', nachname: '', email: null })).toBe(
      'vorname',
    );
    expect(ersterLeererFeld('bausteinBeschluss', { antrag: '' })).toBe('antrag');
    expect(ersterLeererFeld('bausteinEm', { sub: null, name: '', abstimmung: null })).toBe(
      'person',
    );
    expect(ersterLeererFeld('bausteinEm', { sub: 'a', name: '', abstimmung: null })).toBe('text');
    expect(ersterLeererFeld('bausteinMeinungsbild', { frage: '', optionen: [] })).toBe('frage');
    expect(ersterLeererFeld('bausteinMeinungsbild', { frage: 'Ernst?', optionen: [] })).toBe(
      'text',
    );
    expect(ersterLeererFeld('bausteinAufnahme', { sub: null, name: '' })).toBe('person');
    expect(ersterLeererFeld('bausteinAufnahme', { sub: 'a', name: '' })).toBe('text');
    expect(ersterLeererFeld('bausteinThema', { titel: '' })).toBe('titel');
    expect(ersterLeererFeld('bausteinThema', { titel: 'Bar' })).toBe('text');
    expect(ersterLeererFeld('bausteinTodo', { titel: '' })).toBe('titel');
    expect(ersterLeererFeld('bausteinTodo', { titel: 'Putzen' })).toBe('text');
  });
});

describe('dokumentNormalisieren', () => {
  const baustein = { type: 'bausteinBeschluss', attrs: {}, content: [{ type: 'paragraph' }] };
  const doc = {
    type: 'doc' as const,
    content: [
      { type: 'abschnitt', attrs: { art: 'vergangenes' }, content: [baustein] },
      { type: 'abschnitt', attrs: { art: 'gegenwaertiges' } },
      { type: 'abschnitt', attrs: { art: 'zukuenftiges' }, content: [{ type: 'paragraph' }] },
    ],
  };
  it('adds a paragraph after a trailing Baustein and to empty sections', () => {
    const n = dokumentNormalisieren(doc, true);
    expect(n.content[0]?.content).toEqual([baustein, { type: 'paragraph' }]);
    expect(n.content[1]?.content).toEqual([{ type: 'paragraph' }]);
    expect(n.content[2]?.content).toEqual([{ type: 'paragraph' }]);
    expect(doc.content[1]?.content).toBeUndefined();
  });
  it('drops the note paragraph of old Anwesenheit blocks, also inside other Bausteine', () => {
    const anw = { type: 'bausteinAnwesenheit', attrs: {}, content: [{ type: 'paragraph' }] };
    const event = { type: 'bausteinEvent', attrs: {}, content: [{ type: 'paragraph' }, anw] };
    const alt = {
      ...doc,
      content: [
        { type: 'abschnitt', attrs: { art: 'vergangenes' }, content: [anw, { type: 'paragraph' }] },
        { type: 'abschnitt', attrs: { art: 'gegenwaertiges' }, content: [event] },
        doc.content[2]!,
      ],
    };
    const n = dokumentNormalisieren(alt, true);
    expect(n.content[0]?.content?.[0]).toEqual({ type: 'bausteinAnwesenheit', attrs: {} });
    expect(n.content[1]?.content?.[0]?.content?.[1]).toEqual({
      type: 'bausteinAnwesenheit',
      attrs: {},
    });
    expect(anw.content).toHaveLength(1);
  });
  it('appends an empty Sonstiges to an old document with three sections', () => {
    const n = dokumentNormalisieren(doc, true);
    expect(n.content.map((a) => a.attrs?.art)).toEqual([
      'vergangenes',
      'gegenwaertiges',
      'zukuenftiges',
      'sonstiges',
    ]);
    expect(n.content[3]?.content).toEqual([{ type: 'paragraph' }]);
    expect(doc.content).toHaveLength(3);
  });
  it('only fills empty sections in read-only mode', () => {
    const n = dokumentNormalisieren(doc, false);
    expect(n.content[0]?.content).toEqual([baustein]);
    expect(n.content[1]?.content).toEqual([{ type: 'paragraph' }]);
  });
});

describe('Event lists', () => {
  const e = (id: string, beginn: string, ende: string, abgesagt = false) => ({
    id,
    anzeigeTitel: id,
    beginn,
    ende,
    abgesagt,
  });
  const events = [
    e('alt', '2026-04-01T18:00:00Z', '2026-04-01T22:00:00Z'),
    e('neuer', '2026-04-20T18:00:00Z', '2026-04-20T22:00:00Z'),
    e('abgesagt', '2026-04-10T18:00:00Z', '2026-04-10T22:00:00Z', true),
    e('sitzung', '2026-05-01T18:00:00Z', '2026-05-01T20:00:00Z'),
    e('spaeter', '2026-05-09T18:00:00Z', '2026-05-09T22:00:00Z'),
  ];
  it('lists past events newest first without cancelled ones and the Sitzung', () => {
    const r = vergangeneEvents(events, '2026-05-01T18:00:00Z', 'sitzung').map((x) => x.id);
    expect(r).toEqual(['neuer', 'alt']);
  });
  it('lists upcoming events soonest first', () => {
    const r = kommendeEvents(events, '2026-05-01T18:00:00Z').map((x) => x.id);
    expect(r).toEqual(['sitzung', 'spaeter']);
  });
});

describe('new Bausteine', () => {
  it('start Event, Thema and Vergangenes Event with an empty bullet list', () => {
    for (const typ of [
      'bausteinEvent',
      'bausteinThema',
      'bausteinVergangenesEvent',
      'bausteinTodo',
    ] as const) {
      expect(notizenVorlage(typ)).toEqual([
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
      ]);
    }
    expect(bausteinNeu('bausteinEvent', bausteinLeer('bausteinEvent')).content?.[0]?.type).toBe(
      'bulletList',
    );
  });
  it('start the others with an empty paragraph', () => {
    expect(notizenVorlage('bausteinBeschluss')).toEqual([{ type: 'paragraph' }]);
    expect(notizenVorlage('bausteinAnwesenheit')).toEqual([{ type: 'paragraph' }]);
    expect(notizenVorlage('bausteinMeinungsbild')).toEqual([{ type: 'paragraph' }]);
    expect(notizenVorlage('bausteinAufnahme')).toEqual([{ type: 'paragraph' }]);
  });
  it('focuses the person or goes behind a filled Anwesenheit', () => {
    expect(ersterLeererFeld('bausteinAnwesenheit', { art: 'geht', sub: null, uhrzeit: '' })).toBe(
      'person',
    );
    expect(ersterLeererFeld('bausteinAnwesenheit', { art: 'geht', sub: 'x', uhrzeit: '' })).toBe(
      'nach',
    );
  });
});

describe('kalenderEventFuerBaustein', () => {
  it('lets the calendar win when applied to a Baustein', () => {
    const e = kalenderEventFuerBaustein({
      id: 'e1',
      anzeigeTitel: 'Sommerfest',
      beginn: '2026-07-04T16:00:00.000Z',
      ende: '2026-07-04T20:00:00.000Z',
      abgesagt: false,
      kategorie: { id: 'k1', name: 'Fest', farbe: '#fff' },
      dauer: 'eintaegig',
      serie: null,
      verantwortlich: null,
      schichten: [],
    });
    expect(e.kategorieId).toBe('k1');
    const daten = eventDatenAusKalender(e, {
      vorlageId: 'v1',
      name: 'Alt',
      datum: '2026-01-01',
      bisDatum: null,
      beginnZeit: null,
      endeZeit: null,
      schichten: [],
      verantwortlichSub: null,
      eventId: null,
      kategorieId: null,
    });
    expect(daten).toMatchObject({
      vorlageId: 'v1',
      name: 'Sommerfest',
      datum: '2026-07-04',
      beginnZeit: '18:00',
      endeZeit: '22:00',
      eventId: 'e1',
      kategorieId: 'k1',
    });
  });
});

describe('Todo Zuständige', () => {
  it('encodes people and groups as select values and back', () => {
    expect(todoZustaendigWert({ art: 'person', sub: 'x' })).toBe('p:x');
    expect(todoZustaendigWert({ art: 'gruppe', gruppe: 'alle' })).toBe('g:alle');
    expect(todoZustaendigAusWert('p:x')).toEqual({ art: 'person', sub: 'x' });
    expect(todoZustaendigAusWert('g:ems')).toEqual({ art: 'gruppe', gruppe: 'ems' });
    expect(todoZustaendigAusWert('g:nope')).toBeNull();
    expect(todoZustaendigAusWert('p:')).toBeNull();
    expect(todoZustaendigAusWert('x')).toBeNull();
  });
  it('sets the Zuständigen from select values without invalid or duplicate ones', () => {
    const neu = todoZustaendigSetzen(bausteinLeer('bausteinTodo'), [
      'g:alle',
      'p:a',
      'p:a',
      'q',
      '',
    ]);
    expect(neu.zustaendig).toEqual([
      { art: 'gruppe', gruppe: 'alle' },
      { art: 'person', sub: 'a' },
    ]);
    expect(neu.modus).toBe('einzeln');
  });
  it('knows when exactly one person is zuständig', () => {
    expect(todoNurEinePerson([{ art: 'person', sub: 'a' }])).toBe(true);
    expect(todoNurEinePerson([{ art: 'gruppe', gruppe: 'alle' }])).toBe(false);
    expect(todoNurEinePerson([])).toBe(false);
    expect(
      todoNurEinePerson([
        { art: 'person', sub: 'a' },
        { art: 'person', sub: 'b' },
      ]),
    ).toBe(false);
  });
});
