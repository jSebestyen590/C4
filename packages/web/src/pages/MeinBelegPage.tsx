import { Alert, Button, Group, Loader, Modal, Paper, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { centAnzeigen, type BelegDateiTyp } from '@c4/shared';
import { useApi } from '../api';
import { BelegVorschau } from '../BelegDatei';
import { datumDe, finanzenKeys, jsonOderFehler, useEinreichung } from '../finanzenDaten';
import { fehlerText } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';
import { EinreichungStatusBadge } from './MeineBelegePage';

/** Detail of an own submission: data, file and "Zurückziehen" while it is still open. */
export function MeinBelegPage() {
  const { id } = useParams();
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const daten = useEinreichung(id);
  const [bestaetigen, setBestaetigen] = useState(false);

  const zurueckziehen = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () =>
      jsonOderFehler<{ ok: boolean }>(
        await api.finanzen.einreichungen[':id'].$delete({ param: { id: id as string } }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: finanzenKeys.alle });
      notifications.show({ color: 'green', message: 'Der Beleg wurde zurückgezogen.' });
      void navigate('/belege');
    },
  });

  const e = daten.data;
  return (
    <Stack gap="md">
      <ZurueckLink to="/belege">Meine Belege</ZurueckLink>
      {daten.isPending && <Loader />}
      {daten.isError && <Alert color="red">Der Beleg konnte nicht geladen werden.</Alert>}
      {e && (
        <>
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Title order={2} style={{ minWidth: 0 }}>
              {e.rechnungssteller ?? 'Beleg'}
            </Title>
            <EinreichungStatusBadge status={e.status} />
          </Group>
          <Paper withBorder p="md">
            <Stack gap={4}>
              <Text>
                <b>Datum:</b> {datumDe(e.belegdatum)}
              </Text>
              <Text>
                <b>Betrag:</b> {e.betragCent === null ? '–' : centAnzeigen(e.betragCent)}
              </Text>
              {e.belegNummer && (
                <Text>
                  <b>Belegnummer:</b> {e.belegNummer}
                </Text>
              )}
              {e.notiz && (
                <Text>
                  <b>Notiz:</b> {e.notiz}
                </Text>
              )}
              <Text size="sm" c="dimmed">
                Eingereicht am {datumDe(e.eingereichtAm)}
              </Text>
            </Stack>
          </Paper>
          {e.status === 'verworfen' && e.verworfenGrund && (
            <Alert color="red" title="Verworfen">
              {e.verworfenGrund}
            </Alert>
          )}
          {e.dateiUrl && e.dateiTyp ? (
            <BelegVorschau
              url={e.dateiUrl}
              typ={e.dateiTyp as BelegDateiTyp}
              name={e.dateiName ?? 'Beleg'}
            />
          ) : (
            <Text c="dimmed">Keine Datei vorhanden.</Text>
          )}
          {zurueckziehen.error && (
            <Alert color="red">
              {fehlerText(zurueckziehen.error, 'Der Beleg konnte nicht zurückgezogen werden.')}
            </Alert>
          )}
          {e.zurueckziehbar && (
            <Button
              size="md"
              color="red"
              variant="light"
              fullWidth
              onClick={() => setBestaetigen(true)}
            >
              Zurückziehen
            </Button>
          )}
          <Modal
            opened={bestaetigen}
            onClose={() => setBestaetigen(false)}
            title="Beleg zurückziehen?"
          >
            <Stack>
              <Text>Der Beleg wird gelöscht. Du kannst ihn danach neu einreichen.</Text>
              <Button
                size="md"
                color="red"
                loading={zurueckziehen.isPending}
                onClick={() =>
                  zurueckziehen.mutate(undefined, { onSettled: () => setBestaetigen(false) })
                }
              >
                Zurückziehen
              </Button>
              <Button size="md" variant="default" onClick={() => setBestaetigen(false)}>
                Abbrechen
              </Button>
            </Stack>
          </Modal>
        </>
      )}
    </Stack>
  );
}
