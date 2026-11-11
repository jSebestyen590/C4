export const ALLE_ARTEN = 'alle';
export const ART_PRAEFIX = 'art:';
export const BEREICH_PRAEFIX = 'bereich:';

/** Value of the filter select for the current URL filter. */
export const auswahlWert = (art?: string, bereich?: string): string =>
  art ? `${ART_PRAEFIX}${art}` : bereich ? `${BEREICH_PRAEFIX}${bereich}` : ALLE_ARTEN;

/** URL filter (`art`/`bereich`, null = unset) for a select value. */
export function filterAusAuswahl(v: string | null): { art: string | null; bereich: string | null } {
  if (v?.startsWith(ART_PRAEFIX)) return { art: v.slice(ART_PRAEFIX.length), bereich: null };
  if (v?.startsWith(BEREICH_PRAEFIX)) {
    return { art: null, bereich: v.slice(BEREICH_PRAEFIX.length) };
  }
  return { art: null, bereich: null };
}
