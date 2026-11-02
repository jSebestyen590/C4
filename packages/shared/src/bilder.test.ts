import { describe, expect, it } from 'vitest';
import {
  bilderOrdnerAnlegenSchema,
  bilderSortieren,
  bilderSuche,
  eventOrdnerDaten,
  ordnerName,
  ordnerNameParsen,
  type BilderOrdnerDto,
} from './bilder';
import { eventSpanne } from './kalender';

describe('ordnerNameParsen', () => {
  it('parses a single day', () => {
    expect(ordnerNameParsen('2025-06-14_Sommerfest')).toEqual({
      von: '2025-06-14',
      bis: '2025-06-14',
      eventName: 'Sommerfest',
    });
  });
  it('parses a range in one month', () => {
    expect(ordnerNameParsen('2025-07-18-20_Festival')).toMatchObject({
      von: '2025-07-18',
      bis: '2025-07-20',
    });
  });
  it('parses a range across the month end', () => {
    expect(ordnerNameParsen('2025-07-30-08-02_Camp')).toMatchObject({
      von: '2025-07-30',
      bis: '2025-08-02',
    });
  });
  it('parses a range across the year end', () => {
    expect(ordnerNameParsen('2025-12-30-2026-01-02_Silvester')).toMatchObject({
      von: '2025-12-30',
      bis: '2026-01-02',
    });
  });
  it('keeps underscores and spaces in the event name', () => {
    expect(ordnerNameParsen('2025-06-14_Open Air_Teil 2')?.eventName).toBe('Open Air_Teil 2');
  });
  it('rejects names without a valid date or name', () => {
    expect(ordnerNameParsen('Sommerfest')).toBeNull();
    expect(ordnerNameParsen('2025-02-30_X')).toBeNull();
    expect(ordnerNameParsen('2025-07-20-18_X')).toBeNull();
    expect(ordnerNameParsen('2025-07-31-02-30_X')).toBeNull();
    expect(ordnerNameParsen('2025-06-14')).toBeNull();
    expect(ordnerNameParsen('2025-06-14_')).toBeNull();
    expect(ordnerNameParsen('2025-06-14 Fest')).toBeNull();
  });
});

describe('ordnerName', () => {
  it('uses the shortest form', () => {
    expect(ordnerName('2025-06-14', '2025-06-14', 'Fest')).toBe('2025-06-14_Fest');
    expect(ordnerName('2025-07-18', '2025-07-20', 'Fest')).toBe('2025-07-18-20_Fest');
    expect(ordnerName('2025-07-30', '2025-08-02', 'Fest')).toBe('2025-07-30-08-02_Fest');
    expect(ordnerName('2025-12-30', '2026-01-02', 'Fest')).toBe('2025-12-30-2026-01-02_Fest');
  });
  it('removes forbidden characters and trailing dots and spaces', () => {
    expect(ordnerName('2025-06-14', '2025-06-14', ' A/B: "C"? * <D>|\\ ... ')).toBe(
      '2025-06-14_AB C D',
    );
  });
  it('round-trips with the parser', () => {
    for (const [von, bis] of [
      ['2025-06-14', '2025-06-14'],
      ['2025-07-18', '2025-07-20'],
      ['2025-07-30', '2025-08-02'],
      ['2025-12-30', '2026-01-02'],
    ] as const) {
      expect(ordnerNameParsen(ordnerName(von, bis, 'Ein Event'))).toEqual({
        von,
        bis,
        eventName: 'Ein Event',
      });
    }
  });
});

describe('eventOrdnerDaten', () => {
  const basis = { anzeigeTitel: 'Barabend' };
  it('is one day for an event that ends after midnight', () => {
    const s = eventSpanne('eintaegig', {
      datum: '2025-06-14',
      bis: '2025-06-14',
      beginnZeit: '20:00',
      endeZeit: '04:00',
    });
    expect(eventOrdnerDaten({ ...basis, dauer: 'eintaegig', ...s })).toEqual({
      von: '2025-06-14',
      bis: '2025-06-14',
      eventName: 'Barabend',
    });
  });
  it('ends on the last day of a multi-day event', () => {
    const s = eventSpanne('mehrtaegig', {
      datum: '2025-07-18',
      bis: '2025-07-20',
      beginnZeit: '16:00',
      endeZeit: '03:00',
    });
    expect(eventOrdnerDaten({ ...basis, dauer: 'mehrtaegig', ...s }).bis).toBe('2025-07-20');
  });
  it('ends the day before the exclusive end of a whole-day event', () => {
    const s = eventSpanne('ganztaegig', {
      datum: '2025-07-18',
      bis: '2025-07-20',
      beginnZeit: '00:00',
      endeZeit: '00:00',
    });
    expect(eventOrdnerDaten({ ...basis, dauer: 'ganztaegig', ...s })).toMatchObject({
      von: '2025-07-18',
      bis: '2025-07-20',
    });
  });
  it('uses Berlin days around midnight UTC', () => {
    expect(
      eventOrdnerDaten({
        ...basis,
        dauer: 'eintaegig',
        beginn: '2025-06-13T22:30:00.000Z',
        ende: '2025-06-14T02:00:00.000Z',
      }).von,
    ).toBe('2025-06-14');
  });
});

describe('bilderOrdnerAnlegenSchema', () => {
  it('trims the name and accepts an optional end', () => {
    expect(bilderOrdnerAnlegenSchema.parse({ eventName: '  Fest ', von: '2025-06-14' })).toEqual({
      eventName: 'Fest',
      von: '2025-06-14',
    });
    expect(
      bilderOrdnerAnlegenSchema.parse({ eventName: 'Fest', von: '2025-06-14', bis: '2025-06-15' })
        .bis,
    ).toBe('2025-06-15');
  });
  it('rejects empty names, bad dates and an end before the start', () => {
    expect(bilderOrdnerAnlegenSchema.safeParse({ eventName: ' ', von: '2025-06-14' }).success).toBe(
      false,
    );
    expect(bilderOrdnerAnlegenSchema.safeParse({ eventName: 'x', von: '14.06.2025' }).success).toBe(
      false,
    );
    expect(
      bilderOrdnerAnlegenSchema.safeParse({ eventName: 'x'.repeat(101), von: '2025-06-14' })
        .success,
    ).toBe(false);
    expect(
      bilderOrdnerAnlegenSchema.safeParse({ eventName: 'x', von: '2025-06-14', bis: '2025-06-13' })
        .success,
    ).toBe(false);
  });
});

const o = (
  name: string,
  von: string | null,
  bis: string | null,
  eventName: string,
): BilderOrdnerDto => ({ id: name, name, webUrl: 'u', von, bis, eventName, eventId: null });

describe('bilderSuche', () => {
  const fest = o('2025-06-14_Sommerfest', '2025-06-14', '2025-06-14', 'Sommerfest');
  const camp = o('2025-07-30-08-02_Camp', '2025-07-30', '2025-08-02', 'Camp');
  const ohne = o('Alte Fotos', null, null, 'Alte Fotos');
  it('matches the event name case-insensitively', () => {
    expect(bilderSuche(fest, 'SOMMER')).toBe(true);
    expect(bilderSuche(fest, 'winter')).toBe(false);
    expect(bilderSuche(fest, '')).toBe(true);
  });
  it('matches ISO and German dates', () => {
    for (const t of [
      '2025-06-14',
      '2025-06',
      '2025',
      '14.06.2025',
      '14.06.',
      '14.6.2025',
      '6.2025',
    ])
      expect(bilderSuche(fest, t), t).toBe(true);
    for (const t of ['2025-06-15', '2024', '15.06.2025', '14.07.', '2025-07'])
      expect(bilderSuche(fest, t), t).toBe(false);
  });
  it('matches any day of a range', () => {
    expect(bilderSuche(camp, '31.07.2025')).toBe(true);
    expect(bilderSuche(camp, '01.08.')).toBe(true);
    expect(bilderSuche(camp, '2025-08')).toBe(true);
    expect(bilderSuche(camp, '03.08.2025')).toBe(false);
  });
  it('combines words with AND', () => {
    expect(bilderSuche(fest, 'sommer 2025')).toBe(true);
    expect(bilderSuche(fest, 'sommer 2024')).toBe(false);
  });
  it('matches folders without a date by raw name only', () => {
    expect(bilderSuche(ohne, 'alte')).toBe(true);
    expect(bilderSuche(ohne, '2025')).toBe(false);
  });
});

describe('bilderSortieren', () => {
  it('puts the newest first and undated folders last', () => {
    const l = [
      o('b', null, null, 'b'),
      o('2024-01-01_x', '2024-01-01', '2024-01-01', 'x'),
      o('a', null, null, 'a'),
      o('2025-01-01_y', '2025-01-01', '2025-01-01', 'y'),
    ];
    expect(bilderSortieren(l).map((x) => x.name)).toEqual([
      '2025-01-01_y',
      '2024-01-01_x',
      'a',
      'b',
    ]);
  });
});
