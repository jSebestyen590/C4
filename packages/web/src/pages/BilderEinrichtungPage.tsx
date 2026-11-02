import {
  Alert,
  Anchor,
  Button,
  Group,
  Loader,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconChevronLeft } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { datumAnzeigen, datumBerlin, type OneDriveStatusDto } from '@c4/shared';
import { useApi } from '../api';
import { BestaetigenDialog } from '../BestaetigenDialog';
import { bilderInvalidieren, useOneDriveStatus } from '../bilderDaten';
import { fehlerAnzeigen, fehlerText, pruefen } from '../warenApi';

const STATE_KEY = 'bilder-oauth-state';

/** The page itself is the redirect URI of the Microsoft login. */
const redirectUri = () =>
  `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/bilder/einrichtung`;

const zufallsState = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

const merken = (state: string) => {
  try {
    sessionStorage.setItem(STATE_KEY, state);
  } catch {
    // Without storage the return cannot be verified; the login then fails with a clear message.
  }
};

const gemerkt = (): string | null => {
  try {
    const s = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(STATE_KEY);
    return s;
  } catch {
    return null;
  }
};

function StatusKarte({ status }: Readonly<{ status: OneDriveStatusDto }>) {
  return (
    <Paper withBorder p="md">
      <Stack gap="xs">
        <Text fw={700}>
          {status.verbunden ? 'OneDrive ist verbunden.' : 'OneDrive ist nicht verbunden.'}
        </Text>
        {status.konto && <Text>Konto: {status.konto}</Text>}
        {status.verbunden && status.verbundenAm && (
          <Text size="sm" c="dimmed">
            Verbunden am {datumAnzeigen(datumBerlin(status.verbundenAm))}
            {status.verbundenVon ? ` von ${status.verbundenVon}` : ''}
          </Text>
        )}
        <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
          Basisordner: {status.basisPfad}
        </Text>
        {status.fehler && <Alert color="red">{status.fehler}</Alert>}
      </Stack>
    </Paper>
  );
}

/** Admin page: Azure app data, the Microsoft login and its redirect back to this page. */
export function BilderEinrichtungPage() {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const status = useOneDriveStatus();
  const [clientIdEingabe, setClientId] = useState<string | null>(null);
  const clientId = clientIdEingabe ?? status.data?.clientId ?? '';
  const [clientSecret, setClientSecret] = useState('');
  const [basisEingabe, setBasisEingabe] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [trennen, setTrennen] = useState(false);
  const rueckkehr = useRef(false);

  const basisPfad = basisEingabe ?? (status.data?.basisPfad || 'Cloud4/Bilder');

  // Return from Microsoft: `?code=&state=` or `?error=&error_description=`. Runs once (StrictMode).
  useEffect(() => {
    const code = params.get('code');
    const fehlerCode = params.get('error');
    if (!code && !fehlerCode) return;
    if (rueckkehr.current) return;
    rueckkehr.current = true;
    const state = params.get('state');
    const erwartet = gemerkt();
    const fertig = (): void => void navigate('/bilder/einrichtung', { replace: true });
    if (fehlerCode) {
      notifications.show({
        color: 'red',
        message: `Die Anmeldung bei Microsoft ist fehlgeschlagen: ${params.get('error_description') ?? fehlerCode}`,
      });
      fertig();
      return;
    }
    if (!state || !erwartet || state !== erwartet) {
      notifications.show({
        color: 'red',
        message: 'Die Anmeldung konnte nicht bestätigt werden. Bitte versuche es noch einmal.',
      });
      fertig();
      return;
    }
    void (async () => {
      try {
        await pruefen(
          await api.bilder.verbindung.code.$post({
            json: { code: code!, redirectUri: redirectUri() },
          }),
        );
        await bilderInvalidieren(qc);
        notifications.show({ color: 'green', message: 'OneDrive ist verbunden.' });
      } catch (e) {
        fehlerAnzeigen(e, 'OneDrive konnte nicht verbunden werden.');
      } finally {
        fertig();
      }
    })();
  }, [params, api, qc, navigate]);

  const speichern = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!clientId.trim()) {
      return setFehler('Bitte gib die Client-ID an.');
    }
    setFehler(null);
    setLaeuft(true);
    try {
      await pruefen(
        await api.bilder.verbindung.$put({
          json: {
            clientId: clientId.trim(),
            clientSecret: clientSecret || undefined,
            basisPfad,
          },
        }),
      );
      await bilderInvalidieren(qc);
      setClientSecret('');
      notifications.show({ color: 'green', message: 'Gespeichert.' });
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaeuft(false);
    }
  };

  const verbinden = async () => {
    setFehler(null);
    setLaeuft(true);
    try {
      const state = zufallsState();
      merken(state);
      const res = await api.bilder.verbindung.login.$post({
        json: { redirectUri: redirectUri(), state },
      });
      await pruefen(res);
      const { url } = (await res.json()) as { url: string };
      window.location.assign(url);
    } catch (err) {
      setFehler(fehlerText(err));
      setLaeuft(false);
    }
  };

  const daten = status.data;
  return (
    <Stack maw={600}>
      <Anchor component={Link} to="/bilder" size="sm">
        <Group gap={4} wrap="nowrap">
          <IconChevronLeft size={16} />
          Zurück zu den Bildern
        </Group>
      </Anchor>
      <Title order={2}>Bilder einrichten</Title>
      {status.isPending && <Loader m="md" aria-label="Status wird geladen" />}
      {status.isError && <Alert color="red">Der Status konnte nicht geladen werden.</Alert>}
      {daten && (
        <>
          <StatusKarte status={daten} />
          <Text size="sm" c="dimmed">
            Client-ID und Client-Secret stammen aus der Azure-App-Registrierung des Vereins. Wie du
            sie anlegst, steht in der Dokumentation (docs/bilder.md).
          </Text>
          <form onSubmit={(e) => void speichern(e)}>
            <Stack>
              <TextInput
                size="md"
                label="Client-ID"
                value={clientId}
                required
                description="Anwendungs-ID (Client-ID) der App-Registrierung."
                onChange={(e) => setClientId(e.currentTarget.value)}
              />
              <PasswordInput
                size="md"
                label="Client-Secret"
                value={clientSecret}
                placeholder={daten.clientIdGesetzt ? 'unverändert' : undefined}
                description="Leer lassen, um das gespeicherte Secret zu behalten."
                autoComplete="new-password"
                onChange={(e) => setClientSecret(e.currentTarget.value)}
              />
              <TextInput
                size="md"
                label="Basisordner"
                value={basisPfad}
                onChange={(e) => setBasisEingabe(e.currentTarget.value)}
              />
              {fehler && <Alert color="red">{fehler}</Alert>}
              <Button type="submit" loading={laeuft}>
                Speichern
              </Button>
            </Stack>
          </form>
          <Button
            variant="light"
            disabled={!daten.clientIdGesetzt}
            loading={laeuft}
            onClick={() => void verbinden()}
          >
            Mit Microsoft verbinden
          </Button>
          {daten.verbunden && (
            <Button color="red" variant="outline" onClick={() => setTrennen(true)}>
              Trennen
            </Button>
          )}
        </>
      )}
      {trennen && (
        <BestaetigenDialog
          titel="OneDrive trennen?"
          bestaetigenText="Trennen"
          onClose={() => setTrennen(false)}
          onBestaetigt={async () => {
            await pruefen(await api.bilder.verbindung.$delete());
            await bilderInvalidieren(qc);
          }}
        >
          <Text>
            Die Bilder-Seite zeigt dann keine Ordner mehr, bis OneDrive wieder verbunden ist.
          </Text>
        </BestaetigenDialog>
      )}
    </Stack>
  );
}
