import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ERINNERUNG_MAX_ANZAHL, erinnerungenEingabeSchema } from '@c4/shared';
import { useApi } from './api';
import { kalenderInvalidieren, useErinnerungen } from './kalenderDaten';
import { erinnerungText } from './kalenderZeit';
import { fehlerText, pruefen } from './warenApi';
import { ZahlFeld } from './ZahlFeld';

const EINHEITEN = [
  { value: '60', label: 'Stunden' },
  { value: '1440', label: 'Tage' },
  { value: '10080', label: 'Wochen' },
];

/** Global reminder times for events that still lack Dienste. */
export function ErinnerungenTab() {
  const q = useErinnerungen();
  if (q.isError) return <Alert color="red">Die Erinnerungen konnten nicht geladen werden.</Alert>;
  if (q.isPending) return <Loader m="md" />;
  return <ErinnerungenEditor gespeichert={q.data.minutenVorher} />;
}

function ErinnerungenEditor({ gespeichert }: Readonly<{ gespeichert: number[] }>) {
  const api = useApi();
  const qc = useQueryClient();
  const [liste, setListe] = useState(gespeichert);
  const [anzahl, setAnzahl] = useState<number | ''>(1);
  const [einheit, setEinheit] = useState('1440');
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const geaendert = JSON.stringify(liste) !== JSON.stringify(gespeichert);
  const hinzufuegen = () => {
    const minuten = (anzahl === '' ? 0 : anzahl) * Number(einheit);
    if (minuten <= 0) return setFehler('Bitte gib eine Zahl größer als 0 an.');
    if (liste.includes(minuten)) return setFehler('Diesen Zeitpunkt gibt es schon.');
    const neu = [...liste, minuten].sort((a, b) => b - a);
    const geprueft = erinnerungenEingabeSchema.safeParse({ minutenVorher: neu });
    if (!geprueft.success) return setFehler(geprueft.error.issues[0]?.message ?? 'Ungültig.');
    setFehler(null);
    setListe(neu);
  };

  const speichern = async () => {
    const geprueft = erinnerungenEingabeSchema.safeParse({ minutenVorher: liste });
    if (!geprueft.success) return setFehler(geprueft.error.issues[0]?.message ?? 'Ungültig.');
    setFehler(null);
    setLaeuft(true);
    try {
      await pruefen(await api.kalender.erinnerungen.$put({ json: geprueft.data }));
      await kalenderInvalidieren(qc);
      notifications.show({ color: 'green', message: 'Die Erinnerungen wurden gespeichert.' });
    } catch (e) {
      setFehler(fehlerText(e, 'Das Speichern ist fehlgeschlagen.'));
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Stack>
      <Text size="sm" c="dimmed">
        Zu diesen Zeitpunkten vor dem Beginn bekommen alle eine Benachrichtigung, wenn bei einem
        Event noch Dienste fehlen. Wer das nicht möchte, schaltet es in den Benachrichtigungen aus.
        Ein kurzfristig angelegtes Event löst nur die zuletzt erreichte Erinnerung aus.
      </Text>
      <Stack gap="xs">
        {liste.length === 0 && <Text c="dimmed">Noch keine Zeitpunkte.</Text>}
        {liste.map((m) => (
          <Paper key={m} withBorder p="xs" pl="sm" radius="md">
            <Group justify="space-between" wrap="nowrap" gap="xs">
              <Text fw={600}>{erinnerungText(m)}</Text>
              <ActionIcon
                variant="subtle"
                color="red"
                size={42}
                aria-label={`${erinnerungText(m)} entfernen`}
                onClick={() => setListe(liste.filter((x) => x !== m))}
              >
                <IconTrash size={20} />
              </ActionIcon>
            </Group>
          </Paper>
        ))}
      </Stack>
      <Paper withBorder p="sm" radius="md">
        <Stack gap="sm">
          <Text fw={600}>Zeitpunkt hinzufügen</Text>
          <Group gap="xs" align="flex-end" wrap="nowrap">
            <ZahlFeld
              label="Wie lange vorher"
              min={1}
              allowDecimal={false}
              allowNegative={false}
              value={anzahl}
              onChange={(v) => setAnzahl(typeof v === 'number' ? v : '')}
              style={{ flex: 1, minWidth: 0 }}
            />
            <Select
              aria-label="Einheit"
              data={EINHEITEN}
              value={einheit}
              allowDeselect={false}
              onChange={(v) => v && setEinheit(v)}
              w={130}
              style={{ flexShrink: 0 }}
            />
          </Group>
          <Button
            variant="light"
            leftSection={<IconPlus size={18} />}
            disabled={liste.length >= ERINNERUNG_MAX_ANZAHL}
            onClick={hinzufuegen}
          >
            Hinzufügen
          </Button>
        </Stack>
      </Paper>
      {fehler && <Alert color="red">{fehler}</Alert>}
      <Button loading={laeuft} disabled={!geaendert} onClick={() => void speichern()}>
        Speichern
      </Button>
    </Stack>
  );
}
