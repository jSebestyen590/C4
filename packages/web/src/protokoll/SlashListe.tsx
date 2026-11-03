import { Group, Stack, Text, UnstyledButton } from '@mantine/core';
import { useEffect, useRef } from 'react';
import type { SlashEintrag } from './slashLogik';
import { SlashIcon } from './symbole';

/** List of slash menu items: icon, title, one-line description. Rows are at least 52px high. */
export function SlashListe({
  eintraege,
  auswahl,
  onWaehlen,
  onZeiger,
}: Readonly<{
  eintraege: readonly SlashEintrag[];
  /** Highlighted row (keyboard). */
  auswahl?: number;
  onWaehlen: (eintrag: SlashEintrag) => void;
  onZeiger?: (index: number) => void;
}>) {
  const aktiv = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    aktiv.current?.scrollIntoView({ block: 'nearest' });
  }, [auswahl]);
  return (
    <Stack gap={2} role="listbox" aria-label="Bausteine">
      {eintraege.map((e, i) => {
        const gewaehlt = i === auswahl;
        return (
          <UnstyledButton
            key={e.schluessel}
            ref={gewaehlt ? aktiv : undefined}
            role="option"
            aria-selected={gewaehlt}
            data-gewaehlt={gewaehlt || undefined}
            className="protokoll-slash-eintrag"
            // Keep the focus (and the typed "/query") in the editor.
            onMouseDown={(ev) => ev.preventDefault()}
            onMouseEnter={() => onZeiger?.(i)}
            onClick={() => onWaehlen(e)}
            px="sm"
            py="xs"
            mih={52}
            style={{ borderRadius: 'var(--mantine-radius-sm)' }}
          >
            <Group gap="sm" wrap="nowrap">
              <SlashIcon symbol={e.symbol} />
              <div style={{ minWidth: 0 }}>
                <Text fw={600} size="sm" truncate>
                  {e.titel}
                </Text>
                {e.beschreibung && (
                  <Text size="xs" c="dimmed" truncate>
                    {e.beschreibung}
                  </Text>
                )}
              </div>
            </Group>
          </UnstyledButton>
        );
      })}
    </Stack>
  );
}
