/** `YYYY-MM-DD` -> `dd.MM.yyyy` (always two-digit day and month). */
export function datumAnzeigen(iso: string): string {
  const [jahr, monat, tag] = iso.split('-');
  return `${tag}.${monat}.${jahr}`;
}

/** The day before an ISO date (`YYYY-MM-DD`), e.g. the last day of a Besetzung that is taken over. */
export function tagVorher(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** The date `tage` days after an ISO date (`YYYY-MM-DD`); negative values go back. */
export function tagNachher(iso: string, tage: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

/** Shifts an ISO date by whole months; the day is clamped to the target month's length. */
function monateVerschieben(iso: string, monate: number): string {
  const [jahr, monat, tag] = iso.split('-').map(Number) as [number, number, number];
  const ziel = new Date(Date.UTC(jahr, monat - 1 + monate, 1));
  const letzterTag = new Date(
    Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0),
  ).getUTCDate();
  ziel.setUTCDate(Math.min(tag, letzterTag));
  return ziel.toISOString().slice(0, 10);
}

/** Length of the transition period before and after a Besetzung during which its rights apply. */
export const UEBERGANG_MONATE = 1;

/**
 * Period in which the rights of a Besetzung apply: one month before the start until one month after
 * the end (`bis` is null for an open end).
 */
export function rechteZeitraum(
  start: string,
  ende: string | null,
): { von: string; bis: string | null } {
  return {
    von: monateVerschieben(start, -UEBERGANG_MONATE),
    bis: ende === null ? null : monateVerschieben(ende, UEBERGANG_MONATE),
  };
}

/** Today as `YYYY-MM-DD` in the club's time zone; dates are compared as plain strings. */
export const heuteBerlin = (jetzt = new Date()): string =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(jetzt);
