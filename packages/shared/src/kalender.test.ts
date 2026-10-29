import { describe, expect, it } from 'vitest';
import {
  ausVorlage,
  serieAendernSchema,
  serieEingabeSchema,
  serieIdAus,
  serieRegelText,
  serieSlug,
  serienTage,
  serieEventErsetzen,
  betriebDatum,
  erinnerungenEingabeSchema,
  zeitenAus,
  zeitspanne,
  berlinZuUtc,
  dienstEintragenSchema,
  eventBewertung,
  dienstTermine,
  eventEingabeSchema,
  eventTermine,
  teilnahmeKreisKodieren,
  teilnahmeKreisLesen,
  teilnahmeZustand,
  teilnehmend,
  icsErzeugen,
  icsFalten,
  schichtBewertung,
  schichtDetails,
  schichtBezeichnung,
  schichtEingabeSchema,
  statistikJahr,
  statistikZeilen,
  ueberlappendeSchichten,
  eventKategorieEingabeSchema,
  vorlageEingabeSchema,
  zeitpunktAnzeigen,
  type BewertbareSchicht,
  type DienstPerson,
  type EventDto,
  type VorlageEingabe,
} from './kalender';

const mitglied = (sub: string, status: 'anwaerter' | 'mitglied' | 'em' = 'mitglied') =>
  ({
    art: 'mitglied',
    sub,
    username: sub,
    vorname: 'A',
    nachname: 'B',
    status,
    anrede: 'neutral',
  }) as DienstPerson;
const extern = (id: string): DienstPerson => ({ art: 'extern', id, name: id, quelle: null });
const dienst = (dienstformId: string, person: DienstPerson) => ({ dienstformId, person });

const schicht = (
  bedarfe: [string, number, number][],
  dienste: ReturnType<typeof dienst>[],
): BewertbareSchicht => ({
  bedarfe: bedarfe.map(([dienstformId, minimum, wunsch]) => ({ dienstformId, minimum, wunsch })),
  dienste,
});

describe('schichtBewertung', () => {
  it('is red below the minimum', () => {
    expect(schichtBewertung(schicht([['bar', 2, 3]], [dienst('bar', mitglied('a'))]))).toBe('rot');
  });
  it('is yellow between minimum and wish', () => {
    const s = schicht([['bar', 1, 2]], [dienst('bar', mitglied('a'))]);
    expect(schichtBewertung(s)).toBe('gelb');
  });
  it('is green at the wish and above it', () => {
    const d = [
      dienst('bar', mitglied('a')),
      dienst('bar', mitglied('b')),
      dienst('bar', mitglied('c')),
    ];
    expect(schichtBewertung(schicht([['bar', 1, 2]], d))).toBe('gruen');
  });
  it('is green without Bedarf, and a minimum of 0 is fulfilled', () => {
    expect(schichtBewertung(schicht([], []))).toBe('gruen');
    expect(schichtBewertung(schicht([['bar', 0, 0]], []))).toBe('gruen');
    expect(schichtBewertung(schicht([['bar', 0, 1]], []))).toBe('gelb');
  });
  it('is red for an Anwaerter without Mitglied or EM, although the Bedarf is met', () => {
    const s = schicht([['bar', 1, 1]], [dienst('bar', mitglied('a', 'anwaerter'))]);
    expect(schichtBewertung(s)).toBe('rot');
    expect(schichtDetails(s).begleitungFehlt).toBe(true);
  });
  it('accepts a Mitglied or EM of any Dienstform as companion', () => {
    for (const status of ['mitglied', 'em'] as const) {
      const s = schicht(
        [['bar', 1, 1]],
        [dienst('bar', mitglied('a', 'anwaerter')), dienst('technik', mitglied('b', status))],
      );
      expect(schichtDetails(s).begleitungFehlt).toBe(false);
      expect(schichtBewertung(s)).toBe('gruen');
    }
  });
  it('does not accept an Externe as companion', () => {
    const s = schicht(
      [['bar', 1, 1]],
      [dienst('bar', mitglied('a', 'anwaerter')), dienst('bar', extern('x'))],
    );
    expect(schichtBewertung(s)).toBe('rot');
  });
  it('counts Anwaerter towards the Bedarf', () => {
    const s = schicht(
      [['bar', 2, 2]],
      [dienst('bar', mitglied('a', 'anwaerter')), dienst('bar', mitglied('b'))],
    );
    expect(schichtBewertung(s)).toBe('gruen');
  });
  it('reports what is missing per Dienstform', () => {
    const s = schicht([['bar', 2, 4]], [dienst('bar', mitglied('a'))]);
    expect(schichtDetails(s).dienstformen).toEqual([
      { dienstformId: 'bar', minimum: 2, wunsch: 4, vorhanden: 1, bisMinimum: 1, bisWunsch: 3 },
    ]);
  });
});

describe('schichtBewertung for Aufbau/Putzen', () => {
  const anzahl = (minimum: number, wunsch: number, n: number): BewertbareSchicht => ({
    bedarfe: [],
    minimum,
    wunsch,
    dienste: Array.from({ length: n }, (_, i) => ({
      dienstformId: null,
      person: mitglied(`m${i}`),
    })),
  });
  it('counts all Dienste against minimum and wish', () => {
    expect(schichtBewertung(anzahl(1, 2, 0))).toBe('rot');
    expect(schichtBewertung(anzahl(1, 2, 1))).toBe('gelb');
    expect(schichtBewertung(anzahl(1, 2, 2))).toBe('gruen');
    expect(schichtBewertung(anzahl(0, 2, 0))).toBe('gelb');
    expect(schichtDetails(anzahl(1, 2, 1)).anzahl).toMatchObject({ vorhanden: 1, bisWunsch: 1 });
  });
});

describe('eventBewertung', () => {
  const rot = schicht([['bar', 1, 1]], []);
  const gelb = schicht([['bar', 0, 1]], []);
  const gruen = schicht([], []);
  it('takes the worst Schicht', () => {
    expect(eventBewertung({ schichten: [gruen, gelb, rot] })).toBe('rot');
    expect(eventBewertung({ schichten: [gruen, gelb] })).toBe('gelb');
    expect(eventBewertung({ schichten: [gruen] })).toBe('gruen');
  });
  it('is green without Schichten', () => {
    expect(eventBewertung({ schichten: [] })).toBe('gruen');
  });
  it('is abgesagt for cancelled events', () => {
    expect(eventBewertung({ abgesagt: true, schichten: [rot] })).toBe('abgesagt');
  });
});

describe('Berlin time', () => {
  it('converts winter and summer time', () => {
    expect(berlinZuUtc('2026-01-15', '20:00')).toBe('2026-01-15T19:00:00.000Z');
    expect(berlinZuUtc('2026-07-15', '20:00')).toBe('2026-07-15T18:00:00.000Z');
  });
  it('handles the switch days', () => {
    // 2026-03-29: 02:00 -> 03:00; 2026-10-25: 03:00 -> 02:00
    expect(berlinZuUtc('2026-03-28', '23:00')).toBe('2026-03-28T22:00:00.000Z');
    expect(berlinZuUtc('2026-03-29', '01:30')).toBe('2026-03-29T00:30:00.000Z');
    expect(berlinZuUtc('2026-03-29', '03:30')).toBe('2026-03-29T01:30:00.000Z');
    expect(berlinZuUtc('2026-03-29', '12:00')).toBe('2026-03-29T10:00:00.000Z');
    expect(berlinZuUtc('2026-10-25', '01:30')).toBe('2026-10-24T23:30:00.000Z');
    expect(berlinZuUtc('2026-10-25', '03:30')).toBe('2026-10-25T02:30:00.000Z');
  });
  it('formats for display and picks the year', () => {
    expect(zeitpunktAnzeigen('2026-07-15T18:05:00.000Z')).toBe('15.07.2026 20:05');
    expect(statistikJahr('2025-12-31T23:30:00.000Z')).toBe(2026);
    expect(statistikJahr('2026-12-31T22:59:00.000Z')).toBe(2026);
  });
});

describe('zeitspanne', () => {
  it('keeps the end on the same day when it is later', () => {
    const z = zeitspanne('2026-06-05', '20:00', '21:00');
    expect(z).toEqual({ beginn: '2026-06-05T18:00:00.000Z', ende: '2026-06-05T19:00:00.000Z' });
  });
  it('moves the end to the next day when it is not later', () => {
    expect(zeitspanne('2026-06-05', '20:00', '01:00').ende).toBe('2026-06-05T23:00:00.000Z');
    expect(zeitspanne('2026-06-05', '20:00', '19:00').ende).toBe('2026-06-06T17:00:00.000Z');
    const gleich = zeitspanne('2026-06-05', '20:00', '20:00');
    expect(new Date(gleich.ende).getTime() - new Date(gleich.beginn).getTime()).toBe(24 * 3600_000);
  });
  it('handles daylight saving time', () => {
    // night of 2026-10-24 to 25 has 25 hours: 20:00 -> 20:00 is 25 h, so use a shorter span
    const herbst = zeitspanne('2026-10-24', '20:00', '03:00');
    expect(herbst.ende).toBe('2026-10-25T02:00:00.000Z');
    const fruehling = zeitspanne('2026-03-28', '20:00', '03:00');
    expect(fruehling.ende).toBe('2026-03-29T01:00:00.000Z');
  });
  it('is inverted by zeitenAus', () => {
    const z = zeitspanne('2026-06-05', '20:00', '01:00');
    expect(zeitenAus(z.beginn, z.ende)).toEqual({
      datum: '2026-06-05',
      beginnZeit: '20:00',
      endeZeit: '01:00',
    });
  });
});

describe('betriebDatum', () => {
  it('moves earlier start times to the next day', () => {
    expect(betriebDatum('2026-06-05', '20:00', '00:00')).toBe('2026-06-06');
    expect(betriebDatum('2026-06-05', '20:00', '19:59')).toBe('2026-06-06');
    expect(betriebDatum('2026-06-05', '20:00', '20:00')).toBe('2026-06-05');
    expect(betriebDatum('2026-06-05', '20:00', '22:00')).toBe('2026-06-05');
  });
});

describe('ausVorlage', () => {
  const vorlage: VorlageEingabe = {
    titel: 'Offener Abend',
    beschreibung: null,
    kategorieId: 'k1',
    beginnZeit: '20:00',
    endeZeit: '02:00',
    teilnahmeStatus: ['mitglied', 'em'],
    schichten: [
      {
        art: 'aufbau',
        tagVersatz: -1,
        beginnZeit: '18:00',
        endeZeit: '20:00',
        minimum: 1,
        wunsch: 2,
      },
      {
        art: 'betrieb',
        beginnZeit: '00:00',
        endeZeit: '02:00',
        bedarfe: [{ dienstformId: 'bar', minimum: 1, wunsch: 2 }],
      },
      {
        art: 'putzen',
        tagVersatz: 2,
        beginnZeit: '10:00',
        endeZeit: '11:30',
        minimum: 0,
        wunsch: 1,
      },
    ],
  };
  it('applies day offsets and Berlin time', () => {
    const e = ausVorlage(vorlage, '2026-06-05');
    expect(e.beginn).toBe('2026-06-05T18:00:00.000Z');
    expect(e.ende).toBe('2026-06-06T00:00:00.000Z');
    expect(e.schichten[0]!.beginn).toBe('2026-06-04T16:00:00.000Z');
    // Betrieb starting before the event start lies on the next day
    expect(e.schichten[1]!.beginn).toBe('2026-06-05T22:00:00.000Z');
    expect(e.schichten[1]!.ende).toBe('2026-06-06T00:00:00.000Z');
    expect(e.schichten[2]!.beginn).toBe('2026-06-07T08:00:00.000Z');
    expect(e.kategorieId).toBe('k1');
  });
  it('applies the spring switch', () => {
    const e = ausVorlage(vorlage, '2026-03-28');
    expect(e.beginn).toBe('2026-03-28T19:00:00.000Z');
    // 2026-03-29 02:00 does not exist and moves to 03:00 CEST
    expect(e.ende).toBe('2026-03-29T01:00:00.000Z');
  });
  it('yields valid Event input', () => {
    expect(eventEingabeSchema.safeParse(ausVorlage(vorlage, '2026-06-05')).success).toBe(true);
  });
});

describe('erinnerungenEingabeSchema', () => {
  it('validates the reminder list', () => {
    const ok = (minutenVorher: number[]) =>
      erinnerungenEingabeSchema.safeParse({ minutenVorher }).success;
    expect(ok([10080, 2880, 1440])).toBe(true);
    expect(ok([])).toBe(false);
    expect(ok([14])).toBe(false);
    expect(ok([43201])).toBe(false);
    expect(ok([60, 60])).toBe(false);
    expect(ok([1.5 * 60, 90.5])).toBe(false);
    expect(ok(Array.from({ length: 21 }, (_, i) => 15 + i))).toBe(false);
  });
});

describe('ueberlappendeSchichten', () => {
  const s = (id: string, beginn: string, ende: string) => ({ id, beginn, ende });
  it('finds overlapping pairs, but not touching ones', () => {
    const a = s('a', '2026-06-05T16:00:00Z', '2026-06-05T18:00:00Z');
    const b = s('b', '2026-06-05T18:00:00Z', '2026-06-05T22:00:00Z');
    const c = s('c', '2026-06-05T20:00:00Z', '2026-06-05T23:00:00Z');
    expect(ueberlappendeSchichten([a, b, c])).toEqual([[b, c]]);
    expect(ueberlappendeSchichten([a, b])).toEqual([]);
  });
});

describe('statistikZeilen', () => {
  it('counts per person and column for the year, skipping cancelled events', () => {
    const a = mitglied('a');
    const x = extern('x');
    const d = (
      person: DienstPerson,
      dienstformId: string | null,
      schichtBeginn: string,
      abgesagt = false,
      schichtArt: 'betrieb' | 'aufbau' | 'putzen' = 'betrieb',
    ) => ({ person, dienstformId, schichtArt, schichtBeginn, abgesagt });
    const z = statistikZeilen(
      [
        d(a, 'bar', '2026-03-01T19:00:00Z'),
        d(a, 'technik', '2026-04-01T19:00:00Z'),
        d(a, 'bar', '2026-05-01T19:00:00Z', true),
        d(a, 'bar', '2025-12-31T22:30:00Z'),
        d(a, null, '2026-06-01T15:00:00Z', false, 'aufbau'),
        d(x, 'bar', '2026-03-02T19:00:00Z'),
      ],
      2026,
    );
    expect(z.map((r) => [r.gesamt, r.nachSpalte])).toEqual([
      [3, { bar: 1, technik: 1, 'art:aufbau': 1 }],
      [1, { bar: 1 }],
    ]);
  });
});

describe('schemas', () => {
  const basis = {
    art: 'betrieb',
    beginn: '2026-06-05T18:00:00Z',
    ende: '2026-06-05T22:00:00Z',
    bedarfe: [{ dienstformId: 'bar', minimum: 1, wunsch: 2 }],
  };
  it('validates Schicht input', () => {
    expect(schichtEingabeSchema.safeParse(basis).success).toBe(true);
    expect(schichtEingabeSchema.safeParse({ ...basis, ende: basis.beginn }).success).toBe(false);
    expect(schichtEingabeSchema.safeParse({ ...basis, art: 'x' }).success).toBe(false);
    expect(
      schichtEingabeSchema.safeParse({
        ...basis,
        bedarfe: [{ dienstformId: 'bar', minimum: 2, wunsch: 1 }],
      }).success,
    ).toBe(false);
    expect(
      schichtEingabeSchema.safeParse({
        ...basis,
        bedarfe: [{ dienstformId: 'bar', minimum: -1, wunsch: 1 }],
      }).success,
    ).toBe(false);
    expect(
      schichtEingabeSchema.safeParse({
        ...basis,
        bedarfe: [basis.bedarfe[0], basis.bedarfe[0]],
      }).success,
    ).toBe(false);
  });
  it('requires a Dienstform with minimum 1 for Betrieb, with German messages', () => {
    const leer = schichtEingabeSchema.safeParse({ ...basis, bedarfe: [] });
    expect(leer.success).toBe(false);
    expect(leer.error!.issues[0]!.message).toBe(
      'Eine Betriebs-Schicht braucht mindestens eine Dienstform.',
    );
    expect(
      schichtEingabeSchema.safeParse({
        ...basis,
        bedarfe: [{ dienstformId: 'bar', minimum: 0, wunsch: 1 }],
      }).success,
    ).toBe(false);
  });
  it('validates Aufbau/Putzen head counts', () => {
    const aufbau = {
      art: 'aufbau',
      beginn: basis.beginn,
      ende: basis.ende,
      minimum: 0,
      wunsch: 2,
    };
    expect(schichtEingabeSchema.safeParse(aufbau).success).toBe(true);
    expect(schichtEingabeSchema.safeParse({ ...aufbau, art: 'putzen' }).success).toBe(true);
    expect(schichtEingabeSchema.safeParse({ ...aufbau, wunsch: 0 }).success).toBe(false);
    expect(schichtEingabeSchema.safeParse({ ...aufbau, minimum: 3 }).success).toBe(false);
    expect(schichtEingabeSchema.safeParse({ ...aufbau, wunsch: undefined }).success).toBe(false);
  });
  it('validates Event and Vorlage input', () => {
    const event = {
      titel: 'Abend',
      kategorieId: 'k1',
      beginn: '2026-06-05T18:00:00Z',
      ende: '2026-06-06T00:00:00Z',
      schichten: [basis],
    };
    expect(eventEingabeSchema.safeParse(event).success).toBe(true);
    expect(eventEingabeSchema.safeParse({ ...event, ende: event.beginn }).success).toBe(false);
    // The Kategorie is required
    expect(eventEingabeSchema.safeParse({ ...event, kategorieId: null }).success).toBe(false);
    expect(eventEingabeSchema.safeParse({ ...event, kategorieId: '' }).success).toBe(false);
    expect(eventEingabeSchema.safeParse({ ...event, ende: '2026-06-06T18:00:00Z' }).success).toBe(
      true,
    );
    expect(eventEingabeSchema.safeParse({ ...event, ende: '2026-06-06T18:01:00Z' }).success).toBe(
      false,
    );
    expect(schichtEingabeSchema.safeParse({ ...basis, ende: '2026-06-07T18:00:00Z' }).success).toBe(
      false,
    );
    const vorlage = {
      titel: 'V',
      kategorieId: 'k1',
      beginnZeit: '20:00',
      endeZeit: '23:00',
      schichten: [],
    };
    expect(vorlageEingabeSchema.safeParse(vorlage).success).toBe(true);
    expect(vorlageEingabeSchema.safeParse({ ...vorlage, beginnZeit: '25:00' }).success).toBe(false);
    expect(vorlageEingabeSchema.safeParse({ ...vorlage, endeZeit: '19:00' }).success).toBe(true);
  });
  it('allows Dienst input without Dienstform', () => {
    expect(dienstEintragenSchema.safeParse({}).success).toBe(true);
  });
  it('allows only one person in Dienst input', () => {
    expect(dienstEintragenSchema.safeParse({ dienstformId: 'bar' }).success).toBe(true);
    expect(dienstEintragenSchema.safeParse({ dienstformId: 'bar', mitgliedSub: 'a' }).success).toBe(
      true,
    );
    expect(dienstEintragenSchema.safeParse({ dienstformId: 'bar', externId: 'x' }).success).toBe(
      true,
    );
    expect(
      dienstEintragenSchema.safeParse({ dienstformId: 'bar', mitgliedSub: 'a', externId: 'x' })
        .success,
    ).toBe(false);
    expect(
      dienstEintragenSchema.safeParse({ dienstformId: 'bar', kommentar: 'x'.repeat(201) }).success,
    ).toBe(false);
  });
});

describe('icsErzeugen', () => {
  const jetzt = new Date('2026-06-01T10:00:00Z');
  it('builds a calendar with CRLF line endings', () => {
    const ics = icsErzeugen(
      [
        {
          id: 'd1',
          titel: 'Bar, Schicht 1; früh',
          beschreibung: 'Zeile 1\nZeile 2 \\ Ende',
          beginn: '2026-06-05T18:00:00.000Z',
          ende: '2026-06-05T22:30:00.000Z',
          url: 'https://example.org/app/kalender/events/e1',
        },
        {
          id: 'd2',
          titel: 'Abgesagt',
          beginn: '2026-06-06T18:00:00Z',
          ende: '2026-06-06T19:00:00Z',
          abgesagt: true,
        },
      ],
      { jetzt },
    );
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
    for (const zeile of [
      'PRODID:-//C4 Leipzig//Kalender//DE',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:C4 Dienste',
      'UID:dienst-d1@c4-leipzig.de',
      'DTSTAMP:20260601T100000Z',
      'DTSTART:20260605T180000Z',
      'DTEND:20260605T223000Z',
      'SUMMARY:Bar\\, Schicht 1\\; früh',
      'DESCRIPTION:Zeile 1\\nZeile 2 \\\\ Ende',
      'URL:https://example.org/app/kalender/events/e1',
      'UID:dienst-d2@c4-leipzig.de',
      'STATUS:CANCELLED',
    ]) {
      expect(ics).toContain(`\r\n${zeile}\r\n`);
    }
    expect(ics.match(/STATUS:CANCELLED/g)).toHaveLength(1);
  });
  it('folds long lines at 75 octets without splitting characters', () => {
    const lang = `SUMMARY:${'ä'.repeat(100)}`;
    const gefaltet = icsFalten(lang);
    const zeilen = gefaltet.split('\r\n');
    expect(zeilen.length).toBeGreaterThan(1);
    const enc = new TextEncoder();
    for (const z of zeilen) expect(enc.encode(z).length).toBeLessThanOrEqual(75);
    for (const z of zeilen.slice(1)) expect(z.startsWith(' ')).toBe(true);
    expect(zeilen.map((z, i) => (i === 0 ? z : z.slice(1))).join('')).toBe(lang);
    expect(icsFalten('x'.repeat(75))).toBe('x'.repeat(75));
    expect(icsFalten('x'.repeat(76)).split('\r\n')).toHaveLength(2);
  });
});

describe('dienstTermine', () => {
  const dienst = {
    id: 'd1',
    eventId: 'e1',
    eventTitel: 'Offener Abend',
    schichtArt: 'betrieb' as const,
    dienstformName: 'Bar',
    beginn: '2026-06-05T18:00:00.000Z',
    ende: '2026-06-05T22:00:00.000Z',
    abgesagt: false,
  };

  it('names the entry after Dienstform and event and links the event', () => {
    const [t] = dienstTermine([dienst], 'https://c4.example');
    expect(t).toMatchObject({
      id: 'd1',
      titel: 'Bar · Offener Abend',
      url: 'https://c4.example/app/kalender/events/e1',
    });
    expect(t!.beschreibung).toBe(
      'Schicht: Betrieb 20:00–00:00\nhttps://c4.example/app/kalender/events/e1',
    );
  });

  it('names Aufbau/Putzen entries after the Art', () => {
    const [t] = dienstTermine([{ ...dienst, schichtArt: 'aufbau', dienstformName: null }]);
    expect(t!.titel).toBe('Aufbau · Offener Abend');
  });

  it('leaves the link out without an origin', () => {
    const [t] = dienstTermine([{ ...dienst, abgesagt: true }]);
    expect(t).toMatchObject({
      url: null,
      beschreibung: 'Schicht: Betrieb 20:00–00:00',
      abgesagt: true,
    });
  });
});

describe('schichtBezeichnung', () => {
  it('labels art and Berlin time', () => {
    expect(
      schichtBezeichnung({
        art: 'betrieb',
        beginn: '2026-10-23T18:00:00Z',
        ende: '2026-10-23T20:30:00Z',
      }),
    ).toBe('Betrieb 20:00–22:30');
  });

  it('keeps both times for a Schicht across midnight on the event day', () => {
    expect(
      schichtBezeichnung(
        { art: 'betrieb', beginn: '2026-10-23T18:00:00Z', ende: '2026-10-24T02:00:00Z' },
        '2026-10-23T16:00:00Z',
      ),
    ).toBe('Betrieb 20:00–04:00');
  });

  it('adds weekday and date when the Schicht starts on another day than the event', () => {
    expect(
      schichtBezeichnung(
        { art: 'putzen', beginn: '2026-10-24T09:00:00Z', ende: '2026-10-24T11:00:00Z' },
        '2026-10-23T16:00:00Z',
      ),
    ).toBe('Putzen Sa 24.10. 11:00–13:00');
  });

  it('compares Berlin days, not UTC days', () => {
    // 22:30 UTC on the 23rd is 00:30 Berlin on the 24th.
    expect(
      schichtBezeichnung(
        { art: 'putzen', beginn: '2026-10-23T22:30:00Z', ende: '2026-10-24T00:30:00Z' },
        '2026-10-23T16:00:00Z',
      ),
    ).toBe('Putzen Sa 24.10. 00:30–02:30');
  });
});

describe('serieEventErsetzen', () => {
  const bar = { dienstformId: 'bar', minimum: 1, wunsch: 2 };
  const barabend = (
    dienste: { dienstformId: string | null }[],
    extra: EventDto['schichten'] = [],
  ) =>
    ({
      beginn: '2026-11-02T19:00:00.000Z', // Mo 20:00 Berlin
      schichten: [
        {
          id: 's-betrieb',
          art: 'betrieb',
          beginn: '2026-11-02T19:00:00.000Z',
          ende: '2026-11-03T00:00:00.000Z',
          bedarfe: [bar, { dienstformId: 'tresen', minimum: 1, wunsch: 3 }],
          minimum: null,
          wunsch: null,
          dienste: dienste.map((d, i) => ({ id: `d${i}`, ...d, person: extern('x') })),
        },
        ...extra,
      ],
    }) as unknown as Pick<EventDto, 'beginn' | 'schichten'>;
  const vorlage = (schichten: VorlageEingabe['schichten']): VorlageEingabe => ({
    titel: 'Karaoke',
    beschreibung: null,
    kategorieId: 'k1',
    beginnZeit: '21:00',
    endeZeit: '02:00',
    teilnahmeStatus: null,
    schichten,
  });
  const betrieb = (bedarfe = [{ dienstformId: 'technik', minimum: 1, wunsch: 1 }]) =>
    ({ art: 'betrieb', beginnZeit: '21:00', endeZeit: '02:00', bedarfe }) as const;

  it('takes the Betrieb id, the times of the Vorlage and the date of the Barabend', () => {
    const e = serieEventErsetzen(barabend([{ dienstformId: 'bar' }]), vorlage([betrieb()]));
    expect(e.titel).toBe('Karaoke');
    expect(e.beginn).toBe('2026-11-02T20:00:00.000Z');
    expect(e.schichten).toHaveLength(1);
    expect(e.schichten[0]).toMatchObject({
      id: 's-betrieb',
      art: 'betrieb',
      beginn: '2026-11-02T20:00:00.000Z',
    });
  });

  it('adds Dienstformen with Dienste that the Vorlage lacks, with their old numbers', () => {
    const e = serieEventErsetzen(barabend([{ dienstformId: 'bar' }]), vorlage([betrieb()]));
    const s = e.schichten[0]!;
    if (s.art !== 'betrieb') throw new Error('expected Betrieb');
    expect(s.bedarfe).toEqual([{ dienstformId: 'technik', minimum: 1, wunsch: 1 }, bar]);
  });

  it('does not duplicate Dienstformen the Vorlage has and skips those without Dienste', () => {
    const e = serieEventErsetzen(
      barabend([{ dienstformId: 'bar' }]),
      vorlage([betrieb([{ dienstformId: 'bar', minimum: 2, wunsch: 4 }])]),
    );
    const s = e.schichten[0]!;
    if (s.art !== 'betrieb') throw new Error('expected Betrieb');
    expect(s.bedarfe).toEqual([{ dienstformId: 'bar', minimum: 2, wunsch: 4 }]);
  });

  it('keeps the old Betrieb Schicht as an extra one when the Vorlage has none', () => {
    const putzen = {
      art: 'putzen',
      tagVersatz: 1,
      beginnZeit: '10:00',
      endeZeit: '11:00',
      minimum: 0,
      wunsch: 1,
    } as const;
    const e = serieEventErsetzen(barabend([]), vorlage([putzen]));
    expect(e.schichten.map((s) => s.art)).toEqual(['putzen', 'betrieb']);
    expect(e.schichten[0]!.id).toBeUndefined();
    expect(e.schichten[1]).toMatchObject({ id: 's-betrieb', beginn: '2026-11-02T19:00:00.000Z' });
  });

  it('keeps further old Schichten that have Dienste and drops empty ones', () => {
    const aufbau = (id: string, anzahl: number) => ({
      id,
      art: 'aufbau' as const,
      beginn: '2026-11-02T16:00:00.000Z',
      ende: '2026-11-02T18:00:00.000Z',
      bedarfe: [],
      minimum: 1,
      wunsch: 2,
      dienste: Array.from({ length: anzahl }, (_, i) => ({
        id: `a${i}`,
        dienstformId: null,
        person: extern('y'),
      })),
    });
    const e = serieEventErsetzen(
      barabend([], [aufbau('s-voll', 1), aufbau('s-leer', 0)] as unknown as EventDto['schichten']),
      vorlage([betrieb()]),
    );
    expect(e.schichten.map((s) => s.id)).toEqual(['s-betrieb', 's-voll']);
  });
});

describe('Teilnahme', () => {
  const basis = {
    kreis: ['mitglied', 'em'],
    status: 'mitglied',
    eingeladen: false,
    antwort: null,
  } as const;

  it('takes part when the status is in the circle, unless declined', () => {
    expect(teilnahmeZustand(basis)).toBe('teilnahme');
    expect(teilnehmend({ ...basis, status: 'anwaerter' })).toBe(false);
    expect(teilnahmeZustand({ ...basis, status: 'anwaerter' })).toBeNull();
    expect(teilnahmeZustand({ ...basis, antwort: 'absage' })).toBe('absage');
  });

  it('includes invited people and self-signed people outside the circle', () => {
    const aussen = { ...basis, status: 'anwaerter' } as const;
    expect(teilnehmend({ ...aussen, eingeladen: true })).toBe(true);
    expect(teilnehmend({ ...aussen, antwort: 'teilnahme' })).toBe(true);
    expect(teilnahmeZustand({ ...aussen, eingeladen: true, antwort: 'absage' })).toBe('absage');
    expect(teilnahmeZustand({ ...aussen, antwort: 'absage' })).toBe('absage');
  });

  it('has no participation without a circle and evaluates the circle dynamically', () => {
    expect(teilnahmeZustand({ ...basis, kreis: null, eingeladen: true })).toBeNull();
    expect(teilnahmeZustand({ ...basis, kreis: [], eingeladen: false })).toBeNull();
    // A member who joins later with a matching status is included without any record.
    expect(
      teilnehmend({ kreis: ['anwaerter'], status: 'anwaerter', eingeladen: false, antwort: null }),
    ).toBe(true);
  });

  it('encodes and decodes the circle', () => {
    expect(teilnahmeKreisKodieren(null)).toBeNull();
    expect(teilnahmeKreisKodieren([])).toBe('');
    expect(teilnahmeKreisKodieren(['em', 'anwaerter'])).toBe('anwaerter,em');
    expect(teilnahmeKreisLesen(null)).toBeNull();
    expect(teilnahmeKreisLesen('')).toEqual([]);
    expect(teilnahmeKreisLesen('mitglied,em,quatsch')).toEqual(['mitglied', 'em']);
  });

  it('validates the circle and invitations of an event', () => {
    const roh = {
      titel: 'Plenum',
      kategorieId: 'k1',
      beginn: '2026-06-05T18:00:00.000Z',
      ende: '2026-06-05T20:00:00.000Z',
      schichten: [],
    };
    const ok = eventEingabeSchema.parse(roh);
    expect(ok.teilnahmeStatus).toBeNull();
    expect(ok.eingeladen).toEqual([]);
    expect(
      eventEingabeSchema.parse({ ...roh, teilnahmeStatus: ['em'], eingeladen: ['a'] }),
    ).toMatchObject({
      teilnahmeStatus: ['em'],
      eingeladen: ['a'],
    });
    expect(eventEingabeSchema.safeParse({ ...roh, teilnahmeStatus: ['chef'] }).success).toBe(false);
    expect(eventEingabeSchema.safeParse({ ...roh, eingeladen: ['a', 'a'] }).success).toBe(false);
  });

  it('turns events into ICS entries with their own UID', () => {
    const ics = icsErzeugen(
      eventTermine(
        [
          {
            id: 'e1',
            titel: 'Plenum',
            beschreibung: 'Wichtig',
            beginn: '2026-06-05T18:00:00.000Z',
            ende: '2026-06-05T20:00:00.000Z',
            abgesagt: true,
          },
        ],
        'https://c4.example',
      ),
    );
    expect(ics).toContain('UID:event-e1@c4-leipzig.de');
    expect(ics).toContain('SUMMARY:Plenum');
    expect(ics).toContain('URL:https://c4.example/app/kalender/events/e1');
    expect(ics).toContain('STATUS:CANCELLED');
  });
});

describe('ausVorlage with a Kategorie', () => {
  const vorlage: VorlageEingabe = {
    titel: 'Plenum',
    beschreibung: null,
    kategorieId: 'k1',
    beginnZeit: '19:00',
    endeZeit: '21:00',
    teilnahmeStatus: null,
    schichten: [{ art: 'betrieb', beginnZeit: '19:00', endeZeit: '21:00', bedarfe: [] }],
  };

  it('drops Schichten and uses the default circle for Teilnahme', () => {
    const e = ausVorlage(vorlage, '2026-11-02', {
      art: 'teilnahme',
      teilnahmeStatus: ['mitglied'],
    });
    expect(e.schichten).toEqual([]);
    expect(e.teilnahmeStatus).toEqual(['mitglied']);
  });

  it('prefers the circle of the Vorlage', () => {
    const e = ausVorlage({ ...vorlage, teilnahmeStatus: [] }, '2026-11-02', {
      art: 'teilnahme',
      teilnahmeStatus: ['mitglied'],
    });
    expect(e.teilnahmeStatus).toEqual([]);
  });

  it('keeps Schichten and has no circle for Dienste', () => {
    const e = ausVorlage(vorlage, '2026-11-02', { art: 'dienste', teilnahmeStatus: null });
    expect(e.schichten).toHaveLength(1);
    expect(e.teilnahmeStatus).toBeNull();
  });
});

describe('eventKategorieEingabeSchema', () => {
  const basis = { name: 'Plenum', farbe: 'teal' };

  it('requires the kind and a default circle for Teilnahme', () => {
    expect(eventKategorieEingabeSchema.safeParse(basis).success).toBe(false);
    expect(eventKategorieEingabeSchema.safeParse({ ...basis, art: 'teilnahme' }).success).toBe(
      false,
    );
    const ok = eventKategorieEingabeSchema.parse({
      ...basis,
      art: 'teilnahme',
      teilnahmeStatus: ['mitglied'],
    });
    expect(ok.teilnahmeStatus).toEqual(['mitglied']);
    expect(
      eventKategorieEingabeSchema.parse({ ...basis, art: 'teilnahme', teilnahmeStatus: [] })
        .teilnahmeStatus,
    ).toEqual([]);
  });

  it('drops the circle of a Dienste Kategorie', () => {
    const ok = eventKategorieEingabeSchema.parse({
      ...basis,
      art: 'dienste',
      teilnahmeStatus: ['mitglied'],
    });
    expect(ok.teilnahmeStatus).toBeNull();
  });
});

describe('serienTage', () => {
  const woechentlich = {
    regel: 'woechentlich' as const,
    wochentage: [1, 3, 0],
    wochen: [],
    startDatum: '2026-01-01',
    endDatum: null,
  };
  const monatlich = (wochentage: number[], wochen: number[]) => ({
    ...woechentlich,
    regel: 'monatlich' as const,
    wochentage,
    wochen,
  });

  it('lists the weekdays of a week range, honoring start and end', () => {
    // 2026-10-28 is a Wednesday.
    expect(serienTage(woechentlich, '2026-10-28', '2026-11-04')).toEqual([
      '2026-10-28',
      '2026-11-01',
      '2026-11-02',
      '2026-11-04',
    ]);
    expect(
      serienTage({ ...woechentlich, startDatum: '2026-11-02' }, '2026-10-28', '2026-11-04'),
    ).toEqual(['2026-11-02', '2026-11-04']);
    expect(
      serienTage({ ...woechentlich, endDatum: '2026-11-01' }, '2026-10-28', '2026-11-04'),
    ).toEqual(['2026-10-28', '2026-11-01']);
  });

  it('keeps the weekday across daylight saving time', () => {
    const tage = serienTage({ ...woechentlich, wochentage: [0] }, '2026-03-20', '2027-03-19');
    expect(tage).toContain('2026-03-29');
    expect(tage).toContain('2026-10-25');
    expect(tage).toHaveLength(52);
  });

  it('finds the n-th weekday of a month', () => {
    // First Tuesday: 2026-11-03, 2026-12-01; third Tuesday: 2026-11-17.
    expect(serienTage(monatlich([2], [1]), '2026-11-01', '2026-12-31')).toEqual([
      '2026-11-03',
      '2026-12-01',
    ]);
    expect(serienTage(monatlich([2], [1, 3]), '2026-11-01', '2026-11-30')).toEqual([
      '2026-11-03',
      '2026-11-17',
    ]);
  });

  it('finds the last weekday, also at month ends, and has no fifth weekday for 1..4', () => {
    // November 2026 has five Mondays (2, 9, 16, 23, 30); the last is the 30th.
    expect(serienTage(monatlich([1], [-1]), '2026-11-01', '2026-11-30')).toEqual(['2026-11-30']);
    expect(serienTage(monatlich([1], [4]), '2026-11-01', '2026-11-30')).toEqual(['2026-11-23']);
    // February 2027 ends on a Sunday (28th): the last Sunday is the 28th, the last Monday the 22nd.
    expect(serienTage(monatlich([0], [-1]), '2027-02-01', '2027-02-28')).toEqual(['2027-02-28']);
    expect(serienTage(monatlich([1], [-1]), '2027-02-01', '2027-02-28')).toEqual(['2027-02-22']);
    // A month with a 4th weekday that is also the last (28 days).
    expect(serienTage(monatlich([1], [4, -1]), '2027-02-01', '2027-02-28')).toEqual(['2027-02-22']);
  });
});

describe('Serien-Eingabe', () => {
  const basis = {
    name: ' Plenum ',
    vorlageId: 'v1',
    regel: 'monatlich',
    wochentage: [2, 2],
    wochen: [3, 1],
    startDatum: '2026-11-01',
    endDatum: null,
  };

  it('normalizes and validates', () => {
    const r = serieEingabeSchema.parse(basis);
    expect(r).toMatchObject({ name: 'Plenum', wochentage: [2], wochen: [1, 3] });
    expect(serieEingabeSchema.parse({ ...basis, regel: 'woechentlich' }).wochen).toEqual([]);
    expect(serieAendernSchema.parse({ ...basis, bestehende: 'anpassen' }).bestehende).toBe(
      'anpassen',
    );
  });

  it('rejects missing weekdays, weeks and a reversed range', () => {
    expect(serieEingabeSchema.safeParse({ ...basis, wochentage: [] }).success).toBe(false);
    expect(serieEingabeSchema.safeParse({ ...basis, wochen: [] }).success).toBe(false);
    expect(serieEingabeSchema.safeParse({ ...basis, endDatum: '2026-10-01' }).success).toBe(false);
    expect(serieEingabeSchema.safeParse({ ...basis, endDatum: '2026-11-01' }).success).toBe(true);
  });

  it('describes the rule in German', () => {
    expect(serieRegelText({ regel: 'woechentlich', wochentage: [1, 3, 0], wochen: [] })).toBe(
      'Mo, Mi, So',
    );
    expect(serieRegelText({ regel: 'monatlich', wochentage: [2], wochen: [1, 3] })).toBe(
      '1. und 3. Di im Monat',
    );
    expect(serieRegelText({ regel: 'monatlich', wochentage: [5], wochen: [-1] })).toBe(
      'letzten Fr im Monat',
    );
  });
});

describe('serieSlug / serieIdAus', () => {
  it('makes lowercase ASCII slugs', () => {
    expect(serieSlug('Barabend')).toBe('barabend');
    expect(serieSlug('Große Küchen-Öffnung & Co.')).toBe('grosse-kuechen-oeffnung-co');
    expect(serieSlug('  Café  ')).toBe('cafe');
    expect(serieSlug('!!!')).toBe('serie');
  });

  it('appends a counter when the id is taken', () => {
    expect(serieIdAus('Barabend', new Set())).toBe('barabend');
    expect(serieIdAus('Barabend', new Set(['barabend']))).toBe('barabend-2');
    expect(serieIdAus('Barabend', new Set(['barabend', 'barabend-2']))).toBe('barabend-3');
  });
});
