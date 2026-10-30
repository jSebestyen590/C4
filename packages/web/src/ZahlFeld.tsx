import { ActionIcon, NumberInput, type NumberInputProps } from '@mantine/core';
import { IconMinus, IconPlus } from '@tabler/icons-react';
import type { SyntheticEvent } from 'react';
import { amRand, naechsterWert } from './zahlSchritt';

const SCHALTER = 44;

/**
 * Number field with large -/+ buttons that change the value WITHOUT focusing the input, so the phone
 * keyboard stays closed (Mantine's own step controls focus the input). Tapping the number itself still
 * opens the numeric keyboard. Same props as Mantine's `NumberInput`.
 */
export function ZahlFeld({
  value,
  onChange,
  min,
  max,
  step = 1,
  decimalScale,
  allowDecimal,
  disabled,
  readOnly,
  style,
  ...rest
}: NumberInputProps) {
  const opt = { min, max, step, decimalScale };
  const nichtFokussieren = (e: SyntheticEvent) => e.preventDefault();
  const schalter = (richtung: 1 | -1) => (
    <ActionIcon
      variant="subtle"
      color="gray"
      size={SCHALTER}
      aria-label={richtung === 1 ? 'Erhöhen' : 'Verringern'}
      disabled={disabled || readOnly || amRand(value, richtung, opt)}
      tabIndex={-1}
      onMouseDown={nichtFokussieren}
      onPointerDown={nichtFokussieren}
      onClick={() => onChange?.(naechsterWert(value, richtung, opt))}
    >
      {richtung === 1 ? <IconPlus size={20} /> : <IconMinus size={20} />}
    </ActionIcon>
  );
  return (
    <NumberInput
      {...rest}
      value={value}
      onChange={onChange}
      min={min}
      max={max}
      step={step}
      decimalScale={decimalScale}
      allowDecimal={allowDecimal}
      disabled={disabled}
      readOnly={readOnly}
      hideControls
      inputMode={rest.inputMode ?? (allowDecimal === false ? 'numeric' : 'decimal')}
      leftSection={schalter(-1)}
      rightSection={schalter(1)}
      leftSectionWidth={SCHALTER}
      rightSectionWidth={SCHALTER}
      leftSectionPointerEvents="all"
      rightSectionPointerEvents="all"
      style={{ '--input-height': `${SCHALTER}px`, ...style }}
      styles={{ input: { textAlign: 'center' } }}
    />
  );
}
