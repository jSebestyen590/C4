import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Modal,
  MultiSelect,
  Paper,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconCash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  centAnzeigen,
  type EventDto,
  type EventKasseDto,
  type KassenzaehlungEingabeInput,
} from '@c4/shared';
import { unwrap, useApi } from './api';
import { mengenStueckelung, mengenSumme, type Mengen } from './bargeldFormular';
import { schluesselFuer } from './buchungFormular';
import { formatDatumZeit } from './datum';
import { useAuth } from './auth';
import {
  finanzenKeys,
  jsonOderFehler,
  kassenKurzKey,
  kassenzaehlungenKey,
  useKassen,
} from './finanzenDaten';
import { HILFE } from './finanzenHilfe';
import { InfoHinweis } from './InfoHinweis';
import { mitgliedLink, mitgliedName } from './mitglied';
import { StatusName } from './StatusAnzeige';
import { StueckelungFeld } from './StueckelungFeld';
import { fehlerText, pruefen } from './warenApi';

/** The form of one Dienst-Zählung: choose the Kasse, count, confirm, save. Mount it only while it should be open. */
function ZaehlFormular({
  eventId,
  kassen,
  onClose,
}: Readonly<{
  eventId: string;
  kassen: readonly { kontoId: string; name: string }[];
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const handy = useMediaQuery('(max-width: 48em)');
  const [kasse, setKasse] = useState<string | null>(
    kassen.length === 1 ? kassen[0]!.kontoId : null,
  );
  const [ist, setIst] = useState<Mengen>({});
  const [versucht, setVersucht] = useState(false);
  const [bestaetigen, setBestaetigen] = useState(false);
  const schluessel = useRef<{ schluessel: string; inhalt: string } | null>(null);
  const kassenName = kassen.find((k) => k.kontoId === kasse)?.name ?? '';
  const summe = mengenSumme(ist);

  const speichern = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () => {
      const body = (key: string): KassenzaehlungEingabeInput => ({
        idempotenzSchluessel: key,
        kontoId: kasse ?? '',
        eventId,
        ist: mengenStueckelung(ist),
      });
      schluessel.current = schluesselFuer(schluessel.current, JSON.stringify(body('')), () =>
        crypto.randomUUID(),
      );
      return jsonOderFehler(
        await api.kassen.zaehlungen.$post({ json: body(schluessel.current.schluessel) }),
      );
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: kassenzaehlungenKey(eventId) });
      await qc.invalidateQueries({ queryKey: finanzenKeys.alle });
      onClose();
    },
  });

  return (
    <Modal
      opened
      onClose={speichern.isPending ? () => undefined : onClose}
      title={bestaetigen ? 'Zählung speichern?' : 'Kasse zählen'}
      size="lg"
      fullScreen={handy}
    >
      {bestaetigen ? (
        <Stack>
          <Text>
            Zählung über {centAnzeigen(summe)} für Kasse „{kassenName}“ speichern?
          </Text>
          <Text size="sm" c="dimmed">
            Die Zählung ist unverbindlich und löst keine Buchung aus. Zählst du später noch einmal,
            gilt die neueste Zählung.
          </Text>
          {speichern.isError && (
            <Alert color="red">
              {fehlerText(speichern.error, 'Das Speichern ist fehlgeschlagen.')}
            </Alert>
          )}
          <Group grow preventGrowOverflow={false}>
            <Button
              variant="default"
              size="md"
              onClick={() => {
                speichern.reset();
                setBestaetigen(false);
              }}
              disabled={speichern.isPending}
            >
              Zurück
            </Button>
            <Button size="md" onClick={() => speichern.mutate()} loading={speichern.isPending}>
              Speichern
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack>
          <Select
            label="Kasse"
            placeholder="Kasse wählen"
            data={kassen.map((k) => ({ value: k.kontoId, label: k.name }))}
            value={kasse}
            onChange={setKasse}
            size="md"
            error={versucht && !kasse ? 'Bitte wähle eine Kasse.' : undefined}
          />
          <StueckelungFeld
            label={`Gezählte Münzen und Scheine${kassenName ? ` in ${kassenName}` : ''}`}
            value={ist}
            onChange={setIst}
          />
          <Button
            size="md"
            onClick={() => {
              setVersucht(true);
              if (kasse) setBestaetigen(true);
            }}
          >
            Weiter
          </Button>
        </Stack>
      )}
    </Modal>
  );
}

/** The Kassen of this event: pick the active Kassen, or go back to the default of the Kategorie. */
function KassenFestlegen({
  eventId,
  angepasst,
  aktuell,
  onClose,
}: Readonly<{
  eventId: string;
  angepasst: boolean;
  aktuell: readonly string[];
  onClose: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const kassen = useKassen(false);
  const [auswahl, setAuswahl] = useState<string[]>([...aktuell]);
  const fertig = async () => {
    await qc.invalidateQueries({ queryKey: kassenzaehlungenKey(eventId) });
    onClose();
  };
  const speichern = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () =>
      pruefen(
        await api.finanzen.events[':eventId'].kassen.$put({
          param: { eventId },
          json: { kontoIds: auswahl },
        }),
      ),
    onSuccess: fertig,
  });
  const zuruecksetzen = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () =>
      pruefen(await api.finanzen.events[':eventId'].kassen.$delete({ param: { eventId } })),
    onSuccess: fertig,
  });
  const laeuft = speichern.isPending || zuruecksetzen.isPending;
  const fehler = speichern.error ?? zuruecksetzen.error;
  return (
    <Modal opened onClose={laeuft ? () => undefined : onClose} title="Kassen festlegen" size="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          {angepasst
            ? 'Für dieses Event hast du die Kassen festgelegt. Änderungen am Standard der Kategorie gelten hier nicht mehr.'
            : 'Bisher gelten die Standard-Kassen der Kategorie. Sobald du speicherst, gilt deine Auswahl nur für dieses Event.'}
        </Text>
        <MultiSelect
          label="Kassen dieses Events"
          placeholder="Kassen wählen"
          data={(kassen.data ?? []).map((k) => ({ value: k.kontoId, label: k.name }))}
          value={auswahl}
          onChange={setAuswahl}
          searchable
          nothingFoundMessage="Keine Kasse gefunden"
          comboboxProps={{ withinPortal: true }}
        />
        {fehler && (
          <Alert color="red">{fehlerText(fehler, 'Das Speichern ist fehlgeschlagen.')}</Alert>
        )}
        <Group grow preventGrowOverflow={false}>
          {angepasst && (
            <Button
              variant="default"
              size="md"
              onClick={() => zuruecksetzen.mutate()}
              loading={zuruecksetzen.isPending}
              disabled={laeuft}
            >
              Standard der Kategorie wiederherstellen
            </Button>
          )}
          <Button
            size="md"
            onClick={() => speichern.mutate()}
            loading={speichern.isPending}
            disabled={laeuft}
          >
            Speichern
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function KasseZeile({ k, wartet }: Readonly<{ k: EventKasseDto; wartet: boolean }>) {
  return (
    <Paper withBorder p="sm">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Stack gap={2}>
          <Text fw={600}>{k.name}</Text>
          {!k.zugewiesen && (
            <Text size="xs" c="dimmed">
              zusätzlich gezählt
            </Text>
          )}
        </Stack>
        {k.einnahmeCent !== null ? (
          <Stack gap={2} align="flex-end">
            <Text fw={600} style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {centAnzeigen(k.einnahmeCent)}
            </Text>
            <Badge color={k.status === 'abgerechnet' ? 'green' : 'yellow'} variant="light">
              {k.status === 'abgerechnet' ? 'abgerechnet' : 'vorläufig'}
            </Badge>
          </Stack>
        ) : (
          <Badge color={wartet ? 'yellow' : 'gray'} variant="light">
            {wartet ? 'noch nicht gezählt' : 'wartet auf Zählung'}
          </Badge>
        )}
      </Group>
    </Paper>
  );
}

/**
 * Section „Kasse“ of the event page for everyone who may count: the Kassen of the event (assigned by
 * the Kategorie default or set by the Finanzer:in) with their income (preliminary, or booked once settled),
 * the sum, the counts so far (the newest per Kasse counts, older ones are „ersetzt“) and the buttons to
 * count and, with `finanzen:buchen`, to set the Kassen. Shown only when there are active Kassen.
 */
export function EventKasse({ event }: Readonly<{ event: EventDto }>) {
  const api = useApi();
  const { can } = useAuth();
  const [offen, setOffen] = useState(false);
  const [festlegen, setFestlegen] = useState(false);
  const [jetzt] = useState(() => Date.now());
  const kassen = useQuery({
    queryKey: kassenKurzKey,
    queryFn: async () => unwrap(await api.kassen.$get()),
  });
  const daten = useQuery({
    queryKey: kassenzaehlungenKey(event.id),
    queryFn: async () => unwrap(await api.kassen.zaehlungen.$get({ query: { eventId: event.id } })),
  });
  if (!kassen.data || kassen.data.length === 0) return null;
  const d = daten.data;
  const begonnen = new Date(event.beginn).getTime() <= jetzt;
  const wartet = begonnen && !event.abgesagt;
  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="wrap">
        <Group gap={2}>
          <Title order={3}>Kasse</Title>
          <InfoHinweis feld="Kasse zählen" text={HILFE.kassen.dienstZaehlung} />
        </Group>
        <Group gap="xs" wrap="wrap">
          {can('finanzen:buchen') && (
            <Button variant="default" size="md" onClick={() => setFestlegen(true)} disabled={!d}>
              Kassen festlegen
            </Button>
          )}
          {!event.abgesagt && (
            <Button leftSection={<IconCash size={18} />} onClick={() => setOffen(true)} size="md">
              Kasse zählen
            </Button>
          )}
        </Group>
      </Group>
      {daten.isError && <Alert color="red">Die Kassen konnten nicht geladen werden.</Alert>}
      {d && d.kassen.length === 0 && (
        <Text size="sm" c="dimmed">
          Für dieses Event ist keine Kasse vorgesehen. Du kannst trotzdem eine Kasse zählen.
        </Text>
      )}
      {d?.kassen.map((k) => (
        <KasseZeile key={k.kontoId} k={k} wartet={wartet} />
      ))}
      {d && d.kassen.length > 0 && (
        <Paper p="sm" bg="var(--mantine-color-default-hover)">
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Stack gap={0}>
              <Text fw={700}>Summe aller Einnahmen</Text>
              {d.unvollstaendig && (
                <Text size="xs" c="orange.8">
                  Unvollständig: Mindestens eine Kasse fehlt noch.
                </Text>
              )}
            </Stack>
            <Text fw={700} style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {centAnzeigen(d.summeCent)}
            </Text>
          </Group>
        </Paper>
      )}
      {d && (
        <Text size="xs" c="dimmed">
          {d.angepasst
            ? 'Die Kassen dieses Events wurden festgelegt.'
            : 'Es gelten die Standard-Kassen der Kategorie.'}{' '}
          Einnahmen „vorläufig“ sind ein Vorschlag aus den Zählungen, „abgerechnet“ sind gebucht.
        </Text>
      )}
      {d?.zaehlungen.map((z) => (
        <Paper key={z.id} withBorder p="sm" opacity={z.ersetzt ? 0.55 : 1}>
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Stack gap={0}>
              <Group gap="xs">
                <Text fw={600}>{z.kontoName}</Text>
                {z.ersetzt && (
                  <Badge color="gray" variant="light">
                    ersetzt
                  </Badge>
                )}
              </Group>
              <Text size="sm" c="dimmed">
                {z.gezaehltVon ? (
                  <Anchor component={Link} to={mitgliedLink(z.gezaehltVon)} underline="never">
                    <StatusName status={z.gezaehltVon.status}>
                      {mitgliedName(z.gezaehltVon)}
                    </StatusName>
                  </Anchor>
                ) : (
                  '–'
                )}{' '}
                · {formatDatumZeit(z.gezaehltAm, 'mittel')}
              </Text>
            </Stack>
            <Text fw={600} style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {centAnzeigen(z.summeCent)}
            </Text>
          </Group>
        </Paper>
      ))}
      {offen && (
        <ZaehlFormular
          eventId={event.id}
          kassen={[...kassen.data].sort(
            (a, b) =>
              Number(!!d?.kassen.find((k) => k.kontoId === b.kontoId)?.zugewiesen) -
                Number(!!d?.kassen.find((k) => k.kontoId === a.kontoId)?.zugewiesen) ||
              a.name.localeCompare(b.name),
          )}
          onClose={() => setOffen(false)}
        />
      )}
      {festlegen && d && (
        <KassenFestlegen
          eventId={event.id}
          angepasst={d.angepasst}
          aktuell={d.kassen.filter((k) => k.zugewiesen).map((k) => k.kontoId)}
          onClose={() => setFestlegen(false)}
        />
      )}
    </Stack>
  );
}
