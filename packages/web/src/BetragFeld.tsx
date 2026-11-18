import { TextInput, type TextInputProps } from '@mantine/core';
import { useState } from 'react';
import { betragFormatieren, betragLesen } from './betragEingabe';

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
  ...rest
}: Readonly<
  Omit<TextInputProps, 'value' | 'onChange' | 'type' | 'inputMode' | 'rightSection' | 'styles'> & {
    value: number | null;
    onWert: (cent: number | null) => void;
    /** Negative amounts may be typed (corrections, refunds). */
    negativ?: boolean;
  }
>) {
  const [text, setText] = useState(value === null ? '' : betragFormatieren(value));
  const [beruehrt, setBeruehrt] = useState(false);
  const [fokus, setFokus] = useState(false);
  const gelesen = betragLesen(text, negativ);

  // Follow outside changes (form reset, prefill) but never overwrite what is being typed.
  const [vorher, setVorher] = useState(value);
  if (value !== vorher) {
    setVorher(value);
    // Never rewrite the text while the user types in it (a half typed "-30," has no value yet).
    if (!fokus && gelesen.cent !== value)
      setText(value === null ? '' : betragFormatieren(value));
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
        onWert(betragLesen(neu, negativ).cent);
      }}
      onFocus={(e) => {
        setFokus(true);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFokus(false);
        setBeruehrt(true);
        const l = betragLesen(e.currentTarget.value, negativ);
        if (l.cent !== null) setText(betragFormatieren(l.cent));
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
