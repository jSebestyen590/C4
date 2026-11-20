import { ActionIcon, TextInput, type TextInputProps } from '@mantine/core';
import { IconX } from '@tabler/icons-react';

/**
 * Date input with a clear button. Mobile browsers (iOS Safari in particular) offer no way to empty a
 * native date field once a value is set.
 */
export function DatumFeld({
  value,
  onWert,
  loeschbar = true,
  ...rest
}: Readonly<
  Omit<TextInputProps, 'type' | 'value' | 'onChange'> & {
    value: string;
    onWert: (wert: string) => void;
    /** Shows the clear button (default); turn off for required dates, which also saves width. */
    loeschbar?: boolean;
  }
>) {
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
            tabIndex={-1}
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
