import {
  Alert,
  Avatar,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { unwrap, useApi } from '../api';

export function MitgliederPage() {
  const api = useApi();
  const [suche, setSuche] = useState('');
  const mitglieder = useQuery({
    queryKey: ['mitglieder'],
    queryFn: async () => unwrap(await api.mitglieder.$get()),
  });

  const treffer = (mitglieder.data ?? []).filter((m) =>
    `${m.vorname} ${m.nachname} ${m.username ?? ''}`
      .toLowerCase()
      .includes(suche.trim().toLowerCase()),
  );

  return (
    <Stack>
      <Title order={2}>Mitglieder</Title>
      <TextInput
        type="search"
        placeholder="Nach Namen oder Username suchen"
        aria-label="Mitglieder suchen"
        value={suche}
        onChange={(e) => setSuche(e.currentTarget.value)}
      />
      {mitglieder.isPending && <Loader m="md" aria-label="Mitglieder werden geladen" />}
      {mitglieder.isError && <Alert color="red">Mitglieder konnten nicht geladen werden.</Alert>}
      {mitglieder.data && treffer.length === 0 && (
        <Text c="dimmed">Keine Mitglieder gefunden.</Text>
      )}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {treffer.map((m) => (
          <Paper key={m.sub} withBorder p="md">
            <Stack gap="xs">
              <Group wrap="nowrap">
                <Avatar src={m.profilbildUrl} size={64} radius="xl" alt="" />
                <div style={{ minWidth: 0 }}>
                  <Text fw={500} style={{ overflowWrap: 'anywhere' }}>
                    {m.vorname} {m.nachname}
                  </Text>
                  {m.username && (
                    <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                      @{m.username}
                    </Text>
                  )}
                </div>
              </Group>
              {m.telefon && (
                <Text size="sm" component="a" href={`tel:${m.telefon}`}>
                  {m.telefon}
                </Text>
              )}
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
