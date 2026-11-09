import { Alert, Anchor, Button, Loader, Select, Stack, Switch, Text, Title } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { EinstellungDto } from '@c4/shared';
import { unwrap, useApi } from '../api';
import {
  BENACHRICHTIGUNG_ART_LABELS,
  BENACHRICHTIGUNG_BEREICH_LABELS,
  label,
  minutenVorherLabel,
} from '../i18n';
import { usePushGeraet } from '../usePushGeraet';
import { fehlerAnzeigen } from '../warenApi';

const EINSTELLUNGEN_KEY = ['benachrichtigungen'];

/** Push on this device: status and the buttons to switch it on or off and to send a test. */
function GeraetPush() {
  const api = useApi();
  const {
    status: wert,
    aktivieren,
    aktiviertGerade,
    deaktivieren,
    deaktiviertGerade,
    syncNoetig,
  } = usePushGeraet();
  const [testErgebnis, setTestErgebnis] = useState<
    { geraete: number; ok: number; fehler: number } | 'fehler' | null
  >(null);
  const test = useMutation({
    mutationFn: async () => {
      const ergebnis = await unwrap(await api.push.test.$post());
      // The server knows no device although this one has a subscription: sync, then retry once.
      if (ergebnis.geraete === 0 && (await syncNoetig())) {
        return unwrap(await api.push.test.$post());
      }
      return ergebnis;
    },
    onMutate: () => setTestErgebnis(null),
    onSuccess: setTestErgebnis,
    onError: () => setTestErgebnis('fehler'),
  });

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
        <Button fullWidth loading={aktiviertGerade} onClick={() => void aktivieren()}>
          Push auf diesem Gerät aktivieren
        </Button>
      )}
      {wert === 'an' && (
        <Button
          fullWidth
          variant="default"
          loading={deaktiviertGerade}
          onClick={() => void deaktivieren()}
        >
          Push auf diesem Gerät deaktivieren
        </Button>
      )}
      <Button fullWidth variant="light" loading={test.isPending} onClick={() => test.mutate()}>
        Testbenachrichtigung senden
      </Button>
      {testErgebnis === 'fehler' && (
        <Alert color="red" title="Test fehlgeschlagen">
          Die Testbenachrichtigung konnte nicht gesendet werden. Versuch es gleich noch einmal.
        </Alert>
      )}
      {testErgebnis && testErgebnis !== 'fehler' && testErgebnis.geraete === 0 && (
        <Alert color="yellow" title="Kein Gerät aktiviert">
          Du hast noch kein Gerät für Push aktiviert. Aktiviere es oben auf diesem Gerät.
        </Alert>
      )}
      {testErgebnis &&
        testErgebnis !== 'fehler' &&
        testErgebnis.geraete > 0 &&
        (testErgebnis.ok > 0 ? (
          <Alert color="green" title="Test gesendet">
            Die Testbenachrichtigung wurde an {testErgebnis.ok} von {testErgebnis.geraete}{' '}
            {testErgebnis.geraete === 1 ? 'Gerät' : 'Geräten'} gesendet. Sie sollte gleich ankommen.
          </Alert>
        ) : (
          <Alert color="red" title="Test fehlgeschlagen">
            Der Push-Dienst hat die Nachricht nicht angenommen. Deaktiviere Push auf diesem Gerät
            und aktiviere es erneut.
          </Alert>
        ))}
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
                    description={
                      e.abschaltbar
                        ? texte?.beschreibung
                        : `${texte?.beschreibung ?? ''} Immer aktiv.`.trim()
                    }
                    checked={e.aktiv}
                    disabled={!e.abschaltbar}
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

export function BenachrichtigungenPage() {
  return (
    <Stack maw={520} gap="md">
      <Title order={2}>Benachrichtigungen</Title>
      <Text size="sm" c="dimmed">
        Push-Nachrichten musst du auf jedem Gerät einzeln aktivieren. Welche Nachrichten du
        bekommst, gilt für alle deine Geräte.
      </Text>
      <Anchor component={Link} to="/benachrichtigungen/verlauf">
        Zum Benachrichtigungsverlauf
      </Anchor>
      <GeraetPush />
      <Einstellungen />
    </Stack>
  );
}
