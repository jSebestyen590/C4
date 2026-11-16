import { Alert, Group, Loader, Text } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AppConfig } from '@c4/shared';
import { _createUserManagerForCallback } from '../auth';
import { ruecksprungZiel } from '../ruecksprung';

export function CallbackPage({ config }: Readonly<{ config: AppConfig }>) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // the auth code may be redeemed only once (StrictMode runs effects twice)
    started.current = true;
    _createUserManagerForCallback(config)
      .signinRedirectCallback()
      .then((user) => {
        // Full reload so AuthProvider picks up the stored user; return to the page that started the login.
        window.location.replace(ruecksprungZiel(user.state, import.meta.env.BASE_URL));
      })
      .catch((e: unknown) => setError(String(e)));
  }, [config, navigate]);

  return error ? (
    <Alert color="red" title="Anmeldung fehlgeschlagen">
      {error}
    </Alert>
  ) : (
    <Group>
      <Loader size="sm" />
      <Text>Anmeldung läuft…</Text>
    </Group>
  );
}
