import { Textarea, TextInput, type TextareaProps, type TextInputProps } from '@mantine/core';
import { useState } from 'react';
import { ZahlFeld } from '../ZahlFeld';

// Inputs inside the node views keep their own value while typing, so a late re-render of the node view
// (it receives new props asynchronously) cannot reset the text or move the cursor. They follow the
// outside value as soon as it changes.

function useLokal<T>(extern: T): [T, (wert: T) => void] {
  const [lokal, setLokal] = useState(extern);
  const [zuletzt, setZuletzt] = useState(extern);
  if (!Object.is(zuletzt, extern)) {
    setZuletzt(extern);
    setLokal(extern);
  }
  return [lokal, setLokal];
}

export function LokalText({
  wert,
  onWert,
  ...rest
}: Readonly<
  Omit<TextInputProps, 'value' | 'onChange'> & { wert: string; onWert: (wert: string) => void }
>) {
  const [lokal, setLokal] = useLokal(wert);
  return (
    <TextInput
      {...rest}
      value={lokal}
      onChange={(e) => {
        setLokal(e.currentTarget.value);
        onWert(e.currentTarget.value);
      }}
    />
  );
}

export function LokalTextbereich({
  wert,
  onWert,
  ...rest
}: Readonly<
  Omit<TextareaProps, 'value' | 'onChange'> & { wert: string; onWert: (wert: string) => void }
>) {
  const [lokal, setLokal] = useLokal(wert);
  return (
    <Textarea
      {...rest}
      value={lokal}
      onChange={(e) => {
        setLokal(e.currentTarget.value);
        onWert(e.currentTarget.value);
      }}
    />
  );
}

/** Whole number >= `min` (default 0) via `ZahlFeld`; an empty field falls back to the value on blur. */
export function LokalZahl({
  wert,
  onWert,
  min = 0,
  label,
}: Readonly<{ wert: number; onWert: (wert: number) => void; min?: number; label: string }>) {
  const [lokal, setLokal] = useLokal<number | string>(wert);
  return (
    <ZahlFeld
      label={label}
      value={lokal}
      min={min}
      allowDecimal={false}
      allowNegative={false}
      onChange={(v) => {
        setLokal(v);
        if (typeof v === 'number') onWert(v);
      }}
      onBlur={() => setLokal(wert)}
      style={{ minWidth: 0 }}
    />
  );
}
