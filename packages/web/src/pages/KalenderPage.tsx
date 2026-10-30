import {
  ActionIcon,
  Alert,
  Anchor,
  Box,
  Button,
  Group,
  Loader,
  Drawer,
  Modal,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconChevronLeft,
  IconChevronRight,
  IconCalendarDown,
  IconChartBar,
  IconPlus,
  IconSettings,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  datumAnzeigen,
  datumBerlin,
  heuteBerlin,
  schichtBezeichnung,
  zeitBerlin,
  type EventBewertung,
  type EventDto,
  type DienstformDto,
} from '@c4/shared';
import { useAuth } from '../auth';
import {
  AMPEL_FARBE,
  balkenFarbe,
  dienstName,
  DiensteKurz,
  EventStatusBadge,
  FehltInfo,
  kategorieFarbe,
  PersonName,
  TEILNAHME_BALKEN,
  TeilnahmeBadge,
} from '../KalenderAnzeige';
import { AMPEL_LABELS } from '../i18n';
import { useDienstformen, useKalenderEvents } from '../kalenderDaten';
import {
  monatAnzeigen,
  monatAusSuche,
  monatsGrenzen,
  monatsRaster,
  monatSuche,
  zeitraumKurz,
} from '../kalenderZeit';
import { useEigeneSub } from '../organisator';

const WOCHENTAGE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

type Ansicht = 'liste' | 'monat';

const ANSICHT_KEY = 'kalender.ansicht';

/** Remembered view of this viewer; storage may be unavailable. */
function ansichtLesen(): Ansicht {
  try {
    return localStorage.getItem(ANSICHT_KEY) === 'monat' ? 'monat' : 'liste';
  } catch {
    return 'liste';
  }
}

function ansichtSpeichern(a: Ansicht) {
  try {
    localStorage.setItem(ANSICHT_KEY, a);
  } catch {
    // ignore: the choice just is not remembered
  }
}

const AMPEL_RANG: Record<EventBewertung, number> = { rot: 3, gelb: 2, gruen: 1, abgesagt: 0 };

/** The worst Bewertung of several events; cancelled only if all are cancelled. */
const schlechtesteBewertung = (events: EventDto[]): EventBewertung =>
  events.reduce<EventBewertung>(
    (w, e) => (AMPEL_RANG[e.bewertung] > AMPEL_RANG[w] ? e.bewertung : w),
    'abgesagt',
  );

/**
 * Bar color of a day: the worst Ampel of its events with Dienste; neutral if it only has (uncancelled)
 * participation events, gray if everything is cancelled.
 */
function tagBalkenFarbe(events: EventDto[]): string {
  const mitAmpel = events.filter((e) => e.art === 'dienste');
  if (mitAmpel.length > 0) {
    return `var(--mantine-color-${AMPEL_FARBE[schlechtesteBewertung(mitAmpel)]}-filled)`;
  }
  return events.some((e) => !e.abgesagt)
    ? TEILNAHME_BALKEN
    : `var(--mantine-color-${AMPEL_FARBE.abgesagt}-filled)`;
}

/** Background of a day: one light Kategorie color, or vertical stripes for several. */
function tagHintergrund(events: EventDto[]): string {
  const farben = [...new Set(events.map((e) => kategorieFarbe(e.kategorie)))];
  const f = (c: string) => `var(--mantine-color-${c}-light)`;
  if (farben.length === 1) return f(farben[0]!);
  const stops = farben.map((c, i) => {
    const von = (i * 100) / farben.length;
    const bis = ((i + 1) * 100) / farben.length;
    return `${f(c)} ${von}% ${bis}%`;
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

function Legende({ kategorien }: Readonly<{ kategorien: EventDto['kategorie'][] }>) {
  const eindeutig = new Map<string, { name: string; farbe: string }>();
  for (const k of kategorien) {
    const farbe = kategorieFarbe(k);
    eindeutig.set(farbe + (k?.name ?? ''), { name: k?.name ?? 'Ohne Kategorie', farbe });
  }
  const punkt = (hintergrund: string, rand?: string) => (
    <Box
      w={16}
      h={16}
      style={{
        flexShrink: 0,
        borderRadius: 4,
        background: hintergrund,
        border: '1px solid var(--mantine-color-default-border)',
        borderBottom: rand ? `4px solid ${rand}` : undefined,
      }}
    />
  );
  return (
    <Stack gap="xs">
      <Group gap="md">
        {(['rot', 'gelb', 'gruen', 'abgesagt'] as const).map((b) => (
          <Group key={b} gap={6} wrap="nowrap">
            {punkt('transparent', `var(--mantine-color-${AMPEL_FARBE[b]}-filled)`)}
            <Text size="xs">{AMPEL_LABELS[b]}</Text>
          </Group>
        ))}
        <Group gap={6} wrap="nowrap">
          {punkt('transparent', TEILNAHME_BALKEN)}
          <Text size="xs">Teilnahme</Text>
        </Group>
      </Group>
      {eindeutig.size > 0 && (
        <Group gap="md">
          {[...eindeutig.values()].map((k) => (
            <Group key={k.farbe + k.name} gap={6} wrap="nowrap">
              {punkt(`var(--mantine-color-${k.farbe}-light)`)}
              <Text size="xs">{k.name}</Text>
            </Group>
          ))}
        </Group>
      )}
      <Text size="xs" c="dimmed">
        Die Hintergrundfarbe zeigt die Kategorie, der Streifen die Besetzung. Events mit Teilnahme
        haben keine Ampel und einen grauen Streifen.
      </Text>
    </Stack>
  );
}

/** Day overview: all events of a day as compact cards, plus a button to create one (with right). */
function TagesUebersicht({
  datum,
  events,
  ausgeblendet,
  darfAnlegen,
  onClose,
}: Readonly<{
  datum: string | null;
  events: EventDto[];
  ausgeblendet: boolean;
  darfAnlegen: boolean;
  onClose: () => void;
}>) {
  const navigate = useNavigate();
  const dienstformen = useDienstformen();
  const schmal = !(useMediaQuery('(min-width: 48em)') ?? false);
  const titel = datum ? datumAnzeigen(datum) : '';
  const inhalt = (
    <Stack gap="xs">
      {events.map((e) => (
        <UnstyledButton
          key={e.id}
          onClick={() => void navigate(`/kalender/events/${e.id}`)}
          p="sm"
          style={{
            minHeight: 44,
            borderRadius: 8,
            border: '1px solid var(--mantine-color-default-border)',
            borderLeft: `6px solid var(--mantine-color-${kategorieFarbe(e.kategorie)}-6)`,
            opacity: e.abgesagt ? 0.75 : 1,
          }}
        >
          <Stack gap={6} align="stretch">
            <Group justify="space-between" align="center" wrap="nowrap" gap="xs">
              <Stack gap={0} style={{ minWidth: 0 }}>
                <Text size="sm" c="dimmed">
                  {zeitBerlin(e.beginn)}
                </Text>
                <Text
                  fw={700}
                  td={e.abgesagt ? 'line-through' : undefined}
                  style={{ overflowWrap: 'anywhere' }}
                >
                  {e.anzeigeTitel}
                </Text>
              </Stack>
              <Stack gap={4} align="flex-end">
                <EventStatusBadge event={e} />
                <TeilnahmeBadge event={e} />
              </Stack>
            </Group>
            {e.verantwortlich && (
              <Text size="sm" c="dimmed">
                Verantwortlich: <PersonName person={e.verantwortlich} verlinken={false} />
              </Text>
            )}
            <DiensteKurz event={e} dienstformen={dienstformen.nachId} />
          </Stack>
        </UnstyledButton>
      ))}
      {ausgeblendet && (
        <Text size="sm" c="dimmed">
          Weitere Events ausgeblendet (Filter)
        </Text>
      )}
      {darfAnlegen && datum && (
        <Button
          component={Link}
          to={`/kalender/events/neu?datum=${datum}`}
          leftSection={<IconPlus size={18} />}
          mt="xs"
        >
          Event an diesem Tag anlegen
        </Button>
      )}
    </Stack>
  );
  return schmal ? (
    <Drawer
      opened={datum !== null}
      onClose={onClose}
      position="bottom"
      title={titel}
      styles={{ content: { paddingBottom: 'env(safe-area-inset-bottom)' } }}
    >
      {inhalt}
    </Drawer>
  ) : (
    <Modal opened={datum !== null} onClose={onClose} title={titel} centered>
      {inhalt}
    </Modal>
  );
}

/** Tap logic shared by both grids: events open the day overview, an empty day goes to "create". */
function useTagesKlick(alle: EventDto[], darfAnlegen: boolean, nachTag: Map<string, EventDto[]>) {
  const navigate = useNavigate();
  const [offen, setOffen] = useState<string | null>(null);
  const antippen = (t: string) => {
    if ((nachTag.get(t) ?? []).length > 0) setOffen(t);
    else if (darfAnlegen) void navigate(`/kalender/events/neu?datum=${t}`);
  };
  const sichtbarAm = offen ? (nachTag.get(offen) ?? []) : [];
  const ausgeblendet = offen
    ? alle.filter((e) => datumBerlin(e.beginn) === offen).length > sichtbarAm.length
    : false;
  const uebersicht = (
    <TagesUebersicht
      datum={offen}
      events={sichtbarAm}
      ausgeblendet={ausgeblendet}
      darfAnlegen={darfAnlegen}
      onClose={() => setOffen(null)}
    />
  );
  return { antippen, uebersicht, klickbar: (t: string) => darfAnlegen || nachTag.has(t) };
}

/** Compact month grid for phones: tap a day to see its events or to create one. */
function MonatsRasterKompakt({
  jahr,
  monat,
  events,
  alle,
  darfAnlegen,
}: Readonly<{
  jahr: number;
  monat: number;
  events: EventDto[];
  alle: EventDto[];
  darfAnlegen: boolean;
}>) {
  const tage = monatsRaster(jahr, monat);
  const heute = heuteBerlin();
  const nachTag = useMemo(() => nachTagGruppieren(events), [events]);
  const imMonat = (t: string) => Number(t.slice(5, 7)) - 1 === monat;
  const kategorien = events.filter((e) => imMonat(datumBerlin(e.beginn))).map((e) => e.kategorie);
  const { antippen, uebersicht, klickbar } = useTagesKlick(alle, darfAnlegen, nachTag);

  return (
    <Stack gap="md">
      <SimpleGrid cols={7} spacing={4}>
        {WOCHENTAGE.map((w) => (
          <Text key={w} size="xs" fw={700} ta="center" c="dimmed">
            {w}
          </Text>
        ))}
        {tage.map((t) => {
          const liste = nachTag.get(t) ?? [];
          const hat = liste.length > 0;
          const istHeute = t === heute;
          const zahl = (
            <Text size="sm" fw={istHeute || hat ? 700 : 400} c={hat ? undefined : 'dimmed'}>
              {Number(t.slice(8))}
            </Text>
          );
          const stil = {
            minWidth: 0,
            minHeight: 52,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: imMonat(t) ? 1 : 0.4,
            outline: istHeute ? '2px solid var(--mantine-primary-color-filled)' : undefined,
            outlineOffset: istHeute ? -2 : undefined,
            background: hat ? tagHintergrund(liste) : undefined,
            border: '1px solid var(--mantine-color-default-border)',
            borderBottom: hat ? `5px solid ${tagBalkenFarbe(liste)}` : undefined,
          } as const;
          if (!klickbar(t)) {
            return (
              <Box key={t} style={stil}>
                {zahl}
              </Box>
            );
          }
          return (
            <UnstyledButton
              key={t}
              onClick={() => antippen(t)}
              aria-label={`${Number(t.slice(8))}. ${monatAnzeigen(jahr, Number(t.slice(5, 7)) - 1).split(' ')[0]}: ${hat ? liste.map((e) => e.anzeigeTitel).join(', ') : 'Event anlegen'}`}
              style={stil}
            >
              {zahl}
            </UnstyledButton>
          );
        })}
      </SimpleGrid>
      <Legende kategorien={kategorien} />
      {uebersicht}
    </Stack>
  );
}

function nachTagGruppieren(events: EventDto[]): Map<string, EventDto[]> {
  const m = new Map<string, EventDto[]>();
  for (const e of events) {
    const t = datumBerlin(e.beginn);
    m.set(t, [...(m.get(t) ?? []), e]);
  }
  return m;
}

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
        <Text key={id ?? 'art'} size="sm">
          <Text component="span" c="dimmed">
            {dienstName(schicht, id, dienstformen)}:{' '}
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
              {zeitraumKurz(event.beginn, event.ende)}
            </Text>
            <Anchor
              component={Link}
              to={`/kalender/events/${event.id}`}
              fw={700}
              size="lg"
              td={event.abgesagt ? 'line-through' : undefined}
              style={{ overflowWrap: 'anywhere' }}
            >
              {event.anzeigeTitel}
            </Anchor>
            {event.kategorie && event.titel && (
              <Text size="xs" c="dimmed">
                {event.kategorie.name}
              </Text>
            )}
            {event.verantwortlich && (
              <Text size="xs" c="dimmed">
                Verantwortlich: <PersonName person={event.verantwortlich} />
              </Text>
            )}
          </Stack>
          <Stack gap={4} align="flex-end">
            <EventStatusBadge event={event} />
            <TeilnahmeBadge event={event} />
          </Stack>
        </Group>
        {(event.art === 'dienste' ? event.schichten : []).map((s) => (
          <Box
            key={s.id}
            pl="xs"
            style={{ borderLeft: '2px solid var(--mantine-color-default-border)' }}
          >
            <Text size="sm" fw={600}>
              {schichtBezeichnung(s, event.beginn)}
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
          {event.abgesagt || event.art === 'teilnahme' ? 'Details' : 'Details und eintragen'}
        </Button>
      </Stack>
    </Paper>
  );
}

function MonatsRaster({
  jahr,
  monat,
  events,
  alle,
  darfAnlegen,
}: Readonly<{
  jahr: number;
  monat: number;
  events: EventDto[];
  alle: EventDto[];
  darfAnlegen: boolean;
}>) {
  const tage = monatsRaster(jahr, monat);
  const heute = heuteBerlin();
  const nachTag = useMemo(() => nachTagGruppieren(events), [events]);
  const kategorien = events
    .filter((e) => Number(datumBerlin(e.beginn).slice(5, 7)) - 1 === monat)
    .map((e) => e.kategorie);
  const { antippen, uebersicht, klickbar } = useTagesKlick(alle, darfAnlegen, nachTag);
  return (
    <Stack gap="md">
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
              onClick={klickbar(t) ? () => antippen(t) : undefined}
              style={{
                opacity: imMonat ? 1 : 0.5,
                minWidth: 0,
                cursor: klickbar(t) ? 'pointer' : undefined,
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
                      onClick={(ev) => ev.stopPropagation()}
                      title={`${e.anzeigeTitel} (${zeitBerlin(e.beginn)})`}
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
                        borderLeft: `4px solid ${balkenFarbe(e)}`,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {zeitBerlin(e.beginn)} {e.anzeigeTitel}
                    </Anchor>
                  );
                })}
              </Stack>
            </Paper>
          );
        })}
      </SimpleGrid>
      <Legende kategorien={kategorien} />
      {uebersicht}
    </Stack>
  );
}

/** Calendar: events of a month as card list or month grid (compact on phones, chips from `sm`). */
export function KalenderPage() {
  const { can } = useAuth();
  const eigeneSub = useEigeneSub();
  const heute = heuteBerlin();
  // The month lives in the URL (`?monat=YYYY-MM`, absent = current month), so Back from an event returns to it.
  const [suche, setSuche] = useSearchParams();
  const aktuell = { jahr: Number(heute.slice(0, 4)), monat: Number(heute.slice(5, 7)) - 1 };
  const monatState = monatAusSuche(suche.get('monat')) ?? aktuell;
  const setMonat = (ziel: { jahr: number; monat: number }) => {
    const next = new URLSearchParams(suche);
    if (ziel.jahr === aktuell.jahr && ziel.monat === aktuell.monat) next.delete('monat');
    else next.set('monat', monatSuche(ziel.jahr, ziel.monat));
    setSuche(next, { replace: true });
  };
  const [ansicht, setAnsicht] = useState<Ansicht>(ansichtLesen);
  const [nurFehlend, setNurFehlend] = useState(false);
  const [nurMeine, setNurMeine] = useState(false);
  const breit = useMediaQuery('(min-width: 48em)') ?? false;
  const { jahr, monat } = monatState;
  const raster = ansicht === 'monat';

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
          !e.ichNehmeTeil &&
          e.verantwortlich?.sub !== eigeneSub &&
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
    <Stack maw={raster && breit ? undefined : 900} gap="md">
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
            Dienstschwein
          </Button>
          <Button
            component={Link}
            to="/kalender/mein-kalender"
            variant="default"
            leftSection={<IconCalendarDown size={18} />}
          >
            Mein Kalender
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
          <Anchor component="button" type="button" size="sm" onClick={() => setMonat(aktuell)}>
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
          value={ansicht}
          onChange={(v) => {
            setAnsicht(v as Ansicht);
            ansichtSpeichern(v as Ansicht);
          }}
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
      ) : raster && breit ? (
        <MonatsRaster
          jahr={jahr}
          monat={monat}
          events={sichtbar}
          alle={events.data ?? []}
          darfAnlegen={can('events:verwalten')}
        />
      ) : raster ? (
        <MonatsRasterKompakt
          jahr={jahr}
          monat={monat}
          events={sichtbar}
          alle={events.data ?? []}
          darfAnlegen={can('events:verwalten')}
        />
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
