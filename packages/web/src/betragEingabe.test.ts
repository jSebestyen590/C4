import { describe, expect, it } from 'vitest';
import { BETRAG_MAX_CENT } from '@c4/shared';
import { betragFormatieren, betragLesen } from './betragEingabe';

describe('betragLesen', () => {
  it('treats an empty field as no value without an error', () => {
    expect(betragLesen('')).toEqual({ cent: null });
    expect(betragLesen('   ')).toEqual({ cent: null });
  });
  it('reads German amounts', () => {
    expect(betragLesen('1,10').cent).toBe(110);
    expect(betragLesen('1.234,56').cent).toBe(123456);
    expect(betragLesen('5').cent).toBe(500);
    expect(betragLesen('0,05 €').cent).toBe(5);
    expect(betragLesen('1.234').cent).toBe(123400);
  });
  it('rejects text, three decimals and negative amounts with a message', () => {
    expect(betragLesen('abc').fehler).toContain('Betrag');
    expect(betragLesen('1,234').fehler).toBeDefined();
    expect(betragLesen('-5').fehler).toContain('Minus');
    expect(betragLesen('-5').cent).toBeNull();
  });
  it('rejects amounts above the limit', () => {
    expect(betragLesen(String(BETRAG_MAX_CENT / 100 + 1)).fehler).toContain('zu hoch');
  });
});

describe('betragFormatieren', () => {
  it('uses comma, two decimals and thousands dots', () => {
    expect(betragFormatieren(110)).toBe('1,10');
    expect(betragFormatieren(123456)).toBe('1.234,56');
    expect(betragFormatieren(0)).toBe('0,00');
    expect(betragFormatieren(100000000)).toBe('1.000.000,00');
  });
  it('round-trips with betragLesen', () => {
    for (const c of [1, 99, 100, 123456, 999999999]) {
      expect(betragLesen(betragFormatieren(c)).cent).toBe(c);
    }
  });
});
