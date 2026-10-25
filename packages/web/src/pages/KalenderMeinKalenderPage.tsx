import {
  Alert,
  Anchor,
  Button,
  CopyButton,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconCheck, IconChevronLeft, IconCopy, IconDownload } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { datumBerlin } from '@c4/shared';
import { unwrap, useApi } from '../api';
import { BestaetigenDialog } from '../BestaetigenDialog';
import { dienstIcsHerunterladen } from '../kalenderIcs';
import { fehlerAnzeigen, fehlerText } from '../warenApi';
import { kalenderInvalidieren, useKalenderToken, useMeineDienste } from '../kalenderDaten';

const feedUrl = (token: string) =>
  `${window.location.origin}/api/kalender/feed/${encodeURIComponent(token)}.ics`;
const webcalUrl = (token: string) => feedUrl(token).replace(/^https?:/, 'webcal:');

function KopierenButton({ wert, text }: Readonly<{ wert: string; text: string }>) {
  return (
    <CopyButton value={wert}>
      {({ copied, copy }) => (
        <Button
          variant={copied ? 'light' : 'default'}
          color={copied ? 'green' : undefined}
          leftSection={copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
          onClick={copy}
          fullWidth
        >
          {copied ? 'Kopiert' : text}
        </Button>
      )}
    </CopyButton>
  );
}

/** Subscribe to the own Dienste in a calendar app, or download them once as `.ics`. */
export function KalenderMeinKalenderPage() {
  const api = useApi();
  const qc = useQueryClient();
  const vorhanden = useKalenderToken();
  const meineDienste = useMeineDienste(false);
  // The plain token only exists right after creation; the server keeps just its hash.
  const [token, setToken] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [neuFragen, setNeuFragen] = useState(false);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);

  const erzeugen = async () => {
    const res = await unwrap(await api.me['kalender-token'].$post());
    setToken(res.token);
    await kalenderInvalidieren(qc);
  };

  const einrichten = async () => {
    setLaeuft(true);
    try {
      await erzeugen();
    } catch (e) {
      fehlerAnzeigen(e);
    } finally {
      setLaeuft(false);
    }
  };

  const herunterladen = async () => {
    setLadeFehler(null);
    try {
      const dienste = (await meineDienste.refetch({ throwOnError: true })).data ?? [];
      if (dienste.length === 0) {
        setLadeFehler('Du bist aktuell in keinen kommenden Diensten eingetragen.');
        return;
      }
      dienstIcsHerunterladen(dienste, `dienste-${datumBerlin(new Date().toISOString())}.ics`);
    } catch (e) {
      setLadeFehler(fehlerText(e));
    }
  };

  return (
    <Stack maw={700} gap="md">
      <Anchor component={Link} to="/kalender" size="sm">
        <Group gap={4} wrap="nowrap">
          <IconChevronLeft size={16} />
          Zurück zum Kalender
        </Group>
      </Anchor>
      <Title order={2}>Mein Kalender</Title>
      <Text>
        Abonniere deine Dienste in deiner Kalender-App. Sie erscheinen dort automatisch, auch wenn
        sich etwas ändert oder du dich austrägst. Im Abo stehen nur deine eigenen Dienste.
      </Text>
      <Text size="sm" c="dimmed">
        Erinnerungen per Push stellst du im{' '}
        <Anchor component={Link} to="/profil" size="sm">
          Profil
        </Anchor>{' '}
        ein.
      </Text>

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Title order={4}>Kalender-Abo</Title>
          {vorhanden.isError ? (
            <Alert color="red">Der Abo-Status konnte nicht geladen werden.</Alert>
          ) : vorhanden.isPending ? (
            <Loader m="md" />
          ) : token ? (
            <>
              <Alert color="green" title="Dein Abo-Link">
                Kopiere den Link jetzt und füge ihn in deiner Kalender-App ein. Aus
                Sicherheits­gründen wird er nur dieses eine Mal angezeigt. Wer den Link hat, sieht
                deine Dienste, gib ihn also nicht weiter.
              </Alert>
              <TextInput
                label="Link zum Abonnieren"
                readOnly
                value={webcalUrl(token)}
                onFocus={(e) => e.currentTarget.select()}
              />
              <KopierenButton wert={feedUrl(token)} text="Link (https) kopieren" />
              <KopierenButton wert={webcalUrl(token)} text="Link (webcal) kopieren" />
              <Button
                component="a"
                href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl(token))}`}
                target="_blank"
                rel="noreferrer"
              >
                In Google Kalender abonnieren
              </Button>
              <Button component="a" href={webcalUrl(token)} variant="default">
                In Apple/Outlook öffnen
              </Button>
              <Text size="sm" c="dimmed">
                Google Kalender aktualisiert Abos nur alle paar Stunden, andere Apps meist öfter.
                Änderungen erscheinen deshalb mit etwas Verzögerung.
              </Text>
            </>
          ) : vorhanden.data ? (
            <>
              <Text>
                Abo ist eingerichtet. Den Link kannst du aus Sicherheitsgründen nicht erneut
                ansehen. Wenn du ihn verloren hast, erzeuge einen neuen.
              </Text>
              <Button variant="default" onClick={() => setNeuFragen(true)}>
                Neuen Link erzeugen
              </Button>
            </>
          ) : (
            <>
              <Text>Du hast noch kein Abo eingerichtet.</Text>
              <Button loading={laeuft} onClick={() => void einrichten()}>
                Kalender-Abo einrichten
              </Button>
            </>
          )}
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Title order={4}>Einmaliger Download</Title>
          <Text>
            Du kannst deine kommenden Dienste auch einmalig als Datei herunterladen und in deinen
            Kalender importieren. Die Datei aktualisiert sich nicht.
          </Text>
          {ladeFehler && <Alert color="yellow">{ladeFehler}</Alert>}
          <Button
            variant="default"
            leftSection={<IconDownload size={18} />}
            h="auto"
            mih={44}
            py="xs"
            styles={{ label: { whiteSpace: 'normal', textAlign: 'center' } }}
            loading={meineDienste.isFetching}
            onClick={() => void herunterladen()}
          >
            Alle kommenden Dienste als .ics herunterladen
          </Button>
        </Stack>
      </Paper>

      {neuFragen && (
        <BestaetigenDialog
          titel="Neuen Link erzeugen"
          bestaetigenText="Neuen Link erzeugen"
          color="blue"
          onClose={() => setNeuFragen(false)}
          onBestaetigt={erzeugen}
        >
          <Text>
            Der bisherige Link funktioniert danach nicht mehr. Du musst das Abo in deiner
            Kalender-App mit dem neuen Link erneut einrichten.
          </Text>
        </BestaetigenDialog>
      )}
    </Stack>
  );
}
