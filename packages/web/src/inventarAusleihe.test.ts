import { describe, expect, it } from 'vitest';
import {
  anzahlText,
  ausleihenSortiert,
  gesamtVerfuegbar,
  ifcoAusleiheKurz,
  ifcoAusleiheZeile,
  ifcoAusleiheText,
  offenePositionenAus,
  seitAbText,
  standardMenge,
  startText,
  verfuegbarImZeitraum,
  zeitraumZeile,
  ifcoGruppeTitel,
  ifcoInhaltText,
  isoZuLokal,
  mengeName,
  mengeText,
  offenePositionen,
  positionText,
  ueberfaellig,
  verfuegbarePlaetze,
} from './inventarAnzeige';
import { ausleiheTage } from '@c4/shared';
import type {
  AusleiheEintrag,
  AusleihePositionEintrag,
  GegenstandEintrag,
  IfcoEintrag,
} from './inventarDaten';
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
    typId: null,
    ausleihe: null,
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
  verbaut: [],
  verliehen: 5,
  vorgemerkt: 1,
  plaetze: [
    { id: 'p1', lagerortId: 'l2', ifcoId: null, anzahl: 6, verliehen: 3, vorgemerkt: 1 },
    { id: 'p2', lagerortId: null, ifcoId: 'i1', anzahl: 4, verliehen: 2, vorgemerkt: 0 },
    { id: 'p3', lagerortId: 'l1', ifcoId: null, anzahl: 2, verliehen: 2, vorgemerkt: 0 },
  ],
};

describe('verfuegbarePlaetze', () => {
  it('lists places with something left, sorted by text', () => {
    const r = verfuegbarePlaetze(g1, lagerorte, ifcos);
    expect(r.map((p) => [p.text, p.verfuegbar])).toEqual([
      ['Kiste · Lager › Regal', 2],
      ['Lager › Regal', 2],
    ]);
  });
  it('can include completely taken places', () => {
    const r = verfuegbarePlaetze(g1, lagerorte, ifcos, true);
    expect(r.map((p) => p.verfuegbar)).toEqual([2, 0, 2]);
  });
  it('sums the available amount', () => {
    expect(gesamtVerfuegbar(g1)).toBe(4);
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
  it('leaves out the amount for a single piece and marks a whole IFCO', () => {
    const p = { gegenstandId: 'g1', anzahl: 1, lagerortId: null, ifcoId: 'i1' };
    expect(positionText(p, [g1], lagerorte, ifcos)).toBe('Kabeltrommel aus Kiste · Lager › Regal');
    expect(positionText({ ...p, anzahl: 2, ganzeIfco: true }, [g1], lagerorte, ifcos)).toBe(
      '2× Kabeltrommel aus Kiste · Lager › Regal (mit ganzer IFCO)',
    );
  });
});

describe('whole IFCO texts', () => {
  it('titles the group and lists the contents compactly', () => {
    expect(ifcoGruppeTitel('i1', ifcos)).toBe('Kiste (ganze IFCO)');
    expect(ifcoGruppeTitel('nix', ifcos)).toBe('Unbekannte IFCO (ganze IFCO)');
    expect(
      ifcoInhaltText(
        [
          { gegenstandId: 'g2', anzahl: 1 },
          { gegenstandId: 'g1', anzahl: 4 },
        ],
        [g1, { id: 'g2', name: 'Ratsche' }],
      ),
    ).toBe('4× Kabeltrommel, Ratsche');
  });
  it('says who has the IFCO', () => {
    const a = { id: 'a', an: 'Feuerwehr', ausgeliehenAm: '2026-10-20T08:00:00.000Z' };
    expect(ifcoAusleiheText({ ...a, status: 'verliehen' }, new Date('2026-10-21T08:00:00Z'))).toBe(
      'Verliehen an Feuerwehr seit 20.10.2026 10:00',
    );
    expect(ifcoAusleiheText({ ...a, status: 'geplant' }, new Date('2026-10-19T08:00:00Z'))).toBe(
      'Vorgemerkt für Feuerwehr ab 20.10.2026 10:00',
    );
    expect(ifcoAusleiheKurz({ ...a, status: 'verliehen' })).toBe('Verliehen an Feuerwehr');
    expect(ifcoAusleiheKurz({ ...a, status: 'geplant' })).toBe('Vorgemerkt für Feuerwehr');
    expect(ifcoAusleiheZeile({ ...a, status: 'verliehen' })).toBe('verliehen an Feuerwehr');
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
  it('groups IFCOs and directly assigned Gegenstände per Lagerort', () => {
    const karte = inventarJeLagerort([g1, { ...g1, id: 'g9', archiviert: true }], ifcos);
    expect(karte.get('l2')).toEqual({
      ifcos: [{ id: 'i1', name: 'Kiste', stueck: 5, typ: null, ausleihe: null }],
      gegenstaende: [{ id: 'g1', name: 'Kabeltrommel', anzahl: 6, verliehen: 3, vorgemerkt: 1 }],
    });
    expect(karte.get('l1')?.gegenstaende).toEqual([
      { id: 'g1', name: 'Kabeltrommel', anzahl: 2, verliehen: 2, vorgemerkt: 0 },
    ]);
  });
  it('leaves out archived and place-less IFCOs', () => {
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

describe('mengeText', () => {
  it('shows verliehen and vorgemerkt separately', () => {
    expect(mengeText(10)).toBe('10×');
    expect(mengeText(10, 3)).toBe('10× · 3 verliehen');
    expect(mengeText(10, 0, 2)).toBe('10× · 2 vorgemerkt');
    expect(mengeText(10, 3, 2)).toBe('10× · 3 verliehen · 2 vorgemerkt');
  });
  it('hides the count when it is 1', () => {
    expect(mengeText(1)).toBe('');
    expect(mengeText(1, 1)).toBe('1 verliehen');
    expect(mengeText(1, 0, 1)).toBe('1 vorgemerkt');
    expect(mengeText(2)).toBe('2×');
    expect(anzahlText(1)).toBe('');
    expect(anzahlText(6)).toBe('6×');
    expect(mengeName(1, 'Beamer')).toBe('Beamer');
    expect(mengeName(6, 'Spanngurt 6m')).toBe('6× Spanngurt 6m');
  });
});

describe('ausleihenSortiert', () => {
  it('puts verliehen first, then vorgemerkt by start, then erledigt', () => {
    const a = (
      id: string,
      status: 'geplant' | 'verliehen' | 'erledigt',
      ausgeliehenAm: string,
    ) => ({
      id,
      status,
      ausgeliehenAm,
    });
    const liste = [
      a('e', 'erledigt', '2026-10-01T00:00:00.000Z'),
      a('g2', 'geplant', '2026-11-01T00:00:00.000Z'),
      a('v', 'verliehen', '2026-10-02T00:00:00.000Z'),
      a('g1', 'geplant', '2026-10-25T00:00:00.000Z'),
    ];
    expect(ausleihenSortiert(liste).map((x) => x.id)).toEqual(['v', 'g1', 'g2', 'e']);
  });
});

describe('seit / ab texts', () => {
  const jetzt = new Date('2026-10-21T12:00:00Z');
  it('says ab for an Ausleihe that has not started and seit for a started one', () => {
    expect(seitAbText('2026-10-25T08:00:00Z', jetzt)).toBe('ab 25.10.2026 09:00');
    expect(seitAbText('2026-10-20T08:00:00Z', jetzt)).toBe('seit 20.10.2026 10:00');
    expect(seitAbText('2026-10-21T12:00:00Z', jetzt)).toBe('seit 21.10.2026 14:00');
    expect(startText('2026-10-25T08:00:00Z', jetzt)).toBe('Ab 25.10.2026 09:00');
    expect(startText('2026-10-20T08:00:00Z', jetzt)).toBe('Seit 20.10.2026 10:00');
  });
  it('words the period for the confirmation', () => {
    expect(zeitraumZeile('2026-10-25T08:00:00Z', '2026-10-27', jetzt)).toBe(
      'Vom 25.10.2026 09:00 bis 27.10.2026',
    );
    expect(zeitraumZeile('2026-10-20T08:00:00Z', '2026-10-27', jetzt)).toBe(
      'Seit 20.10.2026 10:00 bis 27.10.2026',
    );
  });
});

describe('availability in a period', () => {
  const ausleihe = (id: string, von: string, bis: string, anzahl: number): AusleiheEintrag => ({
    id,
    an: id,
    ausgeliehenAm: von,
    rueckgabeGeplant: bis,
    kommentar: null,
    organisiertVon: null,
    organisator: null,
    erledigt: false,
    status: 'geplant',
    gefaehrdetDurch: [],
    positionen: [
      {
        id: `p-${id}`,
        ausleiheId: id,
        gegenstandId: 'g1',
        lagerortId: 'l2',
        ifcoId: null,
        anzahl,
        zurueckAm: null,
        ganzeIfco: null,
      },
    ],
  });
  const offen = offenePositionenAus([
    ausleihe('A', '2026-10-25T08:00:00Z', '2026-10-27', 4),
    { ...ausleihe('B', '2026-10-20T08:00:00Z', '2026-10-22', 9), positionen: [] },
  ]);
  const platz = { lagerortId: 'l2', ifcoId: null, anzahl: 6 };
  it('only counts overlapping Ausleihen', () => {
    // Fixed 'now' before all periods, so the result does not depend on the current date.
    const jetzt = new Date('2026-10-24T12:00:00Z');
    expect(
      verfuegbarImZeitraum(
        platz,
        'g1',
        offen,
        ausleiheTage('2026-10-27T08:00:00Z', '2026-10-28'),
        jetzt,
      ),
    ).toBe(6);
    expect(
      verfuegbarImZeitraum(
        platz,
        'g1',
        offen,
        ausleiheTage('2026-10-26T08:00:00Z', '2026-10-28'),
        jetzt,
      ),
    ).toBe(2);
    expect(
      verfuegbarImZeitraum(platz, 'g1', offen, ausleiheTage('2026-10-26T08:00:00Z', null), jetzt),
    ).toBe(2);
    expect(
      verfuegbarImZeitraum(
        { ...platz, anzahl: 3 },
        'g1',
        offen,
        ausleiheTage('2026-10-26T08:00:00Z', null),
        jetzt,
      ),
    ).toBe(0);
  });
});

describe('standardMenge', () => {
  const einzeln = { lagerortId: 'l2', ifcoId: null, anzahl: 1, verfuegbar: 1 };
  it('preselects the only piece of a Gegenstand with a single place', () => {
    expect(standardMenge(einzeln, 1, false)).toBe(1);
  });
  it('does not preselect with several places, bigger amounts or when unavailable', () => {
    expect(standardMenge(einzeln, 2, false)).toBeUndefined();
    expect(standardMenge({ ...einzeln, anzahl: 5, verfuegbar: 5 }, 1, false)).toBeUndefined();
    expect(standardMenge({ ...einzeln, verfuegbar: 0 }, 1, false)).toBeUndefined();
  });
  it('takes the whole available content for a whole IFCO', () => {
    expect(
      standardMenge(
        { ...einzeln, ifcoId: 'i1', lagerortId: null, anzahl: 5, verfuegbar: 3 },
        3,
        true,
      ),
    ).toBe(3);
    expect(standardMenge({ ...einzeln, verfuegbar: 0 }, 1, true)).toBeUndefined();
  });
});
