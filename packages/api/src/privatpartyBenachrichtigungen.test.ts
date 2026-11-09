import { describe, expect, it } from 'vitest';
import { mitgliederMitRecht } from './privatpartyBenachrichtigungen';

describe('mitgliederMitRecht', () => {
  it('joins Posten holders and admins without duplicates', async () => {
    const subs = await mitgliederMitRecht(
      {
        posten: { inhaberMitRecht: async () => ['a', 'b'] },
        userAdmin: {
          rollen: async () =>
            new Map([
              ['b', ['admin']],
              ['c', ['admin']],
              ['d', []],
              ['e', ['unbekannt']],
            ]),
        },
      },
      'privatpartys:verwalten',
    );
    expect(subs.sort()).toEqual(['a', 'b', 'c']);
  });
});
