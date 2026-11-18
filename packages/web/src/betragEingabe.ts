import { BETRAG_MAX_CENT, euroZuCent } from '@c4/shared';

// Pure logic of `BetragFeld`: typed German amount ("1,10", "1.234,56") <-> whole cent.

export interface BetragErgebnis {
  /** Whole cent; null for an empty or invalid field. */
  cent: number | null;
  /** German message for an invalid entry; undefined for empty or valid. */
  fehler?: string;
}

const BEISPIEL = 'Bitte gib einen Betrag wie 1,10 oder 1.234,56 ein.';

/**
 * Parses the text of an amount field. Amounts are positive (direction is chosen elsewhere) unless
 * `negativ` is set; then a lone minus sign is a valid intermediate state (no value, no error).
 */
export function betragLesen(text: string, negativ = false): BetragErgebnis {
  if (text.trim() === '') return { cent: null };
  if (negativ && /^\s*-\s*$/.test(text)) return { cent: null };
  const cent = euroZuCent(text);
  if (cent === null) return { cent: null, fehler: BEISPIEL };
  if (cent < 0 && !negativ) return { cent: null, fehler: 'Bitte gib den Betrag ohne Minus ein.' };
  if (Math.abs(cent) > BETRAG_MAX_CENT) return { cent: null, fehler: 'Der Betrag ist zu hoch.' };
  return { cent };
}

const FORMAT = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `123456` -> `1.234,56` (no currency sign: the field shows the € itself). */
export const betragFormatieren = (cent: number): string => FORMAT.format(cent / 100);
