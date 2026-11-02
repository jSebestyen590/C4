import { describe, expect, it } from 'vitest';
import {
  balkenPosition,
  besetzungSegmente,
  MITGLIED_PALETTE,
  personenFarben,
  spaetestes,
  ticks,
  zeitraumText,
} from './zeitstrahlLogik';

describe('zeitstrahl', () => {
  it('positions inclusive periods in percent', () => {
    const bereich = { von: '2020-01-01', bis: '2020-01-10' };
    expect(balkenPosition(bereich, '2020-01-01', '2020-01-05')).toEqual({ links: 0, breite: 50 });
    expect(balkenPosition(bereich, '2020-01-10', '2020-01-10')).toEqual({ links: 90, breite: 10 });
  });

  it('uses year ticks for long ranges and month ticks for short ones', () => {
    const jahre = ticks({ von: '2012-06-01', bis: '2015-03-01' });
    expect(jahre.map((t) => t.label)).toEqual(['2013', '2014', '2015']);
    const monate = ticks({ von: '2025-11-15', bis: '2026-04-10' });
    expect(monate.map((t) => t.label)).toEqual(['Dez', 'Jan 2026', 'Feb', 'Mär', 'Apr']);
    const halbmonate = ticks({ von: '2026-10-20', bis: '2026-11-20' });
    expect(halbmonate.map((t) => t.label)).toEqual(['1. Nov', '15. Nov']);
  });

  it('extends the range end to planned end dates, never before the minimum', () => {
    expect(spaetestes(['2026-12-31', '2026-01-01'], '2026-11-02')).toBe('2026-12-31');
    expect(spaetestes([], '2026-11-02')).toBe('2026-11-02');
  });

  it('splits a Besetzung at status changes and marks unknown stretches', () => {
    const zeitraeume = [
      { status: 'anwaerter' as const, von: '2020-01-05', bis: '2020-01-09' },
      { status: 'mitglied' as const, von: '2020-01-10', bis: '2020-01-20' },
    ];
    expect(besetzungSegmente('2020-01-01', '2020-01-15', zeitraeume)).toEqual([
      { von: '2020-01-01', bis: '2020-01-04', status: null },
      { von: '2020-01-05', bis: '2020-01-09', status: 'anwaerter' },
      { von: '2020-01-10', bis: '2020-01-15', status: 'mitglied' },
    ]);
    expect(besetzungSegmente('2020-02-01', '2020-02-03', zeitraeume)).toEqual([
      { von: '2020-02-01', bis: '2020-02-03', status: null },
    ]);
  });

  it('assigns palette colors by first start, consistently per person', () => {
    const farben = personenFarben([
      { key: 'b', start: '2015-01-01' },
      { key: 'a', start: '2010-01-01' },
      { key: 'b', start: '2009-01-01' },
    ]);
    expect(farben.get('b')).toBe(MITGLIED_PALETTE[0]);
    expect(farben.get('a')).toBe(MITGLIED_PALETTE[1]);
  });

  it('formats tooltip text', () => {
    expect(zeitraumText('Kassenwart', '2012-11-06', '2019-12-31', false)).toBe(
      'Kassenwart · 06.11.2012 – 31.12.2019',
    );
    expect(zeitraumText('Kassenwart', '2012-11-06', '2026-11-02', true)).toBe(
      'Kassenwart · seit 06.11.2012',
    );
  });
});
