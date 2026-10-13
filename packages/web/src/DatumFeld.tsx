import { ActionIcon, TextInput, type TextInputProps } from '@mantine/core';
import { IconX } from '@tabler/icons-react';

/**
 * Date input with a clear button. Mobile browsers (iOS Safari in particular) offer no way to empty a
 * native date field once a value is set.
 */
export function DatumFeld({
  value,
  onWert,
  ...rest
}: Readonly<
  Omit<TextInputProps, 'type' | 'value' | 'onChange'> & {
    value: string;
    onWert: (wert: string) => void;
  }
>) {
  return (
    <TextInput
      {...rest}
      type="date"
      value={value}
      onChange={(e) => onWert(e.currentTarget.value)}
      rightSectionWidth={44}
      rightSectionPointerEvents="all"
      rightSection={
        value ? (
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
