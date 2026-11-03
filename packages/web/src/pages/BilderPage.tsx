import {
  Alert,
  ActionIcon,
  Anchor,
  Badge,
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
  Tooltip,
} from '@mantine/core';
import { IconPlus, IconSearch, IconSettings, IconShare } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { bilderSuche, type BilderOrdnerDto } from '@c4/shared';
import { useAuth } from '../auth';
import { BilderOrdnerModal } from '../BilderOrdnerModal';
import { bilderDatum, bilderNachJahr } from '../bilderAnzeige';
import { useBilderOrdner } from '../bilderDaten';
import { useBilderTeilen } from '../bilderTeilen';

/** Link that opens the folder: the sharing link opens the OneDrive app on phones. */
const ordnerLink = (o: BilderOrdnerDto) => o.freigabeUrl ?? o.webUrl;

const eventLink = (id: string) => `/kalender/events/${encodeURIComponent(id)}`;

/** Small "Event" badge linking to the calendar event; does not open the folder. */
function EventBadge({ eventId }: Readonly<{ eventId: string }>) {
  return (
    <Badge
      component={Link}
      to={eventLink(eventId)}
      variant="light"
      style={{ cursor: 'pointer' }}
      onClick={(e: { stopPropagation: () => void }) => e.stopPropagation()}
    >
      Event
    </Badge>
  );
}

/** Share button; does not open the folder it sits on. */
function TeilenKnopf({ ordner }: Readonly<{ ordner: BilderOrdnerDto }>) {
  const teilen = useBilderTeilen();
  return (
    <Tooltip label="Teilen">
      <ActionIcon
        variant="subtle"
        color="gray"
        size="xl"
        aria-label={`${ordner.eventName} teilen`}
        style={{ flexShrink: 0 }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void teilen(ordner.id, ordner.eventName, ordner.freigabeUrl);
        }}
      >
        <IconShare size={20} />
      </ActionIcon>
    </Tooltip>
  );
}

function BilderKarte({ ordner }: Readonly<{ ordner: BilderOrdnerDto }>) {
  const datum = bilderDatum(ordner.von, ordner.bis, ordner.genauigkeit);
  return (
    <Paper
      withBorder
      p="md"
      component="a"
      href={ordnerLink(ordner)}
      target="_blank"
      rel="noopener"
      style={{ color: 'inherit', textDecoration: 'none' }}
    >
      <Group justify="space-between" wrap="nowrap" align="center" gap="xs">
        <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
          <Text fw={700} style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
            {ordner.eventName}
          </Text>
          {datum && (
            <Text size="sm" c="dimmed">
              {datum}
            </Text>
          )}
        </Stack>
        {ordner.eventId && <EventBadge eventId={ordner.eventId} />}
        <TeilenKnopf ordner={ordner} />
      </Group>
    </Paper>
  );
}

/** Table from `sm` upward; the whole row opens the folder in OneDrive. */
function BilderTabelle({ ordner }: Readonly<{ ordner: BilderOrdnerDto[] }>) {
  return (
    <Table.ScrollContainer minWidth={480} visibleFrom="sm">
      <Table verticalSpacing="xs" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Datum</Table.Th>
            <Table.Th>Event</Table.Th>
            <Table.Th />
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {ordner.map((o) => (
            <Table.Tr
              key={o.id}
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('a')) return;
                window.open(ordnerLink(o), '_blank', 'noopener');
              }}
            >
              <Table.Td style={{ whiteSpace: 'nowrap' }}>
                {bilderDatum(o.von, o.bis, o.genauigkeit) ?? '–'}
              </Table.Td>
              <Table.Td>
                {/* A real link for keyboard use, but plain text; the whole row is clickable. */}
                <a
                  href={ordnerLink(o)}
                  target="_blank"
                  rel="noopener"
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  <Text component="span" fw={700} style={{ overflowWrap: 'anywhere' }}>
                    {o.eventName}
                  </Text>
                </a>
              </Table.Td>
              <Table.Td ta="right">{o.eventId && <EventBadge eventId={o.eventId} />}</Table.Td>
              <Table.Td ta="right">
                <TeilenKnopf ordner={o} />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

/** The photo folders of the events in OneDrive, newest first, grouped by year. */
export function BilderPage() {
  const { can } = useAuth();
  const istAdmin = can('users:manage');
  const liste = useBilderOrdner();
  const [suche, setSuche] = useState('');
  const [anlegen, setAnlegen] = useState(false);

  const verbunden = liste.data?.verbunden ?? false;
  const alle = useMemo(() => liste.data?.ordner ?? [], [liste.data]);
  const gefiltert = useMemo(
    () => (suche.trim() ? alle.filter((o) => bilderSuche(o, suche)) : alle),
    [alle, suche],
  );
  const gruppen = useMemo(() => bilderNachJahr(gefiltert), [gefiltert]);

  return (
    <Stack>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Title order={2}>Bilder</Title>
        <Group gap="xs" wrap="nowrap">
          {istAdmin && (
            <Tooltip label="Einrichtung">
              <ActionIcon
                component={Link}
                to="/bilder/einrichtung"
                variant="default"
                size="xl"
                aria-label="Einrichtung"
              >
                <IconSettings size={20} />
              </ActionIcon>
            </Tooltip>
          )}
          {verbunden && (
            <Button leftSection={<IconPlus size={18} />} onClick={() => setAnlegen(true)}>
              Ordner anlegen
            </Button>
          )}
        </Group>
      </Group>
      {liste.isPending && <Loader m="md" aria-label="Bilder werden geladen" />}
      {liste.isError && <Alert color="red">Die Ordner konnten nicht geladen werden.</Alert>}
      {liste.data && !verbunden && (
        <Alert color="yellow">
          <Text>OneDrive ist nicht verbunden.</Text>
          {istAdmin && (
            <Anchor component={Link} to="/bilder/einrichtung">
              Zur Einrichtung
            </Anchor>
          )}
        </Alert>
      )}
      {verbunden && (
        <>
          <TextInput
            size="md"
            aria-label="Suche"
            placeholder="Eventname oder Datum"
            leftSection={<IconSearch size={18} />}
            value={suche}
            onChange={(e) => setSuche(e.currentTarget.value)}
          />
          {alle.length === 0 && <Text c="dimmed">Noch keine Ordner.</Text>}
          {alle.length > 0 && gefiltert.length === 0 && <Text c="dimmed">Keine Treffer.</Text>}
          {gruppen.map((g) => (
            <Stack key={g.jahr} gap="xs">
              <Title order={3}>{g.jahr}</Title>
              <SimpleGrid cols={1} hiddenFrom="sm">
                {g.ordner.map((o) => (
                  <BilderKarte key={o.id} ordner={o} />
                ))}
              </SimpleGrid>
              <BilderTabelle ordner={g.ordner} />
            </Stack>
          ))}
        </>
      )}
      {anlegen && <BilderOrdnerModal onClose={() => setAnlegen(false)} />}
    </Stack>
  );
}
