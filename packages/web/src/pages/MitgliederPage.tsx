import {
  Alert,
  Avatar,
  Badge,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { unwrap, useApi } from '../api';
import { anzeigename, nebenname } from '../mitglied';

const SORTIERUNGEN = [
  { value: 'username', label: 'Username' },
  { value: 'vorname', label: 'Vorname' },
  { value: 'nachname', label: 'Nachname' },
];
type Sortierung = 'username' | 'vorname' | 'nachname';

/** Empty values sort last so members without a username do not lead the list. */
const vergleichen = (a: string, b: string) =>
  a === b ? 0 : a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'de', { sensitivity: 'base' });

export function MitgliederPage() {
  const api = useApi();
  const [suche, setSuche] = useState('');
  const [sortierung, setSortierung] = useState<Sortierung>('nachname');
  const mitglieder = useQuery({
    queryKey: ['mitglieder'],
    queryFn: async () => unwrap(await api.mitglieder.$get()),
  });

  const treffer = (mitglieder.data ?? [])
    .filter((m) =>
      `${m.vorname} ${m.nachname} ${m.username ?? ''} ${m.email ?? ''}`
        .toLowerCase()
        .includes(suche.trim().toLowerCase()),
    )
    .sort(
      (a, b) =>
        vergleichen(a[sortierung] ?? '', b[sortierung] ?? '') ||
        vergleichen(anzeigename(a), anzeigename(b)),
    );

  return (
    <Stack>
      <Title order={2}>Mitglieder</Title>
      <TextInput
        type="search"
        placeholder="Suchen"
        aria-label="Mitglieder suchen"
        value={suche}
        onChange={(e) => setSuche(e.currentTarget.value)}
      />
      <Select
        label="Sortieren nach"
        data={SORTIERUNGEN}
        value={sortierung}
        onChange={(v) => v && setSortierung(v as Sortierung)}
        allowDeselect={false}
        comboboxProps={{ withinPortal: true }}
      />
      {mitglieder.isPending && <Loader m="md" aria-label="Mitglieder werden geladen" />}
      {mitglieder.isError && <Alert color="red">Mitglieder konnten nicht geladen werden.</Alert>}
      {mitglieder.data && treffer.length === 0 && (
        <Text c="dimmed">Keine Mitglieder gefunden.</Text>
      )}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {treffer.map((m) => (
          <Paper
            key={m.sub}
            withBorder
            p="md"
            component={Link}
            to={`/mitglieder/${m.sub}`}
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            <Stack gap="xs">
              <Group wrap="nowrap">
                <Avatar src={m.profilbildUrl} size={64} radius="xl" alt="" />
                <div style={{ minWidth: 0 }}>
                  <Text fw={500} style={{ overflowWrap: 'anywhere' }}>
                    {anzeigename(m)}
                  </Text>
                  {nebenname(m) && (
                    <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                      {nebenname(m)}
                    </Text>
                  )}
                  {!m.aktiviert && (
                    <Badge color="yellow" variant="light" mt={4}>
                      Noch nicht aktiviert
                    </Badge>
                  )}
                </div>
              </Group>
              {m.email && (
                <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                  {m.email}
                </Text>
              )}
              {m.telefon && <Text size="sm">{m.telefon}</Text>}
              {m.adresse && (
                <Text size="sm" style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
                  {m.adresse}
                </Text>
              )}
              {m.ueberMich && (
                <Text
                  size="sm"
                  c="dimmed"
                  style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}
                >
                  {m.ueberMich}
                </Text>
              )}
            </Stack>
          </Paper>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
