import { describe, expect, it } from 'vitest';
import {
  entwurfBasis,
  entwurfLesen,
  entwurfLoeschen,
  entwurfSchreiben,
  type KassenEntwurf,
} from './kassenEntwurf';

const speicher = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};
const basis = entwurfBasis({ saldoCent: 100, letzteAbrechnungId: null, zaehlungIds: ['b', 'a'] });
const entwurf: KassenEntwurf = {
  v: 1,
  basis,
  datum: '2027-01-12',
  ist: { 100: 3 },
  erloesWahl: null,
  zielWahl: 'z',
  transferEingabe: null,
  nachschub: { 100: { fachId: 't', stueck: 25 } },
  eventEingabe: { e1: 500 },
  schluessel: null,
};

describe('Kassenabrechnung-Entwurf', () => {
  it('liest, was geschrieben wurde, und löscht auf Wunsch', () => {
    const s = speicher();
    expect(entwurfLesen(s, 'k', basis)).toEqual({ art: 'keiner' });
    entwurfSchreiben(s, 'k', entwurf);
    expect(entwurfLesen(s, 'k', basis)).toEqual({ art: 'entwurf', entwurf });
    entwurfLoeschen(s, 'k');
    expect(entwurfLesen(s, 'k', basis)).toEqual({ art: 'keiner' });
  });
  it('verwirft einen Entwurf zu anderer Basis und räumt ihn weg', () => {
    const s = speicher();
    entwurfSchreiben(s, 'k', entwurf);
    const neu = entwurfBasis({ saldoCent: 100, letzteAbrechnungId: 'x', zaehlungIds: [] });
    expect(entwurfLesen(s, 'k', neu)).toEqual({ art: 'verworfen' });
    expect(entwurfLesen(s, 'k', neu)).toEqual({ art: 'keiner' });
  });
  it('die Basis hängt nicht von der Reihenfolge der Zählungen ab', () => {
    expect(basis).toBe(
      entwurfBasis({ saldoCent: 100, letzteAbrechnungId: null, zaehlungIds: ['a', 'b'] }),
    );
  });
  it('kaputte Daten und fehlender Speicher stören nicht', () => {
    const s = speicher();
    s.setItem('c4.kassenabrechnung.entwurf.k', '{kaputt');
    expect(entwurfLesen(s, 'k', basis)).toEqual({ art: 'keiner' });
    const kaputt = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
      removeItem: () => {
        throw new Error('x');
      },
    };
    expect(entwurfLesen(kaputt, 'k', basis)).toEqual({ art: 'keiner' });
    expect(() => entwurfSchreiben(kaputt, 'k', entwurf)).not.toThrow();
    expect(() => entwurfLoeschen(kaputt, 'k')).not.toThrow();
  });
});
