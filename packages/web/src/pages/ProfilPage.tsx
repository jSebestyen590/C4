import {
  Alert,
  Button,
  FileInput,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ANREDEN,
  PROFILBILD_TYPEN,
  mitgliedAktualisierenSchema,
  setUsernameSchema,
  type Anrede,
  type Mitglied,
} from '@c4/shared';
import { ANREDE_LABELS } from '../i18n';
import { unwrap, useApi } from '../api';
import { useAuth } from '../auth';
import { RollenFeld } from '../RollenAnzeige';
import { StatusFeld } from '../StatusAnzeige';
import { EmailAendern } from '../EmailAendern';
import { ProfilbildAnzeige } from '../ProfilbildAnzeige';
import { profilbilderErzeugen, type Ausschnitt } from '../profilbild';
import { ProfilbildZuschnitt } from '../ProfilbildZuschnitt';

type Fehler = Partial<
  Record<'username' | 'vorname' | 'nachname' | 'adresse' | 'telefon' | 'ueberMich', string>
>;

/** Thrown when the chosen username belongs to someone else. */
class UsernameVergeben extends Error {}

/** Edit form for the caller's own profile, including the login username. */
export function ProfilFormular({
  mitglied,
  username: aktuellerUsername,
  onGespeichert,
}: Readonly<{
  mitglied: Mitglied | null;
  username: string | undefined;
  /** Called after a successful save; the default is to go to the start page. */
  onGespeichert?: () => void;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [username, setUsername] = useState(aktuellerUsername ?? '');
  const [vorname, setVorname] = useState(mitglied?.vorname ?? '');
  const [nachname, setNachname] = useState(mitglied?.nachname ?? '');
  const [anrede, setAnrede] = useState<Anrede>(mitglied?.anrede ?? 'neutral');
  const [adresse, setAdresse] = useState(mitglied?.adresse ?? '');
  const [telefon, setTelefon] = useState(mitglied?.telefon ?? '');
  const [ueberMich, setUeberMich] = useState(mitglied?.ueberMich ?? '');
  const [bildKey, setBildKey] = useState<string | null>(mitglied?.profilbildKey ?? null);
  const [bildUrl, setBildUrl] = useState<string | null>(mitglied?.profilbildUrl ?? null);
  const [bildGrossUrl, setBildGrossUrl] = useState<string | null>(
    mitglied?.profilbildGrossUrl ?? null,
  );
  const [gewaehlt, setGewaehlt] = useState<File | null>(null);
  const [fehler, setFehler] = useState<Fehler>({});
  const [bildFehler, setBildFehler] = useState<string | null>(null);

  const bildHochladen = useMutation({
    mutationFn: async ({ datei, ausschnitt }: { datei: File; ausschnitt: Ausschnitt }) => {
      const { gross, klein } = await profilbilderErzeugen(datei, ausschnitt);
      const res = await api.me.profilbild.$post({
        json: {
          contentType: gross.type as (typeof PROFILBILD_TYPEN)[number],
          groesse: gross.size,
          kleinGroesse: klein.size,
        },
      });
      if (!res.ok) throw new Error('Upload konnte nicht vorbereitet werden');
      const { uploadUrl, kleinUploadUrl, key } = await res.json();
      const hochladen = async (url: string, blob: Blob) => {
        const put = await fetch(url, {
          method: 'PUT',
          headers: { 'content-type': blob.type },
          body: blob,
        });
        if (!put.ok) throw new Error('Upload fehlgeschlagen');
      };
      await Promise.all([hochladen(uploadUrl, gross), hochladen(kleinUploadUrl, klein)]);
      return {
        key,
        vorschau: URL.createObjectURL(klein),
        grossVorschau: URL.createObjectURL(gross),
      };
    },
    onSuccess: ({ key, vorschau, grossVorschau }) => {
      setBildFehler(null);
      setBildKey(key);
      setBildUrl(vorschau);
      setBildGrossUrl(grossVorschau);
    },
    onError: () => setBildFehler('Das Bild konnte nicht hochgeladen werden.'),
  });

  const speichern = useMutation({
    mutationFn: async (eingabe: {
      username: string;
      daten: ReturnType<typeof mitgliedAktualisierenSchema.parse>;
    }) => {
      if (eingabe.username !== aktuellerUsername) {
        const res = await api.me.username.$put({ json: { username: eingabe.username } });
        if (res.status === 409) throw new UsernameVergeben();
        if (!res.ok) throw new Error('Benutzername konnte nicht gespeichert werden');
      }
      const res = await api.me.mitglied.$put({ json: eingabe.daten });
      if (!res.ok) throw new Error('Speichern fehlgeschlagen');
    },
    onSuccess: async () => {
      await Promise.all(
        ['me', 'mitglied', 'mitglieder'].map((key) => qc.invalidateQueries({ queryKey: [key] })),
      );
      notifications.show({ color: 'green', message: 'Dein Profil wurde gespeichert.' });
      if (onGespeichert) onGespeichert();
      else navigate('/');
    },
    onError: (err) => {
      if (err instanceof UsernameVergeben)
        setFehler({ username: 'Dieser Benutzername ist bereits vergeben.' });
    },
  });

  const onSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const usernameGeprueft = setUsernameSchema.safeParse({ username });
    const parsed = mitgliedAktualisierenSchema.safeParse({
      vorname,
      nachname,
      anrede,
      adresse,
      telefon,
      ueberMich,
      profilbildKey: bildKey,
    });
    if (!usernameGeprueft.success || !parsed.success) {
      const neu: Fehler = {};
      const probleme = [
        ...(usernameGeprueft.success ? [] : usernameGeprueft.error.issues),
        ...(parsed.success ? [] : parsed.error.issues),
      ];
      for (const issue of probleme) {
        const feld = issue.path[0] as keyof Fehler;
        neu[feld] ??= issue.message;
      }
      return setFehler(neu);
    }
    setFehler({});
    speichern.mutate({ username: usernameGeprueft.data.username, daten: parsed.data });
  };

  return (
    <Stack gap="xl">
      <form onSubmit={onSubmit} noValidate>
        <Stack maw={520}>
          <Title order={2}>Mein Profil</Title>
          {mitglied && (
            <StatusFeld sub={mitglied.sub} status={mitglied.status} anrede={mitglied.anrede} />
          )}
          {mitglied?.rollen && can('users:manage') && (
            <RollenFeld sub={mitglied.sub} rollen={mitglied.rollen} anrede={mitglied.anrede} />
          )}
          {(!mitglied?.vorname || !aktuellerUsername) && (
            <Text>
              Willkommen! Bitte wähle einen Benutzernamen und trag deinen Namen ein, damit dich die
              anderen finden.
            </Text>
          )}
          <ProfilbildZuschnitt
            datei={gewaehlt}
            onAbbrechen={() => setGewaehlt(null)}
            onUebernehmen={(datei, ausschnitt) => {
              setGewaehlt(null);
              bildHochladen.mutate({ datei, ausschnitt });
            }}
          />
          <Group wrap="nowrap">
            <ProfilbildAnzeige src={bildUrl} grossSrc={bildGrossUrl} size={96} alt="Profilbild" />
            <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
              <FileInput
                size="md"
                label="Profilbild"
                placeholder="Bild auswählen"
                accept="image/jpeg,image/png,image/webp"
                clearable
                value={null}
                onChange={setGewaehlt}
                rightSection={bildHochladen.isPending ? <Loader size="xs" /> : undefined}
                error={bildFehler}
              />
              {bildKey && (
                <Button
                  variant="subtle"
                  color="red"
                  size="sm"
                  onClick={() => {
                    setBildKey(null);
                    setBildUrl(null);
                    setBildGrossUrl(null);
                  }}
                >
                  Bild entfernen
                </Button>
              )}
            </Stack>
          </Group>
          <TextInput
            required
            label="Benutzername"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            description="Damit kannst du dich auch anmelden."
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
            error={fehler.username}
          />
          <TextInput
            required
            label="Vorname"
            autoComplete="given-name"
            value={vorname}
            onChange={(e) => setVorname(e.currentTarget.value)}
            error={fehler.vorname}
          />
          <TextInput
            required
            label="Nachname"
            autoComplete="family-name"
            value={nachname}
            onChange={(e) => setNachname(e.currentTarget.value)}
            error={fehler.nachname}
          />
          <Select
            label="Wie möchtest du angesprochen werden?"
            description="Bestimmt, wie Bezeichnungen wie dein Status in der App für dich geschrieben werden."
            data={ANREDEN.map((a) => ({ value: a, label: ANREDE_LABELS[a] }))}
            value={anrede}
            allowDeselect={false}
            onChange={(v) => v && setAnrede(v as Anrede)}
          />
          <Textarea
            size="md"
            label="Adresse"
            autoComplete="street-address"
            autosize
            minRows={2}
            value={adresse}
            onChange={(e) => setAdresse(e.currentTarget.value)}
            error={fehler.adresse}
          />
          <TextInput
            type="tel"
            label="Telefonnummer"
            autoComplete="tel"
            value={telefon}
            onChange={(e) => setTelefon(e.currentTarget.value)}
            error={fehler.telefon}
          />
          <Textarea
            size="md"
            label="Über mich"
            autosize
            minRows={3}
            maxRows={10}
            value={ueberMich}
            onChange={(e) => setUeberMich(e.currentTarget.value)}
            error={fehler.ueberMich}
          />
          {speichern.isError && (
            <Alert color="red">Das Profil konnte nicht gespeichert werden.</Alert>
          )}
          <Button
            type="submit"
            loading={speichern.isPending}
            disabled={bildHochladen.isPending}
            fullWidth
          >
            Speichern
          </Button>
        </Stack>
      </form>
      {mitglied?.email && <EmailAendern email={mitglied.email} />}
    </Stack>
  );
}

export function ProfilPage() {
  const api = useApi();
  const me = useQuery({ queryKey: ['me'], queryFn: async () => unwrap(await api.me.$get()) });
  const mitglied = useQuery({
    queryKey: ['mitglied'],
    queryFn: async () => {
      const res = await api.me.mitglied.$get();
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Profil konnte nicht geladen werden');
      return res.json();
    },
  });
  if (mitglied.isPending || me.isPending) return <Loader m="md" aria-label="Profil wird geladen" />;
  if (mitglied.isError || me.isError)
    return <Alert color="red">Das Profil konnte nicht geladen werden.</Alert>;
  return <ProfilFormular mitglied={mitglied.data} username={me.data.preferredUsername} />;
}
