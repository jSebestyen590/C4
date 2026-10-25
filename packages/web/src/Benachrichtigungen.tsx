import { Alert, Button, Loader, Select, Stack, Switch, Text, Title } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EinstellungDto } from '@c4/shared';
import { unwrap, useApi } from './api';
import {
  BENACHRICHTIGUNG_ART_LABELS,
  BENACHRICHTIGUNG_BEREICH_LABELS,
  label,
  minutenVorherLabel,
} from './i18n';
import { geraetAktivieren, geraetDeaktivieren, pushStatus, type PushStatus } from './pushGeraet';
import { fehlerAnzeigen } from './warenApi';

const STATUS_KEY = ['push-status'];
const EINSTELLUNGEN_KEY = ['benachrichtigungen'];

/** Push on this device: status and the button to switch it on or off. */
function GeraetPush() {
  const api = useApi();
  const qc = useQueryClient();
  const status = useQuery({ queryKey: STATUS_KEY, queryFn: pushStatus });

  const aktivieren = useMutation({
    mutationFn: async () => {
      const { publicKey } = await unwrap(await api.push.schluessel.$get());
      const abo = await geraetAktivieren(publicKey);
      if (abo) await unwrap(await api.push.abos.$post({ json: abo }));
    },
    onError: (e) => fehlerAnzeigen(e, 'Push konnte nicht aktiviert werden.'),
    onSettled: () => qc.invalidateQueries({ queryKey: STATUS_KEY }),
  });
  const deaktivieren = useMutation({
    mutationFn: async () => {
      const endpoint = await geraetDeaktivieren();
      if (endpoint) await unwrap(await api.push.abos.$delete({ json: { endpoint } }));
    },
    onError: (e) => fehlerAnzeigen(e, 'Push konnte nicht deaktiviert werden.'),
    onSettled: () => qc.invalidateQueries({ queryKey: STATUS_KEY }),
  });

  const wert: PushStatus = status.data ?? 'laedt';
  return (
    <Stack gap="sm">
      {wert === 'ios-installieren' && (
        <Alert color="yellow" title="Push auf iPhone und iPad">
          Hier funktioniert Push erst, wenn du C4 zum Home-Bildschirm hinzufügst (Teilen-Symbol,
          dann „Zum Home-Bildschirm“) und die App von dort öffnest. Du brauchst dafür iOS 16.4 oder
          neuer.
        </Alert>
      )}
      {wert === 'nicht-unterstuetzt' && (
        <Alert color="gray" title="Push nicht verfügbar">
          Dieser Browser unterstützt keine Push-Benachrichtigungen. Probiere einen aktuellen Browser
          oder die installierte App.
        </Alert>
      )}
      {wert === 'verweigert' && (
        <Alert color="red" title="Benachrichtigungen blockiert">
          Du hast Benachrichtigungen für C4 blockiert. Erlaube sie in den Einstellungen deines
          Browsers (beim Schloss-Symbol neben der Adresse) oder des Geräts und lade die Seite neu.
        </Alert>
      )}
      {wert === 'an' && (
        <Text>
          Push ist auf diesem Gerät <b>aktiv</b>.
        </Text>
      )}
      {wert === 'aus' && <Text>Push ist auf diesem Gerät nicht aktiv.</Text>}
      {wert === 'laedt' && <Loader size="sm" aria-label="Status wird geladen" />}
      {wert === 'aus' && (
        <Button fullWidth loading={aktivieren.isPending} onClick={() => aktivieren.mutate()}>
          Push auf diesem Gerät aktivieren
        </Button>
      )}
      {wert === 'an' && (
        <Button
          fullWidth
          variant="default"
          loading={deaktivieren.isPending}
          onClick={() => deaktivieren.mutate()}
        >
          Push auf diesem Gerät deaktivieren
        </Button>
      )}
    </Stack>
  );
}

/** One switch (and minutes) per notification type, grouped by area. */
function Einstellungen() {
  const api = useApi();
  const qc = useQueryClient();
  const liste = useQuery({
    queryKey: EINSTELLUNGEN_KEY,
    queryFn: async () => (await unwrap(await api.me.benachrichtigungen.$get())) as EinstellungDto[],
  });
  const speichern = useMutation({
    mutationFn: async (e: { art: string; aktiv: boolean; minuten?: number }) =>
      unwrap(
        await api.me.benachrichtigungen.$put({
          json: { ...e, art: e.art as never },
        }),
      ),
    onError: (e) => fehlerAnzeigen(e, 'Die Einstellung konnte nicht gespeichert werden.'),
    onSettled: () => qc.invalidateQueries({ queryKey: EINSTELLUNGEN_KEY }),
  });

  if (liste.isPending) return <Loader size="sm" aria-label="Einstellungen werden geladen" />;
  if (liste.isError)
    return <Alert color="red">Die Einstellungen konnten nicht geladen werden.</Alert>;

  const bereiche = [...new Set(liste.data.map((e) => e.bereich))];
  return (
    <Stack gap="lg">
      {bereiche.map((bereich) => (
        <Stack key={bereich} gap="md">
          <Title order={4}>{label(BENACHRICHTIGUNG_BEREICH_LABELS, bereich)}</Title>
          {liste.data
            .filter((e) => e.bereich === bereich)
            .map((e) => {
              const texte = BENACHRICHTIGUNG_ART_LABELS[e.art];
              return (
                <Stack key={e.art} gap="xs">
                  <Switch
                    size="md"
                    label={texte?.titel ?? e.art}
                    description={texte?.beschreibung}
                    checked={e.aktiv}
                    onChange={(ev) =>
                      speichern.mutate({
                        art: e.art,
                        aktiv: ev.currentTarget.checked,
                        ...(e.minuten !== null && { minuten: e.minuten }),
                      })
                    }
                  />
                  {e.aktiv && e.minutenOptionen && e.minuten !== null && (
                    <Select
                      size="md"
                      aria-label="Zeitpunkt der Erinnerung"
                      allowDeselect={false}
                      data={e.minutenOptionen.map((m) => ({
                        value: String(m),
                        label: minutenVorherLabel(m),
                      }))}
                      value={String(e.minuten)}
                      onChange={(v) =>
                        v && speichern.mutate({ art: e.art, aktiv: true, minuten: Number(v) })
                      }
                    />
                  )}
                </Stack>
              );
            })}
        </Stack>
      ))}
    </Stack>
  );
}

/** Profile section "Benachrichtigungen". */
export function Benachrichtigungen() {
  return (
    <Stack maw={520} gap="md">
      <Title order={3}>Benachrichtigungen</Title>
      <Text size="sm" c="dimmed">
        Push-Nachrichten musst du auf jedem Gerät einzeln aktivieren. Welche Nachrichten du
        bekommst, gilt für alle deine Geräte.
      </Text>
      <GeraetPush />
      <Einstellungen />
    </Stack>
  );
}
