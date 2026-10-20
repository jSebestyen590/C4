import { describe, expect, it } from 'vitest';
import {
  gesamtVerfuegbar,
  isoZuLokal,
  offenePositionen,
  positionText,
  ueberfaellig,
  verfuegbarePlaetze,
} from './inventarAnzeige';
import type { AusleihePositionEintrag, GegenstandEintrag, IfcoEintrag } from './inventarDaten';
import { inventarJeLagerort } from './lagerInventar';

const lagerorte = [
  { id: 'l1', parentId: null, name: 'Lager' },
  { id: 'l2', parentId: 'l1', name: 'Regal' },
];
const ifcos: IfcoEintrag[] = [
  {
    id: 'i1',
    name: 'Kiste',
    beschreibung: null,
    lagerortId: 'l2',
    archiviert: false,
    inhalt: [
      { gegenstandId: 'g1', anzahl: 4 },
      { gegenstandId: 'g2', anzahl: 1 },
    ],
  },
];
const g1: GegenstandEintrag = {
  id: 'g1',
  name: 'Kabeltrommel',
  beschreibung: null,
  kategorieId: 'k',
  anzahl: 10,
  archiviert: false,
  verliehen: 5,
  plaetze: [
    { id: 'p1', lagerortId: 'l2', ifcoId: null, anzahl: 6, verliehen: 3 },
    { id: 'p2', lagerortId: null, ifcoId: 'i1', anzahl: 4, verliehen: 2 },
    { id: 'p3', lagerortId: 'l1', ifcoId: null, anzahl: 2, verliehen: 2 },
  ],
};

describe('verfuegbarePlaetze', () => {
  it('lists places with something left, sorted by text', () => {
    const r = verfuegbarePlaetze(g1, lagerorte, ifcos);
    expect(r.map((p) => [p.text, p.verfuegbar])).toEqual([
      ['Kiste · Lager › Regal', 2],
      ['Lager › Regal', 3],
    ]);
  });
  it('sums the available amount', () => {
    expect(gesamtVerfuegbar(g1)).toBe(5);
  });
});

describe('positionText', () => {
  it('names amount, Gegenstand and origin', () => {
    expect(
      positionText(
        { gegenstandId: 'g1', anzahl: 3, lagerortId: 'l2', ifcoId: null },
        [g1],
        lagerorte,
        ifcos,
      ),
    ).toBe('3× Kabeltrommel aus Lager › Regal');
  });
});

describe('ueberfaellig', () => {
  it('is only true for open Ausleihen past the planned date', () => {
    expect(ueberfaellig({ erledigt: false, rueckgabeGeplant: '2026-10-01' }, '2026-10-02')).toBe(
      true,
    );
    expect(ueberfaellig({ erledigt: false, rueckgabeGeplant: '2026-10-02' }, '2026-10-02')).toBe(
      false,
    );
    expect(ueberfaellig({ erledigt: true, rueckgabeGeplant: '2026-10-01' }, '2026-10-02')).toBe(
      false,
    );
    expect(ueberfaellig({ erledigt: false, rueckgabeGeplant: null }, '2026-10-02')).toBe(false);
  });
});

describe('offenePositionen', () => {
  it('keeps the positions not yet returned', () => {
    const p = (id: string, zurueckAm: string | null) =>
      ({ id, zurueckAm }) as AusleihePositionEintrag;
    expect(
      offenePositionen({ positionen: [p('a', null), p('b', '2026-10-01T10:00:00Z')] }),
    ).toEqual([p('a', null)]);
  });
});

describe('isoZuLokal', () => {
  it('round-trips through a datetime-local value', () => {
    const iso = '2026-10-14T09:30:00.000Z';
    expect(new Date(isoZuLokal(iso)).toISOString()).toBe(iso);
  });
});

describe('inventarJeLagerort', () => {
  it('groups Ifcos and directly assigned Gegenstände per Lagerort', () => {
    const karte = inventarJeLagerort([g1, { ...g1, id: 'g9', archiviert: true }], ifcos);
    expect(karte.get('l2')).toEqual({
      ifcos: [{ id: 'i1', name: 'Kiste', stueck: 5 }],
      gegenstaende: [{ id: 'g1', name: 'Kabeltrommel', anzahl: 6, verliehen: 3 }],
    });
    expect(karte.get('l1')?.gegenstaende).toEqual([
      { id: 'g1', name: 'Kabeltrommel', anzahl: 2, verliehen: 2 },
    ]);
  });
  it('leaves out archived and place-less Ifcos', () => {
    const karte = inventarJeLagerort(
      [],
      [
        { ...ifcos[0]!, archiviert: true },
        { ...ifcos[0]!, id: 'i2', lagerortId: null },
      ],
    );
    expect(karte.size).toBe(0);
  });
});
