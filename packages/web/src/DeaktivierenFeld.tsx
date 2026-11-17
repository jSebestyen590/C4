import { Alert, Anchor, Button, List, Loader, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { centAnzeigen, datumAnzeigen, type Mitglied } from '@c4/shared';
import { unwrap, useApi } from './api';
import { BestaetigenDialog } from './BestaetigenDialog';
import { StatusName } from './StatusAnzeige';
import { mitgliedName } from './mitglied';
import { mitgliederKeys } from './queryKeys';

/** What is still open for the member; nothing is changed automatically on deactivation. */
function OffenesAbschnitt({ sub }: Readonly<{ sub: string }>) {
  const api = useApi();
  const vorschau = useQuery({
    queryKey: mitgliederKeys.deaktivierenVorschau(sub),
    queryFn: async () =>
      unwrap(await api.admin.mitglieder[':sub']['deaktivieren-vorschau'].$get({ param: { sub } })),
    gcTime: 0,
  });
  if (vorschau.isPending)
    return <Loader size="sm" aria-label="Offene Zuordnungen werden geladen" />;
  if (vorschau.isError)
    return <Alert color="red">Die offenen Zuordnungen konnten nicht geladen werden.</Alert>;
  const { dienste, posten, schluessel, buch } = vorschau.data;
  if (dienste.length + posten.length + schluessel.length + buch.length === 0) return null;
  return (
    <Stack gap="xs">
      <Text fw={600}>Noch offen:</Text>
      {dienste.length > 0 && (
        <div>
          <Text size="sm" c="dimmed">
            Künftige Dienste
          </Text>
          <List size="md" listStyleType="disc">
            {dienste.map((d) => (
              <List.Item key={`${d.eventId}-${d.datum}`}>
                <Anchor component={Link} to={`/kalender/events/${d.eventId}`}>
                  {d.titel}, {datumAnzeigen(d.datum)}
                </Anchor>
              </List.Item>
            ))}
          </List>
        </div>
      )}
      {posten.length > 0 && (
        <div>
          <Text size="sm" c="dimmed">
            Posten
          </Text>
          <List size="md" listStyleType="disc">
            {posten.map((p) => (
              <List.Item key={p.id}>
                <Anchor component={Link} to={`/posten/${p.id}`}>
                  {p.name}
                </Anchor>
              </List.Item>
            ))}
          </List>
        </div>
      )}
      {schluessel.length > 0 && (
        <div>
          <Text size="sm" c="dimmed">
            Schlüssel
          </Text>
          <List size="md" listStyleType="disc">
            {schluessel.map((s) => (
              <List.Item key={s.id}>
                <Anchor component={Link} to={`/schluessel/${s.id}`}>
                  {s.name}
                </Anchor>
              </List.Item>
            ))}
          </List>
        </div>
      )}
      {buch.length > 0 && (
        <div>
          <Text size="sm" c="dimmed">
            Buch (offener Saldo)
          </Text>
          <List size="md" listStyleType="disc">
            {buch.map((b) => (
              <List.Item key={b.seiteId}>
                <Anchor component={Link} to={`/finanzen/buch/seiten/${b.seiteId}`}>
                  Seite {b.nummer}: {centAnzeigen(b.saldoCent)}
                </Anchor>
              </List.Item>
            ))}
          </List>
        </div>
      )}
    </Stack>
  );
}

/** Admins deactivate and reactivate an account here (not for themselves). */
export function DeaktivierenFeld({ mitglied }: Readonly<{ mitglied: Mitglied }>) {
  const api = useApi();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(false);

  const setzen = async (aktiv: boolean) => {
    const res = await api.admin.mitglieder[':sub'].aktiv.$put({
      param: { sub: mitglied.sub },
      json: { aktiv },
    });
    if (!res.ok) throw new Error('Der Account konnte nicht geändert werden.');
    await qc.invalidateQueries({ queryKey: mitgliederKeys.alle });
    await qc.invalidateQueries({ queryKey: mitgliederKeys.mitglied });
    notifications.show({
      color: 'green',
      message: aktiv ? 'Der Account wurde wieder aktiviert.' : 'Der Account wurde deaktiviert.',
    });
  };

  if (mitglied.deaktiviert)
    return (
      <Button
        size="md"
        mih={42}
        variant="light"
        fullWidth
        onClick={() =>
          void setzen(true).catch(() =>
            notifications.show({
              color: 'red',
              message: 'Der Account konnte nicht wieder aktiviert werden.',
            }),
          )
        }
      >
        Account wieder aktivieren
      </Button>
    );

  return (
    <>
      <Button
        size="md"
        mih={42}
        color="red"
        variant="light"
        fullWidth
        onClick={() => setDialog(true)}
      >
        Account deaktivieren
      </Button>
      {dialog && (
        <BestaetigenDialog
          titel="Account deaktivieren?"
          bestaetigenText="Deaktivieren"
          onClose={() => setDialog(false)}
          onBestaetigt={() => setzen(false)}
        >
          <Stack>
            <Text>
              <StatusName status={mitglied.status}>{mitgliedName(mitglied)}</StatusName> kann sich
              danach nicht mehr anmelden und taucht in Auswahlen, Personenkreisen und
              Benachrichtigungen nicht mehr auf.
            </Text>
            <OffenesAbschnitt sub={mitglied.sub} />
          </Stack>
        </BestaetigenDialog>
      )}
    </>
  );
}
