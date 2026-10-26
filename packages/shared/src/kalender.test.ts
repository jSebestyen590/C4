import { describe, expect, it } from 'vitest';
import {
  ausVorlage,
  berlinZuUtc,
  dienstEintragenSchema,
  eventBewertung,
  dienstTermine,
  eventEingabeSchema,
  icsErzeugen,
  icsFalten,
  schichtBewertung,
  schichtDetails,
  schichtBezeichnung,
  schichtEingabeSchema,
  statistikJahr,
  statistikZeilen,
  ueberlappendeSchichten,
  vorlageEingabeSchema,
  zeitpunktAnzeigen,
  type BewertbareSchicht,
  type DienstPerson,
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

describe('ausVorlage', () => {
  const vorlage: VorlageEingabe = {
    titel: 'Offener Abend',
    beschreibung: null,
    kategorieId: 'k1',
    beginnZeit: '20:00',
    endeTagVersatz: 1,
    endeZeit: '02:00',
    fehltHinweisStunden: 24,
    schichten: [
      {
        art: 'aufbau',
        tagVersatz: 0,
        beginnZeit: '18:00',
        endeTagVersatz: 0,
        endeZeit: '20:00',
        bedarfe: [{ dienstformId: 'aufbau', minimum: 1, wunsch: 2 }],
      },
      {
        art: 'putzen',
        tagVersatz: 1,
        beginnZeit: '02:00',
        endeTagVersatz: 1,
        endeZeit: '03:30',
        bedarfe: [],
      },
    ],
  };
  it('applies day offsets and Berlin time across the autumn switch', () => {
    const e = ausVorlage(vorlage, '2026-10-24');
    expect(e.beginn).toBe('2026-10-24T18:00:00.000Z');
    // 2026-10-25 02:00 is ambiguous; the first (summer time) occurrence is used
    expect(e.ende).toBe('2026-10-25T00:00:00.000Z');
    expect(e.schichten[0]!.beginn).toBe('2026-10-24T16:00:00.000Z');
    expect(e.schichten[1]!.beginn).toBe('2026-10-25T00:00:00.000Z');
    expect(e.schichten[1]!.ende).toBe('2026-10-25T02:30:00.000Z');
    expect(e.kategorieId).toBe('k1');
    expect(e.fehltHinweisStunden).toBe(24);
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
  it('counts per person and Dienstform for the year, skipping cancelled events', () => {
    const a = mitglied('a');
    const x = extern('x');
    const z = statistikZeilen(
      [
        { person: a, dienstformId: 'bar', schichtBeginn: '2026-03-01T19:00:00Z', abgesagt: false },
        {
          person: a,
          dienstformId: 'technik',
          schichtBeginn: '2026-04-01T19:00:00Z',
          abgesagt: false,
        },
        { person: a, dienstformId: 'bar', schichtBeginn: '2026-05-01T19:00:00Z', abgesagt: true },
        { person: a, dienstformId: 'bar', schichtBeginn: '2025-12-31T22:30:00Z', abgesagt: false },
        { person: x, dienstformId: 'bar', schichtBeginn: '2026-03-02T19:00:00Z', abgesagt: false },
      ],
      2026,
    );
    expect(z.map((r) => [r.gesamt, r.nachDienstform])).toEqual([
      [2, { bar: 1, technik: 1 }],
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
  it('validates Event and Vorlage input', () => {
    const event = {
      titel: 'Abend',
      beginn: '2026-06-05T18:00:00Z',
      ende: '2026-06-06T00:00:00Z',
      schichten: [basis],
    };
    expect(eventEingabeSchema.parse(event).fehltHinweisStunden).toBeNull();
    expect(eventEingabeSchema.safeParse({ ...event, ende: event.beginn }).success).toBe(false);
    expect(eventEingabeSchema.safeParse({ ...event, fehltHinweisStunden: -1 }).success).toBe(false);
    const vorlage = {
      titel: 'V',
      beginnZeit: '20:00',
      endeTagVersatz: 0,
      endeZeit: '23:00',
      schichten: [],
    };
    expect(vorlageEingabeSchema.safeParse(vorlage).success).toBe(true);
    expect(vorlageEingabeSchema.safeParse({ ...vorlage, beginnZeit: '25:00' }).success).toBe(false);
    expect(vorlageEingabeSchema.safeParse({ ...vorlage, endeZeit: '19:00' }).success).toBe(false);
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
