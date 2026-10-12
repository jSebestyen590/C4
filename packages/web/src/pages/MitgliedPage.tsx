import { Alert, Anchor, Badge, Group, Loader, Stack, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { unwrap, useApi } from '../api';
import { useAuth } from '../auth';
import { anzeigename, nebenname } from '../mitglied';
import { ProfilbildAnzeige } from '../ProfilbildAnzeige';
import { KontaktkanalIcons } from '../KontaktkanalIcons';
import { RollenFeld } from '../RollenAnzeige';
import { StatusFeld, StatusTitel } from '../StatusAnzeige';
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
            <ProfilbildAnzeige
              src={m.profilbildUrl}
              grossSrc={m.profilbildGrossUrl}
              size={96}
              alt="Profilbild"
            />
            <div style={{ minWidth: 0 }}>
              <StatusTitel status={m.status}>{anzeigename(m)}</StatusTitel>
              {nebenname(m) && (
                <Text c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                  {nebenname(m)}
                </Text>
              )}
              {!m.aktiviert && (
                <Badge color="yellow" variant="light" mt={4}>
                  Noch nicht aktiviert
                </Badge>
              )}
            </div>
          </Group>
          <StatusFeld sub={m.sub} status={m.status} anrede={m.anrede} />
          {can('users:manage') && (
            <RollenFeld sub={m.sub} rollen={m.rollen ?? []} anrede={m.anrede} />
          )}
          {m.email && (
            <div>
              <Text size="sm" c="dimmed">
                E-Mail
              </Text>
              <Text style={{ overflowWrap: 'anywhere' }}>{m.email}</Text>
            </div>
          )}
          <div>
            <Text size="sm" c="dimmed" mb={4}>
              Am besten erreichbar über
            </Text>
            <KontaktkanalIcons gewaehlt={m.kontaktkanaele} />
          </div>
          {m.telefon && (
            <div>
              <Text size="sm" c="dimmed">
                Telefonnummer
              </Text>
              <Text>{m.telefon}</Text>
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
