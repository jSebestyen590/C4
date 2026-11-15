import { describe, expect, it } from 'vitest';
import { feldReihenfolge } from './feldReihenfolge';

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
});
