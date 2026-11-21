import { describe, expect, it } from 'vitest';
import { sortiere, type SortSpalte } from './sortierung';

interface E {
  n: string | null;
  z: number;
}
const spalten: Record<'n' | 'z', SortSpalte<E>> = {
  n: { label: 'Name', wert: (e) => e.n },
  z: { label: 'Zahl', wert: (e) => e.z },
};
const liste: E[] = [
  { n: 'Zelt', z: 3 },
  { n: null, z: 1 },
  { n: 'Äpfel', z: 10 },
  { n: 'Bier', z: 2 },
];

describe('sortiere', () => {
  it('keeps the order without a sorting', () => {
    expect(sortiere(liste, spalten, null)).toEqual(liste);
  });
  it('sorts text with the German collation and empty values last in both directions', () => {
    expect(sortiere(liste, spalten, { key: 'n', richtung: 'auf' }).map((e) => e.n)).toEqual([
      'Äpfel',
      'Bier',
      'Zelt',
      null,
    ]);
    expect(sortiere(liste, spalten, { key: 'n', richtung: 'ab' }).map((e) => e.n)).toEqual([
      'Zelt',
      'Bier',
      'Äpfel',
      null,
    ]);
  });
  it('sorts numbers numerically', () => {
    expect(sortiere(liste, spalten, { key: 'z', richtung: 'ab' }).map((e) => e.z)).toEqual([
      10, 3, 2, 1,
    ]);
  });
});
