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
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconSelector } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { unwrap, useApi } from '../api';
import { useAuth } from '../auth';
import { MitgliedEinladen } from '../MitgliedEinladen';
import { KontaktkanalIcons } from '../KontaktkanalIcons';
import { PostenLinks } from '../PostenAnzeige';
import { anzeigename, kontaktangaben, mitgliedLink, nebenname } from '../mitglied';
import { BADGE_FARBE, StatusBadge, StatusName } from '../StatusAnzeige';
import { MITGLIED_STATUS_MEHRZAHL } from '../i18n';
import { MITGLIED_STATI, type Mitglied } from '@c4/shared';

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

/** How many active accounts each status has; deactivated accounts are not counted. */
function StatusUebersicht({ mitglieder }: Readonly<{ mitglieder: readonly Mitglied[] }>) {
  const aktive = mitglieder.filter((m) => !m.deaktiviert);
  return (
    <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs" aria-label="Anzahl je Status">
      {MITGLIED_STATI.map((status) => (
        <Paper key={status} withBorder radius="md" p="sm">
          <Text fz="xl" fw={700} c={BADGE_FARBE[status]} lh={1.2}>
            {aktive.filter((m) => m.status === status).length}
          </Text>
          <Text size="sm" c="dimmed">
            {MITGLIED_STATUS_MEHRZAHL[status]}
          </Text>
        </Paper>
      ))}
    </SimpleGrid>
  );
}

export function MitgliederPage() {
  const api = useApi();
  const istAdmin = useAuth().can('users:manage');
  const [suche, setSuche] = useState('');
  const [sortierung, setSortierung] = useState<Sortierung>('username');
  const [aufsteigend, setAufsteigend] = useState(true);
  const [mitDeaktivierten, setMitDeaktivierten] = useState(false);
  const zeigeDeaktivierte = istAdmin && mitDeaktivierten;
  // Own cache entry: the default `['mitglieder']` list feeds the pickers and must never contain deactivated members.
  const mitglieder = useQuery({
    queryKey: zeigeDeaktivierte ? ['mitglieder', { deaktivierte: true }] : ['mitglieder'],
    queryFn: async () =>
      unwrap(
        zeigeDeaktivierte
          ? await api.mitglieder.$get({ query: { deaktivierte: '1' } } as never)
          : await api.mitglieder.$get(),
      ),
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
      {mitglieder.data && <StatusUebersicht mitglieder={mitglieder.data} />}
      {istAdmin && (
        <Switch
          label="Deaktivierte anzeigen"
          size="md"
          checked={mitDeaktivierten}
          onChange={(e) => setMitDeaktivierten(e.currentTarget.checked)}
        />
      )}
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
          <Paper key={m.sub} withBorder p="md" style={m.deaktiviert ? { opacity: 0.6 } : undefined}>
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
                    {m.deaktiviert && (
                      <Badge color="gray" variant="light" mt={4}>
                        Deaktiviert
                      </Badge>
                    )}
                    {!m.aktiviert && !m.deaktiviert && (
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
              <PostenLinks posten={m.posten} />
              <KontaktkanalIcons gewaehlt={m.kontaktkanaele} angaben={kontaktangaben(m)} />
            </Stack>
          </Paper>
        ))}
      </SimpleGrid>
      {treffer.length > 0 && (
        <Table.ScrollContainer minWidth={880} visibleFrom="sm">
          <Table verticalSpacing="xs">
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
                <Table.Th>Posten</Table.Th>
                <Table.Th>E-Mail</Table.Th>
                <Table.Th>Telefon</Table.Th>
                <Table.Th>Kontakt</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {treffer.map((m) => (
                <Table.Tr key={m.sub} style={m.deaktiviert ? { opacity: 0.6 } : undefined}>
                  <Table.Td>
                    <Group gap="sm" wrap="nowrap">
                      <Avatar src={m.profilbildUrl} size={32} radius="xl" alt="" />
                      {/* Only the username leads to the detail page, not the whole row. */}
                      <Link to={mitgliedLink(m)} style={{ textDecoration: 'none' }}>
                        <StatusName status={m.status}>{m.username ?? '–'}</StatusName>
                      </Link>
                      {m.deaktiviert && (
                        <Badge color="gray" variant="light">
                          Deaktiviert
                        </Badge>
                      )}
                      {!m.aktiviert && !m.deaktiviert && (
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
                  <Table.Td>
                    <PostenLinks posten={m.posten} />
                  </Table.Td>
                  <Table.Td>{m.email}</Table.Td>
                  <Table.Td>{m.telefon}</Table.Td>
                  <Table.Td>
                    <KontaktkanalIcons
                      gewaehlt={m.kontaktkanaele}
                      angaben={kontaktangaben(m)}
                      groesse={36}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Stack>
  );
}
