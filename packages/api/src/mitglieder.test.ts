import { describe, expect, it } from 'vitest';
import { kanaeleLesen, kanaeleSchreiben } from './mitglieder';

describe('Kontaktkanäle', () => {
  it('stores the channels comma-separated in canonical order', () => {
    expect(kanaeleSchreiben(['mail', 'whatsapp'])).toBe('whatsapp,mail');
    expect(kanaeleSchreiben([])).toBeNull();
  });
  it('reads known channels only', () => {
    expect(kanaeleLesen('signal,mail')).toEqual(['signal', 'mail']);
    expect(kanaeleLesen('fax,discord')).toEqual(['discord']);
    expect(kanaeleLesen(null)).toEqual([]);
  });
});
