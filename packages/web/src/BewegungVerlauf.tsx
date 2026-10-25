import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconMinus, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useApi } from './api';
import { BewegungModal } from './BewegungModal';
import { GRUND_LABELS, label } from './i18n';
import { datumText } from './inventarAnzeige';
import {
  INVENTAR_KEY,
  useBewegungen,
  type BewegungEintrag,
  type GegenstandEintrag,
  type IfcoEintrag,
} from './inventarDaten';
import type { LagerKnoten } from './LagerBaum';
import { mitgliedName } from './mitglied';
import { StatusName } from './StatusAnzeige';
import { fehlerText, pruefen } from './warenApi';

/**
 * History of a Gegenstand: Zugänge and Abgänge, newest first (`+7 gekauft`, `−3 verloren`), with
 * "Zugang" / "Abgang" and deleting a wrong booking for `inventar:verwalten`.
 */
export function BewegungVerlauf({
  gegenstand,
  darfVerwalten,
  lagerorte,
  ifcos,
}: Readonly<{
  gegenstand: GegenstandEintrag;
  darfVerwalten: boolean;
  lagerorte: LagerKnoten[];
  ifcos: IfcoEintrag[];
}>) {
  const api = useApi();
  const qc = useQueryClient();
  const { bewegungen, laedt, fehler } = useBewegungen(gegenstand.id);
  const [buchen, setBuchen] = useState<'zugang' | 'abgang' | null>(null);
  const [loeschen, setLoeschen] = useState<BewegungEintrag | null>(null);

  const loeschenMutation = useMutation({
    mutationFn: async (b: BewegungEintrag) =>
      pruefen(
        await api.inventar.gegenstaende[':id'].bewegungen[':bewegungId'].$delete({
          param: { id: gegenstand.id, bewegungId: b.id },
        }),
      ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: INVENTAR_KEY });
      setLoeschen(null);
    },
  });

  return (
    <>
      <Title order={3}>Verlauf</Title>
      {darfVerwalten && !gegenstand.archiviert && (
        <SimpleGrid cols={2}>
          <Button
            variant="light"
            color="green"
            leftSection={<IconPlus size={18} />}
            onClick={() => setBuchen('zugang')}
          >
            Zugang
          </Button>
          <Button
            variant="light"
            color="red"
            leftSection={<IconMinus size={18} />}
            disabled={gegenstand.anzahl === 0}
            onClick={() => setBuchen('abgang')}
          >
            Abgang
          </Button>
        </SimpleGrid>
      )}
      {laedt && <Loader size="sm" aria-label="Verlauf wird geladen" />}
      {fehler && <Alert color="red">Der Verlauf konnte nicht geladen werden.</Alert>}
      {!laedt && !fehler && bewegungen.length === 0 && (
        <Text c="dimmed">Noch keine Buchungen.</Text>
      )}
      <Stack gap="xs">
        {bewegungen.map((b) => (
          <Paper key={b.id} withBorder p="sm">
            <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
              <Stack gap={2} style={{ minWidth: 0 }}>
                <Text
                  fw={600}
                  c={b.art === 'zugang' ? 'green' : 'red'}
                  style={{ overflowWrap: 'anywhere' }}
                >
                  {b.art === 'zugang' ? '+' : '−'}
                  {b.anzahl} {label(GRUND_LABELS, b.grund)}
                </Text>
                <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                  {datumText(b.datum)}
                  {b.ort && ` · ${b.art === 'zugang' ? 'nach' : 'aus'} ${b.ort}`}
                  {b.ersteller && (
                    <>
                      {' · '}
                      <StatusName status={b.ersteller.status}>
                        {mitgliedName(b.ersteller)}
                      </StatusName>
                    </>
                  )}
                </Text>
                {b.kommentar && (
                  <Text size="sm" style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                    {b.kommentar}
                  </Text>
                )}
              </Stack>
              {darfVerwalten && (
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size={44}
                  aria-label="Buchung löschen"
                  onClick={() => setLoeschen(b)}
                >
                  <IconTrash size={20} />
                </ActionIcon>
              )}
            </Group>
          </Paper>
        ))}
      </Stack>

      {buchen && (
        <BewegungModal
          gegenstand={gegenstand}
          art={buchen}
          lagerorte={lagerorte}
          ifcos={ifcos}
          onClose={() => setBuchen(null)}
        />
      )}
      <Modal opened={loeschen !== null} onClose={() => setLoeschen(null)} title="Buchung löschen">
        {loeschen && (
          <Stack>
            <Text>
              „{loeschen.art === 'zugang' ? '+' : '−'}
              {loeschen.anzahl} {label(GRUND_LABELS, loeschen.grund)}“ vom{' '}
              {datumText(loeschen.datum)} löschen?{' '}
              {loeschen.art === 'zugang'
                ? 'Die Anzahl sinkt entsprechend.'
                : 'Die Stück zählen danach wieder mit, aber ohne Platz.'}
            </Text>
            {loeschenMutation.isError && (
              <Alert color="red">
                {fehlerText(loeschenMutation.error, 'Löschen fehlgeschlagen.')}
              </Alert>
            )}
            <Button
              color="red"
              loading={loeschenMutation.isPending}
              onClick={() => loeschenMutation.mutate(loeschen)}
            >
              Löschen
            </Button>
          </Stack>
        )}
      </Modal>
    </>
  );
}
