import { describe, expect, it } from 'vitest';
import {
  bewegungText,
  richtungKurz,
  richtungText,
  richtungZeilen,
  saldoText,
  vonNachText,
} from './finanzenJournal';

const k = (kontoName: string, betragCent = 100) => ({ kontoId: kontoName, kontoName, betragCent });

describe('Journal-Richtung', () => {
  it('shows up to two names and shortens longer sides', () => {
    expect(richtungText([])).toBe('–');
    expect(richtungText([k('Bank (Fyrst)')])).toBe('Bank (Fyrst)');
    expect(richtungText([k('Bank'), k('Safe')])).toBe('Bank, Safe');
    expect(richtungText([k('Bank'), k('Safe'), k('Kasse'), k('Bar')])).toBe('Bank + 3 weitere');
    expect(richtungKurz([k('A'), k('B'), k('C')])).toEqual({ namen: ['A'], weitere: 2 });
  });

  it('joins both sides and lists all accounts with amounts', () => {
    expect(vonNachText([k('Bank (Fyrst)')], [k('Geldtransit')])).toBe('Bank (Fyrst) → Geldtransit');
    expect(richtungZeilen([k('Bank', 2550), k('Safe', 100)])).toEqual([
      'Bank: 25,50 €',
      'Safe: 1,00 €',
    ]);
  });

  it('labels movements with a word and the absolute amount', () => {
    expect(bewegungText(2550)).toBe('Zugang 25,50 €');
    expect(bewegungText(-2550)).toBe('Abgang 25,50 €');
    expect(bewegungText(0)).toBe('0,00 €');
  });

  it('writes negative balances with a minus sign', () => {
    expect(saldoText(-350)).toBe('−3,50 €');
    expect(saldoText(1000)).toBe('10,00 €');
  });
});
