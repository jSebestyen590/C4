import { describe, expect, it } from 'vitest';
import type { SchichtEingabe } from '@c4/shared';
import {
  artPruefen,
  type KategorieInfo,
  istEindeutigVerletzt,
  jahrGrenzen,
  KalenderUngueltig,
  schichtAbgleich,
  zeitraumGrenzen,
  zusammenfuehrenPlan,
} from './kalender';

const eingabe = (id: string | undefined, formen: string[] = ['bar']): SchichtEingabe => ({
  ...(id !== undefined && { id }),
  art: 'betrieb',
  beginn: '2026-06-05T17:00:00.000Z',
  ende: '2026-06-05T22:00:00.000Z',
  bedarfe: formen.map((dienstformId) => ({ dienstformId, minimum: 1, wunsch: 2 })),
});

const bestehend = [
  {
    id: 's1',
    art: 'betrieb' as const,
    dienste: [
      { id: 'd1', dienstformId: 'bar' },
      { id: 'd2', dienstformId: 'technik' },
    ],
  },
  { id: 's2', art: 'betrieb' as const, dienste: [{ id: 'd3', dienstformId: 'bar' }] },
  { id: 's3', art: 'betrieb' as const, dienste: [] },
];

describe('schichtAbgleich', () => {
  it('keeps unchanged Schichten without removing anything', () => {
    const r = schichtAbgleich(bestehend, [
      eingabe('s1', ['bar', 'technik']),
      eingabe('s2'),
      eingabe('s3', []),
    ]);
    expect(r.behalten.map((b) => b.id)).toEqual(['s1', 's2', 's3']);
    expect(r.neu).toEqual([]);
    expect(r.entfernt).toEqual([]);
    expect(r.entfernteDienste).toEqual([]);
  });

  it('inserts Schichten without id and remembers their position', () => {
    const r = schichtAbgleich(bestehend, [
      eingabe(undefined),
      eingabe('s1', ['bar', 'technik']),
      eingabe('s2'),
      eingabe('s3'),
    ]);
    expect(r.neu.map((n) => n.index)).toEqual([0]);
    expect(r.behalten.map((b) => b.index)).toEqual([1, 2, 3]);
  });

  it('reports the Dienste of a removed Schicht', () => {
    const r = schichtAbgleich(bestehend, [eingabe('s1', ['bar', 'technik']), eingabe('s3')]);
    expect(r.entfernt).toEqual(['s2']);
    expect(r.entfernteDienste).toEqual([
      { dienstId: 'd3', schichtId: 's2', dienstformId: 'bar', grund: 'schicht' },
    ]);
  });

  it('reports Dienste whose Bedarf was removed, but not removed Bedarfe without Dienste', () => {
    const r = schichtAbgleich(bestehend, [
      eingabe('s1', ['bar']),
      eingabe('s2', []),
      eingabe('s3', ['bar']),
    ]);
    expect(r.entfernteDienste).toEqual([
      { dienstId: 'd2', schichtId: 's1', dienstformId: 'technik', grund: 'bedarf' },
      { dienstId: 'd3', schichtId: 's2', dienstformId: 'bar', grund: 'bedarf' },
    ]);
    expect(r.entfernt).toEqual([]);
  });

  it('rejects foreign and duplicate ids', () => {
    expect(() => schichtAbgleich(bestehend, [eingabe('fremd')])).toThrow(KalenderUngueltig);
    expect(() => schichtAbgleich(bestehend, [eingabe('s1'), eingabe('s1')])).toThrow(
      KalenderUngueltig,
    );
  });
});

describe('schichtAbgleich art change', () => {
  const aufbau = (id: string): SchichtEingabe => ({
    id,
    art: 'aufbau',
    beginn: '2026-06-05T15:00:00.000Z',
    ende: '2026-06-05T17:00:00.000Z',
    minimum: 1,
    wunsch: 2,
  });

  it('keeps the Dienste of a Betrieb that became Aufbau and clears their Dienstform', () => {
    const r = schichtAbgleich(bestehend, [aufbau('s1'), eingabe('s2'), eingabe('s3')]);
    expect(r.entfernteDienste).toEqual([]);
    expect(r.dienstformLeeren).toEqual(['d1', 'd2']);
  });

  it('removes the Dienste of an Aufbau that became Betrieb unless they match', () => {
    const alt = [{ id: 'a1', art: 'aufbau' as const, dienste: [{ id: 'x', dienstformId: null }] }];
    const r = schichtAbgleich(alt, [eingabe('a1')]);
    expect(r.entfernteDienste).toEqual([
      { dienstId: 'x', schichtId: 'a1', dienstformId: null, grund: 'bedarf' },
    ]);
    expect(r.dienstformLeeren).toEqual([]);
  });

  it('leaves an Aufbau as Aufbau alone', () => {
    const alt = [{ id: 'a1', art: 'aufbau' as const, dienste: [{ id: 'x', dienstformId: null }] }];
    const r = schichtAbgleich(alt, [aufbau('a1')]);
    expect(r.entfernteDienste).toEqual([]);
    expect(r.dienstformLeeren).toEqual([]);
  });
});

describe('zusammenfuehrenPlan', () => {
  it('moves Dienste and drops those in Schichten where the target is already entered', () => {
    const plan = zusammenfuehrenPlan(
      [{ schichtId: 'a' }],
      [
        { id: '1', schichtId: 'a' },
        { id: '2', schichtId: 'b' },
        { id: '3', schichtId: 'b' },
        { id: '4', schichtId: 'c' },
      ],
    );
    expect(plan).toEqual({ verschieben: ['2', '4'], verwerfen: ['1', '3'] });
  });

  it('moves everything when there is no overlap', () => {
    expect(zusammenfuehrenPlan([], [{ id: '1', schichtId: 'a' }])).toEqual({
      verschieben: ['1'],
      verwerfen: [],
    });
  });
});

describe('time ranges', () => {
  it('turns Berlin dates into a half-open UTC range, summer and winter', () => {
    expect(zeitraumGrenzen('2026-06-01', '2026-06-30')).toEqual({
      start: new Date('2026-05-31T22:00:00.000Z'),
      ende: new Date('2026-06-30T22:00:00.000Z'),
    });
    expect(zeitraumGrenzen('2026-01-01', '2026-01-01')).toEqual({
      start: new Date('2025-12-31T23:00:00.000Z'),
      ende: new Date('2026-01-01T23:00:00.000Z'),
    });
  });

  it('spans a Berlin calendar year', () => {
    expect(jahrGrenzen(2026)).toEqual({
      start: new Date('2025-12-31T23:00:00.000Z'),
      ende: new Date('2026-12-31T23:00:00.000Z'),
    });
  });
});

describe('istEindeutigVerletzt', () => {
  it('detects the Postgres code directly and as a wrapped cause', () => {
    expect(istEindeutigVerletzt({ code: '23505' })).toBe(true);
    expect(istEindeutigVerletzt({ cause: { code: '23505' } })).toBe(true);
    expect(istEindeutigVerletzt({ code: '23503' })).toBe(false);
    expect(istEindeutigVerletzt(new Error('x'))).toBe(false);
    expect(istEindeutigVerletzt(null)).toBe(false);
  });
});

describe('artPruefen', () => {
  const dienste = { art: 'dienste', teilnahmeStatus: null } as const;
  const teilnahme: KategorieInfo = { art: 'teilnahme', teilnahmeStatus: ['mitglied', 'em'] };
  const ohne = { schichten: [], teilnahmeStatus: null, eingeladen: [] };

  it('allows Schichten and no participation for a Dienste Kategorie', () => {
    expect(artPruefen(dienste, { ...ohne, schichten: [{}] })).toBeNull();
    expect(() => artPruefen(dienste, { ...ohne, teilnahmeStatus: [] })).toThrow(
      'Events mit Diensten haben keine Teilnahme.',
    );
    expect(() => artPruefen(dienste, { ...ohne, eingeladen: ['m1'] })).toThrow(
      'Events mit Diensten haben keine Teilnahme.',
    );
  });

  it('forbids Schichten and falls back to the default circle for a Teilnahme Kategorie', () => {
    expect(() => artPruefen(teilnahme, { ...ohne, schichten: [{}] })).toThrow(
      'Events mit Teilnahme haben keine Schichten.',
    );
    expect(artPruefen(teilnahme, ohne)).toEqual(['mitglied', 'em']);
    expect(artPruefen(teilnahme, { ...ohne, teilnahmeStatus: [] })).toEqual([]);
    expect(artPruefen({ art: 'teilnahme', teilnahmeStatus: null }, ohne)).toEqual([]);
  });
});
