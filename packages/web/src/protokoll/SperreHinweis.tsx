import { Alert, Text } from '@mantine/core';
import type { ProtokollMitgliedDto } from '@c4/shared';
import { mitgliedName } from '../mitglied';
import { StatusName } from '../StatusAnzeige';

/** Shown instead of the editor while somebody else (or this person in another tab) holds the edit lock. */
export function SperreHinweis({
  von,
  eigene,
}: Readonly<{
  /** The member who edits (null when unknown). */
  von: ProtokollMitgliedDto | null;
  /** The same person, in another tab or on another device. */
  eigene: boolean;
}>) {
  return (
    <Alert color="yellow" data-druck="aus" role="status">
      <Text size="sm">
        {eigene ? (
          'Du bearbeitest das Protokoll gerade in einem anderen Tab oder auf einem anderen Gerät.'
        ) : von ? (
          <>
            <StatusName status={von.status}>{mitgliedName(von)}</StatusName> bearbeitet das
            Protokoll gerade.
          </>
        ) : (
          'Jemand anderes bearbeitet das Protokoll gerade.'
        )}
      </Text>
    </Alert>
  );
}

/** Shown once after the lock became free and this tab took it. */
export function SperreFreiHinweis({ onSchliessen }: Readonly<{ onSchliessen: () => void }>) {
  return (
    <Alert color="green" withCloseButton onClose={onSchliessen} data-druck="aus" role="status">
      Das Protokoll ist jetzt frei, du kannst es bearbeiten.
    </Alert>
  );
}
