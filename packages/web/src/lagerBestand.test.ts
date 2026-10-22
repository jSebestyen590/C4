import { describe, expect, it } from 'vitest';
import type { Gebinde } from '@c4/shared';
import type { WareInfo } from './inventurDaten';
import type { LagerKnoten } from './LagerBaum';
import {
  ausgangAbschnitte,
  ausgangPositionen,
  bestandAnzeigeJeKnoten,
  bestandKarte,
  verfuegbar,
  warenSortieren,
  type BestandsZeile,
} from './lagerBestand';

const flasche: Gebinde = {
  id: 'f',
  menge: 0.5,
  einheit: 'l',
  verpackungseinheit: 'flasche',
  pfandCent: null,
  unterGebindeId: null,
  unterAnzahl: null,
};
const kasten: Gebinde = {
  ...flasche,
  id: 'k',
  menge: null,
  einheit: null,
  verpackungseinheit: 'kasten',
  unterGebindeId: 'f',
  unterAnzahl: 20,
};
const gebinde = [flasche, kasten];
const ware = (id: string, name: string): WareInfo => ({
  id,
  name,
  mhdArt: 'monat',
  gebindeIds: ['f', 'k'],
  aliase: [],
  archiviert: false,
});
const waren = new Map([
  ['a', ware('a', 'Krosti')],
  ['b', ware('b', 'Sterni')],
  ['c', ware('c', 'Astra')],
]);
const orte: LagerKnoten[] = [
  {
    id: 'l',
    parentId: null,
    name: 'Lager',
    beschreibung: null,
    position: 0,
    archiviert: false,
    art: null,
    ifcoHoeheCm: null,
    ifcoStellflaechen: null,
  },
  {
    id: 'k1',
    parentId: 'l',
    name: 'Kühlschrank',
    beschreibung: null,
    position: 0,
    archiviert: false,
    art: null,
    ifcoHoeheCm: null,
    ifcoStellflaechen: null,
  },
  {
    id: 'k2',
    parentId: 'l',
    name: 'Alt',
    beschreibung: null,
    position: 1,
    archiviert: true,
    art: null,
    ifcoHoeheCm: null,
    ifcoStellflaechen: null,
  },
];
const z = (
  lagerortId: string,
  wareId: string,
  gebindeId: string,
  menge: number,
  fruehestesMhd: string | null = null,
): BestandsZeile => ({ lagerortId, wareId, gebindeId, menge, fruehestesMhd });

describe('lagerBestand', () => {
  it('sorts wares by Warenliste, then alphabetically', () => {
    expect(warenSortieren(['a', 'b', 'c'], ['b'], waren)).toEqual(['b', 'c', 'a']);
  });

  it('builds the display lines per node', () => {
    const karte = bestandAnzeigeJeKnoten(
      [z('l', 'a', 'k', 9, '2027-03-01'), z('l', 'a', 'f', 13, '2027-02-01'), z('l', 'b', 'k', 1)],
      new Map([['l', ['b']]]),
      waren,
      gebinde,
    );
    expect(karte.get('l')).toEqual([
      { wareId: 'b', name: 'Sterni', text: '1 Kasten', mhd: '' },
      { wareId: 'a', name: 'Krosti', text: '9 Kästen, 13 Flaschen', mhd: '02.2027' },
    ]);
  });

  it('offers bottles when only the crate has stock and ignores archived nodes', () => {
    const zeilen = [z('k1', 'a', 'k', 2), z('k2', 'a', 'k', 5)];
    const abschnitte = ausgangAbschnitte('l', orte, zeilen, new Map(), waren, gebinde);
    expect(abschnitte).toHaveLength(1);
    expect(abschnitte[0]!.pfad).toBe('Lager › Kühlschrank');
    expect(abschnitte[0]!.waren[0]!.gebinde.map((g) => g.id)).toEqual(['k', 'f']);
  });

  it('still offers an Ifco-Lagerplatz that holds stock (withdrawals are never blocked)', () => {
    const mitIfco = orte.map((o) =>
      o.id === 'k1' ? { ...o, ifcoHoeheCm: 20, ifcoStellflaechen: 1 } : o,
    );
    expect(
      ausgangAbschnitte('l', mitIfco, [z('k1', 'a', 'k', 2)], new Map(), waren, gebinde),
    ).toHaveLength(1);
  });

  it('counts loose bottles plus the content of untaken crates', () => {
    const karte = bestandKarte([z('l', 'a', 'f', 3), z('l', 'a', 'k', 2)]);
    expect(verfuegbar(karte, 'l', 'a', flasche, gebinde, {})).toBe(43);
    expect(verfuegbar(karte, 'l', 'a', flasche, gebinde, { k: '1' })).toBe(23);
    expect(verfuegbar(karte, 'l', 'a', kasten, gebinde, {})).toBe(2);
  });

  it('collects positions with amounts above 0', () => {
    const abschnitte = ausgangAbschnitte(
      'l',
      orte,
      [z('l', 'a', 'k', 2)],
      new Map(),
      waren,
      gebinde,
    );
    expect(ausgangPositionen(abschnitte, { 'l|a': { k: '1', f: '0' } })).toEqual([
      { lagerortId: 'l', wareId: 'a', gebindeId: 'k', anzahl: 1 },
    ]);
  });
});
