import { Alert, Anchor, Button, Group, Loader, Stack, Text, Timeline } from '@mantine/core';
import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  datumAnzeigen,
  heuteBerlin,
  mitgliedschaftTage,
  type Anrede,
  type StatusEintrag,
} from '@c4/shared';
import { unwrap, useApi } from './api';
import { AktionsMenue } from './AktionsMenue';
import { BestaetigenDialog } from './BestaetigenDialog';
import { useAuth } from './auth';
import { historieAktualisieren } from './historieDaten';
import { StatusBadge } from './StatusAnzeige';
import { StatusEintragModal } from './StatusEintragModal';
import { pruefen } from './warenApi';

const tageText = (n: number) => (n === 1 ? '1 Tag' : `${n.toLocaleString('de-DE')} Tage`);

/** Status history of a member as a timeline, with the length of membership; admins edit it. */
export function StatusHistorie({
  sub,
  username,
  anrede,
  deaktiviert,
}: Readonly<{ sub: string; username: string | null; anrede: Anrede; deaktiviert: boolean }>) {
  const api = useApi();
  const qc = useQueryClient();
  const darfBearbeiten = useAuth().can('users:manage') && !deaktiviert;
  const [bearbeiten, setBearbeiten] = useState<StatusEintrag | 'neu' | null>(null);
  const [loeschen, setLoeschen] = useState<StatusEintrag | null>(null);
  const historie = useQuery({
    queryKey: ['mitglied-historie', sub],
    queryFn: async () =>
      unwrap(await api.mitglieder[':kennung'].historie.$get({ param: { kennung: sub } })),
  });

  if (historie.isPending) return <Loader size="sm" aria-label="Status-Historie wird geladen" />;
  if (historie.isError)
    return <Alert color="red">Die Status-Historie konnte nicht geladen werden.</Alert>;
  const { statusVerlauf, deaktiviertAm } = historie.data;
  const tage = mitgliedschaftTage(statusVerlauf, deaktiviertAm ?? heuteBerlin());
  const kennung = encodeURIComponent(username ?? sub);

  return (
    <Stack gap="xs">
      <Text size="sm" c="dimmed">
        Status-Historie
      </Text>
      {statusVerlauf.length > 0 && (
        <Timeline active={statusVerlauf.length - 1} bulletSize={16} lineWidth={2}>
          {statusVerlauf.map((e) => (
            <Timeline.Item key={e.id}>
              <Group justify="space-between" wrap="nowrap" gap="xs" mih={42}>
                <Group gap="xs">
                  <Text size="sm">{e.ab ? `ab ${datumAnzeigen(e.ab)}` : 'seit ?'}</Text>
                  <StatusBadge status={e.status} anrede={anrede} />
                </Group>
                {darfBearbeiten && (
                  <AktionsMenue
                    label="Eintrag-Aktionen"
                    aktionen={[
                      {
                        text: 'Bearbeiten',
                        icon: <IconEdit size={18} />,
                        onClick: () => setBearbeiten(e),
                      },
                      {
                        text: 'Löschen',
                        icon: <IconTrash size={18} />,
                        color: 'red',
                        onClick: () => setLoeschen(e),
                      },
                    ]}
                  />
                )}
              </Group>
            </Timeline.Item>
          ))}
        </Timeline>
      )}
      <Text size="sm">Dauer der Mitgliedschaft: {tageText(tage)}</Text>
      <Anchor component={Link} to={`/historie?mitglieder=${kennung}`} size="sm">
        Im Zeitstrahl ansehen
      </Anchor>
      {darfBearbeiten && (
        <div>
          <Button
            variant="light"
            leftSection={<IconPlus size={18} />}
            onClick={() => setBearbeiten('neu')}
          >
            Eintrag hinzufügen
          </Button>
        </div>
      )}
      {bearbeiten && (
        <StatusEintragModal
          sub={sub}
          anrede={anrede}
          eintrag={bearbeiten === 'neu' ? undefined : bearbeiten}
          onClose={() => setBearbeiten(null)}
        />
      )}
      {loeschen && (
        <BestaetigenDialog
          titel="Eintrag löschen"
          bestaetigenText="Löschen"
          onClose={() => setLoeschen(null)}
          onBestaetigt={async () => {
            await pruefen(
              await api.admin.mitglieder[':sub']['status-verlauf'][':id'].$delete({
                param: { sub, id: loeschen.id },
              }),
            );
            await historieAktualisieren(qc);
          }}
        >
          <Text>
            Der Eintrag „{loeschen.ab ? `ab ${datumAnzeigen(loeschen.ab)}` : 'seit ?'}“ wird
            gelöscht. Das lässt sich nicht rückgängig machen.
          </Text>
        </BestaetigenDialog>
      )}
    </Stack>
  );
}
