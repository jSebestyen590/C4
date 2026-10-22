import { describe, expect, it } from 'vitest';
import { baumBauen, type LagerortArt } from '@c4/shared';
import {
  alleSetzen,
  aufgeklapptLesen,
  kachelBeschriftung,
  istAufgeklappt,
  istBelegt,
  kachelInhalt,
  kachelZaehlerText,
  kinderTeilen,
  knotenMitKindern,
  nurBelegte,
  type Belegung,
} from './lagerAnsicht';

const knoten = (
  id: string,
  parentId: string | null,
  position = 0,
  art: LagerortArt | null = null,
) => ({
  id,
  parentId,
  position,
  name: id,
  beschreibung: null,
  archiviert: false,
  art,
  ifcoHoeheCm: null,
  ifcoStellflaechen: null,
});

// lager > regal > (s1, s2, s3), lager > kiste (leaf), leer (leaf, top level)
const baum = baumBauen([
  knoten('lager', null, 0),
  knoten('regal', 'lager', 0, 'regal'),
  knoten('s1', 'regal', 0, 'regalboden'),
  knoten('s2', 'regal', 1, 'regalboden'),
  knoten('s3', 'regal', 2, 'regalboden'),
  knoten('kiste', 'lager', 1),
  knoten('leer', null, 1),
]);

const belegung: Belegung = {
  bestand: new Map([
    [
      's1',
      [
        { wareId: 'a', name: 'A', text: '1', mhd: '' },
        { wareId: 'b', name: 'B', text: '2', mhd: '' },
      ],
    ],
  ]),
  inventar: new Map([
    [
      's2',
      { ifcos: [{ id: 'i', name: 'I', stueck: 3, typ: null, ausleihe: null }], gegenstaende: [] },
    ],
    [
      's1',
      { ifcos: [], gegenstaende: [{ id: 'g', name: 'G', anzahl: 2, verliehen: 0, vorgemerkt: 0 }] },
    ],
  ]),
};

describe('kinderTeilen', () => {
  it('turns only the Regalböden into tiles, keeping the order', () => {
    const lager = baum[0]!;
    // a Regal and a plain leaf below the Lager are both cards
    const oben = kinderTeilen(lager.kinder);
    expect(oben.karten.map((k) => k.node.id)).toEqual(['regal', 'kiste']);
    expect(oben.kacheln).toEqual([]);
    const regal = kinderTeilen(lager.kinder[0]!.kinder);
    expect(regal.karten).toEqual([]);
    expect(regal.kacheln.map((k) => k.node.id)).toEqual(['s1', 's2', 's3']);
  });

  it('keeps nested leaves of normal Lagerorte as cards', () => {
    const verschachtelt = baumBauen([
      knoten('a', null),
      knoten('b', 'a', 0),
      knoten('c', 'b', 0),
      knoten('d', 'b', 1),
    ]);
    const { karten, kacheln } = kinderTeilen(verschachtelt[0]!.kinder[0]!.kinder);
    expect(karten.map((k) => k.node.id)).toEqual(['c', 'd']);
    expect(kacheln).toEqual([]);
  });
});

describe('Belegung', () => {
  it('counts distinct Waren plus Inventar entries', () => {
    expect(kachelZaehlerText('s1', belegung)).toBe('3');
    expect(kachelZaehlerText('s2', belegung)).toBe('1');
  });
  it('shows a dash for empty nodes and when nothing is shown', () => {
    expect(kachelZaehlerText('s3', belegung)).toBe('–');
    expect(kachelZaehlerText('s1', { bestand: null, inventar: null })).toBe('–');
  });
  it('counts only the parts that are shown', () => {
    expect(kachelZaehlerText('s1', { ...belegung, inventar: null })).toBe('2');
    expect(istBelegt('s2', { ...belegung, inventar: null })).toBe(false);
  });
});

describe('kachelInhalt', () => {
  const ifco = (name: string) => ({ id: name, name, stueck: 0, typ: null, ausleihe: null });
  const inv = (ifcos: string[], gegenstaende: string[] = []) => ({
    ifcos: ifcos.map(ifco),
    gegenstaende: gegenstaende.map((name) => ({
      id: name,
      name,
      anzahl: 3,
      verliehen: 0,
      vorgemerkt: 0,
    })),
  });
  const ware = (name: string) => ({ wareId: name, name, text: '1', mhd: '' });

  it('names the first Ifco alphabetically plus +N on an Ifco-Lagerplatz', () => {
    const b: Belegung = {
      bestand: null,
      inventar: new Map([['p', inv(['Zelt', 'Alpha', 'Mitte'])]]),
    };
    expect(kachelInhalt('p', b, true)).toEqual({
      text: 'Alpha',
      zusatz: '+2',
      titel: 'Alpha, Mitte, Zelt',
    });
    const eine: Belegung = { bestand: null, inventar: new Map([['p', inv(['Alpha'])]]) };
    expect(kachelInhalt('p', eine, true).zusatz).toBeNull();
  });
  it('names the only entry of a normal node, whatever it is', () => {
    const waren: Belegung = { bestand: new Map([['n', [ware('Mehl')]]]), inventar: null };
    expect(kachelInhalt('n', waren, false).text).toBe('Mehl');
    const ifcoB: Belegung = { bestand: null, inventar: new Map([['n', inv(['Kiste 1'])]]) };
    expect(kachelInhalt('n', ifcoB, false).text).toBe('Kiste 1');
    // a single Gegenstand with several pieces is still just the name
    const g: Belegung = { bestand: null, inventar: new Map([['n', inv([], ['Zelt'])]]) };
    expect(kachelInhalt('n', g, false)).toEqual({ text: 'Zelt', zusatz: null, titel: 'Zelt' });
  });
  it('keeps the counter for two or more entries and a dash when empty', () => {
    const b: Belegung = {
      bestand: new Map([['n', [ware('Mehl')]]]),
      inventar: new Map([['n', inv([], ['Zelt'])]]),
    };
    expect(kachelInhalt('n', b, false)).toEqual({ text: '2', zusatz: null, titel: 'Mehl, Zelt' });
    expect(kachelInhalt('leer', b, false).text).toBe('–');
    expect(kachelInhalt('leer', b, true).titel).toBeNull();
  });
  it('only counts the parts that are shown', () => {
    const b: Belegung = { bestand: new Map([['n', [ware('Mehl')]]]), inventar: null };
    expect(kachelInhalt('n', b, false).text).toBe('Mehl');
  });
});

describe('nurBelegte', () => {
  it('keeps occupied nodes and their ancestors, drops empty subtrees', () => {
    const gefiltert = nurBelegte(baum, belegung);
    expect(gefiltert.map((e) => e.node.id)).toEqual(['lager']);
    const regal = gefiltert[0]!.kinder;
    expect(regal.map((e) => e.node.id)).toEqual(['regal']);
    expect(regal[0]!.kinder.map((e) => e.node.id)).toEqual(['s1', 's2']);
  });
  it('does not filter without loaded data', () => {
    expect(nurBelegte(baum, { bestand: null, inventar: null })).toBe(baum);
  });
});

describe('Aufklappen', () => {
  it('expands top-level nodes and collapses deeper ones by default', () => {
    expect(istAufgeklappt('lager', 0, {})).toBe(true);
    expect(istAufgeklappt('regal', 1, {})).toBe(false);
  });
  it('lets explicit choices win', () => {
    expect(istAufgeklappt('lager', 0, { lager: false })).toBe(false);
    expect(istAufgeklappt('regal', 1, { regal: true })).toBe(true);
  });
  it('sets all nodes with children', () => {
    const ids = knotenMitKindern(baum);
    expect(ids).toEqual(['lager', 'regal']);
    expect(alleSetzen({ x: true }, ids, false)).toEqual({ x: true, lager: false, regal: false });
  });
  it('reads the stored map defensively', () => {
    expect(aufgeklapptLesen(null)).toEqual({});
    expect(aufgeklapptLesen('kaputt')).toEqual({});
    expect(aufgeklapptLesen('[1]')).toEqual({});
    expect(aufgeklapptLesen('{"a":true,"b":"x","c":false}')).toEqual({ a: true, c: false });
  });
});

describe('kachelBeschriftung', () => {
  it('moves a shared leading word into the heading', () => {
    expect(kachelBeschriftung(['Stellplatz 1', 'Stellplatz 2', 'Stellplatz 16'])).toEqual({
      praefix: 'Stellplatz',
      kurz: ['1', '2', '16'],
    });
    expect(kachelBeschriftung(['Fach oben links', 'Fach oben rechts'])).toEqual({
      praefix: 'Fach oben',
      kurz: ['links', 'rechts'],
    });
  });
  it('keeps the names without a shared word or with a single tile', () => {
    expect(kachelBeschriftung(['Regal 1', 'Kiste'])).toEqual({
      praefix: null,
      kurz: ['Regal 1', 'Kiste'],
    });
    expect(kachelBeschriftung(['Brett 10', 'Brett 1'])).toEqual({
      praefix: 'Brett',
      kurz: ['10', '1'],
    });
    expect(kachelBeschriftung(['Brett', 'Brett 2'])).toEqual({
      praefix: null,
      kurz: ['Brett', 'Brett 2'],
    });
    expect(kachelBeschriftung(['Stellplatz 1'])).toEqual({ praefix: null, kurz: ['Stellplatz 1'] });
  });
});
