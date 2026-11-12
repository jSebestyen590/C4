import { Alert, Button, Group, Modal, Stack } from '@mantine/core';
import { useState, type ReactNode } from 'react';
import { fehlerText } from './warenApi';

/** Asks before a destructive action; shows the API's error text if it fails. */
export function BestaetigenDialog({
  titel,
  children,
  bestaetigenText,
  color = 'red',
  gesperrt = false,
  groesse,
  onClose,
  onBestaetigt,
}: Readonly<{
  titel: string;
  children: ReactNode;
  bestaetigenText: string;
  color?: string;
  /** Disables the confirm button (the explanation belongs into `children`). */
  gesperrt?: boolean;
  /** Modal width (Mantine size), e.g. `lg` for tables. */
  groesse?: string;
  onClose: () => void;
  onBestaetigt: () => Promise<void>;
}>) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const ausfuehren = async () => {
    setLaeuft(true);
    setFehler(null);
    try {
      await onBestaetigt();
      onClose();
    } catch (e) {
      setFehler(fehlerText(e));
    } finally {
      setLaeuft(false);
    }
  };
  return (
    <Modal opened onClose={onClose} title={titel} size={groesse}>
      <Stack>
        {children}
        {fehler && <Alert color="red">{fehler}</Alert>}
        <Group grow preventGrowOverflow={false}>
          <Button variant="default" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            color={color}
            loading={laeuft}
            disabled={gesperrt}
            onClick={() => void ausfuehren()}
          >
            {bestaetigenText}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
