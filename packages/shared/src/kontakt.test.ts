import { describe, expect, it } from 'vitest';
import { TELEFON_KANAELE, kontaktLink, telefonNormalisieren, vcardErstellen } from './kontakt';

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

describe('TELEFON_KANAELE', () => {
  it('lists the phone based channels', () => {
    expect([...TELEFON_KANAELE]).toEqual(['whatsapp', 'signal', 'telegram']);
  });
});

describe('vcardErstellen', () => {
  const voll = {
    vorname: 'Erika',
    nachname: 'Muster',
    username: 'erika',
    telefon: '0171 1234567',
    email: 'erika@example.de',
    geburtsdatum: '1990-05-17',
    adresse: 'Musterstr. 1\n04109 Leipzig',
    discordName: 'erika#1',
  };

  it('writes all fields with CRLF lines', () => {
    const v = vcardErstellen(voll);
    expect(v.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n')).toBe(true);
    expect(v.endsWith('END:VCARD\r\n')).toBe(true);
    expect(v).toContain('\r\nN:Muster;Erika;;;\r\n');
    expect(v).toContain('\r\nFN:Erika Muster\r\n');
    expect(v).toContain('\r\nNICKNAME:erika\r\n');
    expect(v).toContain('\r\nORG:C4\r\n');
    expect(v).toContain('\r\nTEL;TYPE=CELL:+491711234567\r\n');
    expect(v).toContain('\r\nEMAIL;TYPE=INTERNET:erika@example.de\r\n');
    expect(v).toContain('\r\nBDAY:1990-05-17\r\n');
    expect(v).toContain('\r\nADR;TYPE=HOME:;;Musterstr. 1\\n04109 Leipzig;;;;\r\n');
    expect(v).toContain('\r\nNOTE:Discord: erika#1\r\n');
    expect(v).not.toContain('PHOTO');
    expect(v.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('escapes special characters', () => {
    const v = vcardErstellen({ vorname: 'A;B', nachname: 'C,D\\E' });
    expect(v).toContain('N:C\\,D\\\\E;A\\;B;;;');
  });

  it('leaves out missing details and falls back to the username', () => {
    const v = vcardErstellen({ vorname: '', nachname: '', username: 'erika' });
    expect(v).toContain('FN:erika');
    for (const feld of ['TEL', 'EMAIL', 'BDAY', 'ADR', 'NOTE', 'PHOTO'])
      expect(v).not.toContain(`\r\n${feld}`);
  });

  it('keeps an unreadable phone number as written', () => {
    expect(vcardErstellen({ ...voll, telefon: '12 34' })).toContain('TEL;TYPE=CELL:12 34');
  });

  it('folds long lines at 75 characters', () => {
    const foto = 'A'.repeat(300);
    const v = vcardErstellen({ ...voll, fotoBase64: foto });
    const zeilen = v.split('\r\n');
    expect(zeilen.every((z) => z.length <= 75)).toBe(true);
    const start = zeilen.findIndex((z) => z.startsWith('PHOTO;ENCODING=b;TYPE=JPEG:'));
    expect(start).toBeGreaterThan(-1);
    expect(zeilen[start + 1]?.startsWith(' ')).toBe(true);
    const text = v.replace(/\r\n /g, '');
    expect(text).toContain(`PHOTO;ENCODING=b;TYPE=JPEG:${foto}`);
  });
});
