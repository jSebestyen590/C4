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
  ifcoInhaltAnwenden,
  ueberfuehrteMenge,
  sollZuKleinFehler,
  zuVielVerteiltFehler,
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
  ganzeIfcoFehler,
  gefaehrdungen,
  positionenGruppieren,
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
  it('normalises category and IFCO input', () => {
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
  it('accepts an empty list and places at a Lagerort or an IFCO', () => {
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
  const kopf = {
    an: ' Feuerwehr ',
    organisiertVon: 'sub-1',
    ausgeliehenAm: '2026-05-01T10:00:00.000Z',
    rueckgabeGeplant: '2026-05-08',
  };
  it('requires a return day that is not before the start day', () => {
    const position = { gegenstandId: 'g1', lagerortId: 'regal', anzahl: 1 };
    const ohne = { ...kopf, rueckgabeGeplant: undefined };
    for (const schema of [ausleiheSchema, ausleiheAendernSchema]) {
      const eingabe = (k: object) => ({ ...k, positionen: [position] });
      const r = schema.safeParse(eingabe(ohne));
      expect(r.success).toBe(false);
      expect(!r.success && r.error.issues[0]?.message).toBe('Bitte gib an, wann es zurückkommt.');
      expect(schema.safeParse(eingabe({ ...ohne, rueckgabeGeplant: null })).success).toBe(false);
      expect(schema.safeParse(eingabe({ ...kopf, rueckgabeGeplant: '2026-04-30' })).success).toBe(
        false,
      );
      expect(schema.safeParse(eingabe({ ...kopf, rueckgabeGeplant: '2026-05-01' })).success).toBe(
        true,
      );
    }
  });
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
  it('needs an organiser', () => {
    const position = { gegenstandId: 'g1', lagerortId: 'regal', anzahl: 1 };
    const ohne = { an: kopf.an, ausgeliehenAm: kopf.ausgeliehenAm };
    expect(ausleiheSchema.safeParse({ ...ohne, positionen: [position] }).success).toBe(false);
    expect(
      ausleiheSchema.safeParse({ ...kopf, organisiertVon: '', positionen: [position] }).success,
    ).toBe(false);
    expect(ausleiheAendernSchema.safeParse(ohne).success).toBe(false);
  });
  it('accepts ganzeIfco only together with an IFCO', () => {
    const inIfco = { gegenstandId: 'g1', ifcoId: 'i1', anzahl: 2, ganzeIfco: true };
    expect(ausleiheSchema.parse({ ...kopf, positionen: [inIfco] }).positionen[0]?.ganzeIfco).toBe(
      true,
    );
    const amLager = { gegenstandId: 'g1', lagerortId: 'regal', anzahl: 2, ganzeIfco: true };
    expect(ausleiheSchema.safeParse({ ...kopf, positionen: [amLager] }).success).toBe(false);
    expect(
      ausleiheSchema.safeParse({ ...kopf, positionen: [{ ...inIfco, ganzeIfco: false }] }).success,
    ).toBe(false);
  });
  it('edits only the header', () => {
    expect(ausleiheAendernSchema.parse(kopf)).toMatchObject({
      an: 'Feuerwehr',
      organisiertVon: 'sub-1',
    });
  });
  it('needs unique, non-empty position ids and a time', () => {
    const zurueckAm = '2026-05-02T10:00:00.000Z';
    expect(rueckgabeSchema.safeParse({ positionIds: ['p1'], zurueckAm }).success).toBe(true);
    expect(rueckgabeSchema.safeParse({ positionIds: [], zurueckAm }).success).toBe(false);
    expect(rueckgabeSchema.safeParse({ positionIds: ['p1', 'p1'], zurueckAm }).success).toBe(false);
    expect(rueckgabeSchema.safeParse({ positionIds: ['p1'], zurueckAm: 'x' }).success).toBe(false);
  });
});

describe('ifcoInhaltAnwenden / ueberfuehrteMenge', () => {
  const regal = { lagerortId: 'l1', ifcoId: null };
  const plaetze = [
    { gegenstandId: 'g', ...regal, anzahl: 6 },
    { gegenstandId: 'g', lagerortId: null, ifcoId: 'i', anzahl: 1 },
    { gegenstandId: 'h', ...regal, anzahl: 2 },
  ];
  it('moves the added pieces from the Herkunft and replaces the IFCO rows', () => {
    const p = { gegenstandId: 'g', anzahl: 4, herkunft: regal };
    expect(ueberfuehrteMenge(plaetze, 'i', p)).toBe(3);
    expect(ifcoInhaltAnwenden(plaetze, 'i', [p])).toEqual({
      plaetze: [
        { gegenstandId: 'g', ...regal, anzahl: 3 },
        { gegenstandId: 'h', ...regal, anzahl: 2 },
        { gegenstandId: 'g', lagerortId: null, ifcoId: 'i', anzahl: 4 },
      ],
      ungueltig: null,
    });
  });
  it('takes at most what lies there and drops an emptied place', () => {
    const p = { gegenstandId: 'h', anzahl: 5, herkunft: regal };
    expect(ueberfuehrteMenge(plaetze, 'i', p)).toBe(2);
    const neu = ifcoInhaltAnwenden(plaetze, 'i', [p]).plaetze;
    expect(neu.filter((x) => x.gegenstandId === 'h')).toEqual([
      { gegenstandId: 'h', lagerortId: null, ifcoId: 'i', anzahl: 5 },
    ]);
  });
  it('moves nothing without Herkunft or when the amount does not grow', () => {
    expect(ueberfuehrteMenge(plaetze, 'i', { gegenstandId: 'g', anzahl: 4, herkunft: null })).toBe(
      0,
    );
    expect(ueberfuehrteMenge(plaetze, 'i', { gegenstandId: 'g', anzahl: 1, herkunft: regal })).toBe(
      0,
    );
  });
  it('flags a Herkunft that is not another Platz of the Gegenstand', () => {
    const fremd = { lagerortId: 'l9', ifcoId: null };
    expect(
      ifcoInhaltAnwenden(plaetze, 'i', [{ gegenstandId: 'g', anzahl: 2, herkunft: fremd }])
        .ungueltig,
    ).toBe('g');
    const selbst = { lagerortId: null, ifcoId: 'i' };
    expect(
      ifcoInhaltAnwenden(plaetze, 'i', [{ gegenstandId: 'g', anzahl: 2, herkunft: selbst }])
        .ungueltig,
    ).toBe('g');
  });
});

describe('zuVielVerteiltFehler / sollZuKleinFehler', () => {
  it('refuses putting more pieces on places than exist', () => {
    expect(zuVielVerteiltFehler('Schalter', 10, 8, 10)).toBeNull();
    expect(zuVielVerteiltFehler('Schalter', 10, 8, 11)).toBe(
      '„Schalter“ gibt es nur 10-mal, zugeordnet wären 11. Nimm zuerst an einem anderen Platz etwas weg oder erhöhe die Anzahl (Soll).',
    );
  });
  it('lets an over-assigned Gegenstand change as long as the sum does not grow', () => {
    expect(zuVielVerteiltFehler('Schalter', 10, 21, 21)).toBeNull();
    expect(zuVielVerteiltFehler('Schalter', 10, 21, 15)).toBeNull();
    expect(zuVielVerteiltFehler('Schalter', 10, 21, 22)).not.toBeNull();
  });
  it('refuses lowering the Soll below the assigned pieces, but allows raising it', () => {
    expect(sollZuKleinFehler(8, 10, 9)).toBe(
      'Es sind schon 9 Stück zugeordnet. Nimm zuerst an den Plätzen etwas weg.',
    );
    expect(sollZuKleinFehler(9, 10, 9)).toBeNull();
    expect(sollZuKleinFehler(15, 10, 21)).toBeNull();
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
  it('shows the path of a Lagerort and the IFCO with its place', () => {
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

/** An open-ended period from the test day on: every open position without return date blocks. */
const Z = { von: '2026-10-21', bis: null };

describe('ausleihFehler', () => {
  const plaetze = [menge('g1', { l: 'regal' }, 6), menge('g1', { i: 'i1' }, 4)];
  const offen = [menge('g1', { l: 'regal' }, 4)];
  it('allows up to the free amount', () => {
    expect(
      ausleihFehler(plaetze, offen, [menge('g1', { l: 'regal' }, 2)], Z, { beschriftung: namen }),
    ).toBeNull();
    expect(
      ausleihFehler(
        plaetze,
        offen,
        [menge('g1', { l: 'regal' }, 2), menge('g1', { i: 'i1' }, 4)],
        Z,
        { beschriftung: namen },
      ),
    ).toBeNull();
  });
  it('names Gegenstand and place when too much is taken', () => {
    expect(
      ausleihFehler(plaetze, offen, [menge('g1', { l: 'regal' }, 3)], Z, { beschriftung: namen }),
    ).toBe('Von „Kabeltrommel“ sind bei „Lager › Regal 1“ nur noch 2 verfügbar.');
    expect(
      ausleihFehler(plaetze, [menge('g1', { i: 'i1' }, 4)], [menge('g1', { i: 'i1' }, 1)], Z, {
        beschriftung: namen,
      }),
    ).toBe('Von „Kabeltrommel“ ist bei „Spanngurtkiste · Lager › Regal 1“ nichts mehr verfügbar.');
  });
  it('rejects places the Gegenstand is not assigned to', () => {
    expect(
      ausleihFehler(plaetze, [], [menge('g1', { l: 'lager' }, 1)], Z, { beschriftung: namen }),
    ).toBe('„Kabeltrommel“ ist nicht bei „Lager“ eingelagert.');
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
    expect(
      ausleihFehler(plaetze, offen, [menge('g1', { l: 'regal' }, 2)], Z, {
        beschriftung: namen,
        jetzt,
      }),
    ).toBe(
      'Von „Kabeltrommel“ sind bei „Lager › Regal 1“ nur noch 1 verfügbar: 3 an Feuerwehr Musterdorf verliehen (seit 20.10.2026), 2 an Jugendgruppe vorgemerkt (ab 25.10.2026).',
    );
  });
  it('names the borrowers in verliehenFehler', () => {
    expect(verliehenFehler([menge('g1', { l: 'regal' }, 2)], offen, namen, jetzt)).toBe(
      '„Kabeltrommel“ bei „Lager › Regal 1“: Davon sind noch 5 verliehen oder vorgemerkt: 3 an Feuerwehr Musterdorf verliehen (seit 20.10.2026), 2 an Jugendgruppe vorgemerkt (ab 25.10.2026).',
    );
  });
  it('counts only the highest simultaneous occupancy in verliehenFehler', () => {
    const nacheinander = [
      { ...pos('A', 3, '2026-10-22T10:00:00.000Z'), rueckgabeGeplant: '2026-10-24' },
      { ...pos('B', 2, '2026-10-24T10:00:00.000Z'), rueckgabeGeplant: '2026-10-26' },
    ];
    expect(
      verliehenFehler([menge('g1', { l: 'regal' }, 3)], nacheinander, namen, jetzt),
    ).toBeNull();
    expect(verliehenFehler([menge('g1', { l: 'regal' }, 2)], nacheinander, namen, jetzt)).toContain(
      'noch 3 verliehen oder vorgemerkt: 3 an A vorgemerkt (22.10.–24.10.2026), 2 an B vorgemerkt (24.10.–26.10.2026)',
    );
  });
});

describe('positionenGruppieren', () => {
  const pos = (id: string, ifcoId: string | null, ganzeIfco?: boolean | null) => ({
    id,
    ifcoId,
    ganzeIfco,
  });
  it('groups the positions of a whole IFCO and keeps the rest single', () => {
    const liste = [
      pos('a', null),
      pos('b', 'i1', true),
      pos('c', 'i1', false),
      pos('d', 'i2', true),
      pos('e', 'i1', true),
      pos('f', 'i1', null),
    ];
    const r = positionenGruppieren(liste);
    expect(
      r.map((e) => (e.art === 'einzeln' ? e.position.id : e.positionen.map((p) => p.id).join('+'))),
    ).toEqual(['a', 'b+e', 'c', 'd', 'f']);
    expect(r[1]).toMatchObject({ art: 'ifco', ifcoId: 'i1' });
  });
  it('returns nothing for nothing', () => {
    expect(positionenGruppieren([])).toEqual([]);
  });
});

describe('ganzeIfcoFehler', () => {
  const inhalt = [menge('g1', { i: 'i1' }, 4), menge('g2', { i: 'i1' }, 2)];
  const ganz = (g: string, anzahl: number, ganzeIfco = true) => ({
    ...menge(g, { i: 'i1' }, anzahl),
    ganzeIfco,
  });
  it('accepts the complete available content', () => {
    expect(
      ganzeIfcoFehler(inhalt, [], [ganz('g1', 4), ganz('g2', 2)], Z, { beschriftung: namen }),
    ).toBeNull();
  });
  it('subtracts what is already lent', () => {
    const offen = [menge('g1', { i: 'i1' }, 1), menge('g2', { i: 'i1' }, 2)];
    expect(ganzeIfcoFehler(inhalt, offen, [ganz('g1', 3)], Z, { beschriftung: namen })).toBeNull();
  });
  it('needs every available Gegenstand in full', () => {
    expect(ganzeIfcoFehler(inhalt, [], [ganz('g1', 4)], Z, { beschriftung: namen })).toContain(
      'angegeben sind 0',
    );
    expect(
      ganzeIfcoFehler(inhalt, [], [ganz('g1', 3), ganz('g2', 2)], Z, { beschriftung: namen }),
    ).toContain('sind 4 verfügbar, angegeben sind 3');
  });
  it('rejects unflagged positions of the same IFCO and an empty IFCO', () => {
    expect(
      ganzeIfcoFehler(inhalt, [], [ganz('g1', 4), ganz('g2', 2, false)], Z, {
        beschriftung: namen,
      }),
    ).toContain('Alle ihre Positionen');
    const leer = [menge('g1', { i: 'i1' }, 4), menge('g2', { i: 'i1' }, 2)];
    expect(ganzeIfcoFehler(inhalt, leer, [ganz('g1', 4)], Z, { beschriftung: namen })).toContain(
      'nichts verfügbar',
    );
  });
  it('ignores lendings without the flag', () => {
    expect(
      ganzeIfcoFehler(inhalt, [], [{ ...menge('g1', { i: 'i1' }, 1) }], Z, { beschriftung: namen }),
    ).toBeNull();
  });
});

describe('period based availability', () => {
  const heute = new Date('2026-10-21T12:00:00.000Z');
  const pos = (
    an: string,
    anzahl: number,
    von: string,
    rueckgabe: string | null,
    ausleiheId = `a-${an}`,
  ) => ({
    ...menge('g1', { l: 'regal' }, anzahl),
    an,
    ausleiheId,
    ausgeliehenAm: von,
    rueckgabeGeplant: rueckgabe,
  });
  const plaetze = [menge('g1', { l: 'regal' }, 5)];
  const tage = (von: string, bis: string | null) => ({ von, bis });
  const fehler = (
    offen: ReturnType<typeof pos>[],
    anzahl: number,
    z: ReturnType<typeof tage>,
    ohne?: string,
  ) =>
    ausleihFehler(plaetze, offen, [menge('g1', { l: 'regal' }, anzahl)], z, {
      beschriftung: namen,
      jetzt: heute,
      ohneAusleiheId: ohne,
    });

  it('accepts a reservation that does not overlap an existing one', () => {
    const offen = [pos('Feuerwehr', 5, '2026-10-25T08:00:00.000Z', '2026-10-27')];
    expect(fehler(offen, 5, tage('2026-10-28', '2026-10-30'))).toBeNull();
    expect(fehler(offen, 5, tage('2026-10-21', '2026-10-25'))).toBeNull();
  });
  it('rejects an overlapping reservation and names only the overlapping Ausleihen with periods', () => {
    const offen = [
      pos('Feuerwehr', 3, '2026-10-20T08:00:00.000Z', '2026-10-27'),
      pos('Jugendgruppe', 2, '2026-10-25T08:00:00.000Z', '2026-10-26'),
      pos('Spaeter', 1, '2026-11-20T08:00:00.000Z', '2026-11-22'),
    ];
    expect(fehler(offen, 3, tage('2026-10-26', '2026-10-28'))).toBe(
      'Von „Kabeltrommel“ sind bei „Lager › Regal 1“ nur noch 2 verfügbar: 3 an Feuerwehr verliehen (20.10.–27.10.2026).',
    );
    expect(fehler(offen, 1, tage('2026-10-25', '2026-10-28'))).toBe(
      'Von „Kabeltrommel“ ist bei „Lager › Regal 1“ nichts mehr verfügbar: 3 an Feuerwehr verliehen (20.10.–27.10.2026), 2 an Jugendgruppe vorgemerkt (25.10.–26.10.2026).',
    );
  });
  it('lets a new Ausleihe start on the return day of another', () => {
    const offen = [pos('Feuerwehr', 5, '2026-10-20T08:00:00.000Z', '2026-10-27')];
    expect(fehler(offen, 5, tage('2026-10-27', '2026-10-29'))).toBeNull();
    expect(fehler(offen, 1, tage('2026-10-26', '2026-10-29'))).not.toBeNull();
  });
  it('leaves out the edited Ausleihe itself', () => {
    const offen = [pos('Feuerwehr', 5, '2026-10-22T08:00:00.000Z', '2026-10-24', 'eigene')];
    expect(fehler(offen, 5, tage('2026-10-22', '2026-10-26'))).not.toBeNull();
    expect(fehler(offen, 5, tage('2026-10-22', '2026-10-26'), 'eigene')).toBeNull();
  });
  it('names an overdue Ausleihe as überfällig seit', () => {
    const offen = [pos('Feuerwehr', 5, '2026-10-10T08:00:00.000Z', '2026-10-15')];
    expect(fehler(offen, 1, tage('2026-10-21', '2026-10-22'))).toBe(
      'Von „Kabeltrommel“ ist bei „Lager › Regal 1“ nichts mehr verfügbar: 5 an Feuerwehr verliehen (überfällig seit 15.10.2026).',
    );
    expect(fehler(offen, 5, tage('2026-10-22', '2026-10-23'))).toBeNull();
  });
  it('treats Ausleihen without return day as open-ended and ignores nothing before today', () => {
    const offen = [pos('Alt', 4, '2026-10-01T08:00:00.000Z', null)];
    expect(fehler(offen, 2, tage('2027-03-01', '2027-03-02'))).toContain('nur noch 1 verfügbar');
  });
  it('uses the highest simultaneous occupancy, not the sum', () => {
    const offen = [
      pos('A', 2, '2026-10-22T08:00:00.000Z', '2026-10-24'),
      pos('B', 2, '2026-10-24T08:00:00.000Z', '2026-10-26'),
      pos('C', 1, '2026-10-23T08:00:00.000Z', '2026-10-25'),
    ];
    // max over the days: 22: 2, 23: 3, 24: 3, 25: 2 -> 2 free in the window
    expect(fehler(offen, 2, tage('2026-10-22', '2026-10-26'))).toBeNull();
    expect(fehler(offen, 3, tage('2026-10-22', '2026-10-26'))).toContain('nur noch 2 verfügbar');
    expect(fehler(offen, 5, tage('2026-10-26', '2026-10-27'))).toBeNull();
  });
  it('flags later Ausleihen as gefährdet by overdue ones that would not fit without them', () => {
    const offen = [
      pos('Feuerwehr', 4, '2026-10-10T08:00:00.000Z', '2026-10-15'),
      pos('Jugend', 2, '2026-10-28T08:00:00.000Z', '2026-10-30'),
      pos('Verein', 1, '2026-10-28T08:00:00.000Z', '2026-10-30'),
    ];
    const r = gefaehrdungen(plaetze, offen, heute);
    expect([...r.keys()].sort()).toEqual(['a-Jugend', 'a-Verein']);
    expect(r.get('a-Jugend')).toEqual([{ id: 'a-Feuerwehr', an: 'Feuerwehr' }]);
    expect(gefaehrdungen(plaetze, [offen[1]!, offen[2]!], heute).size).toBe(0);
  });
  it('sums the whole-IFCO content with the same period availability', () => {
    const inhalt = [menge('g1', { i: 'i1' }, 4)];
    const offen = [
      {
        ...menge('g1', { i: 'i1' }, 4),
        an: 'X',
        ausleiheId: 'x',
        ausgeliehenAm: '2026-10-25T08:00:00.000Z',
        rueckgabeGeplant: '2026-10-27',
      },
    ];
    const ganz = { ...menge('g1', { i: 'i1' }, 4), ganzeIfco: true };
    expect(
      ganzeIfcoFehler(inhalt, offen, [ganz], tage('2026-10-28', '2026-10-29'), { jetzt: heute }),
    ).toBeNull();
    expect(
      ganzeIfcoFehler(inhalt, offen, [ganz], tage('2026-10-26', '2026-10-29'), { jetzt: heute }),
    ).toContain('nichts verfügbar');
  });
});
