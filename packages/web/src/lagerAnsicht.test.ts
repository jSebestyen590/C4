import { describe, expect, it } from 'vitest';
import { baumBauen } from '@c4/shared';
import {
  alleSetzen,
  aufgeklapptLesen,
  istAufgeklappt,
  istBelegt,
  kachelZaehlerText,
  kinderTeilen,
  knotenMitKindern,
  nurBelegte,
  type Belegung,
} from './lagerAnsicht';

const knoten = (id: string, parentId: string | null, position = 0) => ({
  id,
  parentId,
  position,
  name: id,
  beschreibung: null,
  archiviert: false,
});

// lager > regal > (s1, s2, s3), lager > kiste (leaf), leer (leaf, top level)
const baum = baumBauen([
  knoten('lager', null, 0),
  knoten('regal', 'lager', 0),
  knoten('s1', 'regal', 0),
  knoten('s2', 'regal', 1),
  knoten('s3', 'regal', 2),
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
    ['s2', { ifcos: [{ id: 'i', name: 'I', stueck: 3 }], gegenstaende: [] }],
    ['s1', { ifcos: [], gegenstaende: [{ id: 'g', name: 'G', anzahl: 2, verliehen: 0 }] }],
  ]),
};

describe('kinderTeilen', () => {
  it('puts nodes with children into cards and leaves into tiles, keeping the order', () => {
    const lager = baum[0]!;
    const { karten, kacheln } = kinderTeilen(lager.kinder);
    expect(karten.map((k) => k.node.id)).toEqual(['regal']);
    expect(kacheln.map((k) => k.node.id)).toEqual(['kiste']);
    expect(kinderTeilen(baum[0]!.kinder[0]!.kinder).kacheln.map((k) => k.node.id)).toEqual([
      's1',
      's2',
      's3',
    ]);
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
