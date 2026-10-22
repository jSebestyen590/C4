import { describe, expect, it } from 'vitest';
import {
  ausleiheTage,
  beginnText,
  belegteTage,
  berlinTag,
  maximaleBelegung,
  seitOderAb,
  tagNach,
  ueberschneiden,
  zeitraumText,
} from './inventarZeitraum';

describe('days in Europe/Berlin', () => {
  it('uses the Berlin calendar day of a timestamp', () => {
    expect(berlinTag('2026-10-20T22:30:00.000Z')).toBe('2026-10-21');
    expect(berlinTag(new Date('2026-07-01T21:59:00.000Z'))).toBe('2026-07-01');
    expect(berlinTag('2026-07-01T22:00:00.000Z')).toBe('2026-07-02');
  });
  it('shifts days across month ends', () => {
    expect(tagNach('2026-10-31')).toBe('2026-11-01');
    expect(tagNach('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('ausleiheTage / belegteTage', () => {
  it('occupies [start, return): the return day is free', () => {
    expect(ausleiheTage('2026-10-20T08:00:00.000Z', '2026-10-27')).toEqual({
      von: '2026-10-20',
      bis: '2026-10-27',
    });
  });
  it('occupies exactly one day when returning on the start day', () => {
    expect(ausleiheTage('2026-10-20T08:00:00.000Z', '2026-10-20')).toEqual({
      von: '2026-10-20',
      bis: '2026-10-21',
    });
  });
  it('is open-ended without a return day', () => {
    expect(ausleiheTage('2026-10-20T08:00:00.000Z', null).bis).toBeNull();
    expect(belegteTage('2026-10-20T08:00:00.000Z', null, '2026-12-01').bis).toBeNull();
  });
  it('extends an Ausleihe whose return day has come through today', () => {
    const start = '2026-10-10T08:00:00.000Z';
    expect(belegteTage(start, '2026-10-15', '2026-10-21')).toEqual({
      von: '2026-10-10',
      bis: '2026-10-22',
    });
    expect(belegteTage(start, '2026-10-21', '2026-10-21').bis).toBe('2026-10-22');
    expect(belegteTage(start, '2026-10-22', '2026-10-21').bis).toBe('2026-10-22');
  });
  it('treats positions without a known start as occupying forever', () => {
    expect(belegteTage(undefined, null, '2026-10-21')).toEqual({ von: '0000-01-01', bis: null });
  });
});

describe('ueberschneiden', () => {
  it('does not overlap adjacent periods', () => {
    expect(
      ueberschneiden(
        { von: '2026-10-20', bis: '2026-10-27' },
        { von: '2026-10-27', bis: '2026-10-29' },
      ),
    ).toBe(false);
    expect(
      ueberschneiden({ von: '2026-10-20', bis: '2026-10-27' }, { von: '2026-10-26', bis: null }),
    ).toBe(true);
    expect(ueberschneiden({ von: '2026-10-20', bis: null }, { von: '2030-01-01', bis: null })).toBe(
      true,
    );
  });
});

describe('maximaleBelegung', () => {
  const b = (von: string, bis: string | null, anzahl: number) => ({ von, bis, anzahl });
  const fenster = { von: '2026-10-20', bis: '2026-10-30' };
  it('is zero without overlap', () => {
    expect(maximaleBelegung([], fenster)).toBe(0);
    expect(
      maximaleBelegung([b('2026-10-01', '2026-10-20', 4), b('2026-10-30', null, 2)], fenster),
    ).toBe(0);
  });
  it('takes the maximum of simultaneous pieces, not the sum', () => {
    const liste = [
      b('2026-10-20', '2026-10-23', 2),
      b('2026-10-23', '2026-10-26', 3),
      b('2026-10-22', '2026-10-24', 1),
    ];
    expect(maximaleBelegung(liste, fenster)).toBe(4);
  });
  it('handles several overlaps and open-ended entries', () => {
    const liste = [
      b('2026-10-01', null, 1),
      b('2026-10-21', '2026-10-28', 2),
      b('2026-10-25', '2026-10-27', 2),
      b('2026-10-26', '2026-10-29', 1),
    ];
    expect(maximaleBelegung(liste, fenster)).toBe(6);
    expect(maximaleBelegung(liste, { von: '2026-10-28', bis: '2026-10-29' })).toBe(2);
  });
  it('clips to the window and supports an open-ended window', () => {
    expect(
      maximaleBelegung([b('2026-10-01', '2026-10-21', 5)], {
        von: '2026-10-21',
        bis: '2026-10-22',
      }),
    ).toBe(0);
    expect(
      maximaleBelegung([b('2026-12-01', '2026-12-05', 3)], { von: '2026-10-21', bis: null }),
    ).toBe(3);
  });
});

describe('texts', () => {
  it('formats periods', () => {
    expect(zeitraumText('2026-10-20T08:00:00.000Z', '2026-10-27')).toBe('20.10.–27.10.2026');
    expect(zeitraumText('2026-12-30T08:00:00.000Z', '2027-01-05')).toBe('30.12.2026–05.01.2027');
    expect(zeitraumText('2026-10-25T08:00:00.000Z', '2026-10-25')).toBe('25.10.2026');
  });
  it('says seit for a started and ab for a future Ausleihe', () => {
    const jetzt = new Date('2026-10-21T12:00:00.000Z');
    expect(seitOderAb('2026-10-25T10:00:00.000Z', jetzt)).toBe('ab');
    expect(seitOderAb('2026-10-01T10:00:00.000Z', jetzt)).toBe('seit');
    expect(seitOderAb('2026-10-21T12:00:00.000Z', jetzt)).toBe('seit');
    expect(beginnText('2026-10-25T10:00:00.000Z', jetzt)).toBe('ab 25.10.2026');
    expect(beginnText('2026-10-01T10:00:00.000Z', jetzt, () => 'X')).toBe('seit X');
  });
});
