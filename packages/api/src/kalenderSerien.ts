import { ausVorlage, datumPlusTage, heuteBerlin, type EventEingabe } from '@c4/shared';
import type { Benachrichtigungen } from './benachrichtigungen';
import type { KalenderStore } from './kalender';

// Series generate events from a Vorlage on fixed weekdays, rolling `vorlaufMonate` ahead. Every day a
// series has ever created an event for stays in `serien_termine`, so a deleted, moved or renamed event is
// never created again. To change the weekdays or the Vorlage, edit SERIEN (existing events stay).

export interface Serie {
  /** Stored in `events.serie` and `serien_termine.serie`. */
  id: string;
  vorlageId: string;
  /** 0 = Sunday ... 6 = Saturday (`Date#getUTCDay` of the calendar date). */
  wochentage: readonly number[];
  vorlaufMonate: number;
}

export const SERIEN: readonly Serie[] = [
  { id: 'barabend', vorlageId: 'barabend', wochentage: [1, 3, 0], vorlaufMonate: 12 },
];

/** At most this many events are created per job run; the rest follows in the next run. */
export const MAX_PRO_LAUF = 30;

/** Weekday (0 = Sunday) of a calendar date `YYYY-MM-DD`. */
export const wochentagVon = (datum: string): number => new Date(`${datum}T00:00:00Z`).getUTCDay();

/** `datum` plus whole months, clamped to the end of shorter months (31.01. + 1 = 28.02.). */
export function monateDazu(datum: string, monate: number): string {
  const [j, m, t] = datum.split('-').map(Number) as [number, number, number];
  const ziel = new Date(Date.UTC(j, m - 1 + monate, 1));
  const letzter = new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0)).getUTCDate();
  ziel.setUTCDate(Math.min(t, letzter));
  return ziel.toISOString().slice(0, 10);
}

/**
 * Berlin dates from `heute` to `heute` + Vorlauf (inclusive) on the series' weekdays that have no
 * `serien_termine` entry yet, ascending. Past days are never made up for. Works on calendar dates, so
 * daylight saving time does not matter.
 */
export function faelligeTage(
  serie: Pick<Serie, 'wochentage' | 'vorlaufMonate'>,
  heute: string,
  vorhanden: ReadonlySet<string>,
): string[] {
  const bis = monateDazu(heute, serie.vorlaufMonate);
  const tage: string[] = [];
  for (let tag = heute; tag <= bis; tag = datumPlusTage(tag, 1)) {
    if (serie.wochentage.includes(wochentagVon(tag)) && !vorhanden.has(tag)) tage.push(tag);
  }
  return tage;
}

type SerienStore = Pick<KalenderStore, 'vorlagen' | 'serienTage' | 'serienTerminAnlegen'>;

/**
 * Creates the missing events of all series. Returns the number of created events and whether days are
 * left over (the cap per run was reached).
 */
export async function serienErzeugen(
  kalender: SerienStore,
  jetzt: Date,
  serien: readonly Serie[] = SERIEN,
  max = MAX_PRO_LAUF,
): Promise<{ erzeugt: number; rest: boolean }> {
  const heute = heuteBerlin(jetzt);
  let erzeugt = 0;
  for (const serie of serien) {
    const vorlage = (await kalender.vorlagen(false)).find((v) => v.id === serie.vorlageId);
    if (!vorlage) {
      console.error(
        `Series ${serie.id}: Vorlage ${serie.vorlageId} is missing or archived, no events created`,
      );
      continue;
    }
    const vorhanden = new Set(await kalender.serienTage(serie.id));
    for (const datum of faelligeTage(serie, heute, vorhanden)) {
      if (erzeugt >= max) return { erzeugt, rest: true };
      const daten: EventEingabe = ausVorlage(vorlage, datum);
      if (await kalender.serienTerminAnlegen(serie.id, datum, daten)) erzeugt += 1;
    }
  }
  return { erzeugt, rest: false };
}

/** Registers the `kalender.serien` job task: runs once per Berlin day (or until everything is created). */
export function registriereKalenderSerien(
  benachrichtigungen: Pick<
    Benachrichtigungen,
    'registriereAufgabe' | 'einmalBelegen' | 'einmalFreigeben'
  >,
  kalender: SerienStore,
): void {
  benachrichtigungen.registriereAufgabe('kalender.serien', async (jetzt) => {
    const schluessel = `kalender.serien:${heuteBerlin(jetzt)}`;
    if (!(await benachrichtigungen.einmalBelegen(schluessel))) return;
    try {
      const { erzeugt, rest } = await serienErzeugen(kalender, jetzt);
      if (erzeugt > 0) console.log(`Series: created ${erzeugt} events`);
      if (rest) await benachrichtigungen.einmalFreigeben(schluessel);
    } catch (err) {
      await benachrichtigungen.einmalFreigeben(schluessel).catch(() => {});
      throw err;
    }
  });
}
