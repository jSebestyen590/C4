import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconTrash } from '@tabler/icons-react';
import { ActionIcon } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { BaumKnoten, Gebinde } from '@c4/shared';
import { unwrap, useApi } from './api';
import { QUELLE_LABELS, VORGANG_TYP_LABELS } from './i18n';
import { mitgliedLink, mitgliedName } from './mitglied';
import { StatusName } from './StatusAnzeige';
import { fehlerAnzeigen, pruefen } from './warenApi';
import { zeileText, zeilenSortieren, zeitAnzeigen } from './warenAnzeige';
import type { WareEintrag } from './warenDaten';

const SCHRITT = 10;

/** Bookings (Vorgänge) of a Ware, newest first; with `bestand:buchen` an Vorgang can be deleted. */
export function WareHistorie({
  ware,
  lagerorte,
  gebinde,
  darfBuchen,
}: Readonly<{
  ware: WareEintrag;
  lagerorte: BaumKnoten[];
  gebinde: Gebinde[];
  darfBuchen: boolean;
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const [anzahl, setAnzahl] = useState(SCHRITT);
  const [loeschId, setLoeschId] = useState<string | null>(null);

  const daten = useQuery({
    queryKey: ['waren', ware.id, 'vorgaenge'],
    queryFn: async () => unwrap(await api.waren[':id'].vorgaenge.$get({ param: { id: ware.id } })),
  });

  const loeschen = useMutation({
    mutationFn: async (id: string) =>
      pruefen(await api.bestand.vorgaenge[':id'].$delete({ param: { id } })),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['waren'] });
      notifications.show({ color: 'green', message: 'Der Vorgang wurde gelöscht.' });
      setLoeschId(null);
    },
    onError: (e) => fehlerAnzeigen(e),
  });

  const weitere = daten.data?.find((v) => v.id === loeschId)?.weitereZeilen ?? 0;
  const liste = [...(daten.data ?? [])].sort((a, b) => b.zeitpunkt.localeCompare(a.zeitpunkt));

  return (
    <Stack>
      {daten.isPending && <Loader m="md" aria-label="Verlauf wird geladen" />}
      {daten.isError && <Alert color="red">Die Vorgänge konnten nicht geladen werden.</Alert>}
      {daten.data && liste.length === 0 && <Text c="dimmed">Noch keine Vorgänge.</Text>}
      {liste.slice(0, anzahl).map((v) => (
        <Paper key={v.id} withBorder p="sm" pr={darfBuchen ? 4 : 'sm'}>
          <Group gap={4} wrap="nowrap" align="flex-start">
            <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
              <Group gap="xs">
                <Text fw={600}>{VORGANG_TYP_LABELS[v.typ]}</Text>
                <Badge variant="light" color={v.quelle === 'inventur' ? 'grape' : 'gray'}>
                  {QUELLE_LABELS[v.quelle]}
                </Badge>
              </Group>
              <Text size="sm" c="dimmed">
                {zeitAnzeigen(v.zeitpunkt)} ·{' '}
                {v.ersteller ? (
                  <Anchor component={Link} to={mitgliedLink(v.ersteller)} underline="never" inherit>
                    <StatusName status={v.ersteller.status}>{mitgliedName(v.ersteller)}</StatusName>
                  </Anchor>
                ) : (
                  'Unbekannt'
                )}
              </Text>
              {v.kommentar && (
                <Text size="sm" fs="italic" style={{ overflowWrap: 'anywhere' }}>
                  {v.kommentar}
                </Text>
              )}
              {zeilenSortieren(v.zeilen, gebinde, lagerorte).map((z) => (
                <Text
                  key={z.id}
                  size="sm"
                  c={z.menge < 0 ? 'red' : undefined}
                  style={{ overflowWrap: 'anywhere' }}
                >
                  {zeileText(z, ware.mhdArt, gebinde, lagerorte)}
                </Text>
              ))}
            </Stack>
            {darfBuchen && (
              <ActionIcon
                variant="subtle"
                color="red"
                size={42}
                aria-label="Vorgang löschen"
                onClick={() => setLoeschId(v.id)}
              >
                <IconTrash size={20} />
              </ActionIcon>
            )}
          </Group>
        </Paper>
      ))}
      {liste.length > anzahl && (
        <Button variant="default" onClick={() => setAnzahl((a) => a + SCHRITT)}>
          Mehr anzeigen
        </Button>
      )}
      <Modal opened={loeschId !== null} onClose={() => setLoeschId(null)} title="Vorgang löschen">
        <Stack>
          {weitere > 0 && (
            <Text fw={600}>
              Dieser Vorgang enthält auch Buchungen für {weitere} weitere{' '}
              {weitere === 1 ? 'Zeile' : 'Zeilen'} anderer Waren, die mitgelöscht{' '}
              {weitere === 1 ? 'wird' : 'werden'}.
            </Text>
          )}
          <Text>
            Der Vorgang wird endgültig gelöscht und der Bestand entsprechend zurückgesetzt. Spätere
            Entnahmen werden dabei nicht neu berechnet (FIFO-Aufteilungen bleiben, wie sie gebucht
            wurden).
          </Text>
          <Group grow>
            <Button variant="default" onClick={() => setLoeschId(null)}>
              Abbrechen
            </Button>
            <Button
              color="red"
              loading={loeschen.isPending}
              onClick={() => loeschId && loeschen.mutate(loeschId)}
            >
              Löschen
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
