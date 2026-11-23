import { describe, expect, it } from 'vitest';
import {
  buchungsdatumFuer,
  ersterOffenerTag,
  festgeschriebenBis,
  festschreibungEingabeSchema,
  monatsEnde,
  naechsterFestschreibbarerMonat,
} from './finanzenAbschluss';

describe('festgeschriebenBis', () => {
  it('is null without months', () => expect(festgeschriebenBis([])).toBeNull());
  it('is the last day of the latest month', () => {
    expect(festgeschriebenBis(['2026-02-01', '2026-01-01'])).toBe('2026-02-28');
    expect(festgeschriebenBis(['2024-02-01'])).toBe('2024-02-29');
    expect(festgeschriebenBis(['2026-12-01'])).toBe('2026-12-31');
  });
});

describe('ersterOffenerTag / monatsEnde', () => {
  it('is the day after', () => {
    expect(ersterOffenerTag(null)).toBeNull();
    expect(ersterOffenerTag('2026-12-31')).toBe('2027-01-01');
    expect(monatsEnde('2026-04-01')).toBe('2026-04-30');
  });
});

describe('naechsterFestschreibbarerMonat', () => {
  const heute = '2026-11-22';
  it('starts with the month of the earliest booking', () => {
    expect(
      naechsterFestschreibbarerMonat({
        letzterFest: null,
        fruehesteBuchung: '2026-09-17',
        heuteBerlin: heute,
      }),
    ).toBe('2026-09-01');
  });
  it('is null without bookings', () => {
    expect(
      naechsterFestschreibbarerMonat({
        letzterFest: null,
        fruehesteBuchung: null,
        heuteBerlin: heute,
      }),
    ).toBeNull();
  });
  it('follows the last closed month', () => {
    expect(
      naechsterFestschreibbarerMonat({
        letzterFest: '2026-09-01',
        fruehesteBuchung: '2026-09-17',
        heuteBerlin: heute,
      }),
    ).toBe('2026-10-01');
  });
  it('never returns the current or a future month', () => {
    expect(
      naechsterFestschreibbarerMonat({
        letzterFest: '2026-10-01',
        fruehesteBuchung: '2026-09-17',
        heuteBerlin: heute,
      }),
    ).toBeNull();
    expect(
      naechsterFestschreibbarerMonat({
        letzterFest: null,
        fruehesteBuchung: '2026-11-02',
        heuteBerlin: heute,
      }),
    ).toBeNull();
  });
  it('crosses the year', () => {
    expect(
      naechsterFestschreibbarerMonat({
        letzterFest: '2026-12-01',
        fruehesteBuchung: '2026-01-01',
        heuteBerlin: '2027-03-05',
      }),
    ).toBe('2027-01-01');
  });
});

describe('buchungsdatumFuer', () => {
  it('keeps dates in open months', () => {
    expect(buchungsdatumFuer('2026-11-05', null, false)).toEqual({
      datum: '2026-11-05',
      verschoben: false,
    });
    expect(buchungsdatumFuer('2026-11-01', '2026-10-31', false)).toEqual({
      datum: '2026-11-01',
      verschoben: false,
    });
  });
  it('refuses fixed dates in a closed month', () => {
    expect(buchungsdatumFuer('2026-10-31', '2026-10-31', false)).toEqual({
      fehler: 'Der Monat 10/2026 ist festgeschrieben. Buche mit einem Datum ab 01.11.2026.',
    });
  });
  it('moves shiftable dates to the first open day', () => {
    expect(buchungsdatumFuer('2026-09-12', '2026-10-31', true)).toEqual({
      datum: '2026-11-01',
      verschoben: true,
    });
  });
});

describe('festschreibungEingabeSchema', () => {
  const schluessel = '11111111-1111-4111-8111-111111111111';
  it('accepts the first of a month only', () => {
    expect(
      festschreibungEingabeSchema.safeParse({
        monat: '2026-10-01',
        idempotenzSchluessel: schluessel,
      }).success,
    ).toBe(true);
    expect(
      festschreibungEingabeSchema.safeParse({
        monat: '2026-10-15',
        idempotenzSchluessel: schluessel,
      }).success,
    ).toBe(false);
  });
});
