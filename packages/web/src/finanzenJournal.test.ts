import { describe, expect, it } from 'vitest';
import {
  bewegungText,
  journalSortieren,
  sortAusParams,
  sortLabel,
  type SortRichtung,
  type SortSpalte,
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

describe('journalSortieren', () => {
  const b = (
    seq: number,
    datum: string,
    text: string,
    betragCent: number,
    erstellt: string | null,
    konto: { betragCent: number; saldoNachCent: number } | null = null,
    abgang = [k('Bank')],
    zugang = [k('Safe')],
  ) => ({
    seq,
    datum,
    text,
    betragCent,
    abgang,
    zugang,
    konto,
    erstelltVon: erstellt
      ? {
          sub: erstellt,
          username: erstellt,
          vorname: '',
          nachname: '',
          status: 'mitglied' as const,
          anrede: 'neutral' as const,
        }
      : null,
  });
  const liste = [
    b(1, '2027-03-01', 'Zebra', 500, 'Anna', { betragCent: -500, saldoNachCent: -500 }),
    b(
      2,
      '2027-01-01',
      'Äpfel',
      100,
      null,
      { betragCent: 300, saldoNachCent: -200 },
      [k('Safe')],
      [k('Bank')],
    ),
    b(3, '2027-01-01', 'Mango', 900, 'Berta', { betragCent: -50, saldoNachCent: -250 }),
  ];
  const seqs = (spalte: SortSpalte, richtung: SortRichtung, mitKonto: boolean) =>
    journalSortieren(liste, spalte, richtung, mitKonto).map((x) => x.seq);

  it('sorts by number and date with Nr. as tiebreak', () => {
    expect(seqs('nr', 'desc', false)).toEqual([3, 2, 1]);
    expect(seqs('nr', 'asc', false)).toEqual([1, 2, 3]);
    expect(seqs('datum', 'asc', false)).toEqual([2, 3, 1]);
    expect(seqs('datum', 'desc', false)).toEqual([1, 3, 2]);
  });

  it('sorts text German-aware, by accounts, creator and amounts', () => {
    expect(seqs('text', 'asc', false)).toEqual([2, 3, 1]);
    // "Bank → Safe" (Nr. 3 before 1 by date) before "Safe → Bank"
    expect(seqs('konten', 'asc', false)).toEqual([3, 1, 2]);
    expect(seqs('erstellt', 'asc', false)).toEqual([2, 1, 3]);
    expect(seqs('betrag', 'asc', false)).toEqual([2, 1, 3]);
  });

  it('sorts by signed movement and balance in an account statement', () => {
    expect(seqs('betrag', 'asc', true)).toEqual([1, 3, 2]);
    expect(seqs('betrag', 'desc', true)).toEqual([2, 3, 1]);
    expect(seqs('saldo', 'asc', true)).toEqual([1, 3, 2]);
    // the counter account is Safe everywhere; ties fall back to date, then Nr.
    expect(seqs('konten', 'asc', true)).toEqual([2, 3, 1]);
  });
});

describe('sortAusParams / sortLabel', () => {
  it('falls back to Nr. descending for unknown values', () => {
    expect(sortAusParams(null, null, false)).toEqual({ spalte: 'nr', richtung: 'desc' });
    expect(sortAusParams('kaputt', 'asc', false)).toEqual({ spalte: 'nr', richtung: 'desc' });
    expect(sortAusParams('saldo', 'asc', false)).toEqual({ spalte: 'nr', richtung: 'desc' });
    expect(sortAusParams('saldo', 'asc', true)).toEqual({ spalte: 'saldo', richtung: 'asc' });
    expect(sortAusParams('datum', null, false)).toEqual({ spalte: 'datum', richtung: 'desc' });
  });

  it('names the columns per view', () => {
    expect(sortLabel('betrag', true)).toBe('Bewegung');
    expect(sortLabel('konten', false)).toBe('Von → Nach');
  });
});
