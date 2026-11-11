import { describe, expect, it } from 'vitest';
import { auswahlWert, filterAusAuswahl } from './verlaufFilter';

describe('verlaufFilter', () => {
  it('maps select values to URL filters', () => {
    expect(filterAusAuswahl('bereich:umfrage')).toEqual({ art: null, bereich: 'umfrage' });
    expect(filterAusAuswahl('art:umfrage.neu')).toEqual({ art: 'umfrage.neu', bereich: null });
    expect(filterAusAuswahl('alle')).toEqual({ art: null, bereich: null });
    expect(filterAusAuswahl(null)).toEqual({ art: null, bereich: null });
  });
  it('round-trips', () => {
    expect(filterAusAuswahl(auswahlWert(undefined, 'todo'))).toEqual({
      art: null,
      bereich: 'todo',
    });
    expect(filterAusAuswahl(auswahlWert('todo.frist'))).toEqual({
      art: 'todo.frist',
      bereich: null,
    });
  });
});
