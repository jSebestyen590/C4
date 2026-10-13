import { describe, expect, it } from 'vitest';
import { bezeichnungFuer } from './posten';

const posten = {
  name: 'Vorstandsvorsitz',
  bezeichnungMaennlich: 'Chef',
  bezeichnungWeiblich: 'Chefin',
  bezeichnungNeutral: 'Chef:in',
};

describe('bezeichnungFuer', () => {
  it('picks the form matching the address', () => {
    expect(bezeichnungFuer(posten, 'maennlich')).toBe('Chef');
    expect(bezeichnungFuer(posten, 'weiblich')).toBe('Chefin');
    expect(bezeichnungFuer(posten, 'neutral')).toBe('Chef:in');
  });
  it('falls back to the Posten name without a title', () => {
    const ohne = {
      name: 'Kasse',
      bezeichnungMaennlich: null,
      bezeichnungWeiblich: null,
      bezeichnungNeutral: null,
    };
    expect(bezeichnungFuer(ohne, 'weiblich')).toBe('Kasse');
  });
});
