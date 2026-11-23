import { TimePicker, type TimePickerProps } from '@mantine/dates';

/**
 * Time input "HH:mm" (24 h) without the browser's native time control: its picker button is an extra tab
 * stop in Firefox and looks different in every browser. Two number fields (hours, minutes) that jump on
 * typing; the value is `HH:mm`, or '' while it is empty or incomplete.
 */
export function ZeitFeld({
  value,
  onWert,
  label,
  ...rest
}: Readonly<
  Omit<TimePickerProps, 'value' | 'defaultValue' | 'onChange' | 'format' | 'withSeconds'> & {
    value: string;
    onWert: (wert: string) => void;
  }
>) {
  return (
    <TimePicker
      size="md"
      hoursInputLabel={typeof label === 'string' ? `${label}, Stunden` : 'Stunden'}
      minutesInputLabel={typeof label === 'string' ? `${label}, Minuten` : 'Minuten'}
      {...rest}
      label={label}
      format="24h"
      value={value}
      onChange={onWert}
    />
  );
}
