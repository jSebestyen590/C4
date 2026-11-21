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

// ----- Calculation in the price field ("(7,99 + 4,50)/12")

export interface RechenErgebnis extends BetragErgebnis {
  /** Unrounded cent (may have fractions); equals `cent` for a plain amount. */
  exaktCent: number | null;
  /** The text is a calculation (not a plain amount). */
  rechnung: boolean;
}

type Token = { t: 'zahl'; v: number } | { t: 'op'; v: string };

function tokens(text: string): Token[] | null {
  const aus: Token[] = [];
  const re = /\s*(?:(\d[\d.]*(?:,\d+)?|,\d+)|([+\-*/()]))/y;
  let i = 0;
  const t = text.replaceAll('€', '').trimEnd();
  while (i < t.length) {
    re.lastIndex = i;
    const m = re.exec(t);
    if (!m) return null;
    i = re.lastIndex;
    if (m[1] !== undefined) {
      const roh = m[1].includes(',') ? m[1].replaceAll('.', '').replace(',', '.') : m[1];
      const v = Number(roh);
      if (!Number.isFinite(v)) return null;
      aus.push({ t: 'zahl', v });
    } else aus.push({ t: 'op', v: m[2]! });
  }
  return aus;
}

const UNGUELTIG = 'Ungültige Rechnung';

/** Evaluates `+ - * /`, parentheses and unary minus on German numbers; null = invalid. */
function auswerten(tok: Token[]): { wert: number } | { fehler: string } {
  let pos = 0;
  const op = (v: string) => {
    const x = tok[pos];
    if (x?.t === 'op' && x.v === v) {
      pos++;
      return true;
    }
    return false;
  };
  const fail = (fehler: string) => {
    throw new Error(fehler);
  };
  const faktor = (): number => {
    if (op('-')) return -faktor();
    if (op('+')) return faktor();
    if (op('(')) {
      const w = summe();
      if (!op(')')) fail(UNGUELTIG);
      return w;
    }
    const x = tok[pos];
    if (x?.t === 'zahl') {
      pos++;
      return x.v;
    }
    return fail(UNGUELTIG);
  };
  const produkt = (): number => {
    let w = faktor();
    for (;;) {
      if (op('*')) w *= faktor();
      else if (op('/')) {
        const d = faktor();
        if (d === 0) fail('Division durch 0 ist nicht möglich');
        w /= d;
      } else return w;
    }
  };
  const summe = (): number => {
    let w = produkt();
    for (;;) {
      if (op('+')) w += produkt();
      else if (op('-')) w -= produkt();
      else return w;
    }
  };
  try {
    const wert = summe();
    if (pos !== tok.length) return { fehler: UNGUELTIG };
    return { wert };
  } catch (e) {
    return { fehler: (e as Error).message };
  }
}

/**
 * Like `betragLesen`, but the text may be a calculation (`(7,99 + 4,50)/12`). `cent` is the result
 * rounded to whole cent, `exaktCent` the unrounded value.
 */
export function betragRechnen(text: string, negativ = false): RechenErgebnis {
  const einfach = betragLesen(text, negativ);
  const istRechnung = /[+*/()]|.\s*-/.test(text.trim()) || /^\s*-\s*[(]/.test(text);
  if (!istRechnung) return { ...einfach, exaktCent: einfach.cent, rechnung: false };
  const tok = tokens(text);
  if (!tok) return { cent: null, exaktCent: null, fehler: UNGUELTIG, rechnung: true };
  const r = auswerten(tok);
  if ('fehler' in r) return { cent: null, exaktCent: null, fehler: r.fehler, rechnung: true };
  const exaktCent = Number((r.wert * 100).toFixed(6));
  const cent = Math.round(Math.abs(exaktCent)) * (exaktCent < 0 ? -1 : 1) || 0;
  if (cent < 0 && !negativ)
    return {
      cent: null,
      exaktCent: null,
      fehler: 'Bitte gib den Betrag ohne Minus ein.',
      rechnung: true,
    };
  if (Math.abs(cent) > BETRAG_MAX_CENT)
    return { cent: null, exaktCent: null, fehler: 'Der Betrag ist zu hoch.', rechnung: true };
  return { cent, exaktCent, rechnung: true };
}
