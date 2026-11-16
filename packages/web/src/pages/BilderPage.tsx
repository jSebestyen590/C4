import {
  Alert,
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  Collapse,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
  useMantineTheme,
} from '@mantine/core';
import {
  IconChevronDown,
  IconPlus,
  IconSearch,
  IconSettings,
  IconShare,
} from '@tabler/icons-react';
import { useMediaQuery } from '@mantine/hooks';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { bilderSuche, type BilderOrdnerDto } from '@c4/shared';
import { useAuth } from '../auth';
import { formatDatumZeit } from '../datum';
import { BilderOrdnerModal } from '../BilderOrdnerModal';
import { bilderDatum, bilderNachJahr } from '../bilderAnzeige';
import { useBilderOrdner } from '../bilderDaten';
import { useBilderTeilen } from '../bilderTeilen';
import { KartenOderTabelle } from '../KartenOderTabelle';

/** "dd.mm. HH:mm" in Berlin time of an ISO instant. */
const standText = (iso: string) => formatDatumZeit(iso, 'ohneJahr');

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
function TeilenKnopf({
  ordner,
  size = 'xl',
}: Readonly<{ ordner: BilderOrdnerDto; size?: 'lg' | 'xl' }>) {
  const teilen = useBilderTeilen();
  return (
    <Tooltip label="Teilen">
      <ActionIcon
        variant="subtle"
        color="gray"
        size={size}
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

/** Folders as cards on phones and as a table from `sm`; the whole row opens the folder in OneDrive. */
function BilderListe({ ordner }: Readonly<{ ordner: BilderOrdnerDto[] }>) {
  return (
    <KartenOderTabelle
      zeilen={ordner}
      zeilenKey={(o) => o.id}
      minWidth={480}
      tabelle={{ highlightOnHover: true, layout: 'fixed' }}
      /* Same widths in every year table; the Event column takes the rest. */
      spalten={
        <colgroup>
          <col style={{ width: '12rem' }} />
          <col />
          <col style={{ width: '6rem' }} />
          <col style={{ width: '4rem' }} />
        </colgroup>
      }
      karte={(o) => <BilderKarte ordner={o} />}
      kopf={
        <Table.Tr>
          <Table.Th>Datum</Table.Th>
          <Table.Th>Event</Table.Th>
          <Table.Th />
          <Table.Th />
        </Table.Tr>
      }
      zeile={(o) => (
        <Table.Tr
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
            <TeilenKnopf ordner={o} size="lg" />
          </Table.Td>
        </Table.Tr>
      )}
    />
  );
}

/** The photo folders of the events in OneDrive, newest first, grouped by year. */
export function BilderPage() {
  const { can } = useAuth();
  const istAdmin = can('users:manage');
  const liste = useBilderOrdner();
  const stand = liste.daten?.stand ? standText(liste.daten.stand) : null;
  const [suche, setSuche] = useState('');
  const [anlegen, setAnlegen] = useState(false);
  // Explicit user toggles by group key; groups without an entry follow the initial rule.
  const [umgeschaltet, setUmgeschaltet] = useState<Record<string, boolean>>({});
  const theme = useMantineTheme();
  // Read synchronously so phones do not flash expanded groups on the first render.
  const telefon = useMediaQuery(`(max-width: calc(${theme.breakpoints.sm} - 0.0625em))`, false, {
    getInitialValueInEffect: false,
  });

  const verbunden = liste.daten?.verbunden ?? false;
  const alle = useMemo(() => liste.daten?.ordner ?? [], [liste.daten]);
  const gefiltert = useMemo(
    () => (suche.trim() ? alle.filter((o) => bilderSuche(o, suche)) : alle),
    [alle, suche],
  );
  const gruppen = useMemo(() => bilderNachJahr(gefiltert), [gefiltert]);
  // Initial rule is based on all groups, not the filtered ones.
  const startOffen = useMemo(() => {
    const keys = bilderNachJahr(alle).map((g) => g.jahr);
    const aktuell = String(new Date().getFullYear());
    const offen = keys.includes(aktuell) ? aktuell : keys[0];
    return (jahr: string) => !telefon || jahr === offen;
  }, [alle, telefon]);
  const sucht = suche.trim() !== '';
  const istOffen = (jahr: string) => sucht || (umgeschaltet[jahr] ?? startOffen(jahr));

  return (
    <Stack maw="60rem">
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
      {liste.laedt && <Loader m="md" aria-label="Bilder werden geladen" />}
      {liste.fehler && <Alert color="red">Die Ordner konnten nicht geladen werden.</Alert>}
      {verbunden && liste.aktualisierenFehlgeschlagen && (
        <Alert color="yellow">
          Aktualisieren fehlgeschlagen
          {stand ? `, du siehst den Stand von ${stand}.` : '.'}
        </Alert>
      )}
      {liste.daten && !verbunden && (
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
          {/* Fixed height so the list does not jump when the indicator comes and goes. */}
          <Group gap="xs" wrap="nowrap" mih={20} aria-live="polite">
            {liste.aktualisiert && <Loader size="xs" aria-label="Wird aktualisiert" />}
            <Text size="xs" c="dimmed">
              {liste.aktualisiert && 'Wird aktualisiert …'}
              {liste.aktualisiert && liste.ausCache && stand && ' · '}
              {liste.ausCache && stand && `Stand: ${stand}`}
            </Text>
          </Group>
          {alle.length === 0 && !liste.aktualisiert && <Text c="dimmed">Noch keine Ordner.</Text>}
          {alle.length > 0 && gefiltert.length === 0 && <Text c="dimmed">Keine Treffer.</Text>}
          {gruppen.map((g) => {
            const offen = istOffen(g.jahr);
            const regionId = `bilder-gruppe-${g.jahr.replace(/\W/g, '-')}`;
            return (
              <Stack key={g.jahr} gap={0}>
                <Title order={3}>
                  <UnstyledButton
                    w="100%"
                    mih={42}
                    aria-expanded={offen}
                    aria-controls={regionId}
                    onClick={() => {
                      if (!sucht) setUmgeschaltet((u) => ({ ...u, [g.jahr]: !offen }));
                    }}
                  >
                    <Group justify="space-between" wrap="nowrap" gap="xs">
                      <Group gap="xs" wrap="nowrap" align="baseline">
                        <span>{g.jahr}</span>
                        <Text span size="sm" fw={400} c="dimmed">
                          {g.ordner.length} Ordner
                        </Text>
                      </Group>
                      <IconChevronDown
                        size={20}
                        style={{
                          flexShrink: 0,
                          transition: 'transform 200ms ease',
                          transform: offen ? 'rotate(180deg)' : 'none',
                        }}
                      />
                    </Group>
                  </UnstyledButton>
                </Title>
                <Collapse expanded={offen} id={regionId}>
                  <Box pt="xs">
                    <BilderListe ordner={g.ordner} />
                  </Box>
                </Collapse>
              </Stack>
            );
          })}
        </>
      )}
      {anlegen && <BilderOrdnerModal onClose={() => setAnlegen(false)} />}
    </Stack>
  );
}
