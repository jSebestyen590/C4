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
