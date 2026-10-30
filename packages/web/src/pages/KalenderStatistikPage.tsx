import {
  Alert,
  Anchor,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconChevronLeft } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { heuteBerlin, type StatistikZeileDto } from '@c4/shared';
import { PersonName } from '../KalenderAnzeige';
import { useDienstformen, useKalenderStatistik } from '../kalenderDaten';

const ZURUECK_JAHRE = 6;

/** Dienste per person, Dienstform, Aufbau and Putzen for one calendar year; cards on phones, table from `sm`. */
export function KalenderStatistikPage() {
  const aktuell = Number(heuteBerlin().slice(0, 4));
  const [jahr, setJahr] = useState(aktuell);
  const statistik = useKalenderStatistik(jahr);
  const dienstformen = useDienstformen();

  const zeilen: StatistikZeileDto[] = statistik.data?.zeilen ?? [];
  // Columns: the active Dienstformen plus archived ones that have Dienste in this year.
  const spalten = [
    ...dienstformen.liste
      .filter((d) => !d.archiviert || zeilen.some((z) => (z.nachSpalte[d.id] ?? 0) > 0))
      .map((d) => ({ key: d.id, name: d.name })),
    // Aufbau and Putzen have no Dienstform and get a column of their own.
    { key: 'art:aufbau', name: 'Aufbau' },
    { key: 'art:putzen', name: 'Putzen' },
  ];
  const jahre = Array.from({ length: ZURUECK_JAHRE + 1 }, (_, i) => String(aktuell - i));

  return (
    <Stack maw={900}>
      <Anchor component={Link} to="/kalender" size="sm">
        <Group gap={4} wrap="nowrap">
          <IconChevronLeft size={16} />
          Zurück zum Kalender
        </Group>
      </Anchor>
      <Title order={2}>Dienstschwein</Title>
      <Select
        label="Jahr"
        data={jahre}
        value={String(jahr)}
        allowDeselect={false}
        onChange={(v) => v && setJahr(Number(v))}
        maw={200}
      />
      <Text size="sm" c="dimmed">
        Jeder Eintrag zählt einmal, nach dem Beginn der Schicht. Abgesagte Events zählen nicht.
      </Text>

      {statistik.isError || dienstformen.isError ? (
        <Alert color="red">Das Dienstschwein konnte nicht geladen werden.</Alert>
      ) : statistik.isPending || dienstformen.isPending ? (
        <Loader m="md" />
      ) : zeilen.length === 0 ? (
        <Text c="dimmed">In {jahr} gibt es noch keine Dienste.</Text>
      ) : (
        <>
          <Stack gap="xs" hiddenFrom="sm">
            {zeilen.map((z) => (
              <Paper
                key={z.person.art === 'mitglied' ? z.person.sub : z.person.id}
                withBorder
                p="sm"
                radius="md"
              >
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <Text style={{ minWidth: 0 }}>
                    <PersonName person={z.person} />
                  </Text>
                  <Text fw={700} size="lg">
                    {z.gesamt}
                  </Text>
                </Group>
                <Text size="sm" c="dimmed">
                  {spalten
                    .filter((d) => (z.nachSpalte[d.key] ?? 0) > 0)
                    .map((d) => `${d.name} ${z.nachSpalte[d.key]}`)
                    .join(' · ')}
                </Text>
              </Paper>
            ))}
          </Stack>
          <Table.ScrollContainer minWidth={400} visibleFrom="sm">
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Person</Table.Th>
                  <Table.Th ta="right">Gesamt</Table.Th>
                  {spalten.map((d) => (
                    <Table.Th key={d.key} ta="right">
                      {d.name}
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {zeilen.map((z) => (
                  <Table.Tr key={z.person.art === 'mitglied' ? z.person.sub : z.person.id}>
                    <Table.Td>
                      <PersonName person={z.person} />
                    </Table.Td>
                    <Table.Td ta="right" fw={700}>
                      {z.gesamt}
                    </Table.Td>
                    {spalten.map((d) => (
                      <Table.Td key={d.key} ta="right">
                        {z.nachSpalte[d.key] ?? 0}
                      </Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </>
      )}
    </Stack>
  );
}
