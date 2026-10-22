import { datumAnzeigen, heuteBerlin } from './datum';

// ---------------------------------------------------------------------------
// Whole days in Europe/Berlin: an Ausleihe occupies its pieces on the days [von, bis), so the
// return day itself is free again. `bis` null = open-ended (no return date known).

/** Latest day; stands for "never ends" so that days can be compared as plain strings. */
const UNENDLICH = '9999-12-31';
/** Earliest day; stands for "since forever" for positions without a known start. */
const URZEIT = '0000-01-01';

/** Whole days `[von, bis)` as `YYYY-MM-DD`; `bis` null = open-ended. */
export interface Tage {
  von: string;
  bis: string | null;
}

/** `anzahl` pieces occupied during `Tage`. */
export interface Belegung extends Tage {
  anzahl: number;
}

/** The calendar day (`YYYY-MM-DD`) of a timestamp in Europe/Berlin. */
export const berlinTag = (z: Date | string): string =>
  heuteBerlin(z instanceof Date ? z : new Date(z));

/** The day `n` days after `tag` (before for negative `n`). */
export function tagNach(tag: string, n = 1): string {
  const d = new Date(`${tag}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const ende = (t: Tage): string => t.bis ?? UNENDLICH;

/**
 * Days occupied by an Ausleihe from its start to the planned return day (exclusive). Without a
 * return date it is open-ended; a return on the start day (or earlier) occupies exactly that day.
 */
export function ausleiheTage(
  ausgeliehenAm: Date | string,
  rueckgabeGeplant: string | null | undefined,
): Tage {
  const von = berlinTag(ausgeliehenAm);
  if (!rueckgabeGeplant) return { von, bis: null };
  return { von, bis: rueckgabeGeplant > von ? rueckgabeGeplant : tagNach(von) };
}

/** True when the Ausleihe is open and its return day lies before `heute`. */
export const rueckgabeUeberfaellig = (
  rueckgabeGeplant: string | null | undefined,
  heute: string,
): boolean => !!rueckgabeGeplant && rueckgabeGeplant < heute;

/**
 * Days an open Ausleihe really occupies: like `ausleiheTage`, but one that should have been back by
 * today (return day <= today) keeps blocking through today (end = max(end, today + 1)).
 */
export function belegteTage(
  ausgeliehenAm: Date | string | undefined,
  rueckgabeGeplant: string | null | undefined,
  heute: string,
): Tage {
  if (ausgeliehenAm === undefined) return { von: URZEIT, bis: null };
  const tage = ausleiheTage(ausgeliehenAm, rueckgabeGeplant);
  if (tage.bis !== null && rueckgabeGeplant && rueckgabeGeplant <= heute) {
    const bis = tagNach(heute);
    return { von: tage.von, bis: bis > tage.bis ? bis : tage.bis };
  }
  return tage;
}

/** True when the two day ranges share at least one day. */
export const ueberschneiden = (a: Tage, b: Tage): boolean => a.von < ende(b) && b.von < ende(a);

/**
 * Highest number of pieces occupied at the same time on any day of `zeitraum` (sweep over the
 * interval starts: the maximum is always reached on the start day of some interval).
 */
export function maximaleBelegung(belegungen: Belegung[], zeitraum: Tage): number {
  const relevant = belegungen
    .filter((b) => ueberschneiden(b, zeitraum))
    .map((b) => ({
      von: b.von > zeitraum.von ? b.von : zeitraum.von,
      bis: ende(b) < ende(zeitraum) ? ende(b) : ende(zeitraum),
      anzahl: b.anzahl,
    }));
  let hoechstens = 0;
  for (const start of new Set(relevant.map((b) => b.von))) {
    const summe = relevant
      .filter((b) => b.von <= start && start < b.bis)
      .reduce((s, b) => s + b.anzahl, 0);
    if (summe > hoechstens) hoechstens = summe;
  }
  return hoechstens;
}

/** `20.10.–27.10.2026`, `20.12.2026–05.01.2027` across years, `25.10.2026` for a single day. */
export function zeitraumText(ausgeliehenAm: Date | string, rueckgabe: string): string {
  const von = berlinTag(ausgeliehenAm);
  if (rueckgabe <= von) return datumAnzeigen(von);
  const bis = datumAnzeigen(rueckgabe);
  return von.slice(0, 4) === rueckgabe.slice(0, 4)
    ? `${datumAnzeigen(von).slice(0, 6)}–${bis}`
    : `${datumAnzeigen(von)}–${bis}`;
}

/** `seit` for a start that has passed (or is now), `ab` for one in the future. */
export const seitOderAb = (ausgeliehenAm: Date | string, jetzt: Date | string): 'seit' | 'ab' =>
  new Date(ausgeliehenAm).getTime() > new Date(jetzt).getTime() ? 'ab' : 'seit';

/** `seit 20.10.2026` / `ab 25.10.2026`; `anzeige` formats the start (default: German date). */
export function beginnText(
  ausgeliehenAm: Date | string,
  jetzt: Date | string,
  anzeige: (z: Date | string) => string = (z) => datumAnzeigen(berlinTag(z)),
): string {
  return `${seitOderAb(ausgeliehenAm, jetzt)} ${anzeige(ausgeliehenAm)}`;
}
