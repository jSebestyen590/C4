import { describe, expect, it } from 'vitest';
import { jePersonMl, literAnzeigen, trichterName, trichterOptionLabel } from './trichterAnzeige';

describe('trichterAnzeige', () => {
  it('formats litres in German with at most 2 decimals', () => {
    expect(literAnzeigen(1500)).toBe('1,5 l');
    expect(literAnzeigen(2000)).toBe('2 l');
    expect(literAnzeigen(1000 / 3)).toBe('0,33 l');
    expect(literAnzeigen(12345)).toBe('12,35 l');
  });

  it('splits the volume among participants', () => {
    expect(jePersonMl(3000, 4)).toBe(750);
    expect(jePersonMl(3000, 0)).toBe(0);
  });

  it('names members by username, else full name', () => {
    expect(trichterName({ username: 'otto', vorname: 'Otto', nachname: 'N' })).toBe('otto');
    expect(trichterName({ username: null, vorname: 'Otto', nachname: 'N' })).toBe('Otto N');
  });

  it('labels funnels', () => {
    expect(trichterOptionLabel({ name: 'Groß', volumenMl: 3000, auslaesse: 4 })).toBe(
      'Groß (3 l, 4 Auslässe)',
    );
    expect(trichterOptionLabel({ name: 'Solo', volumenMl: 500, auslaesse: 1 })).toBe(
      'Solo (0,5 l, 1 Auslass)',
    );
  });
});
