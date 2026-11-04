import { describe, expect, it } from 'vitest';
import { bausteinLeer, vorlageSchichtSchema, type VorlageSchicht } from '@c4/shared';
import {
  anzahlSetzen,
  bedarfSetzen,
  dokumentNormalisieren,
  ersterLeererFeld,
  eventBisSetzen,
  eventDatenAusVorlage,
  eventDatumSetzen,
  kommendeEvents,
  schichtKurz,
  schichtZeitSetzen,
  stimmeSetzen,
  vergangeneEvents,
  zeitWert,
  anwesenheitUhrzeit,
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
  it('ignores negative or fractional counts', () => {
    expect(stimmeSetzen(leer, 'ja', -1)).toBe(leer);
    expect(stimmeSetzen(leer, 'ja', 1.5)).toBe(leer);
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
  it('start Event and Vergangenes Event with an empty bullet list', () => {
    for (const typ of ['bausteinEvent', 'bausteinVergangenesEvent'] as const) {
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
  });
  it('focuses the person or goes behind a filled Anwesenheit', () => {
    expect(ersterLeererFeld('bausteinAnwesenheit', { art: 'geht', sub: null, uhrzeit: '' })).toBe(
      'person',
    );
    expect(ersterLeererFeld('bausteinAnwesenheit', { art: 'geht', sub: 'x', uhrzeit: '' })).toBe(
      'nach',
    );
  });
  it('prefills the time only on the day of the Sitzung (Berlin)', () => {
    const jetzt = new Date('2026-06-01T19:15:00Z');
    expect(anwesenheitUhrzeit('2026-06-01T17:00:00Z', jetzt)).toBe('21:15');
    expect(anwesenheitUhrzeit('2026-05-20T17:00:00Z', jetzt)).toBe('');
  });
});
