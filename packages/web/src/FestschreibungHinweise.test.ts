import { describe, expect, it } from 'vitest';
import { festschreibungFaellig, verschiebText } from './FestschreibungHinweise';

describe('festschreibungFaellig', () => {
  it('is due from the 10th of the following month', () => {
    expect(festschreibungFaellig('2027-01-01', '2027-02-09')).toBe(false);
    expect(festschreibungFaellig('2027-01-01', '2027-02-10')).toBe(true);
    expect(festschreibungFaellig('2026-12-01', '2027-01-15')).toBe(true);
  });
  it('is never due without a month', () => {
    expect(festschreibungFaellig(null, '2027-02-20')).toBe(false);
  });
});

describe('verschiebText', () => {
  it('names the first open day for a date in a closed month', () => {
    expect(verschiebText('2027-01-15', '2027-01-31')).toBe(
      'Der Monat 01/2027 ist festgeschrieben, gebucht wird mit Datum 01.02.2027.',
    );
  });
  it('is empty for open dates and without closed months', () => {
    expect(verschiebText('2027-02-01', '2027-01-31')).toBeNull();
    expect(verschiebText('2020-01-01', null)).toBeNull();
    expect(verschiebText('', '2027-01-31')).toBeNull();
  });
});
