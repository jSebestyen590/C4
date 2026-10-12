import { describe, expect, it } from 'vitest';
import { kontaktLink, telefonNormalisieren } from './kontakt';

describe('telefonNormalisieren', () => {
  it('normalizes common German and international notations', () => {
    expect(telefonNormalisieren('+49 171 1234567')).toBe('491711234567');
    expect(telefonNormalisieren('0171/1234567')).toBe('491711234567');
    expect(telefonNormalisieren('(0171) 123-4567')).toBe('491711234567');
    expect(telefonNormalisieren('0049 171 1234567')).toBe('491711234567');
    expect(telefonNormalisieren('+43 660 1234567')).toBe('436601234567');
  });
  it('gives up on anything it cannot read', () => {
    expect(telefonNormalisieren('1234567')).toBeNull();
    expect(telefonNormalisieren('abc')).toBeNull();
    expect(telefonNormalisieren('0171')).toBeNull();
    expect(telefonNormalisieren('')).toBeNull();
  });
});

describe('kontaktLink', () => {
  const angaben = { telefon: '0171 1234567', email: 'e@example.de' };
  it('builds the app links', () => {
    expect(kontaktLink('whatsapp', angaben)).toBe('https://wa.me/491711234567');
    expect(kontaktLink('signal', angaben)).toBe('https://signal.me/#p/+491711234567');
    expect(kontaktLink('telegram', angaben)).toBe('https://t.me/+491711234567');
    expect(kontaktLink('mail', angaben)).toBe('mailto:e@example.de');
  });
  it('needs the matching detail and never links Discord', () => {
    expect(kontaktLink('whatsapp', { telefon: null, email: 'e@example.de' })).toBeNull();
    expect(kontaktLink('mail', { telefon: '0171 1234567', email: null })).toBeNull();
    expect(kontaktLink('discord', angaben)).toBeNull();
  });
});
