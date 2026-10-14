import { ActionIcon, Group, NumberInput, Text } from '@mantine/core';
import { IconMinus, IconPlus } from '@tabler/icons-react';
import type { Anzahl } from './inventurDaten';

/** Count input for thumbs: large field with 44px minus/plus buttons. Empty = not counted. */
export function ZahlenFeld({
  label,
  value,
  onChange,
}: Readonly<{ label: string; value: Anzahl; onChange: (wert: Anzahl) => void }>) {
  const aktuell = value === '' ? 0 : value;
  return (
    <Group gap="xs" wrap="nowrap" justify="space-between">
      <Text style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{label}</Text>
      <ActionIcon
        variant="default"
        size={44}
        aria-label={`${label}: weniger`}
        disabled={value === 0}
        onClick={() => onChange(value === '' ? 0 : Math.max(0, aktuell - 1))}
      >
        <IconMinus size={20} />
      </ActionIcon>
      <NumberInput
        size="lg"
        w={84}
        hideControls
        allowDecimal={false}
        allowNegative={false}
        min={0}
        max={999999}
        inputMode="numeric"
        placeholder="–"
        aria-label={label}
        styles={{ input: { textAlign: 'center' } }}
        value={value}
        onChange={(v) => onChange(v === '' ? '' : Number(v))}
      />
      <ActionIcon
        variant="default"
        size={44}
        aria-label={`${label}: mehr`}
        onClick={() => onChange(aktuell + 1)}
      >
        <IconPlus size={20} />
      </ActionIcon>
    </Group>
  );
}
