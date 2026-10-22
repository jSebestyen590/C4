import { describe, expect, it } from 'vitest';
import type { GegenstandRow } from './db/schema';
import { gegenstandDetails, ifcoAusleihen, organisatorVon, zielFehler } from './inventar';

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

const jetzt = new Date('2026-10-21T12:00:00.000Z');
const vorher = new Date('2026-10-01T00:00:00.000Z');
const spaeter = new Date('2026-10-25T00:00:00.000Z');

describe('gegenstandDetails', () => {
  it('counts future Ausleihen as vorgemerkt, not verliehen', () => {
    const d = gegenstandDetails(
      g,
      [platz('p1', 'l5', null, 6)],
      [
        { gegenstandId: 'g1', lagerortId: 'l5', ifcoId: null, anzahl: 3, ausgeliehenAm: vorher },
        { gegenstandId: 'g1', lagerortId: 'l5', ifcoId: null, anzahl: 2, ausgeliehenAm: spaeter },
      ],
      jetzt,
    );
    expect(d.plaetze[0]).toMatchObject({ verliehen: 3, vorgemerkt: 2 });
    expect(d).toMatchObject({ verliehen: 3, vorgemerkt: 2 });
  });
  it('attaches the open lent amount to the place it was lent from', () => {
    const d = gegenstandDetails(
      g,
      [platz('p1', 'l5', null, 6), platz('p2', null, 'i1', 4)],
      [
        { gegenstandId: 'g1', lagerortId: 'l5', ifcoId: null, anzahl: 3, ausgeliehenAm: vorher },
        { gegenstandId: 'g1', lagerortId: 'l5', ifcoId: null, anzahl: 1, ausgeliehenAm: vorher },
        { gegenstandId: 'g1', lagerortId: null, ifcoId: 'i1', anzahl: 2, ausgeliehenAm: vorher },
        {
          gegenstandId: 'andere',
          lagerortId: 'l5',
          ifcoId: null,
          anzahl: 9,
          ausgeliehenAm: vorher,
        },
      ],
      jetzt,
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
    expect(zielFehler([ifco('x')], orte, kisten)).toBe('Die IFCO existiert nicht.');
    expect(zielFehler([lagerort('l2')], orte, kisten)).toBe('Der Lagerort ist archiviert.');
    expect(zielFehler([ifco('i2')], orte, kisten)).toBe('Die IFCO ist archiviert.');
  });
  it('keeps archived places that were already used', () => {
    expect(
      zielFehler([lagerort('l2'), ifco('i2')], orte, kisten, [lagerort('l2'), ifco('i2')]),
    ).toBeNull();
  });
});

describe('ifcoAusleihen', () => {
  const ganz = (ifcoId: string, ausleiheId: string, ausgeliehenAm: Date) => ({
    ifcoId,
    ausleiheId,
    an: `an ${ausleiheId}`,
    ausgeliehenAm,
  });
  it('marks an IFCO as verliehen or vorgemerkt', () => {
    const r = ifcoAusleihen([ganz('i1', 'a1', vorher), ganz('i2', 'a2', spaeter)], jetzt);
    expect(r.get('i1')).toMatchObject({ id: 'a1', status: 'verliehen' });
    expect(r.get('i2')).toMatchObject({ id: 'a2', status: 'geplant', an: 'an a2' });
    expect(r.has('i3')).toBe(false);
  });
  it('prefers the Ausleihe that is away now, then the earliest reserved one', () => {
    const r = ifcoAusleihen(
      [ganz('i1', 'spaet', spaeter), ganz('i1', 'jetzt', vorher), ganz('i2', 'b', spaeter)],
      jetzt,
    );
    expect(r.get('i1')?.id).toBe('jetzt');
    const frueh = new Date('2026-10-23T00:00:00.000Z');
    const s = ifcoAusleihen([ganz('i1', 'spaet', spaeter), ganz('i1', 'frueh', frueh)], jetzt);
    expect(s.get('i1')?.id).toBe('frueh');
  });
});

describe('organisatorVon', () => {
  const personen = [
    {
      sub: 'a',
      vorname: 'Anna',
      nachname: 'Alt',
      status: 'mitglied' as const,
      anrede: 'weiblich' as const,
    },
    { sub: 'b', vorname: 'Ben', nachname: 'Neu', status: 'anwaerter' as const, anrede: null },
  ];
  it('uses organisiertVon and falls back to erstelltVon', () => {
    expect(organisatorVon({ organisiertVon: 'a', erstelltVon: 'b' }, personen)?.sub).toBe('a');
    const r = organisatorVon({ organisiertVon: null, erstelltVon: 'b' }, personen);
    expect(r).toEqual({
      sub: 'b',
      username: null,
      vorname: 'Ben',
      nachname: 'Neu',
      status: 'anwaerter',
      anrede: 'neutral',
    });
  });
  it('is null for an unknown person', () => {
    expect(organisatorVon({ organisiertVon: null, erstelltVon: 'x' }, personen)).toBeNull();
    expect(organisatorVon({ organisiertVon: 'x', erstelltVon: 'a' }, personen)).toBeNull();
  });
});
