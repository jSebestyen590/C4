import { describe, expect, it } from 'vitest';
import { feldReihenfolge, naechstesFeld } from './feldReihenfolge';

describe('feldReihenfolge', () => {
  it('walks row by row', () => {
    expect(feldReihenfolge(2, 2, 'zeilen')).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]);
  });
  it('walks column by column', () => {
    expect(feldReihenfolge(2, 2, 'spalten')).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]);
  });
  it('finds neighbours and the ends', () => {
    expect(naechstesFeld(3, 2, 'spalten', 2, 0, 1)).toEqual([0, 1]);
    expect(naechstesFeld(3, 2, 'zeilen', 0, 1, -1)).toEqual([0, 0]);
    expect(naechstesFeld(3, 2, 'zeilen', 0, 0, -1)).toBeNull();
    expect(naechstesFeld(3, 2, 'zeilen', 2, 1, 1)).toBeNull();
  });
});
