import { describe, expect, it } from 'vitest';
import {
  AKTION_BEREITS_ERLEDIGT,
  aktionenMitZustand,
  bausteinIdsInReihenfolge,
  protokollAktionen,
  type AktionEventKontext,
  type ProtokollAktionenKontext,
} from './protokollAktionen';
import {
  bausteinErzeugen,
  bausteinLeer,
  protokollLeer,
  type BausteinDatenVon,
  type BausteinTyp,
  type ProtokollDokument,
  type ProtokollKnoten,
} from './protokolle';
import type { SchichtDto } from './kalender';

const SITZUNG = '2026-11-10';

function dok(...zukunft: ProtokollKnoten[]): ProtokollDokument {
  const d = protokollLeer();
  d.content[2]!.content = zukunft;
  return d;
}

function baustein<T extends BausteinTyp>(
  typ: T,
  daten: Partial<BausteinDatenVon[T]>,
  content?: ProtokollKnoten[],
) {
  return bausteinErzeugen(typ, { ...bausteinLeer(typ), ...daten } as BausteinDatenVon[T], content);
}

const kontext = (rest: Partial<ProtokollAktionenKontext> = {}): ProtokollAktionenKontext => ({
  sitzungDatum: SITZUNG,
  heute: '2026-11-12',
  events: {},
  kategorien: { k1: { art: 'teilnahme', dauer: 'eintaegig', teilnahmeStatus: ['mitglied'] } },
  personen: {},
  posten: {},
  ...rest,
});

const schicht = (extra: Partial<SchichtDto> = {}): SchichtDto => ({
  id: 's1',
  art: 'betrieb',
  beginn: '2026-12-05T18:00:00.000Z',
  ende: '2026-12-05T21:00:00.000Z',
  bedarfe: [{ dienstformId: 'bar', minimum: 1, wunsch: 2 }],
  minimum: null,
  wunsch: null,
  dienste: [],
  ...extra,
});

// 2026-12-05 18:00-21:00 UTC = 19:00-22:00 Berlin
const ereignis = (extra: Partial<AktionEventKontext> = {}): AktionEventKontext => ({
  id: 'e1',
  titel: 'Barabend',
  titelEingegeben: 'Barabend',
  beschreibung: 'Text',
  kategorieId: 'k2',
  dauer: 'eintaegig',
  beginn: '2026-12-05T18:00:00.000Z',
  ende: '2026-12-05T21:00:00.000Z',
  abgesagt: false,
  verantwortlichSub: null,
  teilnahmeStatus: null,
  eingeladen: ['x'],
  schichten: [schicht()],
  ...extra,
});

const dienstKategorien: ProtokollAktionenKontext['kategorien'] = {
  k2: { art: 'dienste', dauer: 'eintaegig', teilnahmeStatus: null },
};

const eventDaten = {
  name: 'Barabend',
  datum: '2026-12-05',
  beginnZeit: '19:00',
  endeZeit: '22:00',
  kategorieId: 'k2',
  schichten: [
    {
      art: 'betrieb' as const,
      beginnZeit: '19:00',
      endeZeit: '22:00',
      bedarfe: [{ dienstformId: 'bar', minimum: 1, wunsch: 2 }],
    },
  ],
};

describe('event.anlegen', () => {
  it('plans a new event from the block', () => {
    const b = baustein('bausteinEvent', { ...eventDaten, verantwortlichSub: 'v' });
    const [a] = protokollAktionen(dok(b), kontext({ kategorien: dienstKategorien }));
    expect(a).toMatchObject({
      id: `${b.attrs.id}:event.anlegen`,
      bausteinId: b.attrs.id,
      art: 'event.anlegen',
      ausfuehrbar: true,
      erledigt: false,
    });
    expect(a!.text).toContain('Barabend');
    expect(a!.plan).toMatchObject({
      art: 'event.anlegen',
      eingabe: {
        titel: 'Barabend',
        kategorieId: 'k2',
        beginn: '2026-12-05T18:00:00.000Z',
        ende: '2026-12-05T21:00:00.000Z',
        verantwortlichSub: 'v',
        schichten: [{ art: 'betrieb', beginn: '2026-12-05T18:00:00.000Z' }],
      },
    });
  });

  it.each([
    ['the date', { datum: null }, 'Das Datum fehlt.'],
    ['the Kategorie', { kategorieId: null }, 'Die Kategorie fehlt.'],
    ['an unknown Kategorie', { kategorieId: 'weg' }, 'Die Kategorie gibt es nicht mehr.'],
    ['the time', { endeZeit: null }, 'Die Uhrzeit fehlt.'],
  ])('is not executable without %s', (_name, daten, grund) => {
    const [a] = protokollAktionen(
      dok(baustein('bausteinEvent', { ...eventDaten, ...daten })),
      kontext({ kategorien: dienstKategorien }),
    );
    expect(a).toMatchObject({ ausfuehrbar: false, grund, plan: null });
  });

  it('needs no times for whole-day Kategorien', () => {
    const [a] = protokollAktionen(
      dok(
        baustein('bausteinEvent', {
          name: 'Fest',
          datum: '2026-12-05',
          bisDatum: '2026-12-06',
          kategorieId: 'g',
        }),
      ),
      kontext({
        kategorien: { g: { art: 'teilnahme', dauer: 'ganztaegig', teilnahmeStatus: null } },
      }),
    );
    expect(a!.ausfuehrbar).toBe(true);
    expect(a!.plan).toMatchObject({
      eingabe: { beginn: '2026-12-04T23:00:00.000Z', ende: '2026-12-06T23:00:00.000Z' },
    });
  });
});

describe('event.aendern', () => {
  const kt = { kategorien: dienstKategorien };
  const mitEvent = (e = ereignis()) => kontext({ ...kt, events: { [e.id]: e } });

  it('does nothing when the block matches the calendar', () => {
    const b = baustein('bausteinEvent', { ...eventDaten, eventId: 'e1' });
    expect(protokollAktionen(dok(b), mitEvent())).toEqual([]);
  });

  it('does nothing for deleted and cancelled events', () => {
    const b = baustein('bausteinEvent', { ...eventDaten, name: 'X', eventId: 'e1' });
    expect(protokollAktionen(dok(b), kontext(kt))).toEqual([]);
    expect(protokollAktionen(dok(b), mitEvent(ereignis({ abgesagt: true })))).toEqual([]);
  });

  it('plans an update with the rest of the event kept and the Schicht ids matched', () => {
    const b = baustein('bausteinEvent', {
      ...eventDaten,
      eventId: 'e1',
      name: 'Neuer Name',
      datum: '2026-12-06',
      schichten: [
        {
          art: 'betrieb' as const,
          beginnZeit: '19:00',
          endeZeit: '23:00',
          bedarfe: [{ dienstformId: 'bar', minimum: 2, wunsch: 3 }],
        },
      ],
    });
    const [a] = protokollAktionen(dok(b), mitEvent());
    expect(a).toMatchObject({ art: 'event.aendern', ausfuehrbar: true, eventId: 'e1' });
    expect(a!.text).toContain('Name');
    expect(a!.text).toContain('Datum und Uhrzeit');
    expect(a!.text).toContain('Schichten');
    expect(a!.plan).toMatchObject({
      art: 'event.aendern',
      eventId: 'e1',
      eingabe: {
        titel: 'Neuer Name',
        beschreibung: 'Text',
        eingeladen: ['x'],
        beginn: '2026-12-06T18:00:00.000Z',
        ende: '2026-12-06T21:00:00.000Z',
        schichten: [{ id: 's1', art: 'betrieb' }],
      },
    });
  });

  it('keeps the exact Schichten when only the responsible member changes', () => {
    const b = baustein('bausteinEvent', { ...eventDaten, eventId: 'e1', verantwortlichSub: 'n' });
    const [a] = protokollAktionen(dok(b), mitEvent());
    expect(a!.text).toContain('Verantwortliche:r');
    expect(a!.plan).toMatchObject({
      eingabe: {
        verantwortlichSub: 'n',
        titel: 'Barabend',
        schichten: [{ id: 's1', beginn: '2026-12-05T18:00:00.000Z' }],
      },
    });
  });

  it('keeps an empty entered title when the name is the Kategorie name', () => {
    const e = ereignis({ titelEingegeben: '', titel: 'Offener Abend' });
    const b = baustein('bausteinEvent', {
      ...eventDaten,
      eventId: 'e1',
      name: 'Offener Abend',
      kategorieId: 'k2',
      verantwortlichSub: 'n',
    });
    const [a] = protokollAktionen(dok(b), mitEvent(e));
    expect(a!.plan).toMatchObject({ eingabe: { titel: '' } });
  });
});

describe('anwaerter.einladen', () => {
  it('plans the invitation with the Sitzung date', () => {
    const [a] = protokollAktionen(
      dok(
        baustein('bausteinAnwaerter', {
          vorname: 'Ann',
          nachname: 'Neu',
          email: ' ann@example.de ',
        }),
      ),
      kontext({ heute: '2026-11-12' }),
    );
    expect(a).toMatchObject({
      art: 'anwaerter.einladen',
      ausfuehrbar: true,
      plan: { email: 'ann@example.de', vorname: 'Ann', nachname: 'Neu', ab: SITZUNG },
    });
  });

  it('starts today when the Sitzung lies in the future', () => {
    const [a] = protokollAktionen(
      dok(baustein('bausteinAnwaerter', { vorname: 'Ann', email: 'ann@example.de' })),
      kontext({ heute: '2026-11-01' }),
    );
    expect(a!.plan).toMatchObject({ ab: '2026-11-01' });
  });

  it.each([
    [{ email: null, vorname: 'A' }, 'Die E-Mail-Adresse fehlt.'],
    [{ email: 'kaputt', vorname: 'A' }, 'Die E-Mail-Adresse ist ungültig.'],
    [{ email: 'a@b.de' }, 'Der Name fehlt.'],
  ])('is not executable: %j', (daten, grund) => {
    const [a] = protokollAktionen(dok(baustein('bausteinAnwaerter', daten)), kontext());
    expect(a).toMatchObject({ ausfuehrbar: false, grund });
  });

  it('has no Aktion once invited', () => {
    const b = baustein('bausteinAnwaerter', { vorname: 'A', email: 'a@b.de', sub: 'u1' });
    expect(protokollAktionen(dok(b), kontext())).toEqual([]);
  });
});

const ergebnis = (e: 'angenommen' | 'abgelehnt' | null) => ({
  ja: 3,
  nein: 1,
  enthaltung: 0,
  ergebnis: e,
});
const person = (status: 'anwaerter' | 'mitglied' | 'em' | 'extern', deaktiviert = false) => ({
  status,
  deaktiviert,
});

describe('aufnahme.status', () => {
  it('maps the result to the status', () => {
    const k = kontext({ personen: { p: person('anwaerter') } });
    const [ja] = protokollAktionen(
      dok(baustein('bausteinAufnahme', { sub: 'p', abstimmung: ergebnis('angenommen') })),
      k,
    );
    expect(ja).toMatchObject({
      art: 'aufnahme.status',
      ausfuehrbar: true,
      subs: ['p'],
      plan: { sub: 'p', status: 'mitglied', ab: SITZUNG },
    });
    const [nein] = protokollAktionen(
      dok(baustein('bausteinAufnahme', { sub: 'p', abstimmung: ergebnis('abgelehnt') })),
      k,
    );
    expect(nein!.plan).toMatchObject({ status: 'extern' });
  });

  it('is not executable without result, person, or for a deactivated account', () => {
    const k = kontext({ personen: { p: person('anwaerter'), d: person('anwaerter', true) } });
    const grund = (daten: object) =>
      protokollAktionen(dok(baustein('bausteinAufnahme', daten)), k)[0]!.grund;
    expect(grund({ sub: 'p' })).toBe('Es gibt noch kein Ergebnis der Abstimmung.');
    expect(grund({ name: 'Frei', abstimmung: ergebnis('angenommen') })).toContain('Freitext');
    expect(grund({ sub: 'zz', abstimmung: ergebnis('angenommen') })).toBe(
      'Die Person gibt es nicht.',
    );
    expect(grund({ sub: 'd', abstimmung: ergebnis('angenommen') })).toBe(
      'Der Account ist deaktiviert.',
    );
  });

  it('detects what is done already', () => {
    const [a] = protokollAktionen(
      dok(baustein('bausteinAufnahme', { sub: 'p', abstimmung: ergebnis('angenommen') })),
      kontext({ personen: { p: person('mitglied') } }),
    );
    expect(a).toMatchObject({
      ausfuehrbar: false,
      erledigt: true,
      grund: AKTION_BEREITS_ERLEDIGT,
      plan: null,
    });
  });
});

describe('em.status', () => {
  const k = kontext({ personen: { p: person('mitglied') } });
  const plan = (abstimmung: ReturnType<typeof ergebnis> | null) =>
    protokollAktionen(dok(baustein('bausteinEm', { sub: 'p', abstimmung })), k)[0]!;

  it('makes the person EM without a vote or with a yes', () => {
    expect(plan(null).plan).toMatchObject({ art: 'em.status', status: 'em' });
    expect(plan(ergebnis('angenommen')).plan).toMatchObject({ status: 'em' });
  });
  it('makes the person extern after a no', () => {
    expect(plan(ergebnis('abgelehnt')).plan).toMatchObject({ status: 'extern' });
  });
  it('waits for the result of a vote', () => {
    expect(plan(ergebnis(null))).toMatchObject({ ausfuehrbar: false });
  });
  it('is done when the person is EM', () => {
    const [a] = protokollAktionen(
      dok(baustein('bausteinEm', { sub: 'p' })),
      kontext({ personen: { p: person('em') } }),
    );
    expect(a).toMatchObject({ erledigt: true, grund: AKTION_BEREITS_ERLEDIGT });
  });
});

describe('wahl.posten', () => {
  const kandidaten = [
    { id: 'c1', sub: 'a', name: 'A', stimmen: 5 },
    { id: 'c2', sub: 'b', name: 'B', stimmen: 3 },
    { id: 'c3', sub: null, name: 'Frei', stimmen: 1 },
  ];
  const wahl = (extra: object = {}) =>
    baustein('bausteinWahl', {
      posten: 'Kasse',
      postenId: 'p1',
      gueltigAb: '2026-12-01',
      anzahl: 1,
      kandidaten,
      ...extra,
    });
  const personen = { a: person('mitglied'), b: person('mitglied'), alt: person('mitglied') };
  const ctx = (besetzungen: ProtokollAktionenKontext['posten'][string]['besetzungen'] = []) =>
    kontext({ personen, posten: { p1: { name: 'Kasse', besetzungen } } });

  it('occupies the Posten with the elected and ends the Besetzung of those not re-elected', () => {
    const [a] = protokollAktionen(
      dok(wahl()),
      ctx([
        { id: 'b1', mitgliedSub: 'alt', start: '2025-01-01', ende: null },
        { id: 'b2', mitgliedSub: 'b', start: '2025-01-01', ende: '2026-01-01' },
        { id: 'b3', mitgliedSub: 'zz', start: '2026-12-01', ende: null },
      ]),
    );
    expect(a).toMatchObject({
      art: 'wahl.posten',
      ausfuehrbar: true,
      subs: ['a'],
      plan: { postenId: 'p1', start: '2026-12-01', subs: ['a'], ablosung: ['b1'] },
    });
  });

  it('keeps the re-elected and has nothing to do when they hold the Posten', () => {
    const [a] = protokollAktionen(
      dok(wahl()),
      ctx([{ id: 'b1', mitgliedSub: 'a', start: '2025-01-01', ende: null }]),
    );
    expect(a).toMatchObject({ ausfuehrbar: false, erledigt: true, grund: AKTION_BEREITS_ERLEDIGT });
  });

  it('only adds those without a running Besetzung when several are elected', () => {
    const [a] = protokollAktionen(
      dok(wahl({ anzahl: 2 })),
      ctx([{ id: 'b1', mitgliedSub: 'a', start: '2025-01-01', ende: null }]),
    );
    expect(a!.plan).toMatchObject({ subs: ['b'], ablosung: [] });
    expect(a!.subs).toEqual(['a', 'b']);
  });

  it.each([
    ['no Posten from the list', { postenId: null }, 'Es ist kein Posten aus der Liste gewählt.'],
    ['no start date', { gueltigAb: '' }, 'Das Datum „Gilt ab“ fehlt.'],
    ['an unknown Posten', { postenId: 'weg' }, 'Den Posten gibt es nicht mehr.'],
    [
      'no votes',
      { kandidaten: kandidaten.map((c) => ({ ...c, stimmen: 0 })) },
      'Es gibt noch kein Ergebnis.',
    ],
    [
      'a tie',
      { kandidaten: kandidaten.map((c) => ({ ...c, stimmen: 2 })) },
      'Die Wahl ist noch nicht entschieden (Stichwahl offen).',
    ],
  ])('is not executable with %s', (_name, extra, grund) => {
    const [a] = protokollAktionen(dok(wahl(extra)), ctx());
    expect(a).toMatchObject({ ausfuehrbar: false, grund, plan: null });
  });
});

describe('structure', () => {
  it('finds Bausteine inside the free text of other Bausteine, in document order', () => {
    const innen = baustein('bausteinWahl', { postenId: null });
    const aussen = baustein('bausteinEvent', { name: 'Fest' }, [innen]);
    const em = baustein('bausteinEm', { sub: 'p' });
    const liste = protokollAktionen(
      dok(aussen, em),
      kontext({ personen: { p: person('mitglied') } }),
    );
    expect(liste.map((a) => a.id)).toEqual([
      `${aussen.attrs.id}:event.anlegen`,
      `${innen.attrs.id}:wahl.posten`,
      `${em.attrs.id}:em.status`,
    ]);
  });
});

describe('aktionenMitZustand', () => {
  const b = baustein('bausteinEm', { sub: 'p' });
  const liste = () => protokollAktionen(dok(b), kontext({ personen: { p: person('mitglied') } }));
  const am = '2026-11-10T20:00:00.000Z';
  const basis = { am, von: 'u', aktionText: '', bausteinId: '', art: '', eventId: null, subs: [] };

  it('is open without a stored result and failed after a failure', () => {
    expect(aktionenMitZustand(liste(), {})[0]).toMatchObject({ zustand: 'offen', ergebnis: null });
    const id = liste()[0]!.id;
    const gespeichert = { [id]: { ...basis, status: 'fehler' as const, text: 'Kaputt' } };
    expect(aktionenMitZustand(liste(), gespeichert)[0]).toMatchObject({
      zustand: 'fehler',
      ergebnis: { text: 'Kaputt' },
    });
  });

  it('is done when the state says so, and not executable otherwise', () => {
    const erledigt = protokollAktionen(dok(b), kontext({ personen: { p: person('em') } }));
    expect(aktionenMitZustand(erledigt, {})[0]).toMatchObject({ zustand: 'erledigt' });
    const keine = protokollAktionen(dok(b), kontext());
    expect(aktionenMitZustand(keine, {})[0]).toMatchObject({ zustand: 'nicht_ausfuehrbar' });
    expect('plan' in aktionenMitZustand(keine, {})[0]!).toBe(false);
  });

  it('lists stored results of Aktionen that are not computed any more', () => {
    const id = `${b.attrs.id}:event.anlegen`;
    const gespeichert = {
      [id]: { ...basis, status: 'erledigt' as const, text: 'Event angelegt' },
    };
    const alle = aktionenMitZustand([], { ...gespeichert, kaputt: gespeichert[id]! });
    expect(alle).toHaveLength(1);
    expect(alle[0]).toMatchObject({
      id,
      bausteinId: b.attrs.id,
      art: 'event.anlegen',
      zustand: 'erledigt',
      erledigt: true,
      ausfuehrbar: false,
      text: 'Event angelegt',
    });
  });

  it('shows stored results with their Aktion text, event and persons, in document order', () => {
    const e = baustein('bausteinEm', { sub: 'p' });
    const z = baustein('bausteinEm', { sub: 'q' });
    const ev = baustein('bausteinEvent', { ...eventDaten, eventId: 'ev1' });
    const dokument = dok(e, ev, z);
    const live = protokollAktionen(
      dokument,
      kontext({ personen: { p: person('mitglied'), q: person('mitglied') } }),
    );
    const gespeichert = {
      [`${ev.attrs.id}:event.anlegen`]: {
        ...basis,
        status: 'erledigt' as const,
        text: 'Event im Kalender angelegt.',
        aktionText: 'Event „Test“ am 20.11.2026 im Kalender anlegen',
        bausteinId: ev.attrs.id,
        eventId: 'ev1',
        subs: ['p'],
      },
      'weg:event.anlegen': {
        ...basis,
        status: 'erledigt' as const,
        text: 'Event im Kalender angelegt.',
        aktionText: 'Gelöschter Baustein',
        bausteinId: 'weg',
      },
    };
    const alle = aktionenMitZustand(live, gespeichert, bausteinIdsInReihenfolge(dokument));
    expect(alle.map((a) => a.text)).toEqual([
      live[0]!.text,
      'Event „Test“ am 20.11.2026 im Kalender anlegen',
      live[1]!.text,
      'Gelöschter Baustein',
    ]);
    expect(alle[1]).toMatchObject({
      zustand: 'erledigt',
      eventId: 'ev1',
      subs: ['p'],
      ergebnis: { text: 'Event im Kalender angelegt.' },
    });
  });
});

describe('Kategorie of the Vorlage', () => {
  it('is the fallback for Event blocks without kategorieId', () => {
    const b = baustein('bausteinEvent', { ...eventDaten, kategorieId: null, vorlageId: 'v1' });
    const [a] = protokollAktionen(
      dok(b),
      kontext({ kategorien: dienstKategorien, vorlageKategorien: { v1: 'k2' } }),
    );
    expect(a).toMatchObject({ ausfuehrbar: true });
    expect(a!.plan).toMatchObject({ eingabe: { kategorieId: 'k2' } });
    const [ohne] = protokollAktionen(dok(b), kontext({ kategorien: dienstKategorien }));
    expect(ohne).toMatchObject({ ausfuehrbar: false, grund: 'Die Kategorie fehlt.' });
  });
});

describe('vorlaeufig (not beschlussfähig)', () => {
  it('keeps the Aktion executable and marks it provisional', () => {
    const b = baustein('bausteinAufnahme', { sub: 'p', abstimmung: ergebnis('angenommen') });
    const k = kontext({ personen: { p: person('anwaerter') } });
    const id = (b.attrs as { id: string }).id;
    const [normal] = protokollAktionen(dok(b), k);
    expect(normal!.vorlaeufig).toBeUndefined();
    const [vorl] = protokollAktionen(dok(b), { ...k, nichtBeschlussfaehig: [id] });
    expect(vorl).toMatchObject({
      ausfuehrbar: true,
      vorlaeufig: true,
      plan: { status: 'mitglied' },
    });
  });
});
