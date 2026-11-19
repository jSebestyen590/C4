import { describe, expect, it } from 'vitest';
import { belegEntwurfDatenSchema } from '@c4/shared';
import { einlagerungZeitpunkt } from './finanzenBelege';

const daten = (belegdatum: string | null) => belegEntwurfDatenSchema.parse({ belegdatum });

describe('einlagerungZeitpunkt', () => {
  it('uses now when the Belegdatum is today, before or after noon', () => {
    const frueh = new Date('2026-11-19T08:00:00Z'); // 09:00 Berlin
    const spaet = new Date('2026-11-19T12:18:00Z'); // 13:18 Berlin
    expect(einlagerungZeitpunkt(daten('2026-11-19'), frueh)).toEqual(frueh);
    expect(einlagerungZeitpunkt(daten('2026-11-19'), spaet)).toEqual(spaet);
  });

  it('uses 12:00 Berlin for a past Belegdatum', () => {
    const jetzt = new Date('2026-11-19T12:18:00Z');
    expect(einlagerungZeitpunkt(daten('2026-11-10'), jetzt)).toEqual(
      new Date('2026-11-10T11:00:00Z'),
    );
    expect(einlagerungZeitpunkt(daten('2026-07-10'), jetzt)).toEqual(
      new Date('2026-07-10T10:00:00Z'),
    );
  });

  it('uses now without a Belegdatum and never a future time', () => {
    const jetzt = new Date('2026-11-19T12:18:00Z');
    expect(einlagerungZeitpunkt(daten(null), jetzt)).toEqual(jetzt);
    expect(einlagerungZeitpunkt(daten('2026-12-01'), jetzt)).toEqual(jetzt);
  });
});
