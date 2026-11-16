import { describe, expect, it, vi } from 'vitest';
import type { EventEingabe, SerieDto, VorlageDto } from '@c4/shared';
import { serieSofortErzeugen, serienErzeugen } from './kalenderSerien';
import type { KalenderStore } from './kalender';

const MI = new Date('2026-10-28T10:00:00Z');
const serie: SerieDto = {
  id: 'barabend',
  name: 'Barabend',
  vorlageId: 'barabend',
  regel: 'woechentlich',
  wochentage: [3],
  wochen: [],
  startDatum: '2026-01-01',
  endDatum: null,
  aktiv: true,
};
const vorlage = {
  id: 'barabend',
  titel: 'Barabend',
  beschreibung: null,
  kategorieId: 'barabend',
  beginnZeit: '20:00',
  endeZeit: '01:00',
  teilnahmeStatus: null,
  tage: 1,
  bilderOrdner: false,
  archiviert: false,
  schichten: [],
} as unknown as VorlageDto;

/** Store with the batch method only: the per-day method must not be used. */
function batchStore() {
  const termine = new Map<string, EventEingabe>();
  const store = {
    vorlagen: vi.fn(async () => [vorlage]),
    kategorien: vi.fn(async () => []),
    serien: vi.fn(async () => [serie]),
    serienTage: vi.fn(async () => [...termine.keys()]),
    serienTerminAnlegen: vi.fn(async (): Promise<boolean> => {
      throw new Error('per-day path used');
    }),
    serienTermineAnlegen: vi.fn(
      async (_s: string, liste: { datum: string; daten: EventEingabe }[]) => {
        let n = 0;
        for (const t of liste) {
          if (termine.has(t.datum)) continue;
          termine.set(t.datum, t.daten);
          n += 1;
        }
        return n;
      },
    ),
  } satisfies Pick<
    KalenderStore,
    | 'vorlagen'
    | 'kategorien'
    | 'serien'
    | 'serienTage'
    | 'serienTerminAnlegen'
    | 'serienTermineAnlegen'
  >;
  return { store, termine };
}

describe('series creation with the batch store method', () => {
  it('serienErzeugen creates all due days with batch calls instead of per-day calls', async () => {
    const f = batchStore();
    const res = await serienErzeugen(f.store, MI, 1000);
    expect(res.rest).toBe(false);
    expect(res.erzeugt).toBe(f.termine.size);
    expect(f.termine.size).toBeGreaterThan(40);
    expect(f.store.serienTermineAnlegen).toHaveBeenCalledTimes(Math.ceil(f.termine.size / 10));
    expect(await serienErzeugen(f.store, MI, 1000)).toEqual({ erzeugt: 0, rest: false });
  });

  it('serienErzeugen caps a run and reports the rest', async () => {
    const f = batchStore();
    expect(await serienErzeugen(f.store, MI, 20)).toEqual({ erzeugt: 20, rest: true });
    expect(f.termine.size).toBe(20);
  });

  it('serieSofortErzeugen creates at most maxTage days, in batches', async () => {
    const f = batchStore();
    expect(await serieSofortErzeugen(f.store, 'barabend', MI, { maxTage: 25 })).toBe(25);
    expect(f.store.serienTermineAnlegen).toHaveBeenCalledTimes(3);
  });

  it('serieSofortErzeugen stops between batches when the time budget is used up', async () => {
    const f = batchStore();
    let t = 0;
    const uhr = () => (t += 1000);
    expect(await serieSofortErzeugen(f.store, 'barabend', MI, { budgetMs: 3000, uhr })).toBe(20);
  });
});
