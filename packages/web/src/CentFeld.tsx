import type { NumberInputProps } from '@mantine/core';
import { ZahlFeld } from './ZahlFeld';

/**
 * Euro amount field on top of `ZahlFeld`: German formatting (`1.234,56 €`), two decimals, big -/+ buttons.
 * The value is the euro number (or the text while typing); convert with `euroZuCent` from `@c4/shared`.
 * Positive by default; pass `allowNegative` for signed amounts.
 */
export function CentFeld({ allowNegative = false, min, ...rest }: NumberInputProps) {
  return (
    <ZahlFeld
      {...rest}
      allowNegative={allowNegative}
      min={min ?? (allowNegative ? undefined : 0)}
      step={rest.step ?? 1}
      decimalScale={2}
      decimalSeparator=","
      thousandSeparator="."
      suffix=" €"
      inputMode="decimal"
    />
  );
}
