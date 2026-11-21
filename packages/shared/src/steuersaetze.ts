import { z } from 'zod';

// Tax rates with validity (see docs/finanzen.md): the regular and the reduced rate change over time
// (e.g. the Covid period 16/5 %). A Kategorie or Artikel stores only the Art of its rate; the number
// follows from the date of the Beleg. Rates are basis points (1900 = 19 %).

export const STEUERSATZ_ARTEN = ['regel', 'ermaessigt', 'keine'] as const;
export type SteuersatzArt = (typeof STEUERSATZ_ARTEN)[number];
export const STEUERSATZ_ART_LABELS: Record<SteuersatzArt, string> = {
  regel: 'Regelsatz',
  ermaessigt: 'Ermäßigt',
  keine: 'Keine Steuer',
};

/** One period: valid from `ab` until the day before the next period's `ab`. */
export interface SteuersatzZeitraum {
  id: string;
  /** `YYYY-MM-DD`. */
  ab: string;
  regel: number;
  ermaessigt: number;
}

type Zeitraeume = readonly Pick<SteuersatzZeitraum, 'ab' | 'regel' | 'ermaessigt'>[];
type Saetze = Pick<SteuersatzZeitraum, 'regel' | 'ermaessigt'>;

/** Used only when no period exists at all (empty table). */
export const STEUERSATZ_NOTFALL: Saetze = { regel: 1900, ermaessigt: 700 };

/** Rates valid at a date: the regular and the reduced one, and all choices (regular, reduced, 0). */
export interface SteuersaetzeAm {
  regel: number;
  ermaessigt: number;
  /** Highest first, without duplicates, always including 0. */
  saetze: number[];
}

/**
 * The period valid on `datum`: the last one with `ab <= datum`. A date before the first period
 * uses the first one; null when there is no period.
 */
export function steuersatzZeitraumAm<T extends { ab: string }>(
  zeitraeume: readonly T[],
  datum: string,
): T | null {
  const sortiert = [...zeitraeume].sort((a, b) => a.ab.localeCompare(b.ab));
  let treffer: T | null = sortiert[0] ?? null;
  for (const z of sortiert) if (z.ab <= datum) treffer = z;
  return treffer;
}

export function steuersaetzeAm(zeitraeume: Zeitraeume, datum: string): SteuersaetzeAm {
  const z: Saetze = steuersatzZeitraumAm(zeitraeume, datum) ?? STEUERSATZ_NOTFALL;
  const saetze = [...new Set([z.regel, z.ermaessigt, 0])].sort((a, b) => b - a);
  return { regel: z.regel, ermaessigt: z.ermaessigt, saetze };
}

/** The rate of an Art in a period; no default (`null`) stays `null`. */
export function steuersatzFuerArt(art: SteuersatzArt | null, zeitraum: Saetze): number | null {
  if (art === null) return null;
  return art === 'regel' ? zeitraum.regel : art === 'ermaessigt' ? zeitraum.ermaessigt : 0;
}

/** The Art of a rate in a period; null when the rate is none of the three. 0 is always `keine`. */
export function steuersatzArtVon(satz: number, zeitraum: Saetze): SteuersatzArt | null {
  if (satz === 0) return 'keine';
  if (satz === zeitraum.regel) return 'regel';
  if (satz === zeitraum.ermaessigt) return 'ermaessigt';
  return null;
}

/** Rate of an Art at a date, e.g. the default of a Kategorie on a Beleg. */
export const steuersatzAm = (
  zeitraeume: Zeitraeume,
  art: SteuersatzArt | null,
  datum: string,
): number | null => steuersatzFuerArt(art, steuersaetzeAm(zeitraeume, datum));

/** Whether `satz` may be used at `datum`. */
export const steuersatzGueltigAm = (zeitraeume: Zeitraeume, satz: number, datum: string): boolean =>
  steuersaetzeAm(zeitraeume, datum).saetze.includes(satz);

/**
 * Converts a rate of the period `alt` to the same Art in the period `neu` (regular stays regular,
 * reduced stays reduced); other rates stay unchanged.
 */
export function steuersatzUmstellen(satz: number, alt: Saetze, neu: Saetze): number {
  const art = steuersatzArtVon(satz, alt);
  return art === null ? satz : (steuersatzFuerArt(art, neu) ?? satz);
}

/** End of a period (exclusive): the next period's `ab`, null for the last one. */
export function zeitraumEnde(zeitraeume: readonly { ab: string }[], ab: string): string | null {
  return (
    zeitraeume
      .map((z) => z.ab)
      .filter((x) => x > ab)
      .sort()[0] ?? null
  );
}

// ----- Schemas and DTOs

/** `GET /api/finanzen/steuersatz-zeitraeume`: oldest first. */
export interface SteuersatzZeitraumDto extends SteuersatzZeitraum {
  /** No Beleg and no Kassenabrechnung dates into the period, so it may be deleted. */
  loeschbar: boolean;
}

/** Art of a Kategorie or Artikel as sent by the clients. */
export const steuersatzArtSchema = z.enum(STEUERSATZ_ARTEN, 'Bitte wähle den Steuersatz.');

/** The periods the migration seeds (also used by the fakes and tests). */
export const STEUERSATZ_ZEITRAEUME_SEED: readonly SteuersatzZeitraum[] = [
  { id: 'steuersatz-2007-01-01', ab: '2007-01-01', regel: 1900, ermaessigt: 700 },
  { id: 'steuersatz-2020-07-01', ab: '2020-07-01', regel: 1600, ermaessigt: 500 },
  { id: 'steuersatz-2021-01-01', ab: '2021-01-01', regel: 1900, ermaessigt: 700 },
];
