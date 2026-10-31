import { describe, expect, it } from 'vitest';
import { eventTage, zeitraumAnzeigen, erinnerungText, zeitraumKurz } from './kalenderZeit';

describe('erinnerungText', () => {
  it('uses the largest unit that divides evenly, singular and plural', () => {
    expect(erinnerungText(10080)).toBe('1 Woche vorher');
    expect(erinnerungText(20160)).toBe('2 Wochen vorher');
    expect(erinnerungText(2880)).toBe('2 Tage vorher');
    expect(erinnerungText(1440)).toBe('1 Tag vorher');
    expect(erinnerungText(180)).toBe('3 Stunden vorher');
    expect(erinnerungText(60)).toBe('1 Stunde vorher');
    expect(erinnerungText(90)).toBe('90 Minuten vorher');
    expect(erinnerungText(15)).toBe('15 Minuten vorher');
    expect(erinnerungText(4320 + 60)).toBe('73 Stunden vorher');
  });
});

describe('zeitraumKurz', () => {
  it('shows weekday and day without year, the end only as a time', () => {
    expect(zeitraumKurz('2026-11-01T19:00:00.000Z', '2026-11-02T00:00:00.000Z')).toBe(
      'So, 01.11. 20:00 – 01:00',
    );
  });

  it('keeps the same format within one day', () => {
    expect(zeitraumKurz('2026-10-31T19:00:00.000Z', '2026-10-31T22:00:00.000Z')).toBe(
      'Sa, 31.10. 20:00 – 23:00',
    );
  });
});

describe('mehrtägige Events', () => {
  it('shows multi-day and whole-day ranges', () => {
    expect(zeitraumKurz('2026-07-10T16:00:00.000Z', '2026-07-12T12:00:00.000Z', 'mehrtaegig')).toBe(
      'Fr, 10.07. 18:00 – So, 12.07. 14:00',
    );
    expect(zeitraumKurz('2026-07-09T22:00:00.000Z', '2026-07-12T22:00:00.000Z', 'ganztaegig')).toBe(
      'Fr, 10.07. – So, 12.07.',
    );
    expect(zeitraumKurz('2026-07-09T22:00:00.000Z', '2026-07-10T22:00:00.000Z', 'ganztaegig')).toBe(
      'Fr, 10.07. ganztägig',
    );
    expect(
      zeitraumAnzeigen('2026-07-09T22:00:00.000Z', '2026-07-12T22:00:00.000Z', 'ganztaegig'),
    ).toBe('Fr, 10.07.2026 – So, 12.07.2026');
  });

  it('puts multi-day events on every day they cover', () => {
    expect(
      eventTage({
        beginn: '2026-07-09T22:00:00.000Z',
        ende: '2026-07-12T22:00:00.000Z',
        dauer: 'ganztaegig',
      }),
    ).toEqual(['2026-07-10', '2026-07-11', '2026-07-12']);
    expect(
      eventTage({
        beginn: '2026-07-10T18:00:00.000Z',
        ende: '2026-07-11T02:00:00.000Z',
        dauer: 'eintaegig',
      }),
    ).toEqual(['2026-07-10']);
  });
});
