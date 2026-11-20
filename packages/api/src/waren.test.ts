import { describe, expect, it } from 'vitest';
import type { Buchung } from '@c4/shared';
import type { GebindeRow } from './db/schema';
import {
  einlagerungMhd,
  elternFehler,
  gebindeInhaltGeaendert,
  entnahmenZeilen,
  entnahmeZeilen,
  lagerortBestandZeilen,
  umlagerungenZeilen,
  inventurKnotenIds,
  inventurUeberlappt,
  naechstePosition,
  reihenfolgeFehler,
  standardGebindeBestimmen,
  verwendetMeldung,
  WarenUngueltig,
  zaehlungenNormalisieren,
  zyklusFehler,
} from './waren';

const knoten = (id: string, parentId: string | null, position = 0, archiviert = false) => ({
  id,
  parentId,
  name: id,
  position,
  archiviert,
});
const baum = [knoten('lager', null), knoten('regal', 'lager'), knoten('etage', 'regal')];

describe('zyklusFehler', () => {
  it('allows no parent and unrelated parents', () => {
    expect(zyklusFehler(baum, 'regal', null)).toBeNull();
    expect(zyklusFehler([...baum, knoten('keller', null)], 'regal', 'keller')).toBeNull();
  });
  it('rejects the node itself and its descendants', () => {
    expect(zyklusFehler(baum, 'regal', 'regal')).toMatch(/selbst/);
    expect(zyklusFehler(baum, 'lager', 'etage')).toMatch(/selbst/);
  });
});

describe('elternFehler', () => {
  it('accepts top level and active parents only', () => {
    const knoten2 = [knoten('a', null), knoten('b', null, 0, true)];
    expect(elternFehler(knoten2, null)).toBeNull();
    expect(elternFehler(knoten2, 'a')).toBeNull();
    expect(elternFehler(knoten2, 'b')).toMatch(/archiviert/);
    expect(elternFehler(knoten2, 'x')).toMatch(/existiert nicht/);
  });
});

describe('reihenfolgeFehler / naechstePosition', () => {
  it('requires exactly the children', () => {
    expect(reihenfolgeFehler(['a', 'b'], ['b', 'a'])).toBeNull();
    expect(reihenfolgeFehler(['a', 'b'], ['a'])).not.toBeNull();
    expect(reihenfolgeFehler(['a', 'b'], ['a', 'c'])).not.toBeNull();
  });
  it('rejects ordering the Regalböden of a Regal', () => {
    expect(reihenfolgeFehler(['a', 'b'], ['b', 'a'], 'regal')).toBe(
      'Regalböden lassen sich nicht verschieben.',
    );
    expect(reihenfolgeFehler(['a', 'b'], ['b', 'a'], null)).toBeNull();
  });
  it('appends after the highest position', () => {
    expect(naechstePosition([])).toBe(0);
    expect(naechstePosition([{ position: 0 }, { position: 4 }])).toBe(5);
  });
});

describe('verwendetMeldung', () => {
  it('uses the right grammatical gender', () => {
    expect(verwendetMeldung('Lagerort')).toBe(
      'Der Lagerort wird noch verwendet, archiviere ihn stattdessen.',
    );
    expect(verwendetMeldung('Gebinde')).toBe(
      'Das Gebinde wird noch verwendet, archiviere es stattdessen.',
    );
    expect(verwendetMeldung('Ware')).toContain('archiviere sie');
  });
});

describe('einlagerungMhd', () => {
  it('requires a MHD unless the ware has none, and normalises it', () => {
    expect(() => einlagerungMhd(null, 'tag')).toThrow(WarenUngueltig);
    expect(() => einlagerungMhd(undefined, 'monat')).toThrow(WarenUngueltig);
    expect(einlagerungMhd('2027-03-15', 'tag')).toBe('2027-03-15');
    expect(einlagerungMhd('2027-03-15', 'monat')).toBe('2027-03-01');
    expect(einlagerungMhd('2027-03-15', 'keins')).toBeNull();
    expect(einlagerungMhd(null, 'keins')).toBeNull();
  });
});

describe('inventurKnotenIds', () => {
  it('walks the subtree in order and skips archived nodes with their descendants', () => {
    const alle = [
      knoten('lager', null),
      knoten('b', 'lager', 1),
      knoten('a', 'lager', 0),
      knoten('a1', 'a', 0),
      knoten('alt', 'lager', 2, true),
      knoten('alt1', 'alt', 0, true),
      knoten('anderes', null),
    ];
    expect(inventurKnotenIds(alle, 'lager')).toEqual(['lager', 'a', 'a1', 'b']);
    expect(inventurKnotenIds(alle, 'a')).toEqual(['a', 'a1']);
    expect(inventurKnotenIds(alle, 'alt')).toEqual([]);
  });

  it('leaves out places where IFCOs stand, but keeps empty IFCO-Lagerplätze', () => {
    const alle = [
      knoten('regal', null),
      knoten('b1', 'regal', 0),
      { ...knoten('b2', 'regal', 1), ifcoHoeheCm: 20 },
      { ...knoten('b3', 'regal', 2), ifcoHoeheCm: 20 },
    ];
    expect(inventurKnotenIds(alle, 'regal', new Set(['b3']))).toEqual(['regal', 'b1', 'b2']);
    expect(inventurKnotenIds(alle, 'b3', new Set(['b3']))).toEqual([]);
  });
});

describe('zaehlungenNormalisieren', () => {
  const waren = new Map([
    ['bier', { mhdArt: 'monat' as const, gebindeIds: ['kasten', 'flasche'] }],
    ['salz', { mhdArt: 'keins' as const, gebindeIds: ['tuete'] }],
  ]);
  it('normalises the MHD and merges lines with the same key', () => {
    expect(
      zaehlungenNormalisieren(
        [
          { wareId: 'bier', gebindeId: 'kasten', mhd: '2027-03-10', anzahl: 2 },
          { wareId: 'bier', gebindeId: 'kasten', mhd: '2027-03-25', anzahl: 1 },
          { wareId: 'salz', gebindeId: 'tuete', mhd: '2027-01-01', anzahl: 0 },
        ],
        waren,
      ),
    ).toEqual([
      { wareId: 'bier', gebindeId: 'kasten', mhd: '2027-03-01', anzahl: 3 },
      { wareId: 'salz', gebindeId: 'tuete', mhd: null, anzahl: 0 },
    ]);
  });
  it('rejects unknown wares and foreign Gebinde', () => {
    expect(() =>
      zaehlungenNormalisieren([{ wareId: 'x', gebindeId: 'kasten', mhd: null, anzahl: 1 }], waren),
    ).toThrow(WarenUngueltig);
    expect(() =>
      zaehlungenNormalisieren(
        [{ wareId: 'salz', gebindeId: 'kasten', mhd: null, anzahl: 1 }],
        waren,
      ),
    ).toThrow(WarenUngueltig);
  });
});

describe('entnahmeZeilen', () => {
  const gebinde: GebindeRow[] = [
    {
      id: 'flasche',
      menge: 0.5,
      einheit: 'l',
      verpackungseinheit: 'flasche',
      pfandCent: 8,
      unterGebindeId: null,
      unterAnzahl: null,
      archiviert: false,
    },
    {
      id: 'kasten',
      menge: null,
      einheit: null,
      verpackungseinheit: 'kasten',
      pfandCent: 150,
      unterGebindeId: 'flasche',
      unterAnzahl: 20,
      archiviert: false,
    },
  ];
  const orte = [knoten('lager', null), knoten('regal', 'lager'), knoten('kueche', null)];
  const buchung = (b: Partial<Buchung> & Pick<Buchung, 'zeitpunkt' | 'menge'>): Buchung => ({
    vorgangId: 'v',
    wareId: 'bier',
    lagerortId: 'regal',
    gebindeId: 'flasche',
    mhd: null,
    art: 'zugang',
    ...b,
  });
  const basis = { lagerorte: orte, gebinde, wareId: 'bier', anzahl: 5 };

  it('uses the stock at the booking time, so later bookings do not count', () => {
    const buchungen = [
      buchung({ zeitpunkt: '2026-01-01T00:00:00Z', menge: 3 }),
      buchung({ zeitpunkt: '2026-03-01T00:00:00Z', menge: 10 }),
    ];
    const zeilen = entnahmeZeilen({
      ...basis,
      buchungen,
      lagerortId: 'lager',
      gebindeId: 'flasche',
      zeitpunkt: '2026-02-01T00:00:00Z',
    });
    expect(zeilen).toEqual([
      { lagerortId: 'regal', gebindeId: 'flasche', mhd: null, menge: -3, art: 'abgang' },
      { lagerortId: 'lager', gebindeId: 'flasche', mhd: null, menge: -2, art: 'abgang' },
    ]);
  });

  it('is restricted to the chosen subtree and to the ware', () => {
    const buchungen = [
      buchung({ zeitpunkt: '2026-01-01T00:00:00Z', menge: 10, lagerortId: 'kueche' }),
      buchung({ zeitpunkt: '2026-01-01T00:00:00Z', menge: 10, wareId: 'wein' }),
    ];
    expect(
      entnahmeZeilen({
        ...basis,
        buchungen,
        lagerortId: 'lager',
        gebindeId: 'flasche',
        zeitpunkt: '2026-02-01T00:00:00Z',
      }),
    ).toEqual([{ lagerortId: 'lager', gebindeId: 'flasche', mhd: null, menge: -5, art: 'abgang' }]);
  });

  it('opens an Obergebinde when no loose units are left', () => {
    const zeilen = entnahmeZeilen({
      ...basis,
      buchungen: [buchung({ zeitpunkt: '2026-01-01T00:00:00Z', menge: 1, gebindeId: 'kasten' })],
      lagerortId: 'lager',
      gebindeId: 'flasche',
      zeitpunkt: '2026-02-01T00:00:00Z',
    });
    expect(zeilen).toEqual(
      expect.arrayContaining([
        { lagerortId: 'regal', gebindeId: 'kasten', mhd: null, menge: -1, art: 'anbruch' },
        { lagerortId: 'regal', gebindeId: 'flasche', mhd: null, menge: 20, art: 'anbruch' },
        { lagerortId: 'regal', gebindeId: 'flasche', mhd: null, menge: -5, art: 'abgang' },
      ]),
    );
  });
});

describe('entnahmenZeilen / umlagerungenZeilen / lagerortBestandZeilen', () => {
  const kasten: GebindeRow = {
    id: 'K',
    menge: null,
    einheit: null,
    verpackungseinheit: 'kasten',
    pfandCent: null,
    unterGebindeId: null,
    unterAnzahl: null,
    archiviert: false,
  };
  const buchung = (lagerortId: string, mhd: string, menge: number, wareId = 'bier'): Buchung => ({
    vorgangId: 'v',
    zeitpunkt: '2027-01-01T00:00:00Z',
    wareId,
    lagerortId,
    gebindeId: 'K',
    mhd,
    menge,
    art: 'zugang',
  });
  const buchungen = [buchung('KS', '2027-02-01', 1), buchung('BK', '2027-03-01', 10)];
  const zeitpunkt = '2027-02-01T00:00:00Z';

  it('withdraws on the node and refills from the source', () => {
    const { entnahme, umlagerung } = entnahmenZeilen({
      buchungen,
      gebinde: [kasten],
      positionen: [{ wareId: 'bier', lagerortId: 'KS', gebindeId: 'K', anzahl: 1 }],
      nachfuellen: [{ lagerortId: 'KS', quelleId: 'BK' }],
      zeitpunkt,
    });
    expect(entnahme).toEqual([
      {
        wareId: 'bier',
        lagerortId: 'KS',
        gebindeId: 'K',
        mhd: '2027-02-01',
        menge: -1,
        art: 'abgang',
      },
    ]);
    expect(umlagerung).toEqual([
      {
        wareId: 'bier',
        lagerortId: 'BK',
        gebindeId: 'K',
        mhd: '2027-03-01',
        menge: -1,
        art: 'umlagerung',
      },
      {
        wareId: 'bier',
        lagerortId: 'KS',
        gebindeId: 'K',
        mhd: '2027-03-01',
        menge: 1,
        art: 'umlagerung',
      },
    ]);
  });

  it('does not refill without nachfuellen and sums repeated positions', () => {
    const ohne = entnahmenZeilen({
      buchungen,
      gebinde: [kasten],
      positionen: [{ wareId: 'bier', lagerortId: 'KS', gebindeId: 'K', anzahl: 1 }],
      nachfuellen: [],
      zeitpunkt,
    });
    expect(ohne.umlagerung).toEqual([]);
    const zwei = entnahmenZeilen({
      buchungen,
      gebinde: [kasten],
      positionen: [
        { wareId: 'bier', lagerortId: 'BK', gebindeId: 'K', anzahl: 1 },
        { wareId: 'bier', lagerortId: 'BK', gebindeId: 'K', anzahl: 2 },
      ],
      nachfuellen: [{ lagerortId: 'BK', quelleId: 'KS' }],
      zeitpunkt,
    });
    expect(zwei.entnahme.map((z) => z.menge)).toEqual([-1, -2]);
    // The fridge only has 1 Kasten; the remaining 2 go negative there.
    expect(
      zwei.umlagerung.filter((z) => z.lagerortId === 'KS').map((z) => `${z.mhd} ${z.menge}`),
    ).toEqual(['2027-02-01 -1', 'null -2']);
  });

  it('plans Umlagerungen cumulatively and aggregates the current stock', () => {
    const zeilen = umlagerungenZeilen({
      buchungen,
      gebinde: [kasten],
      positionen: [
        { wareId: 'bier', gebindeId: 'K', anzahl: 4, vonId: 'BK', nachId: 'KS' },
        { wareId: 'bier', gebindeId: 'K', anzahl: 3, vonId: 'BK', nachId: 'X' },
      ],
      zeitpunkt,
    });
    expect(zeilen.filter((z) => z.lagerortId === 'BK').map((z) => z.menge)).toEqual([-4, -3]);
    const bestand = lagerortBestandZeilen([
      ...buchungen,
      buchung('BK', '2027-01-01', 2),
      buchung('KS', '2027-02-01', -1),
    ]);
    expect(bestand).toEqual([
      { lagerortId: 'BK', wareId: 'bier', gebindeId: 'K', menge: 12, fruehestesMhd: '2027-01-01' },
    ]);
  });
});

describe('gebindeInhaltGeaendert', () => {
  const g = { menge: 0.5, einheit: 'l', unterGebindeId: null, unterAnzahl: null } as const;
  it('flags changes of amount, unit and Untergebinde only', () => {
    expect(gebindeInhaltGeaendert(g, { ...g })).toBe(false);
    expect(gebindeInhaltGeaendert(g, { ...g, menge: 1 })).toBe(true);
    expect(gebindeInhaltGeaendert(g, { ...g, einheit: 'kg' })).toBe(true);
    expect(gebindeInhaltGeaendert(g, { ...g, unterGebindeId: 'x', unterAnzahl: 6 })).toBe(true);
  });
});

describe('inventurUeberlappt', () => {
  const alle = [...baum, knoten('keller', null)];
  it('is false without open Inventuren or on unrelated Lagerorte', () => {
    expect(inventurUeberlappt(alle, [], 'regal')).toBe(false);
    expect(inventurUeberlappt(alle, ['keller'], 'regal')).toBe(false);
  });
  it('detects the same, an ancestor and a descendant Lagerort', () => {
    expect(inventurUeberlappt(alle, ['regal'], 'regal')).toBe(true);
    expect(inventurUeberlappt(alle, ['lager'], 'etage')).toBe(true);
    expect(inventurUeberlappt(alle, ['etage'], 'lager')).toBe(true);
  });
});

describe('standardGebindeBestimmen', () => {
  const gebinde = ['a', 'b'];
  it('takes a given Standard-Gebinde of the Ware, null clears it', () => {
    expect(standardGebindeBestimmen('b', 'a', gebinde)).toBe('b');
    expect(standardGebindeBestimmen(null, 'a', gebinde)).toBeNull();
  });
  it('rejects one that is not a Gebinde of the Ware', () => {
    expect(() => standardGebindeBestimmen('x', null, gebinde)).toThrow(WarenUngueltig);
  });
  it('keeps the current one when omitted and resets it once the Gebinde was removed', () => {
    expect(standardGebindeBestimmen(undefined, 'a', gebinde)).toBe('a');
    expect(standardGebindeBestimmen(undefined, 'c', gebinde)).toBeNull();
    expect(standardGebindeBestimmen(undefined, null, gebinde)).toBeNull();
  });
});
