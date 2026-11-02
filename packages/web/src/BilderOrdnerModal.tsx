import { Alert, Anchor, Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { bilderOrdnerAnlegenSchema, ordnerName, type BilderOrdnerDto } from '@c4/shared';
import { useApi } from './api';
import { bilderInvalidieren } from './bilderDaten';
import { DatumFeld } from './DatumFeld';
import { fehlerText, pruefen } from './warenApi';

/** Creates a photo folder `<date>_<name>` in OneDrive and refreshes the list. */
export function BilderOrdnerModal({ onClose }: Readonly<{ onClose: () => void }>) {
  const api = useApi();
  const qc = useQueryClient();
  const [eventName, setEventName] = useState('');
  const [von, setVon] = useState('');
  const [bis, setBis] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const parsed = bilderOrdnerAnlegenSchema.safeParse({ eventName, von, bis: bis || undefined });
  const vorschau = parsed.success
    ? ordnerName(parsed.data.von, parsed.data.bis ?? parsed.data.von, parsed.data.eventName)
    : null;

  const onSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!parsed.success) {
      return setFehler(parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.');
    }
    setFehler(null);
    setLaeuft(true);
    try {
      const res = await api.bilder.ordner.$post({
        json: { eventName: parsed.data.eventName, von: parsed.data.von, bis: parsed.data.bis },
      });
      await pruefen(res);
      const ordner = (await res.json()) as BilderOrdnerDto;
      await bilderInvalidieren(qc);
      notifications.show({
        color: 'green',
        message: (
          <Stack gap={4}>
            <Text size="sm">Ordner angelegt.</Text>
            <Anchor href={ordner.webUrl} target="_blank" rel="noopener" size="sm">
              In OneDrive öffnen
            </Anchor>
          </Stack>
        ),
      });
      onClose();
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Modal opened onClose={onClose} title="Ordner anlegen">
      <form onSubmit={(e) => void onSubmit(e)}>
        <Stack>
          <TextInput
            size="md"
            label="Eventname"
            required
            maxLength={100}
            value={eventName}
            onChange={(e) => setEventName(e.currentTarget.value)}
            data-autofocus
          />
          <DatumFeld
            size="md"
            label="Datum"
            required
            loeschbar={false}
            value={von}
            onWert={setVon}
          />
          <DatumFeld
            size="md"
            label="Bis (optional)"
            description="Nur bei mehrtägigen Events."
            value={bis}
            onWert={setBis}
            min={von || undefined}
          />
          <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
            Ordnername: {vorschau ?? '–'}
          </Text>
          {fehler && <Alert color="red">{fehler}</Alert>}
          <Group grow preventGrowOverflow={false}>
            <Button variant="default" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" loading={laeuft}>
              Anlegen
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
