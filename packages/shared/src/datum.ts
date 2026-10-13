/** `YYYY-MM-DD` -> `dd.MM.yyyy` (always two-digit day and month). */
export function datumAnzeigen(iso: string): string {
  const [jahr, monat, tag] = iso.split('-');
  return `${tag}.${monat}.${jahr}`;
}
