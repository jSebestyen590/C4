import {
  Alert,
  Button,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PrivatpartyPersonDto } from '@c4/shared';
import { PrivatpartyPersonFormular } from '../PrivatpartyPersonFormular';
import { privatpartyPersonLink, usePrivatpartyPersonen } from '../privatpartyDaten';
import { ZurueckLink } from '../ZurueckLink';

const anzahlText = (n: number) => (n === 1 ? '1 Privatparty' : `${n} Privatpartys`);

/** The people who rent the club, with a search. */
export function PrivatpartyPersonenPage() {
  const navigate = useNavigate();
  const personen = usePrivatpartyPersonen();
  const [suche, setSuche] = useState('');
  const [neu, setNeu] = useState(false);
  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return (personen.data ?? []).filter(
      (p) => !q || [p.name, p.email, p.kontakt].some((feld) => feld?.toLowerCase().includes(q)),
    );
  }, [personen.data, suche]);

  return (
    <Stack maw="60rem">
      <ZurueckLink to="/privatpartys">Privatpartys</ZurueckLink>
      <Group justify="space-between" gap="xs">
        <Title order={2}>Personen</Title>
        <Button
          size="md"
          mih={42}
          leftSection={<IconPlus size={18} />}
          onClick={() => setNeu(true)}
        >
          Neue Person
        </Button>
      </Group>
      <TextInput
        size="md"
        aria-label="Personen suchen"
        placeholder="Suchen"
        leftSection={<IconSearch size={18} />}
        value={suche}
        onChange={(e) => setSuche(e.currentTarget.value)}
      />
      {personen.isPending && <Loader m="md" aria-label="Personen werden geladen" />}
      {personen.isError && <Alert color="red">Die Personen konnten nicht geladen werden.</Alert>}
      {personen.data && treffer.length === 0 && (
        <Text c="dimmed">{suche ? 'Keine Treffer.' : 'Noch keine Personen.'}</Text>
      )}
      {treffer.length > 0 && (
        <>
          <SimpleGrid cols={1} spacing="sm" hiddenFrom="sm">
            {treffer.map((p: PrivatpartyPersonDto) => (
              <Paper
                key={p.id}
                component={Link}
                to={privatpartyPersonLink(p.id)}
                withBorder
                p="md"
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                <Stack gap={2}>
                  <Text fw={700} style={{ overflowWrap: 'anywhere' }}>
                    {p.name}
                  </Text>
                  {p.email && (
                    <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                      {p.email}
                    </Text>
                  )}
                  <Text size="sm" c="dimmed">
                    {anzahlText(p.anzahlPrivatpartys)}
                  </Text>
                </Stack>
              </Paper>
            ))}
          </SimpleGrid>
          <Table.ScrollContainer minWidth={520} visibleFrom="sm">
            <Table verticalSpacing="xs" highlightOnHover layout="fixed">
              <colgroup>
                <col style={{ width: '14rem' }} />
                <col />
                <col style={{ width: '10rem' }} />
              </colgroup>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>E-Mail</Table.Th>
                  <Table.Th>Privatpartys</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {treffer.map((p) => (
                  <Table.Tr
                    key={p.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => void navigate(privatpartyPersonLink(p.id))}
                  >
                    <Table.Td>
                      <Text fw={700} style={{ overflowWrap: 'anywhere' }}>
                        {p.name}
                      </Text>
                    </Table.Td>
                    <Table.Td style={{ overflowWrap: 'anywhere' }}>{p.email ?? '–'}</Table.Td>
                    <Table.Td>{p.anzahlPrivatpartys}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </>
      )}
      {neu && (
        <PrivatpartyPersonFormular
          onClose={() => setNeu(false)}
          onGespeichert={(id) => void navigate(privatpartyPersonLink(id))}
        />
      )}
    </Stack>
  );
}
