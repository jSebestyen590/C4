import { describe, expect, it } from 'vitest';
import { heuteBerlin, tagNachher } from './datum';
import { setMitgliedStatusSchema } from './schemas';
import {
  aktuellerStatus,
  mitgliedschaftTage,
  statusEintragEingabeSchema,
  statusZeitraeume,
} from './statusVerlauf';

describe('statusZeitraeume', () => {
  it('lasts until the day before the next entry, the last until the end', () => {
    expect(
      statusZeitraeume(
        [
          { status: 'mitglied', ab: '2024-03-01' },
          { status: 'anwaerter', ab: '2024-01-01' },
        ],
        '2024-12-31',
      ),
    ).toEqual([
      { status: 'anwaerter', von: '2024-01-01', bis: '2024-02-29' },
      { status: 'mitglied', von: '2024-03-01', bis: '2024-12-31' },
    ]);
  });

  it('skips undated entries and entries after the end', () => {
    expect(
      statusZeitraeume(
        [
          { status: 'anwaerter', ab: null },
          { status: 'mitglied', ab: '2024-03-01' },
          { status: 'em', ab: '2025-01-01' },
        ],
        '2024-06-30',
      ),
    ).toEqual([{ status: 'mitglied', von: '2024-03-01', bis: '2024-06-30' }]);
  });

  it('keeps a single-day period', () => {
    expect(
      statusZeitraeume(
        [
          { status: 'anwaerter', ab: '2024-05-01' },
          { status: 'mitglied', ab: '2024-05-02' },
        ],
        '2024-05-02',
      ),
    ).toEqual([
      { status: 'anwaerter', von: '2024-05-01', bis: '2024-05-01' },
      { status: 'mitglied', von: '2024-05-02', bis: '2024-05-02' },
    ]);
  });
});

describe('mitgliedschaftTage', () => {
  it('counts the inclusive days of the Mitglied periods only', () => {
    const eintraege = [
      { status: 'anwaerter' as const, ab: null },
      { status: 'mitglied' as const, ab: '2024-01-01' },
      { status: 'extern' as const, ab: '2024-01-11' },
      { status: 'mitglied' as const, ab: '2024-02-01' },
    ];
    expect(mitgliedschaftTage(eintraege, '2024-02-05')).toBe(10 + 5);
    expect(mitgliedschaftTage(eintraege, '2024-01-01')).toBe(1);
  });

  it('is 0 without dated Mitglied entries', () => {
    expect(mitgliedschaftTage([{ status: 'mitglied', ab: null }], '2024-12-31')).toBe(0);
  });
});

describe('aktuellerStatus', () => {
  it('picks the latest date; undated count as oldest', () => {
    expect(
      aktuellerStatus([
        { status: 'em', ab: '2024-05-01' },
        { status: 'anwaerter', ab: null },
        { status: 'mitglied', ab: '2023-01-01' },
      ])?.status,
    ).toBe('em');
    expect(aktuellerStatus([{ status: 'anwaerter', ab: null }])?.status).toBe('anwaerter');
    expect(
      aktuellerStatus([
        { status: 'anwaerter', ab: null },
        { status: 'mitglied', ab: null },
      ])?.status,
    ).toBe('mitglied');
    expect(aktuellerStatus([])).toBeNull();
  });
});

describe('ab validation', () => {
  it('rejects future dates', () => {
    const zukunft = tagNachher(heuteBerlin(), 1);
    expect(statusEintragEingabeSchema.safeParse({ status: 'mitglied', ab: zukunft }).success).toBe(
      false,
    );
    expect(setMitgliedStatusSchema.safeParse({ status: 'mitglied', ab: zukunft }).success).toBe(
      false,
    );
    expect(
      statusEintragEingabeSchema.safeParse({ status: 'mitglied', ab: heuteBerlin() }).success,
    ).toBe(true);
    expect(setMitgliedStatusSchema.safeParse({ status: 'mitglied' }).success).toBe(true);
  });
});
