import { describe, expect, it } from 'vitest';
import type { TeilQuelle } from '@c4/shared';
import {
  ausleiheVorbelegung,
  mengeVerteilen,
  teileGruppeTitel,
  teileGruppieren,
} from './inventarTeile';

describe('mengeVerteilen', () => {
  it('fills the place with the most available first', () => {
    const plaetze = [
      { key: 'a', verfuegbar: 3 },
      { key: 'b', verfuegbar: 10 },
      { key: 'c', verfuegbar: 5 },
    ];
    expect(mengeVerteilen(plaetze, 12)).toEqual({ a: 0, b: 10, c: 2 });
    expect(mengeVerteilen(plaetze, 0)).toEqual({ a: 0, b: 0, c: 0 });
  });
  it('caps at what is available', () => {
    expect(mengeVerteilen([{ key: 'a', verfuegbar: 2 }], 5)).toEqual({ a: 2 });
    expect(mengeVerteilen([{ key: 'a', verfuegbar: 0 }], 1)).toEqual({ a: 0 });
    expect(mengeVerteilen([], 3)).toEqual({});
  });
});

describe('teileGruppeTitel', () => {
  it('names complete, repeated and partial groups', () => {
    expect(teileGruppeTitel('Pavillon', 1)).toBe('Pavillon (komplett)');
    expect(teileGruppeTitel('Pavillon', 2)).toBe('2× Pavillon (komplett)');
    expect(teileGruppeTitel('Pavillon', 0)).toBe('Pavillon (teilweise)');
    expect(teileGruppeTitel('Pavillon', 1, 2)).toBe('Pavillon (teilweise)');
  });
});

const g = (id: string, extra: Partial<TeilQuelle> = {}): TeilQuelle => ({
  id,
  anzahl: 1,
  virtuell: false,
  teilVon: null,
  anzahlJe: null,
  verliehen: 0,
  vorgemerkt: 0,
  plaetze: [],
  ...extra,
});
const pos = (id: string, gegenstandId: string, anzahl: number) => ({
  id,
  gegenstandId,
  anzahl,
  ifcoId: null as string | null,
  ganzeIfco: false,
});

describe('teileGruppieren', () => {
  const alle = [
    g('p', { virtuell: true, anzahl: 2 }),
    g('w', { teilVon: 'p', anzahlJe: 12 }),
    g('d', { teilVon: 'p', anzahlJe: 1 }),
    g('x'),
  ];
  const einzeln = (positionen: ReturnType<typeof pos>[]) =>
    positionen.map((position) => ({ art: 'einzeln' as const, position }));

  it('groups parts under the parent and counts complete sets', () => {
    const r = teileGruppieren(
      einzeln([pos('1', 'w', 24), pos('2', 'x', 1), pos('3', 'd', 2)]),
      alle,
    );
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ art: 'teile', elternId: 'p', saetze: 2 });
    expect(r[1]).toMatchObject({ art: 'einzeln' });
  });
  it('is partial when a component is missing', () => {
    const r = teileGruppieren(einzeln([pos('1', 'w', 12)]), alle);
    expect(r[0]).toMatchObject({ art: 'teile', saetze: 0 });
  });
  it('includes a non-virtual parent as component and keeps whole IFCOs', () => {
    const mit = [g('p', { anzahl: 1 }), g('w', { teilVon: 'p', anzahlJe: 2 })];
    const ifco = {
      art: 'ifco' as const,
      ifcoId: 'i',
      positionen: [{ ...pos('9', 'w', 2), ifcoId: 'i', ganzeIfco: true }],
    };
    const r = teileGruppieren([...einzeln([pos('1', 'p', 1), pos('2', 'w', 2)]), ifco], mit);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ art: 'teile', saetze: 1 });
    expect(r[1]).toBe(ifco);
  });
});

describe('ausleiheVorbelegung', () => {
  const alle = [
    g('p', { virtuell: true, anzahl: 2 }),
    g('w', { teilVon: 'p', anzahlJe: 12 }),
    g('d', { teilVon: 'p', anzahlJe: 1 }),
    g('x'),
    g('y'),
  ];
  const key = (id: string, z: { lagerortId: string | null; ifcoId: string | null }) =>
    `${id}|${z.lagerortId ?? ''}|${z.ifcoId ?? ''}`;
  const p = (gegenstandId: string, anzahl: number, extra: Record<string, unknown> = {}) => ({
    gegenstandId,
    anzahl,
    lagerortId: 'l' as string | null,
    ifcoId: null as string | null,
    ganzeIfco: false as boolean | null,
    ...extra,
  });

  it('collects ids, amounts, groups and sets', () => {
    const r = ausleiheVorbelegung([p('w', 24), p('d', 2), p('x', 3)], alle, key);
    expect(r.gegenstandIds).toEqual(['w', 'd', 'x']);
    expect(r.mengen).toEqual({ 'w|l|': 24, 'd|l|': 2, 'x|l|': 3 });
    expect(r.gruppen).toEqual(['p']);
    expect(r.saetze).toEqual({ p: 2 });
    expect(r.ifcoIds).toEqual([]);
  });
  it('uses at least one set for an incomplete group', () => {
    expect(ausleiheVorbelegung([p('w', 12)], alle, key).saetze).toEqual({ p: 1 });
  });
  it('marks whole IFCOs and keeps them out of groups', () => {
    const r = ausleiheVorbelegung(
      [
        p('y', 2, { lagerortId: null, ifcoId: 'i', ganzeIfco: true }),
        p('w', 12, { lagerortId: null, ifcoId: 'i', ganzeIfco: true }),
      ],
      alle,
      key,
    );
    expect(r.ifcoIds).toEqual(['i']);
    expect(r.gruppen).toEqual([]);
  });
});
