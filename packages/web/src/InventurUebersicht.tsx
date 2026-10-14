import { Drawer, NavLink, Stack, Text } from '@mantine/core';
import { IconCheck, IconCircleDashed, IconClipboardCheck } from '@tabler/icons-react';
import type { KnotenDaten } from './inventurDaten';

/** Bottom sheet listing all nodes with their done state; jump to any of them or to the summary. */
export function InventurUebersicht({
  knoten,
  aktuell,
  onWaehlen,
  onClose,
}: Readonly<{
  knoten: KnotenDaten[];
  /** Index of the current step; `knoten.length` is the summary. */
  aktuell: number;
  onWaehlen: (index: number) => void;
  onClose: () => void;
}>) {
  return (
    <Drawer
      opened
      onClose={onClose}
      position="bottom"
      size="80%"
      title="Alle Plätze"
      styles={{
        body: { paddingBottom: 'calc(var(--mantine-spacing-md) + env(safe-area-inset-bottom))' },
      }}
    >
      <Stack gap={4}>
        {knoten.map((k, i) => (
          <NavLink
            key={k.lagerortId}
            mih={44}
            active={i === aktuell}
            label={<Text style={{ overflowWrap: 'anywhere' }}>{k.pfad}</Text>}
            description={k.erledigt ? 'gezählt' : 'noch nicht gezählt'}
            leftSection={
              k.erledigt ? (
                <IconCheck size={20} color="var(--mantine-color-green-7)" />
              ) : (
                <IconCircleDashed size={20} />
              )
            }
            onClick={() => onWaehlen(i)}
          />
        ))}
        <NavLink
          mih={44}
          active={aktuell === knoten.length}
          label="Zusammenfassung"
          leftSection={<IconClipboardCheck size={20} />}
          onClick={() => onWaehlen(knoten.length)}
        />
      </Stack>
    </Drawer>
  );
}
