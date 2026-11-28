import { Pill, PillsInput } from '@mantine/core';
import { useState } from 'react';

/** Most characters of one name (`protokollKopfSchema`). */
const MAX_NAME = 100;
/** Most names of one list. */
const MAX_NAMEN = 50;

/**
 * Chip input for a list of names (EMs without the app, guests): Enter, comma or leaving the field
 * creates a chip, the x removes it, Backspace in the empty field removes the last one. `text` can add
 * something to the shown chip (the times of the person); `verboten` are names that exist elsewhere.
 */
export function NamenChips({
  label,
  werte,
  onChange,
  text = (n) => n,
  verboten = [],
  placeholder,
}: Readonly<{
  label: string;
  werte: readonly string[];
  onChange: (werte: string[]) => void;
  text?: (name: string) => string;
  verboten?: readonly string[];
  placeholder?: string;
}>) {
  const [eingabe, setEingabe] = useState('');
  const gleich = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

  /** Adds the names (new ones only), returns nothing to keep in the field. */
  const hinzufuegen = (namen: string[]) => {
    const neu = [...werte];
    for (const roh of namen) {
      const n = roh.trim().slice(0, MAX_NAME);
      if (n === '' || neu.length >= MAX_NAMEN) continue;
      if ([...neu, ...verboten].some((x) => gleich(x, n))) continue;
      neu.push(n);
    }
    if (neu.length !== werte.length) onChange(neu);
  };

  return (
    <PillsInput size="md" label={label}>
      <Pill.Group>
        {werte.map((n) => (
          <Pill
            key={n}
            size="lg"
            withRemoveButton
            removeButtonProps={{ 'aria-label': `${n} entfernen` }}
            onRemove={() => onChange(werte.filter((x) => x !== n))}
          >
            {text(n)}
          </Pill>
        ))}
        <PillsInput.Field
          value={eingabe}
          placeholder={werte.length === 0 ? placeholder : undefined}
          aria-label={label}
          maxLength={MAX_NAME}
          enterKeyHint="done"
          onChange={(e) => {
            const teile = e.currentTarget.value.split(',');
            if (teile.length > 1) {
              hinzufuegen(teile.slice(0, -1));
              setEingabe(teile[teile.length - 1]!);
            } else {
              setEingabe(e.currentTarget.value);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              hinzufuegen([eingabe]);
              setEingabe('');
            } else if (e.key === 'Backspace' && eingabe === '' && werte.length > 0) {
              onChange(werte.slice(0, -1));
            }
          }}
          onBlur={() => {
            hinzufuegen([eingabe]);
            setEingabe('');
          }}
        />
      </Pill.Group>
    </PillsInput>
  );
}
