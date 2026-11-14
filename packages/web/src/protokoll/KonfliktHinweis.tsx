import { Alert, Button, Stack, Text } from '@mantine/core';
import type { ProtokollMitgliedDto } from '@c4/shared';
import { mitgliedName } from '../mitglied';
import { StatusName } from '../StatusAnzeige';

/** Shown after a 409 on save: somebody else changed the protocol; "Neu laden" drops the local state. */
export function KonfliktHinweis({
  von,
  ladeNeu,
  onNeuLaden,
}: Readonly<{
  /** Who saved the newer version (null when unknown). */
  von: ProtokollMitgliedDto | null;
  ladeNeu: boolean;
  onNeuLaden: () => void;
}>) {
  return (
    <Alert
      color="red"
      title={
        von ? (
          <>
            <StatusName status={von.status}>{mitgliedName(von)}</StatusName> hat das Protokoll
            inzwischen geändert.
          </>
        ) : (
          'Jemand anderes hat das Protokoll inzwischen geändert.'
        )
      }
      data-druck="aus"
    >
      <Stack gap="xs" align="flex-start">
        <Text size="sm">
          Deine letzten Änderungen wurden nicht gespeichert. Lade die neue Version, um
          weiterzuarbeiten. Deine ungespeicherten Änderungen gehen dabei verloren.
        </Text>
        <Button color="red" loading={ladeNeu} onClick={onNeuLaden}>
          Neu laden
        </Button>
      </Stack>
    </Alert>
  );
}
