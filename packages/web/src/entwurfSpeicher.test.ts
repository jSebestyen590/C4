// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { lokalIstNeuer, lokalLesen, lokalLoeschen, lokalSpeichern } from './entwurfSpeicher';

describe('entwurfSpeicher', () => {
  beforeEach(() => localStorage.clear());

  it('stores and reads a value with its timestamp', () => {
    lokalSpeichern('a', { x: 1 }, 1000);
    expect(lokalLesen<{ x: number }>('a')).toEqual({ wert: { x: 1 }, zeit: 1000 });
  });

  it('returns null for missing or broken entries', () => {
    expect(lokalLesen('fehlt')).toBeNull();
    localStorage.setItem('c4:entwurf:kaputt', '{nope');
    expect(lokalLesen('kaputt')).toBeNull();
    localStorage.setItem('c4:entwurf:form', JSON.stringify({ wert: 1 }));
    expect(lokalLesen('form')).toBeNull();
  });

  it('deletes several keys', () => {
    lokalSpeichern('a', 1);
    lokalSpeichern('b', 2);
    lokalLoeschen('a', 'b');
    expect(lokalLesen('a')).toBeNull();
    expect(lokalLesen('b')).toBeNull();
  });

  it('compares with the server timestamp', () => {
    expect(lokalIstNeuer(Date.parse('2026-01-02T00:00:00Z'), '2026-01-01T00:00:00Z')).toBe(true);
    expect(lokalIstNeuer(Date.parse('2026-01-01T00:00:00Z'), '2026-01-02T00:00:00Z')).toBe(false);
    expect(lokalIstNeuer(1, 'kaputt')).toBe(true);
  });
});
