import { describe, expect, it } from 'vitest';
import {
  basisGebinde,
  bestandAnzeigen,
  bestandZu,
  baumBauen,
  centAnzeigen,
  einlagerungSchema,
  entnahmePlanen,
  entnahmeSchema,
  gebindeErgaenzen,
  gebindeFehler,
  gebindeSchema,
  gesamtPfandCent,
  inBasiseinheiten,
  inventurKorrekturen,
  inventurZaehlungSchema,
  mhdAnzeigen,
  mhdNormalisieren,
  oberstesLager,
  pfad,
  teilbaumIds,
  tiefensuche,
  verlauf,
  verlaufSerien,
  wareSchema,
  type Buchung,
  type Buchungszeile,
  type Gebinde,
} from './waren';

const F: Gebinde = {
  id: 'F',
  name: '0,5l Flasche',
  pfandCent: 8,
  unterGebindeId: null,
  unterAnzahl: null,
};
const K: Gebinde = {
  id: 'K',
  name: '20×0,5l Kasten',
  pfandCent: 150,
  unterGebindeId: 'F',
  unterAnzahl: 20,
};
const ALLE = [F, K];

const knoten = (id: string, parentId: string | null, name = id, position = 0) => ({
  id,
  parentId,
  name,
  position,
});
const LAGER = [knoten('L1', null, 'Lager 1'), knoten('L2', null, 'Lager 2')];

const buchung = (
  zeitpunkt: string,
  lagerortId: string,
  gebindeId: string,
  mhd: string | null,
  menge: number,
  art: Buchung['art'] = 'zugang',
  vorgangId = zeitpunkt,
): Buchung => ({ vorgangId, zeitpunkt, wareId: 'krosti', lagerortId, gebindeId, mhd, menge, art });

const plan = (
  posten: Parameters<typeof entnahmePlanen>[0]['posten'],
  gebindeId: string,
  anzahl: number,
  lagerortId = 'L1',
) => entnahmePlanen({ posten, gebinde: ALLE, gebindeId, anzahl, lagerortId });

const alsBuchungen = (zeitpunkt: string, zeilen: Buchungszeile[]) =>
  zeilen.map((z) => buchung(zeitpunkt, z.lagerortId, z.gebindeId, z.mhd, z.menge, z.art));

describe('Krosti scenario', () => {
  const t1 = '2027-01-01T00:00:00Z';
  const t2 = '2027-01-01T11:23:00Z';
  const t3 = '2027-01-02T01:33:00Z';
  const t4 = '2027-01-10T01:00:00Z';
  const alle: Buchung[] = [buchung(t1, 'L1', 'K', '2027-02-01', 10)];

  const schritt = (t: string, gebindeId: string, anzahl: number) => {
    const zeilen = plan(bestandZu(alle, t), gebindeId, anzahl);
    alle.push(...alsBuchungen(t, zeilen));
    return zeilen;
  };

  it('plans the FIFO withdrawals and tracks stock', () => {
    expect(bestandAnzeigen(bestandZu(alle), ALLE)).toBe('10 × 20×0,5l Kasten');

    expect(schritt(t2, 'F', 7)).toEqual([
      { lagerortId: 'L1', gebindeId: 'K', mhd: '2027-02-01', menge: -1, art: 'anbruch' },
      { lagerortId: 'L1', gebindeId: 'F', mhd: '2027-02-01', menge: 20, art: 'anbruch' },
      { lagerortId: 'L1', gebindeId: 'F', mhd: '2027-02-01', menge: -7, art: 'abgang' },
    ]);
    expect(bestandAnzeigen(bestandZu(alle), ALLE)).toBe('9 × 20×0,5l Kasten, 13 × 0,5l Flasche');

    expect(schritt(t3, 'K', 4)).toEqual([
      { lagerortId: 'L1', gebindeId: 'K', mhd: '2027-02-01', menge: -4, art: 'abgang' },
    ]);
    alle.push(buchung(t4, 'L2', 'K', '2027-06-01', 2));

    const stand = (t: string) =>
      bestandZu(alle, t)
        .map((p) => `${p.menge} ${p.gebindeId} ${p.mhd} ${p.lagerortId}`)
        .sort();
    expect(stand(t3)).toEqual(['13 F 2027-02-01 L1', '5 K 2027-02-01 L1']);
    expect(stand(t4)).toEqual(['13 F 2027-02-01 L1', '2 K 2027-06-01 L2', '5 K 2027-02-01 L1']);
  });

  it('reproduces the history in total and per Lager', () => {
    const punkte = verlauf(alle, LAGER, ALLE);
    expect(punkte.map((p) => p.zeitpunkt)).toEqual([t1, t2, t3, t4]);
    const { serien, zeilen } = verlaufSerien(punkte, ALLE);
    expect(serien).toEqual([
      { key: 'F', basisGebindeId: 'F', lagerId: null },
      { key: 'F|L1', basisGebindeId: 'F', lagerId: 'L1' },
      { key: 'F|L2', basisGebindeId: 'F', lagerId: 'L2' },
    ]);
    expect(zeilen.map((z) => z.F)).toEqual([200, 193, 113, 153]);
    expect(zeilen.map((z) => z['F|L1'])).toEqual([200, 193, 113, 113]);
    expect(zeilen.map((z) => z['F|L2'])).toEqual([0, 0, 0, 40]);
  });

  it('computes the Inventur corrections against the FIFO stock', () => {
    const soll = bestandZu(alle);
    const korrekturen = inventurKorrekturen(
      soll,
      [
        { lagerortId: 'L1', wareId: 'krosti', gebindeId: 'K', mhd: '2027-02-01', anzahl: 3 },
        { lagerortId: 'L1', wareId: 'krosti', gebindeId: 'F', mhd: '2027-02-01', anzahl: 6 },
        { lagerortId: 'L2', wareId: 'krosti', gebindeId: 'K', mhd: '2027-06-01', anzahl: 1 },
      ],
      ['L1', 'L2'],
    );
    // K 06.2027 left empty on L1 is not a difference (and does not exist there anyway).
    expect(korrekturen).toHaveLength(3);
    expect(korrekturen).toEqual(
      expect.arrayContaining([
        {
          wareId: 'krosti',
          lagerortId: 'L1',
          gebindeId: 'K',
          mhd: '2027-02-01',
          menge: -2,
          art: 'korrektur',
        },
        {
          wareId: 'krosti',
          lagerortId: 'L1',
          gebindeId: 'F',
          mhd: '2027-02-01',
          menge: -7,
          art: 'korrektur',
        },
        {
          wareId: 'krosti',
          lagerortId: 'L2',
          gebindeId: 'K',
          mhd: '2027-06-01',
          menge: -1,
          art: 'korrektur',
        },
      ]),
    );
  });

  it('takes uncounted Soll keys as correct', () => {
    const soll = bestandZu(alle);
    const korrekturen = inventurKorrekturen(
      soll,
      [
        { lagerortId: 'L1', wareId: 'krosti', gebindeId: 'K', mhd: '2027-02-01', anzahl: 3 },
        { lagerortId: 'L1', wareId: 'krosti', gebindeId: 'F', mhd: '2027-02-01', anzahl: 6 },
      ],
      ['L1', 'L2'],
    );
    expect(korrekturen.map((k) => [k.gebindeId, k.menge])).toEqual([
      ['F', -7],
      ['K', -2],
    ]);
  });
});

describe('inventurKorrekturen', () => {
  const soll = bestandZu([buchung('2027-01-01T00:00:00Z', 'L1', 'F', null, 5)]);
  it('takes missing counts as correct, but an explicit 0 as none', () => {
    expect(inventurKorrekturen(soll, [], ['L1'])).toEqual([]);
    expect(
      inventurKorrekturen(
        soll,
        [{ lagerortId: 'L1', wareId: 'krosti', gebindeId: 'F', mhd: null, anzahl: 0 }],
        ['L1'],
      ),
    ).toEqual([
      {
        wareId: 'krosti',
        lagerortId: 'L1',
        gebindeId: 'F',
        mhd: null,
        menge: -5,
        art: 'korrektur',
      },
    ]);
    expect(inventurKorrekturen(soll, [], ['L2'])).toEqual([]);
  });
  it('yields nothing when the count matches and handles surplus', () => {
    const ist = (anzahl: number) => [
      { lagerortId: 'L1', wareId: 'krosti', gebindeId: 'F', mhd: null, anzahl },
    ];
    expect(inventurKorrekturen(soll, ist(5), ['L1'])).toEqual([]);
    expect(inventurKorrekturen(soll, ist(8), ['L1'])[0]?.menge).toBe(3);
  });
});

describe('entnahmePlanen', () => {
  const p = (
    gebindeId: string,
    mhd: string | null,
    menge: number,
    lagerortId = 'L1',
    zugang = '2027-01-01T00:00:00Z',
  ) => ({
    lagerortId,
    gebindeId,
    mhd,
    menge,
    ersterZugang: zugang,
  });

  it('uses loose bottles with a later MHD before opening an earlier Kasten', () => {
    const zeilen = plan([p('K', '2027-02-01', 3), p('F', '2027-09-01', 5)], 'F', 4);
    expect(zeilen).toEqual([
      { lagerortId: 'L1', gebindeId: 'F', mhd: '2027-09-01', menge: -4, art: 'abgang' },
    ]);
  });

  it('opens a Kasten when the loose bottles are not enough', () => {
    const zeilen = plan([p('K', '2027-02-01', 3), p('F', '2027-09-01', 5)], 'F', 7);
    expect(zeilen).toEqual([
      { lagerortId: 'L1', gebindeId: 'F', mhd: '2027-09-01', menge: -5, art: 'abgang' },
      { lagerortId: 'L1', gebindeId: 'K', mhd: '2027-02-01', menge: -1, art: 'anbruch' },
      { lagerortId: 'L1', gebindeId: 'F', mhd: '2027-02-01', menge: 20, art: 'anbruch' },
      { lagerortId: 'L1', gebindeId: 'F', mhd: '2027-02-01', menge: -2, art: 'abgang' },
    ]);
  });

  it('splits over several MHDs and merges identical lines', () => {
    const zeilen = plan(
      [
        p('F', '2027-03-01', 2),
        p('F', '2027-01-01', 3),
        p('F', null, 10),
        p('F', '2027-03-01', 1, 'L1', '2026-01-01T00:00:00Z'),
      ],
      'F',
      7,
    );
    expect(zeilen).toEqual([
      { lagerortId: 'L1', gebindeId: 'F', mhd: '2027-01-01', menge: -3, art: 'abgang' },
      { lagerortId: 'L1', gebindeId: 'F', mhd: '2027-03-01', menge: -3, art: 'abgang' },
      { lagerortId: 'L1', gebindeId: 'F', mhd: null, menge: -1, art: 'abgang' },
    ]);
  });

  it('breaks MHD ties by arrival, then Lagerort', () => {
    const zeilen = plan(
      [
        p('F', '2027-01-01', 2, 'B', '2027-01-02T00:00:00Z'),
        p('F', '2027-01-01', 2, 'A', '2027-01-02T00:00:00Z'),
        p('F', '2027-01-01', 2, 'C', '2027-01-01T00:00:00Z'),
      ],
      'F',
      3,
    );
    expect(zeilen.map((z) => [z.lagerortId, z.menge])).toEqual([
      ['C', -2],
      ['A', -1],
    ]);
  });

  it('opens several Kästen and merges the lines', () => {
    expect(plan([p('K', '2027-02-01', 3)], 'F', 45)).toEqual([
      { lagerortId: 'L1', gebindeId: 'K', mhd: '2027-02-01', menge: -3, art: 'anbruch' },
      { lagerortId: 'L1', gebindeId: 'F', mhd: '2027-02-01', menge: 60, art: 'anbruch' },
      { lagerortId: 'L1', gebindeId: 'F', mhd: '2027-02-01', menge: -45, art: 'abgang' },
    ]);
  });

  it('works across several nodes', () => {
    const zeilen = plan(
      [p('F', '2027-02-01', 2, 'R1'), p('F', '2027-03-01', 2, 'R2')],
      'F',
      3,
      'L1',
    );
    expect(zeilen).toEqual([
      { lagerortId: 'R1', gebindeId: 'F', mhd: '2027-02-01', menge: -2, art: 'abgang' },
      { lagerortId: 'R2', gebindeId: 'F', mhd: '2027-03-01', menge: -1, art: 'abgang' },
    ]);
  });

  it('goes negative on the chosen node when stock is missing', () => {
    expect(plan([p('F', '2027-02-01', 2)], 'F', 5, 'R9')).toEqual([
      { lagerortId: 'L1', gebindeId: 'F', mhd: '2027-02-01', menge: -2, art: 'abgang' },
      { lagerortId: 'R9', gebindeId: 'F', mhd: null, menge: -3, art: 'abgang' },
    ]);
    expect(plan([], 'F', 2)).toEqual([
      { lagerortId: 'L1', gebindeId: 'F', mhd: null, menge: -2, art: 'abgang' },
    ]);
  });

  it('never assembles a Kasten from loose bottles', () => {
    expect(plan([p('K', '2027-02-01', 1), p('F', '2027-02-01', 100)], 'K', 3)).toEqual([
      { lagerortId: 'L1', gebindeId: 'K', mhd: '2027-02-01', menge: -1, art: 'abgang' },
      { lagerortId: 'L1', gebindeId: 'K', mhd: null, menge: -2, art: 'abgang' },
    ]);
  });
});

describe('bestandZu', () => {
  it('drops zero rows, respects the time and picks the first positive arrival', () => {
    const b = [
      buchung('2027-01-03T00:00:00Z', 'L1', 'F', null, 4),
      buchung('2027-01-01T00:00:00Z', 'L1', 'F', null, -1, 'abgang'),
      buchung('2027-01-02T00:00:00Z', 'L1', 'F', null, 2),
      buchung('2027-01-02T00:00:00Z', 'L2', 'F', null, 1),
      buchung('2027-01-03T00:00:00Z', 'L2', 'F', null, -1, 'abgang'),
    ];
    const jetzt = bestandZu(b);
    expect(jetzt).toEqual([
      {
        wareId: 'krosti',
        lagerortId: 'L1',
        gebindeId: 'F',
        mhd: null,
        menge: 5,
        ersterZugang: '2027-01-02T00:00:00Z',
      },
    ]);
    expect(bestandZu(b, '2027-01-02T00:00:00Z').map((p) => p.menge)).toEqual([1, 1]);
  });
});

describe('trees', () => {
  const nodes = [
    knoten('lager', null, 'Lager'),
    knoten('kuehl', 'lager', 'Kühlschrank', 3),
    knoten('schnaps', 'lager', 'Schnapsregal', 2),
    knoten('bier', 'lager', 'Bierkästen', 1),
    knoten('kollis', 'schnaps', 'Kollis', 2),
    knoten('regal', 'schnaps', 'Regal', 1),
    knoten('l2', null, 'Anderes Lager'),
  ];
  it('walks depth first', () => {
    expect(tiefensuche(nodes, 'lager').map((n) => n.id)).toEqual([
      'lager',
      'bier',
      'schnaps',
      'regal',
      'kollis',
      'kuehl',
    ]);
    expect(teilbaumIds(nodes, 'schnaps')).toEqual(['schnaps', 'regal', 'kollis']);
    expect(tiefensuche(nodes, 'unbekannt')).toEqual([]);
  });
  it('builds a sorted forest', () => {
    const baum = baumBauen(nodes);
    expect(baum.map((b) => b.node.id)).toEqual(['l2', 'lager']);
    expect(baum[1]?.kinder.map((k) => k.node.id)).toEqual(['bier', 'schnaps', 'kuehl']);
  });
  it('finds the top-level Lager and the path', () => {
    expect(oberstesLager(nodes, 'kollis')).toBe('lager');
    expect(oberstesLager(nodes, 'lager')).toBe('lager');
    expect(pfad(nodes, 'kollis')).toBe('Lager › Schnapsregal › Kollis');
  });
  it('survives cycles', () => {
    const zyklus = [knoten('a', 'b'), knoten('b', 'a'), knoten('c', 'a')];
    expect(baumBauen(zyklus)).toEqual([]);
    expect(tiefensuche(zyklus, 'a').map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(teilbaumIds(zyklus, 'b').length).toBeGreaterThan(0);
    expect(oberstesLager(zyklus, 'c')).toBeTypeOf('string');
    expect(pfad(zyklus, 'c')).toBeTypeOf('string');
  });
});

describe('Gebinde helpers', () => {
  it('computes deposits', () => {
    expect(gesamtPfandCent(K, ALLE)).toBe(310);
    expect(gesamtPfandCent(F, ALLE)).toBe(8);
    expect(centAnzeigen(310)).toBe('3,10 €');
    expect(centAnzeigen(0)).toBe('0,00 €');
    expect(centAnzeigen(123456)).toBe('1.234,56 €');
  });
  it('converts to base units', () => {
    expect(basisGebinde(K)).toBe('F');
    expect(basisGebinde(F)).toBe('F');
    expect(inBasiseinheiten('K', 1, ALLE)).toBe(20);
    expect(inBasiseinheiten('F', 3, ALLE)).toBe(3);
  });
  it('displays stock', () => {
    expect(
      bestandAnzeigen(
        [
          { gebindeId: 'F', menge: 13 },
          { gebindeId: 'K', menge: 9 },
          { gebindeId: 'F', menge: 0 },
        ],
        ALLE,
      ),
    ).toBe('9 × 20×0,5l Kasten, 13 × 0,5l Flasche');
    expect(bestandAnzeigen([{ gebindeId: 'K', menge: 0 }], ALLE)).toBe('kein Bestand');
    expect(bestandAnzeigen([], ALLE)).toBe('kein Bestand');
  });
  it('adds the Untergebinde', () => {
    expect(gebindeErgaenzen(['K'], ALLE)).toEqual(['K', 'F']);
    expect(gebindeErgaenzen(['K', 'F'], ALLE)).toEqual(['K', 'F']);
    expect(gebindeErgaenzen(['F'], ALLE)).toEqual(['F']);
  });
  it('validates nesting', () => {
    expect(gebindeFehler({ unterGebindeId: null }, ALLE)).toBeNull();
    expect(gebindeFehler({ unterGebindeId: 'F' }, ALLE)).toBeNull();
    expect(gebindeFehler({ id: 'K', unterGebindeId: 'F' }, ALLE)).toBeNull();
    expect(gebindeFehler({ unterGebindeId: 'X' }, ALLE)).toMatch(/existiert nicht/);
    expect(gebindeFehler({ unterGebindeId: 'K' }, ALLE)).toMatch(/Untergebinde haben/);
    expect(gebindeFehler({ id: 'F', unterGebindeId: 'F' }, ALLE)).toMatch(/sich selbst/);
    expect(gebindeFehler({ id: 'F', unterGebindeId: 'K' }, ALLE)).not.toBeNull();
    const G: Gebinde = {
      id: 'G',
      name: 'Palette',
      pfandCent: 0,
      unterGebindeId: null,
      unterAnzahl: null,
    };
    expect(gebindeFehler({ id: 'F', unterGebindeId: 'G' }, [...ALLE, G])).toMatch(
      /bereits Untergebinde/,
    );
  });
});

describe('MHD helpers', () => {
  it('normalizes', () => {
    expect(mhdNormalisieren('2027-02-17', 'monat')).toBe('2027-02-01');
    expect(mhdNormalisieren('2027-02-17', 'tag')).toBe('2027-02-17');
    expect(mhdNormalisieren('2027-02-17', 'keins')).toBeNull();
    expect(mhdNormalisieren(null, 'tag')).toBeNull();
  });
  it('displays', () => {
    expect(mhdAnzeigen('2027-02-01', 'monat')).toBe('02.2027');
    expect(mhdAnzeigen('2027-02-17', 'tag')).toBe('17.02.2027');
    expect(mhdAnzeigen('2027-02-17', 'keins')).toBe('');
    expect(mhdAnzeigen(null, 'tag')).toBe('');
  });
});

describe('schemas', () => {
  it('validates Gebinde', () => {
    expect(gebindeSchema.safeParse({ name: ' Flasche ', pfandCent: 8 }).data).toEqual({
      name: 'Flasche',
      pfandCent: 8,
      unterGebindeId: null,
      unterAnzahl: null,
    });
    expect(
      gebindeSchema.safeParse({ name: 'K', pfandCent: 150, unterGebindeId: 'F', unterAnzahl: 20 })
        .success,
    ).toBe(true);
    expect(
      gebindeSchema.safeParse({ name: 'K', pfandCent: 150, unterGebindeId: 'F' }).success,
    ).toBe(false);
    expect(gebindeSchema.safeParse({ name: 'K', pfandCent: 150, unterAnzahl: 20 }).success).toBe(
      false,
    );
    expect(
      gebindeSchema.safeParse({ name: 'K', pfandCent: 150, unterGebindeId: 'F', unterAnzahl: 1 })
        .success,
    ).toBe(false);
    expect(gebindeSchema.safeParse({ name: 'K', pfandCent: -1 }).success).toBe(false);
    expect(gebindeSchema.safeParse({ name: 'K', pfandCent: 1.5 }).success).toBe(false);
    expect(gebindeSchema.safeParse({ name: '  ', pfandCent: 1 }).error?.issues[0]?.message).toBe(
      'Bitte gib einen Namen ein.',
    );
  });
  it('validates Ware', () => {
    const basis = { name: 'Krosti', warengruppeId: 'g', mhdArt: 'monat', gebindeIds: ['K', 'F'] };
    expect(wareSchema.safeParse(basis).data?.aliase).toEqual([]);
    expect(wareSchema.safeParse({ ...basis, aliase: [' Krostitzer '] }).data?.aliase).toEqual([
      'Krostitzer',
    ]);
    expect(wareSchema.safeParse({ ...basis, aliase: ['a', 'A'] }).success).toBe(false);
    expect(wareSchema.safeParse({ ...basis, aliase: ['  '] }).success).toBe(false);
    expect(wareSchema.safeParse({ ...basis, gebindeIds: [] }).success).toBe(false);
    expect(wareSchema.safeParse({ ...basis, gebindeIds: ['K', 'K'] }).success).toBe(false);
    expect(wareSchema.safeParse({ ...basis, mhdArt: 'jahr' }).success).toBe(false);
  });
  it('validates Einlagerung and Entnahme', () => {
    const e = {
      wareId: 'w',
      lagerortId: 'l',
      gebindeId: 'g',
      anzahl: 2,
      zeitpunkt: '2027-01-01T10:00:00Z',
    };
    expect(einlagerungSchema.safeParse(e).data).toMatchObject({ mhd: null, kommentar: null });
    expect(
      einlagerungSchema.safeParse({ ...e, mhd: '2027-02-01', kommentar: ' hi ' }).data,
    ).toMatchObject({
      mhd: '2027-02-01',
      kommentar: 'hi',
    });
    expect(einlagerungSchema.safeParse({ ...e, anzahl: 0 }).error?.issues[0]?.message).toBe(
      'Die Anzahl muss mindestens 1 sein.',
    );
    expect(einlagerungSchema.safeParse({ ...e, anzahl: 1.5 }).success).toBe(false);
    expect(einlagerungSchema.safeParse({ ...e, mhd: '01.02.2027' }).success).toBe(false);
    expect(entnahmeSchema.safeParse({ ...e, zeitpunkt: 'gestern' }).success).toBe(false);
    expect(entnahmeSchema.safeParse(e).success).toBe(true);
  });
  it('validates Inventur', () => {
    const z = { wareId: 'w', gebindeId: 'g', mhd: null, anzahl: 0 };
    expect(inventurZaehlungSchema.safeParse({ zaehlungen: [z] }).data?.inListeAufnehmen).toEqual(
      [],
    );
    expect(inventurZaehlungSchema.safeParse({ zaehlungen: [{ ...z, anzahl: -1 }] }).success).toBe(
      false,
    );
  });
});
