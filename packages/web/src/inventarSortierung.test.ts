import { describe, expect, it } from 'vitest';
import { gegenstaendeSortieren, ifcosSortieren } from './inventarAnzeige';
import type { GegenstandEintrag, IfcoEintrag } from './inventarDaten';

const kategorien = [
  { id: 'k1', parentId: null, name: 'Technik' },
  { id: 'k2', parentId: 'k1', name: 'Kabel' },
  { id: 'k3', parentId: null, name: 'Äpfel' },
];
const lagerorte = [
  { id: 'l1', parentId: null, name: 'Lager' },
  { id: 'l2', parentId: 'l1', name: 'Regal' },
  { id: 'l3', parentId: null, name: 'Keller' },
];
const kontext = { kategorien, lagerorte, ifcos: [] };

const gegenstand = (
  id: string,
  name: string,
  extra: Partial<GegenstandEintrag> = {},
): GegenstandEintrag => ({
  id,
  name,
  beschreibung: null,
  kategorieId: 'k1',
  anzahl: 1,
  archiviert: false,
  verliehen: 0,
  vorgemerkt: 0,
  plaetze: [],
  teilVon: null,
  virtuell: false,
  anzahlJe: null,
  verbaut: [],
  ...extra,
});
const platz = (lagerortId: string) => ({
  id: `p-${lagerortId}`,
  lagerortId,
  ifcoId: null,
  anzahl: 1,
  verliehen: 0,
  vorgemerkt: 0,
});
const ids = (l: GegenstandEintrag[]) => l.map((g) => g.id);

describe('gegenstaendeSortieren', () => {
  const zelt = gegenstand('z', 'Zelt', { kategorieId: 'k3', anzahl: 2, plaetze: [platz('l2')] });
  const aermel = gegenstand('a', 'ärmel', { kategorieId: 'k2', anzahl: 5, plaetze: [platz('l3')] });
  const beamer = gegenstand('b', 'Beamer', { anzahl: 5, verliehen: 1, vorgemerkt: 1 });
  const liste = [zelt, beamer, aermel];

  it('sorts by name with the German locale', () => {
    expect(ids(gegenstaendeSortieren(liste, 'name', kontext))).toEqual(['a', 'b', 'z']);
    expect(ids(gegenstaendeSortieren(liste, 'name', kontext, true))).toEqual(['z', 'b', 'a']);
  });
  it('sorts by category path, then name', () => {
    // Äpfel, Technik (Beamer), Technik › Kabel (ärmel)
    expect(ids(gegenstaendeSortieren(liste, 'kategorie', kontext))).toEqual(['z', 'b', 'a']);
  });
  it('sorts by Anzahl descending, ties by name', () => {
    expect(ids(gegenstaendeSortieren(liste, 'anzahl', kontext))).toEqual(['a', 'b', 'z']);
  });
  it('sorts by the first place path and keeps items without place last', () => {
    expect(ids(gegenstaendeSortieren(liste, 'platz', kontext))).toEqual(['a', 'z', 'b']);
    expect(ids(gegenstaendeSortieren(liste, 'platz', kontext, true))).toEqual(['z', 'a', 'b']);
  });
  it('does not change the input', () => {
    const kopie = [...liste];
    gegenstaendeSortieren(liste, 'anzahl', kontext);
    expect(liste).toEqual(kopie);
  });
});

describe('ifcosSortieren', () => {
  const ifco = (id: string, name: string, lagerortId: string | null): IfcoEintrag => ({
    id,
    name,
    beschreibung: null,
    lagerortId,
    archiviert: false,
    typId: null,
    inhalt: [],
    ausleihe: null,
  });
  const liste = [ifco('a', 'Kiste 10', 'l3'), ifco('b', 'Kiste 2', null), ifco('c', 'Zelt', 'l2')];
  it('sorts by name with numbers in order', () => {
    expect(ifcosSortieren(liste, 'name', lagerorte).map((i) => i.id)).toEqual(['b', 'a', 'c']);
    expect(ifcosSortieren(liste, 'name', lagerorte, true).map((i) => i.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });
  it('sorts by Standort and keeps IFCOs without a place last', () => {
    // Keller < Lager › Regal
    expect(ifcosSortieren(liste, 'platz', lagerorte).map((i) => i.id)).toEqual(['a', 'c', 'b']);
    expect(ifcosSortieren(liste, 'platz', lagerorte, true).map((i) => i.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });
});
