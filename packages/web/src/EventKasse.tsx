import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Modal,
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
import { centAnzeigen, type EventDto, type KassenzaehlungEingabeInput } from '@c4/shared';
import { unwrap, useApi } from './api';
import { mengenStueckelung, mengenSumme, type Mengen } from './bargeldFormular';
import { schluesselFuer } from './buchungFormular';
import { formatDatumZeit } from './datum';
import { finanzenKeys, jsonOderFehler, kassenKurzKey, kassenzaehlungenKey } from './finanzenDaten';
import { HILFE } from './finanzenHilfe';
import { InfoHinweis } from './InfoHinweis';
import { mitgliedLink, mitgliedName } from './mitglied';
import { StatusName } from './StatusAnzeige';
import { StueckelungFeld } from './StueckelungFeld';
import { fehlerText } from './warenApi';

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

/**
 * Section „Kasse“ of the event page for everyone who may count: the hint when nobody counted yet,
 * the button to count and the counts so far (the newest per Kasse counts, older ones are „ersetzt“).
 * Shown only when there are active Kassen.
 */
export function EventKasse({ event }: Readonly<{ event: EventDto }>) {
  const api = useApi();
  const [offen, setOffen] = useState(false);
  const [jetzt] = useState(() => Date.now());
  const kassen = useQuery({
    queryKey: kassenKurzKey,
    queryFn: async () => unwrap(await api.kassen.$get()),
  });
  const zaehlungen = useQuery({
    queryKey: kassenzaehlungenKey(event.id),
    queryFn: async () => unwrap(await api.kassen.zaehlungen.$get({ query: { eventId: event.id } })),
  });
  const liste = zaehlungen.data ?? [];
  if (!kassen.data || kassen.data.length === 0) return null;
  const begonnen = new Date(event.beginn).getTime() <= jetzt;
  const nochNicht =
    zaehlungen.data !== undefined && liste.length === 0 && begonnen && !event.abgesagt;
  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="wrap">
        <Group gap={2}>
          <Title order={3}>Kasse</Title>
          <InfoHinweis feld="Kasse zählen" text={HILFE.kassen.dienstZaehlung} />
        </Group>
        {!event.abgesagt && (
          <Button leftSection={<IconCash size={18} />} onClick={() => setOffen(true)} size="md">
            Kasse zählen
          </Button>
        )}
      </Group>
      {nochNicht && (
        <Alert color="yellow" title="Kasse noch nicht gezählt">
          Zähle die Kasse nach dem Event. Das ist unverbindlich und hilft der Finanzer:in, die
          Einnahmen den Events zuzuordnen.
        </Alert>
      )}
      {zaehlungen.isError && <Alert color="red">Die Zählungen konnten nicht geladen werden.</Alert>}
      {liste.map((z) => (
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
        <ZaehlFormular eventId={event.id} kassen={kassen.data} onClose={() => setOffen(false)} />
      )}
    </Stack>
  );
}
