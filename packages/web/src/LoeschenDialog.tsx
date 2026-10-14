import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { ApiFehler, fehlerText } from './warenApi';

/**
 * Confirms deleting an entry. When the API answers 409 (still in use) the dialog explains why and
 * offers to archive the entry instead.
 */
export function LoeschenDialog({
  titel,
  name,
  onClose,
  loeschen,
  archivieren,
}: Readonly<{
  titel: string;
  name: string;
  onClose: () => void;
  loeschen: () => Promise<void>;
  archivieren: () => Promise<void>;
}>) {
  const [konflikt, setKonflikt] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const ausfuehren = async (aktion: () => Promise<void>) => {
    setLaeuft(true);
    setFehler(null);
    try {
      await aktion();
      onClose();
    } catch (e) {
      if (aktion === loeschen && e instanceof ApiFehler && e.status === 409) setKonflikt(e.message);
      else setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Modal opened onClose={onClose} title={titel}>
      <Stack>
        {konflikt ? (
          <Alert color="yellow">{konflikt}</Alert>
        ) : (
          <Text>„{name}“ wird endgültig gelöscht. Das lässt sich nicht rückgängig machen.</Text>
        )}
        {fehler && <Alert color="red">{fehler}</Alert>}
        <Group justify="flex-end" grow preventGrowOverflow={false}>
          <Button variant="default" onClick={onClose}>
            Abbrechen
          </Button>
          {konflikt ? (
            <Button loading={laeuft} onClick={() => void ausfuehren(archivieren)}>
              Stattdessen archivieren
            </Button>
          ) : (
            <Button color="red" loading={laeuft} onClick={() => void ausfuehren(loeschen)}>
              Löschen
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
