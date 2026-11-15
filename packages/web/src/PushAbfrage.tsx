import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { unwrap, useApi } from './api';
import { useAuth } from './auth';
import { usePushAbgleichBeimStart, usePushGeraet } from './usePushGeraet';
import { mitgliederKeys } from './queryKeys';

const NEIN_KEY = 'c4.push.nein';
const SPAETER_KEY = 'c4.push.spaeter';

const lesen = (storage: () => Storage, key: string): boolean => {
  try {
    return storage().getItem(key) === '1';
  } catch {
    return false;
  }
};
const schreiben = (storage: () => Storage, key: string) => {
  try {
    storage().setItem(key, '1');
  } catch {
    // Storage blocked: the dialog may come back, which is acceptable.
  }
};

/**
 * Asks once per device (until decided) whether to switch push on. Mounted once in the app shell;
 * shows only after the profile gate passed, never on the notifications page itself.
 */
export function PushAbfrage() {
  const api = useApi();
  const { user, can } = useAuth();
  const { pathname } = useLocation();
  const darf = !!user && can('profil:bearbeiten');
  const me = useQuery({
    queryKey: mitgliederKeys.me,
    enabled: darf,
    queryFn: async () => unwrap(await api.me.$get()),
  });
  const mitglied = useQuery({
    queryKey: mitgliederKeys.mitglied,
    enabled: darf,
    queryFn: async () => {
      const res = await api.me.mitglied.$get();
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Profil konnte nicht geladen werden');
      return res.json();
    },
  });
  const push = usePushGeraet();
  const [ausgeblendet, setAusgeblendet] = useState(false);

  const profilVorhanden =
    !!me.data?.preferredUsername && !!mitglied.data && mitglied.data.vorname !== '';
  usePushAbgleichBeimStart(darf && profilVorhanden);
  const entschieden =
    lesen(() => localStorage, NEIN_KEY) || lesen(() => sessionStorage, SPAETER_KEY);
  if (!darf || !profilVorhanden || ausgeblendet || entschieden) return null;
  if (pathname === '/benachrichtigungen' || pathname.startsWith('/auth/')) return null;

  const hinweisIos = push.status === 'ios-installieren';
  if (push.status !== 'aus' && !hinweisIos) return null;

  const spaeter = () => {
    schreiben(() => sessionStorage, SPAETER_KEY);
    setAusgeblendet(true);
  };
  const nein = () => {
    schreiben(() => localStorage, NEIN_KEY);
    setAusgeblendet(true);
  };

  if (hinweisIos)
    return (
      <Modal opened onClose={spaeter} title="Zum Home-Bildschirm hinzufügen" centered padding="md">
        <Stack>
          <Text>
            Auf dem iPhone und iPad bekommst du Benachrichtigungen erst, wenn du C4 zum
            Home-Bildschirm hinzufügst: Tippe auf das Teilen-Symbol, dann auf „Zum Home-Bildschirm“,
            und öffne C4 von dort. Du brauchst dafür iOS 16.4 oder neuer.
          </Text>
          <Button fullWidth size="md" onClick={nein}>
            Verstanden
          </Button>
        </Stack>
      </Modal>
    );

  return (
    <Modal opened onClose={spaeter} title="Benachrichtigungen aktivieren?" centered padding="md">
      <Stack>
        <Text>
          Wir erinnern dich vor deinen Diensten und melden Änderungen an Events, bei denen du
          eingetragen bist. Das gilt nur für dieses Gerät; was du bekommst, stellst du jederzeit
          unter Benachrichtigungen ein.
        </Text>
        <Button
          fullWidth
          size="md"
          loading={push.aktiviertGerade}
          onClick={() => {
            // No await before the permission prompt inside `aktivieren` (iOS user gesture).
            void push.aktivieren().then((ok) => {
              if (ok) setAusgeblendet(true);
            });
          }}
        >
          Aktivieren
        </Button>
        <Group grow>
          <Button variant="default" size="md" onClick={spaeter}>
            Später
          </Button>
          <Button variant="subtle" size="md" onClick={nein}>
            Nein danke
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
