import { Button, Group, Modal, Stack, Text } from '@mantine/core';

export interface BestaetigungsGruppe {
  titel: string;
  zeilen: string[];
  /** Extra line below the rows (e.g. "Nachfüllen aus …"). */
  hinweis?: string;
}

/** Confirmation before booking: lists what will happen, grouped by node. */
export function BuchungsBestaetigung({
  titel,
  gruppen,
  buchenText,
  laedt,
  onBuchen,
  onClose,
}: Readonly<{
  titel: string;
  gruppen: BestaetigungsGruppe[];
  buchenText: string;
  laedt: boolean;
  onBuchen: () => void;
  onClose: () => void;
}>) {
  return (
    <Modal opened onClose={onClose} title={titel} fullScreen={false}>
      <Stack>
        {gruppen.map((g) => (
          <Stack key={g.titel} gap={2}>
            <Text size="sm" fw={700} style={{ overflowWrap: 'anywhere' }}>
              {g.titel}
            </Text>
            {g.zeilen.map((z) => (
              <Text key={z} size="sm" style={{ overflowWrap: 'anywhere' }}>
                {z}
              </Text>
            ))}
            {g.hinweis && (
              <Text size="sm" c="blue" style={{ overflowWrap: 'anywhere' }}>
                {g.hinweis}
              </Text>
            )}
          </Stack>
        ))}
        <Group justify="flex-end" grow preventGrowOverflow={false}>
          <Button variant="default" onClick={onClose}>
            Abbrechen
          </Button>
          <Button loading={laedt} onClick={onBuchen}>
            {buchenText}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
