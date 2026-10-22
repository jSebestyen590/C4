import { describe, expect, it } from 'vitest';
import { gegenstaendeSortieren } from './inventarAnzeige';
import type { GegenstandEintrag } from './inventarDaten';

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
