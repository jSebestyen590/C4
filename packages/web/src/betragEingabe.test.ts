import { describe, expect, it } from 'vitest';
import { BETRAG_MAX_CENT } from '@c4/shared';
import { betragFormatieren, betragLesen, betragRechnen } from './betragEingabe';

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

describe('betragLesen mit negativ', () => {
  it('liest negative Beträge und das einzelne Minus als Zwischenstand', () => {
    expect(betragLesen('-30', true)).toEqual({ cent: -3000 });
    expect(betragLesen('-30,00', true)).toEqual({ cent: -3000 });
    expect(betragLesen('-0,05', true).cent).toBe(-5);
    expect(betragLesen('-', true)).toEqual({ cent: null });
    expect(betragLesen('30', true).cent).toBe(3000);
    expect(betragLesen('-1.000.000.000', true).fehler).toContain('zu hoch');
  });
  it('ohne negativ bleibt das Minus ein Fehler', () => {
    expect(betragLesen('-', false).fehler).toBeDefined();
    expect(betragLesen('-30,00').fehler).toContain('Minus');
  });
});

describe('betragFormatieren', () => {
  it('formatiert negative Beträge', () => {
    expect(betragFormatieren(-3000)).toBe('-30,00');
  });
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

describe('betragRechnen', () => {
  it('liest einen einfachen Betrag wie betragLesen', () => {
    expect(betragRechnen('1,10')).toEqual({ cent: 110, exaktCent: 110, rechnung: false });
    expect(betragRechnen('1.234,56')).toMatchObject({ cent: 123456 });
    expect(betragRechnen('')).toEqual({ cent: null, exaktCent: null, rechnung: false });
    expect(betragRechnen('1+1').rechnung).toBe(true);
  });

  it('rechnet mit Klammern und Dezimalkomma', () => {
    const r = betragRechnen('(7,99 + 4,50)/12');
    expect(r.exaktCent).toBeCloseTo(104.0833, 3);
    expect(r.cent).toBe(104);
  });

  it('beachtet Punkt vor Strich und mehrere Operatoren', () => {
    expect(betragRechnen('1+2*3').cent).toBe(700);
    expect(betragRechnen('10 - 2,5 - 1').cent).toBe(650);
    expect(betragRechnen('2*(1+0,5)').cent).toBe(300);
  });

  it('rundet auf ganze Cent', () => {
    expect(betragRechnen('1/3')).toMatchObject({ cent: 33 });
    expect(betragRechnen('2/3')).toMatchObject({ cent: 67 });
  });

  it('meldet ungültige Rechnungen', () => {
    for (const t of ['1+', '(1+2', '1+2)', '2**3', 'abc+1', '1 + a'])
      expect(betragRechnen(t)).toMatchObject({ cent: null, fehler: 'Ungültige Rechnung' });
  });

  it('meldet Division durch 0', () => {
    const r = betragRechnen('5/0');
    expect(r.cent).toBeNull();
    expect(r.fehler).toContain('Division durch 0');
    expect(betragRechnen('5/(1-1)').cent).toBeNull();
  });

  it('negative Ergebnisse nur mit negativ', () => {
    expect(betragRechnen('1-3').fehler).toBeDefined();
    expect(betragRechnen('1-3', true)).toMatchObject({ cent: -200, exaktCent: -200 });
    expect(betragRechnen('-(1+1)', true).cent).toBe(-200);
  });
});
