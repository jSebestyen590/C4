import { describe, expect, it } from 'vitest';
import {
  bedarfZusammen,
  dienstVerteilung,
  ergebnisseSichtbar,
  erinnerungenKodieren,
  erinnerungenLesen,
  erinnerungHeute,
  kreisVon,
  leererKreis,
  stimmzettelFehler,
  terminDauerFehler,
  terminNormalisieren,
  terminSpanne,
  terminText,
  umfrageEingabeSchema,
  umfrageLaeuft,
  ungueltigNachAenderung,
  type FrageRegeln,
  type Stimme,
  type UmfrageEingabe,
} from './umfragen';

const eingabe = (extra: Partial<UmfrageEingabe> = {}): UmfrageEingabe => ({
  titel: 'Sommerfest',
  beschreibung: null,
  endetAm: '2026-11-10',
  anonym: false,
  ergebnisse: 'sofort',
  pflicht: { status: ['mitglied'], posten: [], personen: [] },
  optional: leererKreis(),
  erinnerungenPflicht: [7, 3],
  erinnerungenOptional: [3],
  fragen: [
    {
      text: 'Wann?',
      freitext: false,
      maxAntworten: 1,
      optionen: [{ text: 'Samstag' }, { text: 'Sonntag' }],
    },
  ],
  ...extra,
});

describe('umfrageEingabeSchema', () => {
  it('accepts a valid poll', () => {
    expect(umfrageEingabeSchema.safeParse(eingabe()).success).toBe(true);
  });
  it('needs someone to vote', () => {
    const r = umfrageEingabeSchema.safeParse(eingabe({ pflicht: leererKreis() }));
    expect(r.success).toBe(false);
  });
  it('needs options or free text and a fitting maximum', () => {
    const ohne = eingabe({
      fragen: [{ text: 'X', freitext: false, maxAntworten: null, optionen: [] }],
    });
    expect(umfrageEingabeSchema.safeParse(ohne).success).toBe(false);
    const nurFreitext = eingabe({
      fragen: [{ text: 'X', freitext: true, maxAntworten: 1, optionen: [] }],
    });
    expect(umfrageEingabeSchema.safeParse(nurFreitext).success).toBe(true);
    const zuViele = eingabe({
      fragen: [{ text: 'X', freitext: true, maxAntworten: 3, optionen: [{ text: 'a' }] }],
    });
    expect(umfrageEingabeSchema.safeParse(zuViele).success).toBe(false);
  });
  it('takes title or question from the other one when there is a single question', () => {
    const frage = eingabe().fragen[0]!;
    const ohneTitel = umfrageEingabeSchema.parse(eingabe({ titel: '' }));
    expect(ohneTitel.titel).toBe('Wann?');
    const ohneFrage = umfrageEingabeSchema.parse(eingabe({ fragen: [{ ...frage, text: ' ' }] }));
    expect(ohneFrage.fragen[0]!.text).toBe('Sommerfest');
    const lang = umfrageEingabeSchema.parse(
      eingabe({ titel: '', fragen: [{ ...frage, text: 'x'.repeat(300) }] }),
    );
    expect(lang.titel).toHaveLength(200);
    expect(lang.titel.endsWith('…')).toBe(true);
    expect(
      umfrageEingabeSchema.safeParse(eingabe({ titel: '', fragen: [{ ...frage, text: '' }] }))
        .success,
    ).toBe(false);
  });
  it('needs title and questions when there are several questions', () => {
    const frage = eingabe().fragen[0]!;
    expect(
      umfrageEingabeSchema.safeParse(eingabe({ titel: '', fragen: [frage, frage] })).success,
    ).toBe(false);
    expect(
      umfrageEingabeSchema.safeParse(eingabe({ fragen: [frage, { ...frage, text: '' }] })).success,
    ).toBe(false);
  });
  it('lets nobody vote both mandatorily and optionally', () => {
    for (const optional of [
      { status: ['mitglied' as const], posten: [], personen: [] },
      { status: [], posten: [], personen: ['x'] },
    ]) {
      const r = umfrageEingabeSchema.safeParse(
        eingabe({ pflicht: { status: ['mitglied'], posten: [], personen: ['x'] }, optional }),
      );
      expect(r.success).toBe(false);
    }
  });
  it('rejects duplicate options and unknown reminder days', () => {
    const doppelt = eingabe({
      fragen: [
        { text: 'X', freitext: false, maxAntworten: 1, optionen: [{ text: 'a' }, { text: 'A' }] },
      ],
    });
    expect(umfrageEingabeSchema.safeParse(doppelt).success).toBe(false);
    expect(umfrageEingabeSchema.safeParse(eingabe({ erinnerungenPflicht: [4] })).success).toBe(
      false,
    );
  });
});

const frage: FrageRegeln = { id: 'f', optionIds: ['a', 'b', 'c'], freitext: true, maxAntworten: 2 };

describe('stimmzettelFehler', () => {
  it('accepts a fitting ballot', () => {
    expect(
      stimmzettelFehler([frage], {
        antworten: [{ frageId: 'f', optionIds: ['a'], freitext: 'x' }],
      }),
    ).toBeNull();
  });
  it('needs an answer to every question', () => {
    expect(stimmzettelFehler([frage], { antworten: [] })).toBe('Bitte beantworte Frage 1.');
  });
  it('limits the number of answers, counting the free text', () => {
    expect(
      stimmzettelFehler([frage], {
        antworten: [{ frageId: 'f', optionIds: ['a', 'b'], freitext: 'x' }],
      }),
    ).toMatch(/höchstens 2/);
  });
  it('rejects unknown options and free text where not allowed', () => {
    expect(
      stimmzettelFehler([frage], {
        antworten: [{ frageId: 'f', optionIds: ['z'], freitext: null }],
      }),
    ).toMatch(/geändert/);
    expect(
      stimmzettelFehler([{ ...frage, freitext: false }], {
        antworten: [{ frageId: 'f', optionIds: [], freitext: 'x' }],
      }),
    ).toMatch(/kein Freitext/);
  });
});

describe('ungueltigNachAenderung', () => {
  const stimme = (id: string, sub: string, optionId: string | null, frageId = 'f'): Stimme => ({
    id,
    frageId,
    sub,
    optionId,
    freitext: optionId === null ? 'text' : null,
  });

  it('asks members who picked a removed option to vote again', () => {
    const r = ungueltigNachAenderung(
      [{ ...frage, optionIds: ['b'] }],
      [stimme('1', 'u', 'a'), stimme('2', 'v', 'b')],
      ['u', 'v'],
    );
    expect(r).toEqual({ loeschen: ['1'], erneut: ['u'] });
  });
  it('drops answers of removed questions without asking again', () => {
    const r = ungueltigNachAenderung(
      [frage],
      [stimme('1', 'u', 'a'), stimme('2', 'u', 'x', 'g')],
      ['u'],
    );
    expect(r).toEqual({ loeschen: ['2'], erneut: [] });
  });
  it('asks everybody when a question is added or the maximum drops below a vote', () => {
    const neu: FrageRegeln = { id: 'g', optionIds: ['x'], freitext: false, maxAntworten: 1 };
    expect(ungueltigNachAenderung([frage, neu], [stimme('1', 'u', 'a')], ['u']).erneut).toEqual([
      'u',
    ]);
    const r = ungueltigNachAenderung(
      [{ ...frage, maxAntworten: 1 }],
      [stimme('1', 'u', 'a'), stimme('2', 'u', 'b')],
      ['u'],
    );
    expect(r).toEqual({ loeschen: ['1', '2'], erneut: ['u'] });
  });
  it('drops free texts once they are no longer allowed', () => {
    const r = ungueltigNachAenderung(
      [{ ...frage, freitext: false }],
      [stimme('1', 'u', null)],
      ['u'],
    );
    expect(r).toEqual({ loeschen: ['1'], erneut: ['u'] });
  });
});

describe('kreisVon', () => {
  const mitglieder = [
    { sub: 'm', status: 'mitglied' as const },
    { sub: 'e', status: 'em' as const },
    { sub: 'a', status: 'anwaerter' as const },
  ];
  it('combines statuses, Posten holders and persons; mandatory wins', () => {
    const k = kreisVon(
      {
        pflicht: { status: ['mitglied'], posten: ['kasse'], personen: [] },
        optional: { status: ['em', 'mitglied'], posten: [], personen: ['a', 'weg'] },
      },
      mitglieder,
      new Map([['kasse', ['e']]]),
    );
    expect(Object.fromEntries(k)).toEqual({ m: 'pflicht', e: 'pflicht', a: 'optional' });
  });
});

describe('umfrageLaeuft', () => {
  it('runs until the end of the day in Berlin', () => {
    const u = { endetAm: '2026-11-10', beendetAm: null };
    expect(umfrageLaeuft(u, new Date('2026-11-10T22:59:00Z'))).toBe(true);
    expect(umfrageLaeuft(u, new Date('2026-11-10T23:00:00Z'))).toBe(false);
    expect(umfrageLaeuft({ ...u, beendetAm: '2026-11-01T10:00:00Z' })).toBe(false);
  });
});

describe('ergebnisseSichtbar', () => {
  const basis = { laeuft: true, verwaltet: false, abgestimmt: false };
  it('follows the setting while the poll runs', () => {
    expect(ergebnisseSichtbar({ ...basis, ergebnisse: 'sofort' })).toBe(true);
    expect(ergebnisseSichtbar({ ...basis, ergebnisse: 'nach_abstimmung' })).toBe(false);
    expect(ergebnisseSichtbar({ ...basis, ergebnisse: 'nach_abstimmung', abgestimmt: true })).toBe(
      true,
    );
    expect(ergebnisseSichtbar({ ...basis, ergebnisse: 'nach_ende', abgestimmt: true })).toBe(false);
  });
  it('always shows them to the creator and after the end', () => {
    expect(ergebnisseSichtbar({ ...basis, ergebnisse: 'nach_ende', verwaltet: true })).toBe(true);
    expect(ergebnisseSichtbar({ ...basis, ergebnisse: 'nach_ende', laeuft: false })).toBe(true);
  });
});

describe('erinnerungHeute', () => {
  it('finds the reminder of today, but not on or before the day of creation', () => {
    expect(erinnerungHeute('2026-11-10', [7, 3], '2026-11-01', '2026-11-07')).toBe(3);
    expect(erinnerungHeute('2026-11-10', [7, 3], '2026-11-01', '2026-11-08')).toBeNull();
    expect(erinnerungHeute('2026-11-10', [0], '2026-11-01', '2026-11-10')).toBe(0);
    expect(erinnerungHeute('2026-11-10', [3], '2026-11-07', '2026-11-07')).toBeNull();
  });
  it('round-trips the stored days', () => {
    expect(erinnerungenLesen(erinnerungenKodieren([1, 7, 3]))).toEqual([7, 3, 1]);
    expect(erinnerungenLesen('')).toEqual([]);
  });
});

describe('Terminumfragen', () => {
  const termin = {
    kategorieId: 'sitzung',
    jeTermin: false,
    beginn: '19:00',
    ende: '21:00',
    bedarf: null,
  };
  const terminUmfrage = (extra: Partial<UmfrageEingabe> = {}) =>
    eingabe({
      termin,
      fragen: [
        {
          text: '',
          freitext: true,
          maxAntworten: 1,
          optionen: [
            { text: '', termin: { datum: '2026-11-12', beginn: null, ende: null } },
            { text: '', termin: { datum: '2026-11-11', beginn: '18:00', ende: '20:00' } },
          ],
        },
      ],
      ...extra,
    });

  it('sorts the dates, generates their texts and allows several picks', () => {
    const u = umfrageEingabeSchema.parse(terminUmfrage());
    const frage = u.fragen[0]!;
    expect(frage.text).toBe('Welche Termine passen dir?');
    expect(frage).toMatchObject({ freitext: false, maxAntworten: null });
    expect(u.termin).toMatchObject({ vorlageId: null });
    // Without own times per date the given ones are dropped.
    expect(frage.optionen.map((o) => [o.text, o.termin])).toEqual([
      ['Mi, 11.11.2026', { datum: '2026-11-11', bis: null, beginn: null, ende: null }],
      ['Do, 12.11.2026', { datum: '2026-11-12', bis: null, beginn: null, ende: null }],
    ]);
  });

  it('writes date ranges and times into the answer', () => {
    expect(terminText({ datum: '2026-11-11', bis: null, beginn: '18:00', ende: '20:00' })).toBe(
      'Mi, 11.11.2026, 18:00–20:00',
    );
    expect(terminText({ datum: '2026-07-10', bis: '2026-07-12', beginn: null, ende: null })).toBe(
      'Fr, 10.07.2026 – So, 12.07.2026',
    );
    expect(
      terminText({ datum: '2026-07-10', bis: '2026-07-12', beginn: '18:00', ende: '14:00' }),
    ).toBe('Fr, 10.07.2026 18:00 – So, 12.07.2026 14:00');
  });

  it('needs one question, unique dates and no anonymity, but no title', () => {
    expect(umfrageEingabeSchema.safeParse(terminUmfrage({ titel: '' })).success).toBe(true);
    expect(umfrageEingabeSchema.safeParse(terminUmfrage({ anonym: true })).success).toBe(false);
    const doppelt = terminUmfrage();
    doppelt.fragen[0]!.optionen[1]!.termin!.datum = '2026-11-12';
    expect(umfrageEingabeSchema.safeParse(doppelt).success).toBe(false);
    const zwei = terminUmfrage();
    zwei.fragen.push(eingabe().fragen[0]!);
    expect(umfrageEingabeSchema.safeParse(zwei).success).toBe(false);
  });

  it('allows dates only in scheduling polls', () => {
    const ohne = terminUmfrage({ termin: null });
    expect(umfrageEingabeSchema.safeParse(ohne).success).toBe(false);
  });

  it('checks times and end dates against the Kategorie', () => {
    const o = (bis: string | null, beginn: string | null = null, ende: string | null = null) => ({
      termin: { datum: '2026-07-10', bis, beginn, ende },
    });
    const t = { ...termin, vorlageId: null };
    expect(terminDauerFehler(t, [o(null)], 'eintaegig')).toBeNull();
    expect(terminDauerFehler({ ...t, beginn: null }, [o(null)], 'eintaegig')).toMatch(/Beginn/);
    expect(terminDauerFehler(t, [o(null)], 'mehrtaegig')).toMatch(/Ende/);
    expect(terminDauerFehler({ ...t, jeTermin: true }, [o('2026-07-12')], 'mehrtaegig')).toMatch(
      /jedem Termin/,
    );
    expect(
      terminDauerFehler({ ...t, beginn: null, ende: null }, [o('2026-07-12')], 'ganztaegig'),
    ).toBeNull();
    expect(terminDauerFehler({ ...t, vorlageId: 'v' }, [o(null)], 'mehrtaegig')).toBeNull();
    const n = terminNormalisieren(
      { ...t, vorlageId: 'v', bedarf: { dienstformId: 'd', minimum: 1, wunsch: 1 } },
      [o('2026-07-12', '10:00', '12:00')],
      'mehrtaegig',
    );
    expect(n.termin).toMatchObject({ beginn: null, ende: null, bedarf: null });
    expect(n.optionen[0]!.termin).toEqual({
      datum: '2026-07-10',
      bis: null,
      beginn: null,
      ende: null,
    });
    expect(
      terminSpanne(
        { jeTermin: false, beginn: null, ende: null },
        o('2026-07-12').termin,
        'ganztaegig',
      ),
    ).toEqual({ beginn: '2026-07-09T22:00:00.000Z', ende: '2026-07-12T22:00:00.000Z' });
  });

  it('allows answering "none of the dates"', () => {
    const regel: FrageRegeln = {
      id: 'f',
      optionIds: ['a'],
      freitext: false,
      maxAntworten: null,
      leerErlaubt: true,
    };
    expect(stimmzettelFehler([regel], { antworten: [] })).toBeNull();
    expect(ungueltigNachAenderung([regel], [], ['u']).erneut).toEqual([]);
  });
});

describe('dienstVerteilung', () => {
  const p = (dienstformId: string, minimum: number, wunsch: number) => ({
    schichtId: 's',
    dienstformId,
    minimum,
    wunsch,
  });
  it('fills every Minimum first, then every Wunsch, then the rest in turn', () => {
    const plaetze = [p('bar', 1, 2), p('kasse', 1, 1)];
    expect(bedarfZusammen(plaetze)).toEqual({
      minimum: 2,
      wunsch: 3,
      dienstformIds: ['bar', 'kasse'],
    });
    const v = dienstVerteilung(plaetze, ['a', 'b', 'c', 'd']);
    expect(v.map((x) => [x.sub, x.platz.dienstformId])).toEqual([
      ['a', 'bar'],
      ['b', 'kasse'],
      ['c', 'bar'],
      ['d', 'kasse'],
    ]);
    expect(dienstVerteilung([], ['a'])).toEqual([]);
  });
});

describe('freie Terminfindung', () => {
  const frei = (extra: Partial<UmfrageEingabe> = {}) =>
    eingabe({
      terminFrei: true,
      fragen: [
        {
          text: '',
          freitext: true,
          maxAntworten: 1,
          optionen: [{ text: 'Mo abends' }, { text: 'Sa 14 Uhr' }],
        },
      ],
      ...extra,
    });
  it('allows several free-text dates and needs a title', () => {
    const u = umfrageEingabeSchema.parse(frei());
    expect(u.fragen[0]).toMatchObject({
      text: 'Welche Termine passen dir?',
      freitext: false,
      maxAntworten: null,
    });
    expect(umfrageEingabeSchema.safeParse(frei({ titel: '' })).success).toBe(false);
    expect(
      umfrageEingabeSchema.safeParse(
        frei({
          termin: { kategorieId: 'k', jeTermin: false, beginn: null, ende: null, bedarf: null },
        }),
      ).success,
    ).toBe(false);
  });
});
