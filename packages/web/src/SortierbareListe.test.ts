import { describe, expect, it } from 'vitest';
import { umsortieren } from './SortierbareListe';

describe('umsortieren', () => {
  it('moves an entry up or down', () => {
    expect(umsortieren(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(umsortieren(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(umsortieren(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});
