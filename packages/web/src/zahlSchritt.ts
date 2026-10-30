/** Pure step logic for `ZahlFeld`: clamp(value +/- step) without floating point noise. */

export type ZahlWert = number | string;

export interface SchrittOptionen {
  min?: number;
  max?: number;
  step?: number;
  /** Rounds the result to this many decimals; defaults to the decimals of `step`. */
  decimalScale?: number;
}

function nachkommastellen(n: number): number {
  const s = String(n);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/** The numeric value of a field value, or `undefined` when empty or not a number. */
export function alsZahl(wert: ZahlWert | undefined | null): number | undefined {
  if (typeof wert === 'number') return Number.isFinite(wert) ? wert : undefined;
  if (typeof wert === 'string' && wert.trim() !== '') {
    const n = Number(wert.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function begrenzen(n: number, min?: number, max?: number): number {
  let r = n;
  if (max !== undefined && r > max) r = max;
  if (min !== undefined && r < min) r = min;
  return r;
}

/** New value after pressing "+" (`richtung` 1) or "-" (`richtung` -1). An empty field counts as 0. */
export function naechsterWert(
  wert: ZahlWert | undefined | null,
  richtung: 1 | -1,
  { min, max, step = 1, decimalScale }: SchrittOptionen = {},
): number {
  const aktuell = alsZahl(wert) ?? 0;
  const stellen = decimalScale ?? Math.max(nachkommastellen(step), nachkommastellen(aktuell));
  const roh = Number((aktuell + richtung * step).toFixed(Math.min(stellen, 10)));
  return begrenzen(roh, min, max);
}

/** Whether the "-" / "+" button has nothing left to do. An empty field is never at a bound. */
export function amRand(
  wert: ZahlWert | undefined | null,
  richtung: 1 | -1,
  { min, max }: SchrittOptionen = {},
): boolean {
  const n = alsZahl(wert);
  if (n === undefined) return false;
  return richtung === 1 ? max !== undefined && n >= max : min !== undefined && n <= min;
}
