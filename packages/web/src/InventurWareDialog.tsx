import { Button, Checkbox, Group, Modal, Select, Stack, type ComboboxItem } from '@mantine/core';
import { useState } from 'react';
import type { WareInfo } from './inventurDaten';

/** Adds a Ware ad hoc to a node, optionally for good (Warenliste of the node). */
export function InventurWareDialog({
  katalog,
  vorhanden,
  onHinzufuegen,
  onClose,
}: Readonly<{
  /** All Wares that may be added. */
  katalog: WareInfo[];
  /** Wares already shown on the node. */
  vorhanden: Set<string>;
  onHinzufuegen: (wareId: string, dauerhaft: boolean) => void;
  onClose: () => void;
}>) {
  const [wareId, setWareId] = useState<string | null>(null);
  const [dauerhaft, setDauerhaft] = useState(false);
  const verfuegbar = katalog.filter((w) => !w.archiviert && !vorhanden.has(w.id));

  return (
    <Modal opened onClose={onClose} title="Ware hinzufügen">
      <Stack>
        <Select
          label="Ware"
          placeholder="Name oder Alias suchen"
          searchable
          inputMode="text"
          nothingFoundMessage="Keine Ware gefunden"
          data={verfuegbar.map((w) => ({ value: w.id, label: w.name }))}
          value={wareId}
          onChange={setWareId}
          styles={{ input: { fontSize: 16 } }}
          filter={({ options, search }) => {
            const q = search.trim().toLowerCase();
            return (options as ComboboxItem[]).filter(
              (o) =>
                q === '' ||
                o.label.toLowerCase().includes(q) ||
                (verfuegbar.find((w) => w.id === o.value)?.aliase ?? []).some((a) =>
                  a.toLowerCase().includes(q),
                ),
            );
          }}
        />
        <Checkbox
          size="md"
          label="Dauerhaft in die Liste aufnehmen"
          checked={dauerhaft}
          onChange={(e) => setDauerhaft(e.currentTarget.checked)}
        />
        <Group justify="flex-end" grow preventGrowOverflow={false}>
          <Button variant="default" onClick={onClose}>
            Abbrechen
          </Button>
          <Button disabled={!wareId} onClick={() => wareId && onHinzufuegen(wareId, dauerhaft)}>
            Hinzufügen
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
