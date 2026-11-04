import { describe, expect, it, vi } from 'vitest';
import type { EventEingabe, SerieDto, VorlageDto } from '@c4/shared';
import { createBenachrichtigungen } from './benachrichtigungen';
import { createFakeBenachrichtigungenStore } from './benachrichtigungen.fake';
import {
  faelligeTage,
  monateDazu,
  registriereKalenderSerien,
  serieSofortErzeugen,
  serienErzeugen,
} from './kalenderSerien';
import type { KalenderStore } from './kalender';

const wochentagVon = (datum: string) => new Date(`${datum}T00:00:00Z`).getUTCDay();

const barabend: SerieDto = {
  id: 'barabend',
  name: 'Barabend',
  vorlageId: 'barabend',
  regel: 'woechentlich',
  wochentage: [1, 3, 0],
  wochen: [],
  startDatum: '2026-01-01',
  endDatum: null,
  aktiv: true,
};

describe('faelligeTage', () => {
  it('lists Mondays, Wednesdays and Sundays from today on', () => {
    // 2026-10-28 is a Wednesday.
    const tage = faelligeTage(barabend, '2026-10-28', new Set());
    expect(tage.slice(0, 5)).toEqual([
      '2026-10-28',
      '2026-11-01',
      '2026-11-02',
      '2026-11-04',
      '2026-11-08',
    ]);
    expect(tage.every((t) => [0, 1, 3].includes(wochentagVon(t)))).toBe(true);
    expect(tage.at(-1)).toBe('2027-10-27');
    expect(tage).toHaveLength(157);
  });

  it('skips days that were already created and never looks back', () => {
    const tage = faelligeTage(barabend, '2026-10-28', new Set(['2026-11-01', '2026-10-26']));
    expect(tage).not.toContain('2026-11-01');
    expect(tage).not.toContain('2026-10-26');
    expect(tage[0]).toBe('2026-10-28');
  });

  it('keeps the weekdays across the changes to and from daylight saving time', () => {
    const tage = faelligeTage({ ...barabend, wochentage: [0] }, '2026-03-20', new Set());
    // Sundays around the switches on 2026-03-29 and 2026-10-25.
    expect(tage).toContain('2026-03-29');
    expect(tage).toContain('2026-10-25');
    expect(tage.every((t) => wochentagVon(t) === 0)).toBe(true);
    expect(tage).toHaveLength(52);
  });

  it('starts at the series start and stops at its end', () => {
    const tage = faelligeTage(
      { ...barabend, startDatum: '2026-11-10', endDatum: '2026-11-20' },
      '2026-10-28',
      new Set(),
    );
    expect(tage).toEqual(['2026-11-11', '2026-11-15', '2026-11-16', '2026-11-18']);
  });

  it('supports monthly series: first Tuesday of the month', () => {
    const plenum: SerieDto = { ...barabend, regel: 'monatlich', wochentage: [2], wochen: [1] };
    const tage = faelligeTage(plenum, '2026-10-28', new Set());
    expect(tage.slice(0, 3)).toEqual(['2026-11-03', '2026-12-01', '2027-01-05']);
    expect(tage).toHaveLength(12);
  });

  it('includes the end date and clamps month ends', () => {
    expect(monateDazu('2026-01-31', 1)).toBe('2026-02-28');
    expect(monateDazu('2024-02-29', 12)).toBe('2025-02-28');
    expect(faelligeTage({ ...barabend, wochentage: [3] }, '2026-10-28', new Set())).toContain(
      '2027-10-27',
    );
  });
});

const vorlage = (patch: Partial<VorlageDto> = {}): VorlageDto => ({
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
  schichten: [
    {
      art: 'betrieb',
      beginnZeit: '20:00',
      endeZeit: '01:00',
      bedarfe: [{ dienstformId: 'bar', minimum: 1, wunsch: 2 }],
    },
  ],
  ...patch,
});

/** In-memory store: serien_termine rows stay when an event is deleted or renamed. */
function fakeStore(v: VorlageDto | null = vorlage(), serien: SerieDto[] = [barabend]) {
  const termine = new Set<string>();
  const events = new Map<string, EventEingabe>();
  const store = {
    vorlagen: vi.fn(async () => (v ? [v] : [])),
    kategorien: vi.fn(async () => [
      {
        id: 'barabend',
        name: 'Barabend',
        farbe: 'blue',
        art: 'dienste' as const,
        teilnahmeStatus: null,
        dauer: 'eintaegig' as const,
        protokoll: false,
        protokollArt: 'sitzung' as const,
        archiviert: false,
        benutzt: true,
      },
    ]),
    serien: vi.fn(async () => serien),
    serienTage: vi.fn(async () => [...termine]),
    serienTerminAnlegen: vi.fn(async (_serie: string, datum: string, daten: EventEingabe) => {
      if (termine.has(datum)) return false;
      termine.add(datum);
      events.set(datum, daten);
      return true;
    }),
  } satisfies Pick<
    KalenderStore,
    'vorlagen' | 'kategorien' | 'serien' | 'serienTage' | 'serienTerminAnlegen'
  >;
  return { store, termine, events };
}

const MI = new Date('2026-10-28T10:00:00Z');

describe('serienErzeugen', () => {
  it('creates the events from the Vorlage with Berlin times', async () => {
    const f = fakeStore();
    const r = await serienErzeugen(f.store, MI, 1000);
    expect(r).toEqual({ erzeugt: 157, rest: false });
    expect(f.events.get('2026-10-28')).toMatchObject({
      titel: 'Barabend',
      beginn: '2026-10-28T19:00:00.000Z',
      ende: '2026-10-29T00:00:00.000Z',
    });
    // Winter time from 2026-10-25 on, summer time again in 2027-03-29.
    expect(f.events.get('2027-03-31')).toMatchObject({ beginn: '2027-03-31T18:00:00.000Z' });
  });

  it('does not create anything twice', async () => {
    const f = fakeStore();
    await serienErzeugen(f.store, MI, 1000);
    expect(await serienErzeugen(f.store, MI, 1000)).toEqual({
      erzeugt: 0,
      rest: false,
    });
  });

  it('rolls forward with the date but never recreates a deleted day or a renamed event', async () => {
    const f = fakeStore();
    await serienErzeugen(f.store, MI, 1000);
    // The event of 2026-11-02 is deleted, the one of 2026-11-04 renamed (still recorded in serien_termine).
    f.events.delete('2026-11-02');
    f.events.set('2026-11-04', { ...f.events.get('2026-11-04')!, titel: 'Karaoke' });
    const r = await serienErzeugen(f.store, new Date('2026-11-03T10:00:00Z'), 1000);
    expect(f.events.has('2026-11-02')).toBe(false);
    expect(f.events.get('2026-11-04')!.titel).toBe('Karaoke');
    // Only the new end of the window (2027-10-28 .. 2027-11-03 on the series' weekdays) is added.
    expect(r.erzeugt).toBe(3);
  });

  it('stops at the cap and reports the rest', async () => {
    const f = fakeStore();
    expect(await serienErzeugen(f.store, MI, 10)).toEqual({ erzeugt: 10, rest: true });
    expect(f.events.size).toBe(10);
  });

  it('skips inactive series and creates events for several series', async () => {
    const aus = fakeStore(vorlage(), [{ ...barabend, aktiv: false }]);
    expect(await serienErzeugen(aus.store, MI)).toEqual({ erzeugt: 0, rest: false });
    const plenum: SerieDto = {
      ...barabend,
      id: 'plenum',
      regel: 'monatlich',
      wochentage: [2],
      wochen: [1],
    };
    const zwei = fakeStore(vorlage(), [plenum]);
    expect(await serienErzeugen(zwei.store, MI)).toEqual({ erzeugt: 12, rest: false });
    expect(zwei.store.serienTerminAnlegen.mock.calls[0]![0]).toBe('plenum');
  });

  it('creates nothing and logs when the Vorlage is missing or archived', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = fakeStore(null);
    expect(await serienErzeugen(f.store, MI)).toEqual({ erzeugt: 0, rest: false });
    expect(f.events.size).toBe(0);
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});

describe('registriereKalenderSerien', () => {
  const setup = (store: ReturnType<typeof fakeStore>['store']) => {
    const fake = createFakeBenachrichtigungenStore(() => []);
    const b = createBenachrichtigungen({ store: fake.store, sender: async () => 'ok' });
    registriereKalenderSerien(b, store);
    return b;
  };

  it('runs at most once per Berlin day', async () => {
    const f = fakeStore();
    const b = setup(f.store);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await b.pushJob(MI);
    const nachErstem = f.store.serienTerminAnlegen.mock.calls.length;
    expect(nachErstem).toBe(30); // capped: the rest follows in the next run
    await b.pushJob(new Date(MI.getTime() + 60_000));
    expect(f.store.serienTerminAnlegen.mock.calls.length).toBeGreaterThan(nachErstem);
    // Finish the backlog, then further runs of the same day do nothing.
    for (let i = 0; i < 10; i++) await b.pushJob(new Date(MI.getTime() + (i + 2) * 60_000));
    const fertig = f.store.serienTerminAnlegen.mock.calls.length;
    expect(f.events.size).toBe(157);
    await b.pushJob(new Date(MI.getTime() + 3600_000));
    expect(f.store.serienTerminAnlegen.mock.calls.length).toBe(fertig);
    expect(f.store.vorlagen.mock.calls.length).toBeGreaterThan(0);
  });

  it('retries in the next run after a failure', async () => {
    const f = fakeStore();
    f.store.vorlagen.mockRejectedValueOnce(new Error('db down'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const b = setup(f.store);
    await b.pushJob(MI);
    await b.pushJob(new Date(MI.getTime() + 60_000));
    expect(f.events.size).toBeGreaterThan(0);
    err.mockRestore();
  });
});

describe('serieSofortErzeugen', () => {
  it('creates at most 40 days, then the job continues', async () => {
    const f = fakeStore();
    expect(await serieSofortErzeugen(f.store, 'barabend', MI)).toBe(40);
    expect(f.events.size).toBe(40);
    expect(f.events.get('2026-10-28')).toMatchObject({ titel: 'Barabend' });
    expect(await serienErzeugen(f.store, MI, 1000)).toEqual({ erzeugt: 117, rest: false });
  });

  it('stops when the time budget is used up', async () => {
    const f = fakeStore();
    let t = 0;
    const uhr = () => (t += 1000);
    expect(await serieSofortErzeugen(f.store, 'barabend', MI, { budgetMs: 5000, uhr })).toBe(4);
  });

  it('is idempotent and ignores inactive series and unknown ids', async () => {
    const f = fakeStore();
    await serieSofortErzeugen(f.store, 'barabend', MI, { maxTage: 5 });
    expect(await serieSofortErzeugen(f.store, 'barabend', MI, { maxTage: 5 })).toBe(5);
    expect(f.events.size).toBe(10);
    expect(await serieSofortErzeugen(f.store, 'gibts-nicht', MI)).toBe(0);
    const aus = fakeStore(vorlage(), [{ ...barabend, aktiv: false }]);
    expect(await serieSofortErzeugen(aus.store, 'barabend', MI)).toBe(0);
  });

  it('creates nothing when the Vorlage is missing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = fakeStore(null);
    expect(await serieSofortErzeugen(f.store, 'barabend', MI)).toBe(0);
  });
});
