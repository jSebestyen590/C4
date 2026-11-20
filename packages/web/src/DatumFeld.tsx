import { ActionIcon, TextInput, type TextInputProps } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconX } from '@tabler/icons-react';

/** "20.11.2026", "20.11.26", "20.11." (this year) or "20112026" -> Date; null when not a real date. */
export function datumParsen(text: string, heute: Date = new Date()): Date | null {
  const t = text.trim();
  const m = /^(\d{1,2})\.?(\d{1,2})\.?(\d{2}|\d{4})?\.?$/.exec(t);
  if (!m) return null;
  const tag = Number(m[1]);
  const monat = Number(m[2]);
  const jahr =
    m[3] === undefined
      ? heute.getFullYear()
      : m[3].length === 2
        ? 2000 + Number(m[3])
        : Number(m[3]);
  const d = new Date(jahr, monat - 1, tag);
  return d.getFullYear() === jahr && d.getMonth() === monat - 1 && d.getDate() === tag ? d : null;
}

/**
 * Date input with a clear button. Mobile browsers (iOS Safari in particular) offer no way to empty a
 * native date field once a value is set.
 */
export function DatumFeld({
  value,
  onWert,
  loeschbar = true,
  tippbar = false,
  ...rest
}: Readonly<
  Omit<TextInputProps, 'type' | 'value' | 'onChange'> & {
    value: string;
    onWert: (wert: string) => void;
    /** Shows the clear button (default); turn off for required dates, which also saves width. */
    loeschbar?: boolean;
    /** Typeable "TT.MM.JJJJ" (also "20.11.26", "20.11.") with a calendar popover, for fast desktop entry. */
    tippbar?: boolean;
  }
>) {
  if (tippbar)
    return (
      <DateInput
        {...(rest as object)}
        label={rest.label}
        error={rest.error}
        placeholder={rest.placeholder ?? 'TT.MM.JJJJ'}
        valueFormat="DD.MM.YYYY"
        dateParser={(text) => datumParsen(text)}
        value={value || null}
        onChange={(v) => onWert(v ?? '')}
        clearable={loeschbar}
        allowDeselect={loeschbar}
        autoComplete="off"
      />
    );
  return (
    <TextInput
      {...rest}
      type="date"
      value={value}
      onChange={(e) => onWert(e.currentTarget.value)}
      rightSectionWidth={loeschbar ? 42 : undefined}
      rightSectionPointerEvents="all"
      rightSection={
        loeschbar && value ? (
          <ActionIcon
            variant="subtle"
            color="gray"
            size={42}
            aria-label="Datum löschen"
            onClick={() => onWert('')}
          >
            <IconX size={18} />
          </ActionIcon>
        ) : undefined
      }
    />
  );
}
