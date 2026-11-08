import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../api';
import { AktionsMenue } from '../AktionsMenue';
import { BestaetigenDialog } from '../BestaetigenDialog';
import { privatpartyName, PrivatpartyStatusBadge, StufeBadge } from '../PrivatpartyAnzeige';
import { UmfrageDialog, ZusageDialog } from '../PrivatpartyDialoge';
import { PrivatpartyKorrespondenz } from '../PrivatpartyKorrespondenz';
import { PrivatpartyPersonZuordnen } from '../PrivatpartyPersonZuordnen';
import {
  privatpartyPersonLink,
  privatpartysInvalidieren,
  usePrivatparty,
  usePrivatpartyPerson,
  wunschTerminText,
} from '../privatpartyDaten';
import { umfrageLink } from '../umfrageDaten';
import { pruefen } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

type Dialog = 'zusagen' | 'umfrage' | 'absagen' | 'oeffnen' | 'loeschen' | null;

/** One request: person, wish dates, notes, the poll and the event, and the actions. */
export function PrivatpartyPage() {
  const { id } = useParams();
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const privatparty = usePrivatparty(id);
  const person = usePrivatpartyPerson(privatparty.data?.person?.id);
  const [dialog, setDialog] = useState<Dialog>(null);

  if (privatparty.isPending) return <Loader m="md" aria-label="Privatparty wird geladen" />;
  if (privatparty.isError) {
    return (
      <Stack>
        <ZurueckLink to="/privatpartys">Privatpartys</ZurueckLink>
        <Alert color="red">Die Privatparty konnte nicht geladen werden.</Alert>
      </Stack>
    );
  }
  const p = privatparty.data;
  const mitEvent = p.status === 'zugesagt' && p.event !== null;
  const umfrageLaeuft = p.umfrage?.laeuft === true;

  const statusSetzen = async (status: 'offen' | 'abgesagt') => {
    await pruefen(
      await api.privatpartys[':id'].status.$put({ param: { id: p.id }, json: { status } }),
    );
    await privatpartysInvalidieren(qc);
    notifications.show({
      color: 'green',
      message: status === 'abgesagt' ? 'Die Privatparty wurde abgesagt.' : 'Wieder offen.',
    });
  };

  return (
    <Stack maw="50rem">
      <ZurueckLink to="/privatpartys">Privatpartys</ZurueckLink>
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Title order={2} style={{ overflowWrap: 'anywhere' }}>
            {privatpartyName(p)}
          </Title>
          {p.anlass && <Text c="dimmed">{p.anlass}</Text>}
          <Group gap="xs">
            <PrivatpartyStatusBadge status={p.status} />
            {p.unbeantwortet && (
              <Badge color="red" variant="dot">
                Unbeantwortet
              </Badge>
            )}
          </Group>
        </Stack>
        <AktionsMenue
          label="Privatparty-Aktionen"
          aktionen={[
            {
              text: 'Bearbeiten',
              icon: <IconPencil size={18} />,
              onClick: () => void navigate(`/privatpartys/${p.id}/bearbeiten`),
            },
            {
              text: 'Löschen',
              icon: <IconTrash size={18} />,
              color: 'red',
              trenner: true,
              onClick: () => setDialog('loeschen'),
            },
          ]}
        />
      </Group>

      <Group gap="xs">
        {p.status !== 'zugesagt' && (
          <Button
            size="md"
            mih={44}
            onClick={() => setDialog('zusagen')}
            disabled={p.termine.length === 0}
          >
            Zusagen
          </Button>
        )}
        {p.status !== 'zugesagt' && !umfrageLaeuft && (
          <Button
            size="md"
            mih={44}
            variant="default"
            onClick={() => setDialog('umfrage')}
            disabled={p.termine.length === 0}
          >
            Umfrage erstellen
          </Button>
        )}
        {p.status !== 'abgesagt' && (
          <Button
            size="md"
            mih={44}
            variant="default"
            color="red"
            onClick={() => setDialog('absagen')}
          >
            Absagen
          </Button>
        )}
        {p.status !== 'offen' && (
          <Button size="md" mih={44} variant="default" onClick={() => setDialog('oeffnen')}>
            Wieder öffnen
          </Button>
        )}
      </Group>

      {(p.umfrage || p.event || (p.status === 'zugesagt' && !p.event)) && (
        <Stack gap={4}>
          {p.umfrage && (
            <Text>
              Umfrage:{' '}
              <Anchor component={Link} to={umfrageLink(p.umfrage.id)}>
                {p.umfrage.titel}
              </Anchor>
              {p.umfrage.laeuft ? ' (läuft)' : ' (beendet)'}
            </Text>
          )}
          {p.event && (
            <Text>
              Event:{' '}
              <Anchor component={Link} to={`/kalender/events/${p.event.id}`}>
                {p.event.titel}
              </Anchor>
            </Text>
          )}
          {p.status === 'zugesagt' && !p.event && (
            <Alert color="yellow">Das Event wurde im Kalender gelöscht.</Alert>
          )}
        </Stack>
      )}

      {!p.person && <PrivatpartyPersonZuordnen p={p} />}
      <Stack gap="xs">
        {p.person && <Title order={3}>Person</Title>}
        {p.person && (
          <Paper withBorder p="md">
            <Stack gap={2}>
              <Anchor component={Link} to={privatpartyPersonLink(p.person.id)} fw={700}>
                {p.person.name}
              </Anchor>
              {person.data?.email && (
                <Anchor href={`mailto:${person.data.email}`} style={{ overflowWrap: 'anywhere' }}>
                  {person.data.email}
                </Anchor>
              )}
              {person.data?.kontakt && (
                <Text style={{ overflowWrap: 'anywhere' }}>{person.data.kontakt}</Text>
              )}
              {p.mailAdresse && p.mailAdresse !== person.data?.email && (
                <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                  Antwortadresse: {p.mailAdresse}
                </Text>
              )}
            </Stack>
          </Paper>
        )}
      </Stack>

      <Stack gap="xs">
        <Title order={3}>Wunschtermine</Title>
        {p.termine.length === 0 && <Text c="dimmed">Noch keine Wunschtermine.</Text>}
        {p.termine.map((t) => (
          <Paper key={t.id} withBorder p="sm">
            <Group justify="space-between" wrap="nowrap" gap="xs">
              <Text fw={t.id === p.terminId ? 700 : undefined}>{wunschTerminText(t)}</Text>
              <Group gap="xs" wrap="nowrap">
                {t.id === p.terminId && <Badge color="green">Zugesagt</Badge>}
                <StufeBadge stufe={t.stufe} />
              </Group>
            </Group>
          </Paper>
        ))}
      </Stack>

      {p.notizen && (
        <Stack gap="xs">
          <Title order={3}>Notizen</Title>
          <Text style={{ whiteSpace: 'pre-wrap' }}>{p.notizen}</Text>
        </Stack>
      )}

      <PrivatpartyKorrespondenz p={p} />

      {dialog === 'zusagen' && <ZusageDialog privatparty={p} onClose={() => setDialog(null)} />}
      {dialog === 'umfrage' && <UmfrageDialog privatparty={p} onClose={() => setDialog(null)} />}
      {dialog === 'absagen' && (
        <BestaetigenDialog
          titel="Privatparty absagen?"
          bestaetigenText="Absagen"
          onClose={() => setDialog(null)}
          onBestaetigt={() => statusSetzen('abgesagt')}
        >
          <Text>
            Die Privatparty wird auf „Abgesagt“ gesetzt.
            {mitEvent && ' Das Event samt Diensten wird gelöscht.'}
          </Text>
        </BestaetigenDialog>
      )}
      {dialog === 'oeffnen' && (
        <BestaetigenDialog
          titel="Privatparty wieder öffnen?"
          bestaetigenText="Wieder öffnen"
          color="blue"
          onClose={() => setDialog(null)}
          onBestaetigt={() => statusSetzen('offen')}
        >
          <Text>
            Die Privatparty wird wieder „Offen“.
            {mitEvent && ' Das Event samt Diensten wird gelöscht.'}
          </Text>
        </BestaetigenDialog>
      )}
      {dialog === 'loeschen' && (
        <BestaetigenDialog
          titel="Privatparty löschen?"
          bestaetigenText="Löschen"
          onClose={() => setDialog(null)}
          onBestaetigt={async () => {
            await pruefen(await api.privatpartys[':id'].$delete({ param: { id: p.id } }));
            await privatpartysInvalidieren(qc);
            void navigate('/privatpartys', { replace: true });
          }}
        >
          <Text>
            Die Privatparty wird endgültig gelöscht. Das geht nur ohne Event und ohne Nachrichten.
          </Text>
        </BestaetigenDialog>
      )}
    </Stack>
  );
}
