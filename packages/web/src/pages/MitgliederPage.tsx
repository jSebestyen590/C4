import {
  Alert,
  Avatar,
  Badge,
  Flex,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconSelector } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { unwrap, useApi } from '../api';
import { useAuth } from '../auth';
import { MitgliedEinladen } from '../MitgliedEinladen';
import { KontaktkanalIcons } from '../KontaktkanalIcons';
import { RollenBadges } from '../RollenAnzeige';
import { anzeigename, kontaktangaben, mitgliedLink, nebenname } from '../mitglied';
import { StatusBadge, StatusName } from '../StatusAnzeige';

type Sortierung = 'username' | 'vorname' | 'nachname';
const SORTIERUNGEN: { value: Sortierung; label: string }[] = [
  { value: 'username', label: 'Username' },
  { value: 'vorname', label: 'Vorname' },
  { value: 'nachname', label: 'Nachname' },
];

/** Empty values sort last so members without a username do not lead the list. */
const vergleichen = (a: string, b: string) =>
  a === b ? 0 : a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'de', { sensitivity: 'base' });

/** Column header that sorts the table; the phone layout uses the select instead. */
function SortKopf({
  spalte,
  label,
  sortierung,
  aufsteigend,
  onSort,
}: Readonly<{
  spalte: Sortierung;
  label: string;
  sortierung: Sortierung;
  aufsteigend: boolean;
  onSort: (spalte: Sortierung) => void;
}>) {
  const aktiv = sortierung === spalte;
  const Icon = !aktiv ? IconSelector : aufsteigend ? IconChevronUp : IconChevronDown;
  return (
    <Table.Th aria-sort={!aktiv ? 'none' : aufsteigend ? 'ascending' : 'descending'}>
      <UnstyledButton onClick={() => onSort(spalte)} py="xs" fw={600}>
        <Group gap={4} wrap="nowrap">
          {label}
          <Icon size={16} aria-hidden />
        </Group>
      </UnstyledButton>
    </Table.Th>
  );
}

export function MitgliederPage() {
  const api = useApi();
  const navigate = useNavigate();
  const istAdmin = useAuth().can('users:manage');
  const [suche, setSuche] = useState('');
  const [sortierung, setSortierung] = useState<Sortierung>('username');
  const [aufsteigend, setAufsteigend] = useState(true);
  const mitglieder = useQuery({
    queryKey: ['mitglieder'],
    queryFn: async () => unwrap(await api.mitglieder.$get()),
  });

  const sortieren = (spalte: Sortierung) => {
    if (spalte === sortierung) setAufsteigend((a) => !a);
    else {
      setSortierung(spalte);
      setAufsteigend(true);
    }
  };

  const treffer = (mitglieder.data ?? [])
    .filter((m) =>
      `${m.vorname} ${m.nachname} ${m.username ?? ''} ${m.email ?? ''}`
        .toLowerCase()
        .includes(suche.trim().toLowerCase()),
    )
    .sort((a, b) => {
      const [x, y] = [a[sortierung] ?? '', b[sortierung] ?? ''];
      const richtung = x === '' || y === '' ? 1 : aufsteigend ? 1 : -1;
      return richtung * vergleichen(x, y) || vergleichen(anzeigename(a), anzeigename(b));
    });

  return (
    <Stack>
      <Flex direction={{ base: 'column', sm: 'row' }} justify="space-between" gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Title order={2}>Mitglieder</Title>
          {istAdmin && <MitgliedEinladen />}
        </Group>
        <TextInput
          type="search"
          placeholder="Suchen"
          aria-label="Mitglieder suchen"
          value={suche}
          onChange={(e) => setSuche(e.currentTarget.value)}
          w={{ base: '100%', sm: 280 }}
        />
      </Flex>
      <Select
        hiddenFrom="sm"
        label="Sortieren nach"
        data={SORTIERUNGEN}
        value={sortierung}
        onChange={(v) => {
          if (v) {
            setSortierung(v as Sortierung);
            setAufsteigend(true);
          }
        }}
        allowDeselect={false}
      />
      {mitglieder.isPending && <Loader m="md" aria-label="Mitglieder werden geladen" />}
      {mitglieder.isError && <Alert color="red">Mitglieder konnten nicht geladen werden.</Alert>}
      {mitglieder.data && treffer.length === 0 && (
        <Text c="dimmed">Keine Mitglieder gefunden.</Text>
      )}
      <SimpleGrid cols={1} hiddenFrom="sm">
        {treffer.map((m) => (
          <Paper key={m.sub} withBorder p="md">
            <Stack gap="xs">
              {/* Only the upper part links to the detail page; the contact icons are links themselves. */}
              <Link
                to={mitgliedLink(m)}
                style={{
                  color: 'inherit',
                  textDecoration: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--mantine-spacing-xs)',
                }}
              >
                <Group wrap="nowrap">
                  <Avatar src={m.profilbildUrl} size={64} radius="xl" alt="" />
                  <div style={{ minWidth: 0 }}>
                    <Group gap="xs">
                      <StatusName status={m.status}>{anzeigename(m)}</StatusName>
                      <StatusBadge status={m.status} anrede={m.anrede} />
                    </Group>
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
              </Link>
              <KontaktkanalIcons gewaehlt={m.kontaktkanaele} angaben={kontaktangaben(m)} />
              {istAdmin && <RollenBadges rollen={m.rollen ?? []} anrede={m.anrede} />}
            </Stack>
          </Paper>
        ))}
      </SimpleGrid>
      {treffer.length > 0 && (
        <Table.ScrollContainer minWidth={istAdmin ? 980 : 760} visibleFrom="sm">
          <Table highlightOnHover verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                {SORTIERUNGEN.map((sp) => (
                  <SortKopf
                    key={sp.value}
                    spalte={sp.value}
                    label={sp.label}
                    sortierung={sortierung}
                    aufsteigend={aufsteigend}
                    onSort={sortieren}
                  />
                ))}
                <Table.Th>Status</Table.Th>
                <Table.Th>E-Mail</Table.Th>
                <Table.Th>Telefon</Table.Th>
                <Table.Th>Kontakt</Table.Th>
                {istAdmin && <Table.Th>Berechtigungen</Table.Th>}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {treffer.map((m) => (
                <Table.Tr
                  key={m.sub}
                  onClick={() => navigate(mitgliedLink(m))}
                  style={{ cursor: 'pointer' }}
                >
                  <Table.Td>
                    <Group gap="sm" wrap="nowrap">
                      <Avatar src={m.profilbildUrl} size={32} radius="xl" alt="" />
                      <Link to={mitgliedLink(m)} style={{ textDecoration: 'none' }}>
                        <StatusName status={m.status}>{m.username ?? '–'}</StatusName>
                      </Link>
                      {!m.aktiviert && (
                        <Badge color="yellow" variant="light">
                          Noch nicht aktiviert
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>{m.vorname}</Table.Td>
                  <Table.Td>{m.nachname}</Table.Td>
                  <Table.Td>
                    <StatusBadge status={m.status} anrede={m.anrede} />
                  </Table.Td>
                  <Table.Td>{m.email}</Table.Td>
                  <Table.Td>{m.telefon}</Table.Td>
                  <Table.Td>
                    <div onClick={(e) => e.stopPropagation()}>
                      <KontaktkanalIcons
                        gewaehlt={m.kontaktkanaele}
                        angaben={kontaktangaben(m)}
                        groesse={36}
                      />
                    </div>
                  </Table.Td>
                  {istAdmin && (
                    <Table.Td>
                      <RollenBadges rollen={m.rollen ?? []} anrede={m.anrede} />
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Stack>
  );
}
