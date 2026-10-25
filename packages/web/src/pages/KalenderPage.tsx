import {
  ActionIcon,
  Alert,
  Anchor,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconChevronLeft,
  IconChevronRight,
  IconChartBar,
  IconPlus,
  IconSettings,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  datumBerlin,
  heuteBerlin,
  zeitBerlin,
  type EventDto,
  type DienstformDto,
} from '@c4/shared';
import { useAuth } from '../auth';
import { SCHICHT_ART_LABELS } from '../i18n';
import { AMPEL_FARBE, AmpelBadge, FehltInfo, kategorieFarbe, PersonName } from '../KalenderAnzeige';
import { useDienstformen, useKalenderEvents } from '../kalenderDaten';
import {
  monatAnzeigen,
  monatsGrenzen,
  monatsRaster,
  schichtZeitAnzeigen,
  zeitraumAnzeigen,
} from '../kalenderZeit';
import { useEigeneSub } from '../organisator';

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

type Ansicht = 'liste' | 'monat';

/** Dienste of one Schicht grouped by Dienstform: "Bar: A, B". */
function DienstZeilen({
  schicht,
  dienstformen,
}: Readonly<{ schicht: EventDto['schichten'][number]; dienstformen: Map<string, DienstformDto> }>) {
  if (schicht.dienste.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Noch niemand eingetragen
      </Text>
    );
  }
  const ids = [...new Set(schicht.dienste.map((d) => d.dienstformId))];
  return (
    <Stack gap={2}>
      {ids.map((id) => (
        <Text key={id} size="sm">
          <Text component="span" c="dimmed">
            {dienstformen.get(id)?.name ?? 'Dienst'}:{' '}
          </Text>
          {schicht.dienste
            .filter((d) => d.dienstformId === id)
            .map((d, i) => (
              <span key={d.id}>
                {i > 0 && ', '}
                <PersonName person={d.person} />
              </span>
            ))}
        </Text>
      ))}
    </Stack>
  );
}

function EventKarte({
  event,
  dienstformen,
}: Readonly<{ event: EventDto; dienstformen: Map<string, DienstformDto> }>) {
  const tag = datumBerlin(event.beginn);
  return (
    <Paper
      withBorder
      p="sm"
      radius="md"
      style={{
        borderLeft: `6px solid var(--mantine-color-${kategorieFarbe(event.kategorie)}-6)`,
        opacity: event.abgesagt ? 0.75 : 1,
      }}
    >
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Text size="sm" c="dimmed">
              {zeitraumAnzeigen(event.beginn, event.ende)}
            </Text>
            <Anchor
              component={Link}
              to={`/kalender/events/${event.id}`}
              fw={700}
              size="lg"
              td={event.abgesagt ? 'line-through' : undefined}
              style={{ overflowWrap: 'anywhere' }}
            >
              {event.titel}
            </Anchor>
            {event.kategorie && (
              <Text size="xs" c="dimmed">
                {event.kategorie.name}
              </Text>
            )}
          </Stack>
          <AmpelBadge bewertung={event.bewertung} />
        </Group>
        {event.schichten.map((s) => (
          <Box
            key={s.id}
            pl="xs"
            style={{ borderLeft: '2px solid var(--mantine-color-default-border)' }}
          >
            <Text size="sm" fw={600}>
              {s.name}{' '}
              <Text component="span" fw={400} c="dimmed">
                · {SCHICHT_ART_LABELS[s.art]} · {schichtZeitAnzeigen(s, tag)}
              </Text>
            </Text>
            <DienstZeilen schicht={s} dienstformen={dienstformen} />
            {!event.abgesagt && <FehltInfo schicht={s} dienstformen={dienstformen} />}
          </Box>
        ))}
        <Button
          component={Link}
          to={`/kalender/events/${event.id}`}
          variant="light"
          fullWidth
          hiddenFrom="sm"
        >
          {event.abgesagt ? 'Details' : 'Details und eintragen'}
        </Button>
      </Stack>
    </Paper>
  );
}

function MonatsRaster({
  jahr,
  monat,
  events,
}: Readonly<{ jahr: number; monat: number; events: EventDto[] }>) {
  const tage = monatsRaster(jahr, monat);
  const heute = heuteBerlin();
  const nachTag = useMemo(() => {
    const m = new Map<string, EventDto[]>();
    for (const e of events) {
      const t = datumBerlin(e.beginn);
      m.set(t, [...(m.get(t) ?? []), e]);
    }
    return m;
  }, [events]);
  return (
    <Stack gap={4}>
      <SimpleGrid cols={7} spacing={4}>
        {WOCHENTAGE.map((w) => (
          <Text key={w} size="sm" fw={700} ta="center" c="dimmed">
            {w}
          </Text>
        ))}
        {tage.map((t) => {
          const imMonat = Number(t.slice(5, 7)) - 1 === monat;
          return (
            <Paper
              key={t}
              withBorder
              p={4}
              mih={104}
              style={{
                opacity: imMonat ? 1 : 0.5,
                minWidth: 0,
                outline: t === heute ? '2px solid var(--mantine-primary-color-filled)' : undefined,
              }}
            >
              <Text size="xs" fw={t === heute ? 700 : 400} c="dimmed">
                {Number(t.slice(8))}
              </Text>
              <Stack gap={2}>
                {(nachTag.get(t) ?? []).map((e) => {
                  const farbe = kategorieFarbe(e.kategorie);
                  return (
                    <Anchor
                      key={e.id}
                      component={Link}
                      to={`/kalender/events/${e.id}`}
                      title={`${e.titel} (${zeitBerlin(e.beginn)})`}
                      fz={12}
                      lh={1.25}
                      px={4}
                      py={2}
                      td={e.abgesagt ? 'line-through' : undefined}
                      style={{
                        display: 'block',
                        borderRadius: 4,
                        background: `var(--mantine-color-${farbe}-light)`,
                        color: `var(--mantine-color-${farbe}-light-color)`,
                        borderLeft: `4px solid var(--mantine-color-${AMPEL_FARBE[e.bewertung]}-filled)`,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {zeitBerlin(e.beginn)} {e.titel}
                    </Anchor>
                  );
                })}
              </Stack>
            </Paper>
          );
        })}
      </SimpleGrid>
      <Text size="xs" c="dimmed">
        Der Streifen links zeigt die Besetzung: rot = Dienste fehlen, gelb = Wunsch nicht erreicht,
        grün = voll besetzt, grau = abgesagt.
      </Text>
    </Stack>
  );
}

/** Calendar: card list of the events of a month (phone), from `sm` optionally as month grid. */
export function KalenderPage() {
  const { can } = useAuth();
  const eigeneSub = useEigeneSub();
  const heute = heuteBerlin();
  const [monatState, setMonat] = useState({
    jahr: Number(heute.slice(0, 4)),
    monat: Number(heute.slice(5, 7)) - 1,
  });
  const [ansicht, setAnsicht] = useState<Ansicht>('liste');
  const [nurFehlend, setNurFehlend] = useState(false);
  const [nurMeine, setNurMeine] = useState(false);
  const breit = useMediaQuery('(min-width: 48em)') ?? false;
  const { jahr, monat } = monatState;
  const raster = ansicht === 'monat' && breit;

  const tage = monatsRaster(jahr, monat);
  const grenzen = monatsGrenzen(jahr, monat);
  const von = raster ? tage[0]! : grenzen.erster;
  const bis = raster ? tage[tage.length - 1]! : grenzen.letzter;
  const events = useKalenderEvents(von, bis);
  const dienstformen = useDienstformen();

  const sichtbar = useMemo(
    () =>
      (events.data ?? []).filter((e) => {
        if (nurFehlend && (e.bewertung === 'gruen' || e.bewertung === 'abgesagt')) return false;
        if (
          nurMeine &&
          !e.schichten.some((s) =>
            s.dienste.some((d) => d.person.art === 'mitglied' && d.person.sub === eigeneSub),
          )
        )
          return false;
        return true;
      }),
    [events.data, nurFehlend, nurMeine, eigeneSub],
  );
  // The list shows the selected month only; the grid also shows the neighbouring days.
  const listeEvents = sichtbar.filter(
    (e) => datumBerlin(e.beginn) >= grenzen.erster && datumBerlin(e.beginn) <= grenzen.letzter,
  );

  const verschieben = (delta: number) => {
    const d = new Date(Date.UTC(jahr, monat + delta, 1));
    setMonat({ jahr: d.getUTCFullYear(), monat: d.getUTCMonth() });
  };

  return (
    <Stack maw={raster ? undefined : 900} gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>Kalender</Title>
        <Group gap="xs">
          {can('events:verwalten') && (
            <Button component={Link} to="/kalender/events/neu" leftSection={<IconPlus size={18} />}>
              Event anlegen
            </Button>
          )}
          <Button
            component={Link}
            to="/kalender/statistik"
            variant="default"
            leftSection={<IconChartBar size={18} />}
          >
            Statistik
          </Button>
          {can('kalender:einrichten') && (
            <Button
              component={Link}
              to="/kalender/einrichtung"
              variant="default"
              leftSection={<IconSettings size={18} />}
            >
              Einrichtung
            </Button>
          )}
        </Group>
      </Group>

      <Group justify="space-between" wrap="nowrap">
        <ActionIcon
          variant="default"
          size={44}
          aria-label="Voriger Monat"
          onClick={() => verschieben(-1)}
        >
          <IconChevronLeft size={20} />
        </ActionIcon>
        <Stack gap={0} align="center">
          <Text fw={700} size="lg" ta="center">
            {monatAnzeigen(jahr, monat)}
          </Text>
          <Anchor
            component="button"
            type="button"
            size="sm"
            onClick={() =>
              setMonat({ jahr: Number(heute.slice(0, 4)), monat: Number(heute.slice(5, 7)) - 1 })
            }
          >
            Heute
          </Anchor>
        </Stack>
        <ActionIcon
          variant="default"
          size={44}
          aria-label="Nächster Monat"
          onClick={() => verschieben(1)}
        >
          <IconChevronRight size={20} />
        </ActionIcon>
      </Group>

      <Group justify="space-between" align="center">
        <Group gap="lg">
          <Switch
            size="md"
            label="Nur mit fehlenden Diensten"
            checked={nurFehlend}
            onChange={(e) => setNurFehlend(e.currentTarget.checked)}
          />
          <Switch
            size="md"
            label="Nur meine"
            checked={nurMeine}
            onChange={(e) => setNurMeine(e.currentTarget.checked)}
          />
        </Group>
        <SegmentedControl
          visibleFrom="sm"
          value={ansicht}
          onChange={(v) => setAnsicht(v as Ansicht)}
          data={[
            { value: 'liste', label: 'Liste' },
            { value: 'monat', label: 'Monat' },
          ]}
        />
      </Group>

      {events.isError || dienstformen.isError ? (
        <Alert color="red">Der Kalender konnte nicht geladen werden.</Alert>
      ) : events.isPending ? (
        <Loader m="md" />
      ) : raster ? (
        <MonatsRaster jahr={jahr} monat={monat} events={sichtbar} />
      ) : listeEvents.length === 0 ? (
        <Text c="dimmed">
          {nurFehlend || nurMeine
            ? 'Keine passenden Events in diesem Monat.'
            : 'Keine Events in diesem Monat.'}
        </Text>
      ) : (
        <Stack gap="sm">
          {listeEvents.map((e) => (
            <EventKarte key={e.id} event={e} dienstformen={dienstformen.nachId} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
