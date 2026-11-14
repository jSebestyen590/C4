import { ausVorlage, heuteBerlin, serienTage, type EventEingabe, type SerieDto } from '@c4/shared';
import type { Benachrichtigungen } from './benachrichtigungen';
import type { KalenderStore } from './kalender';

// Series generate events from a Vorlage by a configurable rule (see `serienTage` in shared), rolling
// `VORLAUF_MONATE` ahead. Every day a series has ever created an event for stays in `serien_termine`, so a
// deleted, moved or renamed event is never created again.

/** How far ahead events are created. */
export const VORLAUF_MONATE = 12;

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
 * Berlin dates from `heute` (or the series' start) to `heute` + Vorlauf (or the series' end) on which the
 * series has an event and that have no `serien_termine` entry yet, ascending. Past days are never made
 * up for.
 */
export function faelligeTage(
  serie: Pick<SerieDto, 'regel' | 'wochentage' | 'wochen' | 'startDatum' | 'endDatum'>,
  heute: string,
  vorhanden: ReadonlySet<string>,
): string[] {
  return serienTage(serie, heute, monateDazu(heute, VORLAUF_MONATE)).filter(
    (tag) => !vorhanden.has(tag),
  );
}

type SerienStore = Pick<
  KalenderStore,
  'vorlagen' | 'kategorien' | 'serien' | 'serienTage' | 'serienTerminAnlegen'
>;

/**
 * Creates the missing events of all series. Returns the number of created events and whether days are
 * left over (the cap per run was reached).
 */
export async function serienErzeugen(
  kalender: SerienStore,
  jetzt: Date,
  max = MAX_PRO_LAUF,
): Promise<{ erzeugt: number; rest: boolean }> {
  const heute = heuteBerlin(jetzt);
  const serien = (await kalender.serien()).filter((s) => s.aktiv);
  if (serien.length === 0) return { erzeugt: 0, rest: false };
  const vorlagen = await kalender.vorlagen(false);
  const kategorien = await kalender.kategorien(true);
  let erzeugt = 0;
  for (const serie of serien) {
    const vorlage = vorlagen.find((v) => v.id === serie.vorlageId);
    if (!vorlage) {
      console.error(
        `Series ${serie.id}: Vorlage ${serie.vorlageId} is missing or archived, no events created`,
      );
      continue;
    }
    const kategorie = kategorien.find((k) => k.id === vorlage.kategorieId);
    const vorhanden = new Set(await kalender.serienTage(serie.id));
    for (const datum of faelligeTage(serie, heute, vorhanden)) {
      if (erzeugt >= max) return { erzeugt, rest: true };
      const daten: EventEingabe = ausVorlage(vorlage, datum, kategorie);
      if (await kalender.serienTerminAnlegen(serie.id, datum, daten)) erzeugt += 1;
    }
  }
  return { erzeugt, rest: false };
}

/** Days handled synchronously when a series is saved (Lambda timeout is 15 s, one transaction per event). */
export const MAX_TAGE_SOFORT = 40;
/** Time budget in ms for the synchronous part of saving a series. */
export const BUDGET_SOFORT_MS = 10_000;

/**
 * Creates the due events of one series right away (after saving it), at most `maxTage` days and until
 * `budgetMs` has passed; the job creates the rest. Returns the number of created events.
 */
export async function serieSofortErzeugen(
  kalender: SerienStore,
  serieId: string,
  jetzt: Date = new Date(),
  { maxTage = MAX_TAGE_SOFORT, budgetMs = BUDGET_SOFORT_MS, uhr = Date.now } = {},
): Promise<number> {
  const start = uhr();
  const serie = (await kalender.serien()).find((s) => s.id === serieId);
  if (!serie?.aktiv) return 0;
  const vorlage = (await kalender.vorlagen(false)).find((v) => v.id === serie.vorlageId);
  if (!vorlage) {
    console.error(`Series ${serie.id}: Vorlage ${serie.vorlageId} is missing or archived`);
    return 0;
  }
  const kategorie = (await kalender.kategorien(true)).find((k) => k.id === vorlage.kategorieId);
  const vorhanden = new Set(await kalender.serienTage(serie.id));
  let erzeugt = 0;
  for (const datum of faelligeTage(serie, heuteBerlin(jetzt), vorhanden).slice(0, maxTage)) {
    if (uhr() - start >= budgetMs) break;
    if (await kalender.serienTerminAnlegen(serie.id, datum, ausVorlage(vorlage, datum, kategorie)))
      erzeugt += 1;
  }
  return erzeugt;
}

const markeSchluessel = (jetzt: Date) => `kalender.serien:${heuteBerlin(jetzt)}`;

/** Lets the job run again today, e.g. after a series was created or changed, so new days appear soon. */
export async function serienMarkeFreigeben(
  benachrichtigungen: Pick<Benachrichtigungen, 'einmalFreigeben'>,
  jetzt = new Date(),
): Promise<void> {
  await benachrichtigungen.einmalFreigeben(markeSchluessel(jetzt));
}

/**
 * Registers the `kalender.serien` job task: runs once per Berlin day (or until everything is
 * created). The day is marked only after the work succeeded, so a Lambda timeout does not lose it;
 * the work is idempotent per event (`serienTerminAnlegen` skips existing days), so an overlapping or
 * repeated run is harmless.
 */
export function registriereKalenderSerien(
  benachrichtigungen: Pick<
    Benachrichtigungen,
    'registriereAufgabe' | 'einmalBelegen' | 'einmalGesetzt'
  >,
  kalender: SerienStore,
): void {
  benachrichtigungen.registriereAufgabe('kalender.serien', async (jetzt) => {
    const schluessel = markeSchluessel(jetzt);
    if (await benachrichtigungen.einmalGesetzt(schluessel)) return;
    const { erzeugt, rest } = await serienErzeugen(kalender, jetzt);
    if (erzeugt > 0) console.log(`Series: created ${erzeugt} events`);
    if (!rest) await benachrichtigungen.einmalBelegen(schluessel);
  });
}
