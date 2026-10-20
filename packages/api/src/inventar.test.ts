import { describe, expect, it } from 'vitest';
import type { GegenstandRow } from './db/schema';
import { gegenstandDetails, zielFehler } from './inventar';

const g: GegenstandRow = {
  id: 'g1',
  name: 'Kabeltrommel',
  beschreibung: null,
  kategorieId: 'k',
  anzahl: 10,
  archiviert: false,
};
const platz = (id: string, lagerortId: string | null, ifcoId: string | null, anzahl: number) => ({
  id,
  lagerortId,
  ifcoId,
  anzahl,
});

describe('gegenstandDetails', () => {
  it('attaches the open lent amount to the place it was lent from', () => {
    const d = gegenstandDetails(
      g,
      [platz('p1', 'l5', null, 6), platz('p2', null, 'i1', 4)],
      [
        { gegenstandId: 'g1', lagerortId: 'l5', ifcoId: null, anzahl: 3 },
        { gegenstandId: 'g1', lagerortId: 'l5', ifcoId: null, anzahl: 1 },
        { gegenstandId: 'g1', lagerortId: null, ifcoId: 'i1', anzahl: 2 },
        { gegenstandId: 'andere', lagerortId: 'l5', ifcoId: null, anzahl: 9 },
      ],
    );
    expect(d.plaetze.map((p) => p.verliehen)).toEqual([4, 2]);
    expect(d.verliehen).toBe(6);
    expect(d.name).toBe('Kabeltrommel');
  });
  it('reports nothing lent without open positions', () => {
    const d = gegenstandDetails(g, [platz('p1', 'l5', null, 6)], []);
    expect(d.plaetze[0]?.verliehen).toBe(0);
    expect(d.verliehen).toBe(0);
  });
  it('keeps a Gegenstand without Plätze', () => {
    expect(gegenstandDetails(g, [], [])).toMatchObject({ plaetze: [], verliehen: 0 });
  });
});

describe('zielFehler', () => {
  const orte = [
    { id: 'l1', archiviert: false },
    { id: 'l2', archiviert: true },
  ];
  const kisten = [
    { id: 'i1', archiviert: false },
    { id: 'i2', archiviert: true },
  ];
  const lagerort = (id: string) => ({ lagerortId: id, ifcoId: null });
  const ifco = (id: string) => ({ lagerortId: null, ifcoId: id });

  it('accepts existing, non-archived places', () => {
    expect(zielFehler([lagerort('l1'), ifco('i1')], orte, kisten)).toBeNull();
    expect(zielFehler([], orte, kisten)).toBeNull();
  });
  it('rejects unknown and archived places', () => {
    expect(zielFehler([lagerort('x')], orte, kisten)).toBe('Der Lagerort existiert nicht.');
    expect(zielFehler([ifco('x')], orte, kisten)).toBe('Die Ifco existiert nicht.');
    expect(zielFehler([lagerort('l2')], orte, kisten)).toBe('Der Lagerort ist archiviert.');
    expect(zielFehler([ifco('i2')], orte, kisten)).toBe('Die Ifco ist archiviert.');
  });
  it('keeps archived places that were already used', () => {
    expect(
      zielFehler([lagerort('l2'), ifco('i2')], orte, kisten, [lagerort('l2'), ifco('i2')]),
    ).toBeNull();
  });
});
