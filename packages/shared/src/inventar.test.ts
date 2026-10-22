import { describe, expect, it } from 'vitest';
import {
  abweichungText,
  ausleiheAendernSchema,
  ausleihFehler,
  ausleiheSchema,
  gegenstandPlaetzeSchema,
  gegenstandSchema,
  ifcoInhaltSchema,
  ifcoSchema,
  inventarAbweichung,
  kategorieSchema,
  platzText,
  rueckgabeSchema,
  verliehenFehler,
  istVorgemerkt,
  blockierungText,
  blockierungen,
  datumDe,
  offenAufteilen,
  ausleiheStatus,
  verliehenJePlatz,
  type Beschriftung,
  type PlatzMenge,
} from './inventar';

const orte = [
  { id: 'lager', parentId: null, name: 'Lager' },
  { id: 'regal', parentId: 'lager', name: 'Regal 1' },
];
const ifcos = [
  { id: 'i1', name: 'Spanngurtkiste', lagerortId: 'regal' },
  { id: 'i2', name: 'Kabelkiste', lagerortId: null },
];
const menge = (
  gegenstandId: string,
  ziel: { l?: string; i?: string },
  anzahl: number,
): PlatzMenge => ({
  gegenstandId,
  lagerortId: ziel.l ?? null,
  ifcoId: ziel.i ?? null,
  anzahl,
});
const namen: Beschriftung = {
  gegenstand: (id) => (id === 'g1' ? 'Kabeltrommel' : id),
  platz: (z) => platzText(orte, ifcos, z),
};

describe('kategorieSchema / gegenstandSchema / ifcoSchema', () => {
  it('normalises category and Ifco input', () => {
    expect(kategorieSchema.parse({ name: ' Technik ' })).toEqual({
      name: 'Technik',
      parentId: null,
    });
    expect(ifcoSchema.parse({ name: 'Kiste', beschreibung: ' ' })).toEqual({
      name: 'Kiste',
      beschreibung: null,
      lagerortId: null,
      typId: null,
    });
    expect(ifcoSchema.parse({ name: 'Kiste', lagerortId: 'regal' }).lagerortId).toBe('regal');
    expect(ifcoSchema.parse({ name: 'Kiste', typId: 't1' }).typId).toBe('t1');
  });
  it('defaults the Anzahl of a Gegenstand to 1 and rejects invalid values', () => {
    expect(gegenstandSchema.parse({ name: 'Beamer', kategorieId: 'k' }).anzahl).toBe(1);
    expect(
      gegenstandSchema.safeParse({ name: 'Beamer', kategorieId: 'k', anzahl: 0 }).success,
    ).toBe(false);
    expect(
      gegenstandSchema.safeParse({ name: 'Beamer', kategorieId: 'k', anzahl: 1.5 }).success,
    ).toBe(false);
    expect(gegenstandSchema.safeParse({ name: 'Beamer', kategorieId: '' }).success).toBe(false);
    expect(gegenstandSchema.safeParse({ name: ' ', kategorieId: 'k' }).success).toBe(false);
  });
});

describe('gegenstandPlaetzeSchema', () => {
  it('accepts an empty list and places at a Lagerort or an Ifco', () => {
    expect(gegenstandPlaetzeSchema.safeParse({ plaetze: [] }).success).toBe(true);
    const ok = gegenstandPlaetzeSchema.parse({
      plaetze: [
        { lagerortId: 'regal', anzahl: 6 },
        { ifcoId: 'i1', anzahl: 4 },
      ],
    });
    expect(ok.plaetze[0]).toEqual({ lagerortId: 'regal', ifcoId: null, anzahl: 6 });
  });
  it('needs exactly one target, a positive Anzahl and unique targets', () => {
    const fehler = (plaetze: unknown[]) => gegenstandPlaetzeSchema.safeParse({ plaetze }).success;
    expect(fehler([{ anzahl: 1 }])).toBe(false);
    expect(fehler([{ lagerortId: 'a', ifcoId: 'b', anzahl: 1 }])).toBe(false);
    expect(fehler([{ lagerortId: 'a', anzahl: 0 }])).toBe(false);
    expect(
      fehler([
        { lagerortId: 'a', anzahl: 1 },
        { lagerortId: 'a', anzahl: 2 },
      ]),
    ).toBe(false);
    expect(
      fehler([
        { lagerortId: 'a', anzahl: 1 },
        { ifcoId: 'a', anzahl: 2 },
      ]),
    ).toBe(true);
  });
});

describe('ifcoInhaltSchema', () => {
  it('rejects duplicate Gegenstände and non-positive amounts', () => {
    expect(ifcoInhaltSchema.safeParse({ positionen: [] }).success).toBe(true);
    expect(
      ifcoInhaltSchema.safeParse({
        positionen: [
          { gegenstandId: 'g', anzahl: 1 },
          { gegenstandId: 'g', anzahl: 2 },
        ],
      }).success,
    ).toBe(false);
    expect(
      ifcoInhaltSchema.safeParse({ positionen: [{ gegenstandId: 'g', anzahl: 0 }] }).success,
    ).toBe(false);
  });
});

describe('ausleiheSchema / rueckgabeSchema', () => {
  const kopf = { an: ' Feuerwehr ', ausgeliehenAm: '2026-05-01T10:00:00.000Z' };
  it('parses a valid Ausleihe', () => {
    const a = ausleiheSchema.parse({
      ...kopf,
      rueckgabeGeplant: '2026-05-08',
      positionen: [
        { gegenstandId: 'g1', lagerortId: 'regal', anzahl: 3 },
        { gegenstandId: 'g1', ifcoId: 'i1', anzahl: 2 },
      ],
    });
    expect(a.an).toBe('Feuerwehr');
    expect(a.kommentar).toBeNull();
    expect(a.positionen).toHaveLength(2);
  });
  it('rejects empty, duplicate and ambiguous positions and a missing recipient', () => {
    const position = { gegenstandId: 'g1', lagerortId: 'regal', anzahl: 1 };
    expect(ausleiheSchema.safeParse({ ...kopf, positionen: [] }).success).toBe(false);
    expect(ausleiheSchema.safeParse({ ...kopf, positionen: [position, position] }).success).toBe(
      false,
    );
    expect(
      ausleiheSchema.safeParse({ ...kopf, positionen: [{ ...position, ifcoId: 'i1' }] }).success,
    ).toBe(false);
    expect(ausleiheSchema.safeParse({ ...kopf, an: ' ', positionen: [position] }).success).toBe(
      false,
    );
    expect(
      ausleiheSchema.safeParse({ ...kopf, rueckgabeGeplant: 'morgen', positionen: [position] })
        .success,
    ).toBe(false);
  });
  it('edits only the header', () => {
    expect(ausleiheAendernSchema.parse(kopf)).toMatchObject({ an: 'Feuerwehr' });
  });
  it('needs unique, non-empty position ids and a time', () => {
    const zurueckAm = '2026-05-02T10:00:00.000Z';
    expect(rueckgabeSchema.safeParse({ positionIds: ['p1'], zurueckAm }).success).toBe(true);
    expect(rueckgabeSchema.safeParse({ positionIds: [], zurueckAm }).success).toBe(false);
    expect(rueckgabeSchema.safeParse({ positionIds: ['p1', 'p1'], zurueckAm }).success).toBe(false);
    expect(rueckgabeSchema.safeParse({ positionIds: ['p1'], zurueckAm: 'x' }).success).toBe(false);
  });
});

describe('inventarAbweichung / abweichungText', () => {
  it('compares the sum of the Plätze with the target', () => {
    expect(inventarAbweichung(10, [{ anzahl: 6 }, { anzahl: 2 }])).toEqual({
      summe: 8,
      differenz: -2,
    });
    expect(inventarAbweichung(1, [])).toEqual({ summe: 0, differenz: -1 });
    expect(inventarAbweichung(2, [{ anzahl: 3 }]).differenz).toBe(1);
  });
  it('words the difference', () => {
    expect(abweichungText(-2)).toBe('2 ohne Platz');
    expect(abweichungText(1)).toBe('1 mehr als Soll');
    expect(abweichungText(0)).toBeNull();
  });
});

describe('platzText', () => {
  it('shows the path of a Lagerort and the Ifco with its place', () => {
    expect(platzText(orte, ifcos, { lagerortId: 'regal', ifcoId: null })).toBe('Lager › Regal 1');
    expect(platzText(orte, ifcos, { lagerortId: null, ifcoId: 'i1' })).toBe(
      'Spanngurtkiste · Lager › Regal 1',
    );
    expect(platzText(orte, ifcos, { lagerortId: null, ifcoId: 'i2' })).toBe(
      'Kabelkiste · ohne Platz',
    );
  });
});

describe('verliehenJePlatz', () => {
  it('sums the open amounts per Gegenstand and place', () => {
    const summen = verliehenJePlatz([
      menge('g1', { l: 'regal' }, 3),
      menge('g1', { l: 'regal' }, 1),
      menge('g1', { i: 'i1' }, 2),
      menge('g2', { l: 'regal' }, 5),
    ]);
    expect(summen.size).toBe(3);
    expect(summen.get(`g1\u0000l:regal`)).toBe(4);
    expect(summen.get(`g1\u0000i:i1`)).toBe(2);
  });
});

describe('ausleihFehler', () => {
  const plaetze = [menge('g1', { l: 'regal' }, 6), menge('g1', { i: 'i1' }, 4)];
  const offen = [menge('g1', { l: 'regal' }, 4)];
  it('allows up to the free amount', () => {
    expect(ausleihFehler(plaetze, offen, [menge('g1', { l: 'regal' }, 2)], namen)).toBeNull();
    expect(
      ausleihFehler(
        plaetze,
        offen,
        [menge('g1', { l: 'regal' }, 2), menge('g1', { i: 'i1' }, 4)],
        namen,
      ),
    ).toBeNull();
  });
  it('names Gegenstand and place when too much is taken', () => {
    expect(ausleihFehler(plaetze, offen, [menge('g1', { l: 'regal' }, 3)], namen)).toBe(
      'Von „Kabeltrommel“ sind bei „Lager › Regal 1“ nur noch 2 verfügbar.',
    );
    expect(
      ausleihFehler(plaetze, [menge('g1', { i: 'i1' }, 4)], [menge('g1', { i: 'i1' }, 1)], namen),
    ).toBe('Von „Kabeltrommel“ ist bei „Spanngurtkiste · Lager › Regal 1“ nichts mehr verfügbar.');
  });
  it('rejects places the Gegenstand is not assigned to', () => {
    expect(ausleihFehler(plaetze, [], [menge('g1', { l: 'lager' }, 1)], namen)).toBe(
      '„Kabeltrommel“ ist nicht bei „Lager“ eingelagert.',
    );
  });
});

describe('verliehenFehler', () => {
  const offen = [menge('g1', { l: 'regal' }, 3)];
  it('allows assignments that keep the lent amount', () => {
    expect(verliehenFehler([menge('g1', { l: 'regal' }, 3)], offen)).toBeNull();
    expect(verliehenFehler([menge('g1', { l: 'regal' }, 5)], offen)).toBeNull();
    expect(verliehenFehler([], [])).toBeNull();
  });
  it('rejects lowering or removing a place below the lent amount', () => {
    expect(verliehenFehler([menge('g1', { l: 'regal' }, 2)], offen, namen)).toBe(
      '„Kabeltrommel“ bei „Lager › Regal 1“: Davon sind noch 3 verliehen oder vorgemerkt.',
    );
    expect(verliehenFehler([menge('g1', { i: 'i1' }, 9)], offen, namen)).toContain(
      'Davon sind noch 3 verliehen oder vorgemerkt.',
    );
  });
});

describe('istVorgemerkt / offenAufteilen / ausleiheStatus', () => {
  const jetzt = new Date('2026-10-21T12:00:00.000Z');
  it('treats only a start after now as vorgemerkt', () => {
    expect(istVorgemerkt('2026-10-21T12:00:01.000Z', jetzt)).toBe(true);
    expect(istVorgemerkt('2026-10-21T12:00:00.000Z', jetzt)).toBe(false);
    expect(istVorgemerkt(new Date('2026-10-01T00:00:00.000Z'), jetzt)).toBe(false);
  });
  it('splits open positions by start', () => {
    const a = { id: 'a', ausgeliehenAm: '2026-10-01T00:00:00.000Z' };
    const b = { id: 'b', ausgeliehenAm: new Date('2026-10-25T00:00:00.000Z') };
    const { verliehen, vorgemerkt } = offenAufteilen([a, b], jetzt);
    expect(verliehen).toEqual([a]);
    expect(vorgemerkt).toEqual([b]);
  });
  it('derives the Ausleihe status', () => {
    const offen = [{ zurueckAm: null }];
    expect(ausleiheStatus('2026-10-25T00:00:00.000Z', offen, jetzt)).toBe('geplant');
    expect(ausleiheStatus('2026-10-01T00:00:00.000Z', offen, jetzt)).toBe('verliehen');
    expect(ausleiheStatus('2026-10-01T00:00:00.000Z', [{ zurueckAm: 'x' }, ...offen], jetzt)).toBe(
      'verliehen',
    );
    expect(ausleiheStatus('2026-10-25T00:00:00.000Z', [{ zurueckAm: 'x' }], jetzt)).toBe(
      'erledigt',
    );
  });
});

describe('Blockierung: who holds the pieces', () => {
  const jetzt = new Date('2026-10-21T12:00:00.000Z');
  const pos = (an: string, anzahl: number, ausgeliehenAm: string) => ({
    ...menge('g1', { l: 'regal' }, anzahl),
    an,
    ausleiheId: `a-${an}`,
    ausgeliehenAm,
  });
  const offen = [
    pos('Jugendgruppe', 2, '2026-10-25T10:00:00.000Z'),
    pos('Feuerwehr Musterdorf', 3, '2026-10-20T08:00:00.000Z'),
  ];
  it('formats dates in German', () => {
    expect(datumDe('2026-10-20T23:30:00.000Z')).toBe('21.10.2026');
  });
  it('lists verliehen first, then vorgemerkt', () => {
    expect(
      blockierungText(
        blockierungen(offen, { gegenstandId: 'g1', lagerortId: 'regal', ifcoId: null }, jetzt),
      ),
    ).toBe(
      '3 an Feuerwehr Musterdorf verliehen (seit 20.10.2026), 2 an Jugendgruppe vorgemerkt (ab 25.10.2026)',
    );
  });
  it('names the borrowers in ausleihFehler', () => {
    const plaetze = [menge('g1', { l: 'regal' }, 6)];
    expect(ausleihFehler(plaetze, offen, [menge('g1', { l: 'regal' }, 2)], namen, jetzt)).toBe(
      'Von „Kabeltrommel“ sind bei „Lager › Regal 1“ nur noch 1 verfügbar: 3 an Feuerwehr Musterdorf verliehen (seit 20.10.2026), 2 an Jugendgruppe vorgemerkt (ab 25.10.2026).',
    );
  });
  it('names the borrowers in verliehenFehler', () => {
    expect(verliehenFehler([menge('g1', { l: 'regal' }, 2)], offen, namen, jetzt)).toBe(
      '„Kabeltrommel“ bei „Lager › Regal 1“: Davon sind noch 5 verliehen oder vorgemerkt: 3 an Feuerwehr Musterdorf verliehen (seit 20.10.2026), 2 an Jugendgruppe vorgemerkt (ab 25.10.2026).',
    );
  });
});
