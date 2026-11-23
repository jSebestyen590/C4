import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { RechnungsempfaengerDto } from '@c4/shared';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { jsonOderFehler, useRechnungsempfaenger } from '../finanzenDaten';
import { HILFE } from '../finanzenHilfe';
import { InfoHinweis } from '../InfoHinweis';
import { RechnungsempfaengerDialog } from '../RechnungsempfaengerDialog';
import { fehlerText } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

/** Stammdaten of the external Rechnungsempfänger: add, edit and archive. */
export function FinanzenRechnungsempfaengerPage() {
  const api = useApi();
  const qc = useQueryClient();
  const { can } = useAuth();
  const darf = can('finanzen:buchen');
  const [archiviert, setArchiviert] = useState(false);
  const liste = useRechnungsempfaenger(archiviert);
  const [dialog, setDialog] = useState<{ empfaenger?: RechnungsempfaengerDto } | null>(null);

  const archivieren = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (a: { id: string; archiviert: boolean }) =>
      jsonOderFehler(
        await api.finanzen.rechnungsempfaenger[':id'].$put({
          param: { id: a.id },
          json: { archiviert: a.archiviert },
        }),
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['finanzen', 'rechnungsempfaenger'] }),
  });

  return (
    <Stack maw={800}>
      <ZurueckLink to="/finanzen/rechnungen">Rechnungen</ZurueckLink>
      <Group justify="space-between" align="flex-end">
        <Group gap={4}>
          <Title order={2}>Rechnungsempfänger</Title>
          <InfoHinweis feld="Rechnungsempfänger" text={HILFE.rechnungen.empfaenger} />
        </Group>
        {darf && (
          <Button leftSection={<IconPlus size={18} />} onClick={() => setDialog({})}>
            Neuer Empfänger
          </Button>
        )}
      </Group>
      <Text size="sm" c="dimmed">
        Externe Empfänger von Rechnungen. Mitglieder wählst du direkt in der Rechnung.
      </Text>
      {archivieren.isError && (
        <Alert color="red">
          {fehlerText(archivieren.error, 'Das Speichern ist fehlgeschlagen.')}
        </Alert>
      )}
      <Switch
        label="Archivierte anzeigen"
        checked={archiviert}
        onChange={(e) => setArchiviert(e.currentTarget.checked)}
      />
      {liste.isPending && <Loader m="md" aria-label="Wird geladen" />}
      {liste.isError && <Alert color="red">Die Liste konnte nicht geladen werden.</Alert>}
      {liste.data && liste.data.length === 0 && <Text c="dimmed">Noch keine Empfänger.</Text>}
      {liste.data?.map((e) => (
        <Paper key={e.id} withBorder p="md" opacity={e.archiviert ? 0.7 : 1}>
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Stack gap={2} style={{ minWidth: 0 }}>
              <Group gap="xs">
                <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                  {e.name}
                </Text>
                {e.archiviert && <Badge color="gray">Archiviert</Badge>}
              </Group>
              <Text
                size="sm"
                c="dimmed"
                style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}
              >
                {e.anschrift}
              </Text>
              {e.email && (
                <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                  {e.email}
                </Text>
              )}
              {e.ustId && (
                <Text size="sm" c="dimmed">
                  USt-IdNr.: {e.ustId}
                </Text>
              )}
            </Stack>
            {darf && (
              <Stack gap="xs" align="stretch">
                <Button
                  variant="default"
                  leftSection={<IconPencil size={18} />}
                  onClick={() => setDialog({ empfaenger: e })}
                  aria-label={`${e.name} bearbeiten`}
                >
                  Bearbeiten
                </Button>
                <Button
                  variant="default"
                  loading={archivieren.isPending && archivieren.variables?.id === e.id}
                  onClick={() => archivieren.mutate({ id: e.id, archiviert: !e.archiviert })}
                >
                  {e.archiviert ? 'Wiederherstellen' : 'Archivieren'}
                </Button>
              </Stack>
            )}
          </Group>
        </Paper>
      ))}
      {dialog && (
        <RechnungsempfaengerDialog
          empfaenger={dialog.empfaenger}
          onGespeichert={() => undefined}
          onClose={() => setDialog(null)}
        />
      )}
    </Stack>
  );
}
