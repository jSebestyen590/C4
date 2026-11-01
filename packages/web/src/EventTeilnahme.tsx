import { Alert, Anchor, Button, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
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
import { BestaetigenDialog } from './BestaetigenDialog';
import { useApi } from './api';
import { labelFuer, MITGLIED_STATUS_LABELS } from './i18n';
import { PersonName, personAnzeigename } from './KalenderAnzeige';
import { kalenderInvalidieren, useKalenderToken } from './kalenderDaten';
import { ApiFehler, fehlerAnzeigen, pruefen } from './warenApi';

/** "Alle Mitglieder", "Anwärter:in und Mitglied" ... or "nur eingeladene Personen". */
function kreisText(kreis: NonNullable<EventDto['teilnahmeStatus']>): string {
  if (kreis.length === 0) return 'Eingeladen sind einzelne Personen.';
  if (kreis.length === MITGLIED_STATI.length) return 'Eingeladen sind alle Mitglieder.';
  const namen = kreis.map((s) => labelFuer(MITGLIED_STATUS_LABELS, s, 'neutral'));
  return `Eingeladen sind ${namen.join(' und ')}.`;
}

function Liste({ titel, eintraege }: Readonly<{ titel: string; eintraege: TeilnahmeDto[] }>) {
  return <PersonenListe titel={titel} personen={eintraege.map((t) => t.person)} />;
}

function PersonenListe({
  titel,
  personen,
}: Readonly<{ titel: string; personen: TeilnahmeDto['person'][] }>) {
  if (personen.length === 0) return null;
  return (
    <Stack gap={4}>
      <Text fw={600}>
        {titel} ({personen.length})
      </Text>
      <Group gap="md">
        {[...personen]
          .sort((a, b) => personAnzeigename(a).localeCompare(personAnzeigename(b), 'de'))
          .map((p) => (
            <PersonName key={p.sub} person={p} />
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
  if (e.art !== 'teilnahme' || e.teilnahmeStatus === null) return null;
  const dabei = e.teilnahmen.filter((t) => t.zustand === 'teilnahme');
  const abgesagt = e.teilnahmen.filter((t) => t.zustand === 'absage');
  const meine = e.meineTeilnahme;

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
        message: teilnahme ? 'Du nimmst jetzt teil.' : 'Du hast abgesagt.',
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
            <Text
              fw={700}
              c={meine === 'teilnahme' ? 'green' : meine === 'absage' ? 'red' : 'dimmed'}
            >
              {meine === 'teilnahme'
                ? 'Du nimmst teil'
                : meine === 'absage'
                  ? 'Du hast abgesagt'
                  : 'Du hast noch nicht geantwortet'}
            </Text>
            <SimpleGrid cols={{ base: 1, sm: meine === null ? 2 : 1 }} spacing="xs">
              {meine !== 'teilnahme' && (
                <Button
                  leftSection={<IconUserCheck size={18} />}
                  loading={laeuft}
                  fullWidth
                  onClick={() => void setzen(true)}
                >
                  {meine === 'absage' ? 'Ich nehme doch teil' : 'Ich nehme teil'}
                </Button>
              )}
              {meine !== 'absage' && (
                <Button
                  variant="light"
                  color="red"
                  leftSection={<IconUserMinus size={18} />}
                  loading={laeuft}
                  fullWidth
                  onClick={() => void setzen(false)}
                >
                  Ich kann nicht
                </Button>
              )}
            </SimpleGrid>
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

/**
 * Dienste events: "Ich bin nicht verfügbar" for the whole event (cancels the own Dienste after a
 * confirmation) and the list of everybody who is unavailable.
 */
export function EventVerfuegbarkeit({ event: e }: Readonly<{ event: EventDto }>) {
  const api = useApi();
  const qc = useQueryClient();
  const [laeuft, setLaeuft] = useState(false);
  const [dienste, setDienste] = useState<{ anzahl: number; text: string } | null>(null);
  if (e.art !== 'dienste') return null;
  const nicht = e.ichBinNichtVerfuegbar;

  const senden = async (verfuegbar: boolean, bestaetigt: boolean) => {
    const res = await api.kalender.events[':id'].verfuegbarkeit.$put({
      param: { id: e.id },
      json: { verfuegbar, ...(bestaetigt && { bestaetigt: true }) },
    });
    if (res.status === 409) {
      const body = (await res.json()) as { error: string; dienste?: number };
      if (typeof body.dienste === 'number') {
        setDienste({ anzahl: body.dienste, text: body.error });
        return;
      }
      throw new ApiFehler(409, body.error);
    }
    await pruefen(res);
    setDienste(null);
    await kalenderInvalidieren(qc);
    notifications.show({
      color: 'green',
      message: verfuegbar
        ? 'Du bist wieder verfügbar.'
        : 'Du bist als nicht verfügbar eingetragen.',
    });
  };

  const wechseln = async (verfuegbar: boolean) => {
    setLaeuft(true);
    try {
      await senden(verfuegbar, false);
    } catch (err) {
      fehlerAnzeigen(err);
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Stack gap="xs">
      {!e.abgesagt && (
        <Stack gap="xs">
          {nicht && <Text fw={700}>Du bist nicht verfügbar</Text>}
          <Button
            variant="light"
            color={nicht ? 'green' : 'red'}
            leftSection={nicht ? <IconUserCheck size={18} /> : <IconUserMinus size={18} />}
            loading={laeuft}
            fullWidth
            maw={{ sm: 320 }}
            onClick={() => void wechseln(nicht)}
          >
            {nicht ? 'Ich bin doch verfügbar' : 'Ich bin nicht verfügbar'}
          </Button>
        </Stack>
      )}
      <PersonenListe titel="Nicht verfügbar" personen={e.nichtVerfuegbar} />
      {dienste && (
        <BestaetigenDialog
          titel="Nicht verfügbar"
          bestaetigenText="Austragen und absagen"
          onClose={() => setDienste(null)}
          onBestaetigt={() => senden(false, true)}
        >
          <Text>{dienste.text}</Text>
        </BestaetigenDialog>
      )}
    </Stack>
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
