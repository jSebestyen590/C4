import { Alert, Anchor, Avatar, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { unwrap, useApi } from '../api';
import { useAuth } from '../auth';
import { ProfilFormular } from './ProfilPage';

/** Detail page of one member; the owner edits their own profile here. */
export function MitgliedPage() {
  const { sub = '' } = useParams();
  const api = useApi();
  const qc = useQueryClient();
  const { can } = useAuth();
  const me = useQuery({ queryKey: ['me'], queryFn: async () => unwrap(await api.me.$get()) });
  const mitglied = useQuery({
    queryKey: ['mitglieder', sub],
    queryFn: async () => {
      const res = await api.mitglieder[':sub'].$get({ param: { sub } });
      if (res.status === 404) return null;
      return unwrap(res);
    },
  });

  if (mitglied.isPending || me.isPending)
    return <Loader m="md" aria-label="Mitglied wird geladen" />;
  if (mitglied.isError || me.isError)
    return <Alert color="red">Das Mitglied konnte nicht geladen werden.</Alert>;
  const m = mitglied.data;

  return (
    <Stack>
      <Anchor component={Link} to="/mitglieder" size="sm">
        ← Zurück zur Liste
      </Anchor>
      {!m && <Alert color="yellow">Dieses Mitglied wurde nicht gefunden.</Alert>}
      {m && m.sub === me.data.sub && can('profil:bearbeiten') && (
        <ProfilFormular
          mitglied={m}
          username={me.data.preferredUsername}
          onGespeichert={() => void qc.invalidateQueries({ queryKey: ['mitglieder', sub] })}
        />
      )}
      {m && !(m.sub === me.data.sub && can('profil:bearbeiten')) && (
        <Stack maw={520}>
          <Group wrap="nowrap">
            <Avatar src={m.profilbildUrl} size={96} radius="xl" alt="" />
            <div style={{ minWidth: 0 }}>
              <Title order={2} style={{ overflowWrap: 'anywhere' }}>
                {m.username ?? `${m.vorname} ${m.nachname}`}
              </Title>
              {m.username && (
                <Text c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                  {m.vorname} {m.nachname}
                </Text>
              )}
            </div>
          </Group>
          {m.telefon && (
            <div>
              <Text size="sm" c="dimmed">
                Telefonnummer
              </Text>
              <Text component="a" href={`tel:${m.telefon}`}>
                {m.telefon}
              </Text>
            </div>
          )}
          {m.adresse && (
            <div>
              <Text size="sm" c="dimmed">
                Adresse
              </Text>
              <Text style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{m.adresse}</Text>
            </div>
          )}
          {m.ueberMich && (
            <div>
              <Text size="sm" c="dimmed">
                Über mich
              </Text>
              <Text style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
                {m.ueberMich}
              </Text>
            </div>
          )}
        </Stack>
      )}
    </Stack>
  );
}
