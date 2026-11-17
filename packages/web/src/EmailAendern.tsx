import { Alert, Button, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { emailAendernSchema, emailBestaetigenSchema } from '@c4/shared';
import { useApi } from './api';
import { mitgliederKeys } from './queryKeys';

/** Two steps: request a code for the new address, then confirm it. */
export function EmailAendern({ email }: Readonly<{ email: string }>) {
  const api = useApi();
  const qc = useQueryClient();
  const [schritt, setSchritt] = useState<'anzeigen' | 'adresse' | 'code'>('anzeigen');
  const [neu, setNeu] = useState('');
  const [code, setCode] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);

  const meldung = (status: number, standard: string) =>
    status === 403
      ? 'Bitte melde dich einmal ab und wieder an, dann kannst du deine E-Mail-Adresse ändern.'
      : status === 409
        ? 'Diese E-Mail-Adresse wird bereits verwendet.'
        : status === 429
          ? 'Zu viele Versuche. Bitte warte kurz und versuche es erneut.'
          : standard;

  const anfordern = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (adresse: string) => api.me.email.$put({ json: { email: adresse } }),
    onSuccess: (res) => {
      if (!res.ok) return setFehler(meldung(res.status, 'Der Code konnte nicht gesendet werden.'));
      setFehler(null);
      setSchritt('code');
    },
    onError: () => setFehler('Der Code konnte nicht gesendet werden.'),
  });

  const bestaetigen = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (eingabe: string) =>
      api.me.email.bestaetigen.$post({ json: { code: eingabe } }),
    onSuccess: async (res) => {
      if (res.status === 400) return setFehler('Der Code ist falsch oder abgelaufen.');
      if (!res.ok)
        return setFehler(meldung(res.status, 'Die Adresse konnte nicht bestätigt werden.'));
      await Promise.all(
        [mitgliederKeys.me, mitgliederKeys.mitglied, mitgliederKeys.alle].map((queryKey) =>
          qc.invalidateQueries({ queryKey }),
        ),
      );
      notifications.show({ color: 'green', message: 'Deine E-Mail-Adresse wurde geändert.' });
      setFehler(null);
      setNeu('');
      setCode('');
      setSchritt('anzeigen');
    },
    onError: () => setFehler('Die Adresse konnte nicht bestätigt werden.'),
  });

  const adresseSenden = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = emailAendernSchema.safeParse({ email: neu });
    if (!parsed.success) return setFehler('Bitte gib eine gültige E-Mail-Adresse ein.');
    if (parsed.data.email === email.toLowerCase())
      return setFehler('Das ist bereits deine aktuelle E-Mail-Adresse.');
    setFehler(null);
    anfordern.mutate(parsed.data.email);
  };

  const codeSenden = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = emailBestaetigenSchema.safeParse({ code });
    if (!parsed.success) return setFehler('Bitte gib den Code aus der E-Mail ein.');
    setFehler(null);
    bestaetigen.mutate(parsed.data.code);
  };

  return (
    <Stack maw={520} gap="sm">
      <Title order={3}>E-Mail-Adresse</Title>
      <Text style={{ overflowWrap: 'anywhere' }}>{email}</Text>
      {schritt === 'anzeigen' && (
        <Button variant="default" onClick={() => setSchritt('adresse')}>
          E-Mail-Adresse ändern
        </Button>
      )}
      {schritt === 'adresse' && (
        <form onSubmit={adresseSenden} noValidate>
          <Stack>
            <TextInput
              required
              type="email"
              label="Neue E-Mail-Adresse"
              description="Wir schicken einen Code an diese Adresse. Bis du ihn bestätigst, meldest du dich weiter mit der alten an."
              autoComplete="email"
              autoCapitalize="none"
              value={neu}
              onChange={(e) => setNeu(e.currentTarget.value)}
            />
            {fehler && <Alert color="red">{fehler}</Alert>}
            <Button type="submit" loading={anfordern.isPending} fullWidth>
              Code senden
            </Button>
            <Button
              variant="subtle"
              onClick={() => {
                setFehler(null);
                setSchritt('anzeigen');
              }}
            >
              Abbrechen
            </Button>
          </Stack>
        </form>
      )}
      {schritt === 'code' && (
        <form onSubmit={codeSenden} noValidate>
          <Stack>
            <TextInput
              required
              label="Bestätigungscode"
              description={`Wir haben einen Code an ${neu} geschickt.`}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.currentTarget.value)}
            />
            {fehler && <Alert color="red">{fehler}</Alert>}
            <Button type="submit" loading={bestaetigen.isPending} fullWidth>
              Bestätigen
            </Button>
            <Button
              variant="subtle"
              onClick={() => {
                setFehler(null);
                setCode('');
                setSchritt('adresse');
              }}
            >
              Andere Adresse eingeben
            </Button>
          </Stack>
        </form>
      )}
    </Stack>
  );
}
