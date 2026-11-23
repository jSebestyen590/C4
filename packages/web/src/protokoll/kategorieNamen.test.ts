import { describe, expect, it } from 'vitest';
import { bausteinKategorie, kategorieNamenBauen } from './kategorieNamen';

const namen = kategorieNamenBauen(
  [{ id: 'k1', name: 'PP' }],
  [
    { id: 'v1', kategorieId: 'k1' },
    { id: 'v2', kategorieId: '' },
  ],
  [
    { id: 'e1', kategorie: { id: 'k1', name: 'PP', farbe: 'blue' } },
    { id: 'e2', kategorie: null },
  ],
);

describe('bausteinKategorie', () => {
  it('Event: own Kategorie first, else the Vorlage Kategorie', () => {
    expect(bausteinKategorie('bausteinEvent', { kategorieId: 'k1', vorlageId: null }, namen)).toBe(
      'PP',
    );
    expect(bausteinKategorie('bausteinEvent', { kategorieId: null, vorlageId: 'v1' }, namen)).toBe(
      'PP',
    );
    expect(
      bausteinKategorie('bausteinEvent', { kategorieId: null, vorlageId: 'v2' }, namen),
    ).toBeUndefined();
  });

  it('Vergangenes Event: only through the linked calendar event', () => {
    expect(bausteinKategorie('bausteinVergangenesEvent', { eventId: 'e1' }, namen)).toBe('PP');
    expect(bausteinKategorie('bausteinVergangenesEvent', { eventId: 'e2' }, namen)).toBeUndefined();
    expect(bausteinKategorie('bausteinVergangenesEvent', { eventId: null }, namen)).toBeUndefined();
  });

  it('is empty without a lookup or for other Bausteine', () => {
    expect(bausteinKategorie('bausteinEvent', { kategorieId: 'k1' }, undefined)).toBeUndefined();
    expect(bausteinKategorie('bausteinThema', { titel: 'x' }, namen)).toBeUndefined();
  });
});
