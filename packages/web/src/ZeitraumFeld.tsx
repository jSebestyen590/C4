import { useMediaQuery } from '@mantine/hooks';
import { DatePickerInput, type DatePickerInputProps } from '@mantine/dates';
import { useState } from 'react';

type Auswahl = [string | null, string | null];

/**
 * One field for a date range: the calendar picks the first and then the last day (both may be
 * the same). On phones the calendar opens as a modal. `onWert` fires once both days are chosen.
 */
export function ZeitraumFeld({
  von,
  bis,
  onWert,
  ...rest
}: Readonly<
  Omit<DatePickerInputProps<'range'>, 'type' | 'value' | 'onChange'> & {
    von: string;
    bis: string;
    onWert: (zeitraum: { von: string; bis: string }) => void;
  }
>) {
  const telefon = useMediaQuery('(max-width: 48em)');
  // First day picked, last one still open; otherwise the field shows `von`–`bis`.
  const [erster, setErster] = useState<string | null>(null);
  return (
    <DatePickerInput
      size="md"
      {...rest}
      type="range"
      allowSingleDateInRange
      valueFormat="dd, DD.MM.YYYY"
      labelSeparator="–"
      dropdownType={telefon ? 'modal' : 'popover'}
      value={erster ? [erster, null] : [von || null, bis || null]}
      onChange={(wert) => {
        const [start, ende] = wert as Auswahl;
        setErster(start && !ende ? start : null);
        if (start && ende) onWert({ von: start, bis: ende });
      }}
      // Closing after only the first day keeps the previous range.
      onDropdownClose={() => setErster(null)}
    />
  );
}
