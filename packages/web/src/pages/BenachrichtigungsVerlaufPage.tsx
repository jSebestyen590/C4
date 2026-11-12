import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Collapse,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BENACHRICHTIGUNGS_ARTEN,
  BENACHRICHTIGUNGS_BEREICHE,
  datumAnzeigen,
  datumBerlin,
  zeitBerlin,
  type VerlaufEintragDto,
} from '@c4/shared';
import {
  useAlleGelesen,
  useGelesenMarkieren,
  useUngelesen,
  useVerlauf,
} from '../benachrichtigungVerlauf';
import { BENACHRICHTIGUNG_ART_LABELS, BENACHRICHTIGUNG_BEREICH_LABELS, label } from '../i18n';
import {
  ALLE_ARTEN,
  ART_PRAEFIX,
  auswahlWert,
  BEREICH_PRAEFIX,
  filterAusAuswahl,
} from '../verlaufFilter';
import { WischZumGelesen } from '../WischZumGelesen';
import { fehlerAnzeigen } from '../warenApi';

/** Select options grouped by area: "Alle aus <Bereich>" plus the single types. */
const FILTER_OPTIONEN = [
  { value: ALLE_ARTEN, label: 'Alle Arten' },
  ...BENACHRICHTIGUNGS_BEREICHE.map((bereich) => ({
    group: label(BENACHRICHTIGUNG_BEREICH_LABELS, bereich),
    items: [
      {
        value: `${BEREICH_PRAEFIX}${bereich}`,
        label: `Alle aus ${label(BENACHRICHTIGUNG_BEREICH_LABELS, bereich)}`,
      },
      ...BENACHRICHTIGUNGS_ARTEN.filter((a) => a.bereich === bereich).map((a) => ({
        value: `${ART_PRAEFIX}${a.key}`,
        label: BENACHRICHTIGUNG_ART_LABELS[a.key]?.titel ?? a.key,
      })),
    ],
  })),
];

/** "/app/kalender/events/1" -> "/kalender/events/1" (the router has the `/app` basename). */
const routerPfad = (url: string) => (url.startsWith('/app/') ? url.slice(4) : url);

function Eintrag({
  eintrag,
  onKlick,
  onGelesen,
}: Readonly<{ eintrag: VerlaufEintragDto; onKlick: () => void; onGelesen: () => void }>) {
  const ungelesen = !eintrag.gelesen;
  const art = BENACHRICHTIGUNG_ART_LABELS[eintrag.art]?.titel ?? eintrag.art;
  return (
    <WischZumGelesen aktiv={ungelesen} onGelesen={onGelesen} onKlick={onKlick}>
      <Paper
        withBorder
        p="md"
        radius="md"
        style={{
          borderLeft: ungelesen
            ? '4px solid var(--mantine-primary-color-filled)'
            : '4px solid transparent',
        }}
      >
        <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
          <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
            <Text fw={ungelesen ? 700 : 400} style={{ overflowWrap: 'anywhere' }}>
              {eintrag.titel}
            </Text>
            <Text size="sm" fw={ungelesen ? 600 : 400} style={{ overflowWrap: 'anywhere' }}>
              {eintrag.text}
            </Text>
            <Group gap="xs">
              <Badge variant="light" color="gray" size="sm" style={{ maxWidth: '100%' }}>
                {art}
              </Badge>
              <Text size="xs" c="dimmed">
                {datumAnzeigen(datumBerlin(eintrag.erstellt))}, {zeitBerlin(eintrag.erstellt)} Uhr
              </Text>
            </Group>
          </Stack>
          {ungelesen && (
            <ActionIcon
              visibleFrom="sm"
              variant="light"
              size={42}
              aria-label="Als gelesen markieren"
              title="Als gelesen markieren"
              onClick={(e) => {
                e.stopPropagation();
                onGelesen();
              }}
            >
              <IconCheck size={22} />
            </ActionIcon>
          )}
        </Group>
      </Paper>
    </WischZumGelesen>
  );
}

export function BenachrichtigungsVerlaufPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const art = params.get('art') ?? undefined;
  const bereich = params.get('bereich') ?? undefined;
  const nurUngelesen = params.get('alle') !== '1';
  const auswahl = auswahlWert(art, bereich);
  const filter = { art: art as never, bereich };

  const liste = useVerlauf({ ...filter, nurUngelesen });
  const ungelesen = useUngelesen();
  const markieren = useGelesenMarkieren();
  const alleGelesen = useAlleGelesen();

  const aendern = (aenderung: Record<string, string | null>) =>
    setParams(
      (alt) => {
        const neu = new URLSearchParams(alt);
        for (const [k, v] of Object.entries(aenderung)) {
          if (v === null) neu.delete(k);
          else neu.set(k, v);
        }
        return neu;
      },
      { replace: true },
    );

  const eintraege = liste.data?.pages.flatMap((s) => s.eintraege) ?? [];
  // Entries just marked as read stay in the cache (and collapse) until the next fetch.
  const sichtbar = nurUngelesen ? eintraege.filter((e) => !e.gelesen) : eintraege;
  // Ids read in the "Ungelesen" view are dropped after the collapse animation, so removal does
  // not depend on the transition finishing.
  const ansichtKey = `${nurUngelesen}|${auswahl}`;
  // Tied to the view, so it starts empty again when the filter or view changes.
  const [entfernung, setEntfernung] = useState<{ key: string; ids: ReadonlySet<string> }>({
    key: ansichtKey,
    ids: new Set(),
  });
  const entfernt: ReadonlySet<string> = entfernung.key === ansichtKey ? entfernung.ids : new Set();
  const gelesenIds = nurUngelesen
    ? eintraege.filter((e) => e.gelesen && !entfernt.has(e.id)).map((e) => e.id)
    : [];
  const gelesenKey = gelesenIds.join(',');
  useEffect(() => {
    if (!gelesenKey) return;
    const ids = gelesenKey.split(',');
    const timer = setTimeout(
      () =>
        setEntfernung((alt) => ({
          key: ansichtKey,
          ids: new Set([...(alt.key === ansichtKey ? alt.ids : []), ...ids]),
        })),
      300,
    );
    return () => clearTimeout(timer);
  }, [gelesenKey, ansichtKey]);

  const oeffnen = (e: VerlaufEintragDto) => {
    if (!e.gelesen) markieren.mutate(e.id);
    void navigate(routerPfad(e.url));
  };

  return (
    <Stack maw={900} gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>Benachrichtigungsverlauf</Title>
        <Button
          variant="light"
          size="md"
          disabled={!ungelesen.data}
          loading={alleGelesen.isPending}
          onClick={() =>
            alleGelesen.mutate(filter, {
              onError: (e) => fehlerAnzeigen(e, 'Das Markieren hat nicht geklappt.'),
            })
          }
        >
          Alle als gelesen markieren
        </Button>
      </Group>
      <Select
        size="md"
        aria-label="Art der Benachrichtigung"
        allowDeselect={false}
        data={FILTER_OPTIONEN}
        value={auswahl}
        onChange={(v) => {
          aendern(filterAusAuswahl(v));
        }}
      />
      <SegmentedControl
        size="md"
        fullWidth
        value={nurUngelesen ? 'ungelesen' : 'alle'}
        onChange={(v) => aendern({ alle: v === 'alle' ? '1' : null })}
        data={[
          { value: 'ungelesen', label: 'Ungelesen' },
          { value: 'alle', label: 'Alle' },
        ]}
      />

      {liste.isPending && <Loader size="sm" aria-label="Verlauf wird geladen" />}
      {liste.isError && (
        <Alert color="red">
          Der Verlauf konnte nicht geladen werden. Versuch es gleich noch einmal.
        </Alert>
      )}
      {liste.isSuccess && sichtbar.length === 0 && !liste.hasNextPage && (
        <Stack gap={4}>
          <Text c="dimmed">
            {nurUngelesen ? 'Keine ungelesenen Benachrichtigungen.' : 'Keine Benachrichtigungen.'}
          </Text>
          {nurUngelesen && (
            <Anchor
              component="button"
              type="button"
              ta="left"
              onClick={() => aendern({ alle: '1' })}
            >
              Alle anzeigen
            </Anchor>
          )}
        </Stack>
      )}
      {liste.isSuccess && (
        <Stack gap={0}>
          {eintraege
            .filter((e) => !entfernt.has(e.id))
            .map((e) => (
              // Collapses (instead of vanishing) once read in the "Ungelesen" view.
              <Collapse key={e.id} expanded={!nurUngelesen || !e.gelesen} transitionDuration={250}>
                <Box pb="sm">
                  <Eintrag
                    eintrag={e}
                    onKlick={() => oeffnen(e)}
                    onGelesen={() => markieren.mutate(e.id)}
                  />
                </Box>
              </Collapse>
            ))}
        </Stack>
      )}
      {liste.hasNextPage && (
        <Button
          variant="default"
          size="md"
          loading={liste.isFetchingNextPage}
          onClick={() => void liste.fetchNextPage()}
        >
          Mehr laden
        </Button>
      )}
      <Text size="xs" c="dimmed">
        Einträge werden nach 90 Tagen gelöscht.
      </Text>
    </Stack>
  );
}
