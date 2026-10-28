import { Alert, Anchor, Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCalendarMinus,
  IconCalendarPlus,
  IconUserCheck,
  IconUserMinus,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MITGLIED_STATI, type EventDto, type TeilnahmeDto } from '@c4/shared';
import { useApi } from './api';
import { labelFuer, MITGLIED_STATUS_LABELS } from './i18n';
import { PersonName, personAnzeigename } from './KalenderAnzeige';
import { kalenderInvalidieren, useKalenderToken } from './kalenderDaten';
import { fehlerAnzeigen, pruefen } from './warenApi';

const nachName = (a: TeilnahmeDto, b: TeilnahmeDto) =>
  personAnzeigename(a.person).localeCompare(personAnzeigename(b.person), 'de');

/** "Alle Mitglieder", "Anwärter:in und Mitglied" ... or "nur eingeladene Personen". */
function kreisText(kreis: NonNullable<EventDto['teilnahmeStatus']>): string {
  if (kreis.length === 0) return 'Eingeladen sind einzelne Personen.';
  if (kreis.length === MITGLIED_STATI.length) return 'Eingeladen sind alle Mitglieder.';
  const namen = kreis.map((s) => labelFuer(MITGLIED_STATUS_LABELS, s, 'neutral'));
  return `Eingeladen sind ${namen.join(' und ')}.`;
}

function Liste({ titel, eintraege }: Readonly<{ titel: string; eintraege: TeilnahmeDto[] }>) {
  if (eintraege.length === 0) return null;
  return (
    <Stack gap={4}>
      <Text fw={600}>
        {titel} ({eintraege.length})
      </Text>
      <Group gap="md">
        {[...eintraege].sort(nachName).map((t) => (
          <PersonName key={t.person.sub} person={t.person} />
        ))}
      </Group>
    </Stack>
  );
}

/** Participation of an event: the own state with its button and the list of everybody concerned. */
export function EventTeilnahme({ event: e }: Readonly<{ event: EventDto }>) {
  const api = useApi();
  const qc = useQueryClient();
  const [laeuft, setLaeuft] = useState(false);
  if (e.teilnahmeStatus === null) return null;
  const dabei = e.teilnahmen.filter((t) => t.zustand === 'teilnahme');
  const abgesagt = e.teilnahmen.filter((t) => t.zustand === 'absage');
  const ich = e.ichNehmeTeil === true;

  const setzen = async (teilnahme: boolean) => {
    setLaeuft(true);
    try {
      await pruefen(
        await api.kalender.events[':id'].teilnahme.$put({
          param: { id: e.id },
          json: { teilnahme },
        }),
      );
      await kalenderInvalidieren(qc);
      notifications.show({
        color: 'green',
        message: teilnahme ? 'Du nimmst jetzt teil.' : 'Du nimmst nicht mehr teil.',
      });
    } catch (err) {
      fehlerAnzeigen(err);
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Paper withBorder p="sm" radius="md">
      <Stack gap="sm">
        <Title order={4}>Teilnahme</Title>
        <Text size="sm" c="dimmed">
          {kreisText(e.teilnahmeStatus)} Das ist kein Dienst und zählt nicht im Dienstschwein.
        </Text>
        {!e.abgesagt && (
          <Stack gap="xs">
            <Text fw={700} c={ich ? 'green' : 'dimmed'}>
              {ich ? 'Du nimmst teil' : 'Du nimmst nicht teil'}
            </Text>
            {ich ? (
              <Button
                variant="light"
                color="red"
                leftSection={<IconUserMinus size={18} />}
                loading={laeuft}
                fullWidth
                onClick={() => void setzen(false)}
              >
                Ich nehme nicht teil
              </Button>
            ) : (
              <Button
                leftSection={<IconUserCheck size={18} />}
                loading={laeuft}
                fullWidth
                onClick={() => void setzen(true)}
              >
                Ich nehme teil
              </Button>
            )}
          </Stack>
        )}
        {dabei.length === 0 && abgesagt.length === 0 && (
          <Text size="sm" c="dimmed">
            Noch niemand nimmt teil.
          </Text>
        )}
        <Liste titel="Nehmen teil" eintraege={dabei} />
        <Liste titel="Abgesagt" eintraege={abgesagt} />
      </Stack>
    </Paper>
  );
}

/** Adds the event to / removes it from the own calendar feed, with a hint when no feed exists yet. */
export function EventAboButton({ event: e }: Readonly<{ event: EventDto }>) {
  const api = useApi();
  const qc = useQueryClient();
  const token = useKalenderToken();
  const [laeuft, setLaeuft] = useState(false);

  const wechseln = async () => {
    setLaeuft(true);
    try {
      const param = { param: { id: e.id } };
      await pruefen(
        e.imAbo
          ? await api.kalender.events[':id'].abo.$delete(param)
          : await api.kalender.events[':id'].abo.$put(param),
      );
      await kalenderInvalidieren(qc);
      notifications.show({
        color: 'green',
        message: e.imAbo
          ? 'Das Event ist nicht mehr in deinem Kalender-Abo.'
          : 'Das Event ist jetzt in deinem Kalender-Abo.',
      });
    } catch (err) {
      fehlerAnzeigen(err);
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Stack gap="xs" align="flex-start">
      <Button
        variant="default"
        leftSection={e.imAbo ? <IconCalendarMinus size={18} /> : <IconCalendarPlus size={18} />}
        loading={laeuft}
        onClick={() => void wechseln()}
      >
        {e.imAbo ? 'Aus Kalender-Abo entfernen' : 'In mein Kalender-Abo'}
      </Button>
      {token.data === false && (
        <Alert color="blue" p="xs">
          <Text size="sm">
            Du hast noch kein Kalender-Abo.{' '}
            <Anchor component={Link} to="/kalender/mein-kalender" size="sm">
              Richte es unter „Mein Kalender“ ein.
            </Anchor>
          </Text>
        </Alert>
      )}
    </Stack>
  );
}
