import {
  Alert,
  Anchor,
  Button,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconPlus, IconUsers } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../api';
import { fehlerAnzeigen, pruefen } from '../warenApi';
import { PRIVATPARTY_STATI } from '@c4/shared';
import { PRIVATPARTY_STATUS_LABELS } from '../i18n';
import { PrivatpartyListe } from '../PrivatpartyAnzeige';
import {
  privatpartysInvalidieren,
  usePrivatpartyMailStatus,
  usePrivatpartys,
  type PrivatpartyFilter,
} from '../privatpartyDaten';

const FILTER = [...PRIVATPARTY_STATI, 'alle'] as const;

const filterLabel = (f: PrivatpartyFilter) =>
  f === 'alle' ? 'Alle' : PRIVATPARTY_STATUS_LABELS[f];

/** Status of the Party-Mail with a button to fetch new mails right now. */
function MailStatus() {
  const api = useApi();
  const qc = useQueryClient();
  const status = usePrivatpartyMailStatus();
  const [laeuft, setLaeuft] = useState(false);
  if (!status.data) return null;
  if (!status.data.eingerichtet) {
    return <Alert color="gray">Party-Mail ist nicht eingerichtet.</Alert>;
  }
  const abrufen = async () => {
    setLaeuft(true);
    try {
      const res = await api.privatpartys.mail.abrufen.$post();
      await pruefen(res);
      const { neu } = (await res.json()) as { neu: number };
      notifications.show({
        color: 'green',
        message: neu === 0 ? 'Keine neuen Mails.' : `${neu} neue Mail${neu === 1 ? '' : 's'}.`,
      });
    } catch (err) {
      fehlerAnzeigen(err);
    } finally {
      setLaeuft(false);
      await privatpartysInvalidieren(qc);
    }
  };
  return (
    <Group justify="space-between" wrap="nowrap" gap="xs">
      <Text size="sm" c={status.data.fehler ? 'red' : 'dimmed'}>
        {status.data.fehler
          ? `Letzter Abruf fehlgeschlagen: ${status.data.fehler}`
          : status.data.letzterAbruf
            ? `Postfach zuletzt abgerufen: ${new Date(status.data.letzterAbruf).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' })}`
            : 'Postfach noch nicht abgerufen.'}
      </Text>
      <Anchor component="button" type="button" size="sm" onClick={() => void abrufen()}>
        {laeuft ? 'Ruft ab …' : 'Jetzt abrufen'}
      </Anchor>
    </Group>
  );
}

/** The requests for private parties, by default the open ones. */
export function PrivatpartysPage() {
  const [suche, setSuche] = useSearchParams();
  const param = suche.get('status');
  const filter: PrivatpartyFilter = FILTER.find((f) => f === param) ?? 'offen';
  const liste = usePrivatpartys(filter);

  return (
    <Stack maw="60rem">
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Title order={2}>Privatpartys</Title>
        <Group gap="xs" wrap="nowrap">
          <Button
            component={Link}
            to="/privatpartys/personen"
            variant="default"
            leftSection={<IconUsers size={18} />}
          >
            Personen
          </Button>
          <Button component={Link} to="/privatpartys/neu" leftSection={<IconPlus size={18} />}>
            Neu
          </Button>
        </Group>
      </Group>
      <MailStatus />
      <SegmentedControl
        fullWidth
        size="md"
        aria-label="Status"
        value={filter}
        onChange={(wert) => setSuche(wert === 'offen' ? {} : { status: wert }, { replace: true })}
        data={FILTER.map((f) => ({ value: f, label: filterLabel(f) }))}
      />
      {liste.isPending && <Loader m="md" aria-label="Privatpartys werden geladen" />}
      {liste.isError && <Alert color="red">Die Privatpartys konnten nicht geladen werden.</Alert>}
      {liste.data && liste.data.length === 0 && (
        <Text c="dimmed">
          {filter === 'offen'
            ? 'Keine offenen Anfragen.'
            : filter === 'alle'
              ? 'Noch keine Privatpartys. Lege die erste mit „Neu“ an.'
              : `Keine ${filterLabel(filter).toLowerCase()}en Privatpartys.`}
        </Text>
      )}
      {liste.data && liste.data.length > 0 && <PrivatpartyListe liste={liste.data} />}
    </Stack>
  );
}
