import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Switch,
  Table,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import type { TrichterDto } from '@c4/shared';
import { TrichterFormular } from '../TrichterFormular';
import { literAnzeigen } from '../trichterAnzeige';
import { useTrichterListe } from '../trichterDaten';
import { ZurueckLink } from '../ZurueckLink';
import { KartenOderTabelle } from '../KartenOderTabelle';

const auslaesseText = (n: number) => `${n} ${n === 1 ? 'Auslass' : 'Auslässe'}`;

function ArchiviertBadge() {
  return (
    <Badge color="gray" variant="light">
      Archiviert
    </Badge>
  );
}

/** Funnels: cards on phones, a table from `sm`; the whole card or row opens the editor. */
export function TrichterVerwaltungPage() {
  const [archiv, setArchiv] = useState(false);
  const liste = useTrichterListe(archiv);
  const [bearbeiten, setBearbeiten] = useState<TrichterDto | 'neu' | null>(null);
  const daten = liste.data ?? [];

  return (
    <Stack maw={900}>
      <ZurueckLink to="/trichter">Zurück zum Trichter</ZurueckLink>
      <Group justify="space-between" gap="sm">
        <Title order={2}>Trichter verwalten</Title>
        <Button size="md" leftSection={<IconPlus size={18} />} onClick={() => setBearbeiten('neu')}>
          Trichter anlegen
        </Button>
      </Group>
      <Switch
        size="md"
        label="Archivierte anzeigen"
        checked={archiv}
        onChange={(e) => setArchiv(e.currentTarget.checked)}
      />
      {liste.isPending && <Loader m="md" aria-label="Trichter werden geladen" />}
      {liste.isError && <Alert color="red">Die Trichter konnten nicht geladen werden.</Alert>}
      {liste.data && daten.length === 0 && <Text c="dimmed">Keine Trichter vorhanden.</Text>}
      <KartenOderTabelle
        zeilen={daten}
        zeilenKey={(t) => t.id}
        minWidth={420}
        kartenAlsStapel
        tabelle={{ highlightOnHover: true }}
        karte={(t) => (
          <UnstyledButton onClick={() => setBearbeiten(t)} w="100%">
            <Paper withBorder p="md" radius="md" opacity={t.archiviert ? 0.6 : 1}>
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Stack gap={2} style={{ minWidth: 0 }}>
                  <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                    {t.name}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {literAnzeigen(t.volumenMl)} · {auslaesseText(t.auslaesse)}
                  </Text>
                </Stack>
                {t.archiviert && <ArchiviertBadge />}
              </Group>
            </Paper>
          </UnstyledButton>
        )}
        kopf={
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Volumen</Table.Th>
            <Table.Th>Auslässe</Table.Th>
            <Table.Th />
          </Table.Tr>
        }
        zeile={(t) => (
          <Table.Tr
            opacity={t.archiviert ? 0.6 : 1}
            style={{ cursor: 'pointer' }}
            onClick={() => setBearbeiten(t)}
          >
            <Table.Td fw={600}>{t.name}</Table.Td>
            <Table.Td>{literAnzeigen(t.volumenMl)}</Table.Td>
            <Table.Td>{t.auslaesse}</Table.Td>
            <Table.Td>{t.archiviert && <ArchiviertBadge />}</Table.Td>
          </Table.Tr>
        )}
      />
      {bearbeiten && (
        <TrichterFormular
          trichter={bearbeiten === 'neu' ? undefined : bearbeiten}
          onClose={() => setBearbeiten(null)}
        />
      )}
    </Stack>
  );
}
