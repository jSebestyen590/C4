import { TextInput, type TextInputProps } from '@mantine/core';
import { useState } from 'react';
import { betragFormatieren, betragLesen, betragRechnen } from './betragEingabe';

/**
 * Amount field for the Finanzen work pages: the amount is typed in German notation (`1,10`,
 * `1.234,56`), right-aligned with tabular digits, and formatted when the field loses focus. The
 * value is whole cent (null = empty or invalid). No -/+ buttons (see `ZahlFeld` for counts).
 * Amounts are positive; the direction (Zugang/Abgang) is a separate choice.
 */
export function BetragFeld({
  value,
  onWert,
  error,
  onBlur,
  negativ = false,
  rechnen = false,
  formel = null,
  ...rest
}: Readonly<
  Omit<TextInputProps, 'value' | 'onChange' | 'type' | 'inputMode' | 'rightSection' | 'styles'> & {
    value: number | null;
    /** `exaktCent` is the unrounded result of a calculation (only with `rechnen`), else the same as `cent`. */
    onWert: (cent: number | null, exaktCent?: number | null, formel?: string | null) => void;
    /** Negative amounts may be typed (corrections, refunds). */
    negativ?: boolean;
    /** The text may be a calculation with `+ - * /` and parentheses, e.g. `(7,99 + 4,50)/12`. */
    rechnen?: boolean;
    /** With `rechnen`: the typed calculation, shown instead of the result (also after leaving the field). */
    formel?: string | null;
  }
>) {
  const [text, setText] = useState(formel ?? (value === null ? '' : betragFormatieren(value)));
  const [beruehrt, setBeruehrt] = useState(false);
  const [fokus, setFokus] = useState(false);
  const lesen = (t: string) => (rechnen ? betragRechnen(t, negativ) : betragLesen(t, negativ));
  // (`betragRechnen` of a plain amount returns the same cent as `betragLesen`.)
  const gelesen = lesen(text);

  // Follow outside changes (form reset, prefill) but never overwrite what is being typed.
  const [vorher, setVorher] = useState(value);
  if (value !== vorher) {
    setVorher(value);
    // Never rewrite the text while the user types in it (a half typed "-30," has no value yet).
    if (!fokus && gelesen.cent !== value)
      setText(formel ?? (value === null ? '' : betragFormatieren(value)));
  }

  return (
    <TextInput
      {...rest}
      value={text}
      inputMode="decimal"
      autoComplete="off"
      placeholder={rest.placeholder ?? '0,00'}
      rightSection={
        <span aria-hidden style={{ opacity: 0.6 }}>
          €
        </span>
      }
      rightSectionPointerEvents="none"
      error={(beruehrt && gelesen.fehler) || error}
      onChange={(e) => {
        const neu = e.currentTarget.value;
        setText(neu);
        const l = lesen(neu);
        const rechnung = 'rechnung' in l && l.rechnung === true;
        onWert(
          l.cent,
          'exaktCent' in l ? (l.exaktCent as number | null) : l.cent,
          rechnung ? neu.trim() : null,
        );
      }}
      onFocus={(e) => {
        setFokus(true);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFokus(false);
        setBeruehrt(true);
        const l = lesen(e.currentTarget.value);
        // A calculation stays as typed (so it can be corrected); a plain amount is reformatted.
        const rechnung = 'rechnung' in l && l.rechnung === true;
        if (l.cent !== null && !rechnung) setText(betragFormatieren(l.cent));
        onBlur?.(e);
      }}
      styles={{
        input: {
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          fontSize: 'max(16px, 1rem)',
        },
      }}
    />
  );
}
