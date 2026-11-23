import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconCheck, IconPencil, IconX } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { RechnungsstellerDto } from '@c4/shared';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { jsonOderFehler, useRechnungssteller } from '../finanzenDaten';
import { HILFE } from '../finanzenHilfe';
import { InfoHinweis } from '../InfoHinweis';
import { fehlerText } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

/** Stammdaten of the Rechnungssteller: add, rename and archive inline. */
export function FinanzenRechnungsstellerPage() {
  const api = useApi();
  const qc = useQueryClient();
  const { can } = useAuth();
  const darf = can('finanzen:buchen');
  const [archiviert, setArchiviert] = useState(false);
  const liste = useRechnungssteller(archiviert);
  const [neu, setNeu] = useState('');
  const [bearbeiten, setBearbeiten] = useState<{ id: string; name: string } | null>(null);

  const speichern = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (a: { id?: string; name?: string; archiviert?: boolean }) => {
      if (a.id)
        return jsonOderFehler(
          await api.finanzen.rechnungssteller[':id'].$patch({
            param: { id: a.id },
            json: { name: a.name, archiviert: a.archiviert },
          }),
        );
      return jsonOderFehler(await api.finanzen.rechnungssteller.$post({ json: { name: a.name! } }));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['finanzen', 'rechnungssteller'] });
      setNeu('');
      setBearbeiten(null);
    },
  });
  const anlegen = () => neu.trim() && speichern.mutate({ name: neu.trim() });
  const zeile = (r: RechnungsstellerDto) =>
    bearbeiten?.id === r.id ? (
      <Group key={r.id} wrap="nowrap" align="flex-start">
        <TextInput
          style={{ flex: 1 }}
          aria-label="Name"
          value={bearbeiten.name}
          maxLength={120}
          onChange={(e) => setBearbeiten({ id: r.id, name: e.currentTarget.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && bearbeiten.name.trim())
              speichern.mutate({ id: r.id, name: bearbeiten.name.trim() });
            if (e.key === 'Escape') setBearbeiten(null);
          }}
          data-autofocus
        />
        <ActionIcon
          size={42}
          aria-label="Speichern"
          onClick={() => speichern.mutate({ id: r.id, name: bearbeiten.name.trim() })}
          disabled={bearbeiten.name.trim() === ''}
        >
          <IconCheck size={20} />
        </ActionIcon>
        <ActionIcon
          size={42}
          variant="default"
          aria-label="Abbrechen"
          onClick={() => setBearbeiten(null)}
        >
          <IconX size={20} />
        </ActionIcon>
      </Group>
    ) : (
      <Group key={r.id} justify="space-between" wrap="nowrap">
        <Group gap="xs" style={{ minWidth: 0 }}>
          <Text style={{ overflowWrap: 'anywhere' }} c={r.archiviert ? 'dimmed' : undefined}>
            {r.name}
          </Text>
          {r.archiviert && <Badge color="gray">Archiviert</Badge>}
        </Group>
        {darf && (
          <Group gap="xs" wrap="nowrap">
            <ActionIcon
              size={42}
              variant="default"
              aria-label={`${r.name} umbenennen`}
              onClick={() => setBearbeiten({ id: r.id, name: r.name })}
            >
              <IconPencil size={20} />
            </ActionIcon>
            <Button
              variant="default"
              onClick={() => speichern.mutate({ id: r.id, archiviert: !r.archiviert })}
            >
              {r.archiviert ? 'Wiederherstellen' : 'Archivieren'}
            </Button>
          </Group>
        )}
      </Group>
    );

  return (
    <Stack maw={700}>
      <ZurueckLink to="/finanzen/belege">Belege</ZurueckLink>
      <Group gap={4}>
        <Title order={2}>Rechnungssteller</Title>
        <InfoHinweis feld="Rechnungssteller" text={HILFE.belege.rechnungssteller} />
      </Group>
      {darf && (
        <Group align="flex-start" wrap="nowrap">
          <TextInput
            style={{ flex: 1 }}
            aria-label="Neuer Rechnungssteller"
            placeholder="Name des neuen Rechnungsstellers"
            value={neu}
            maxLength={120}
            onChange={(e) => setNeu(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && anlegen()}
          />
          <Button onClick={anlegen} loading={speichern.isPending} disabled={neu.trim() === ''}>
            Anlegen
          </Button>
        </Group>
      )}
      {speichern.isError && (
        <Alert color="red">
          {fehlerText(speichern.error, 'Das Speichern ist fehlgeschlagen.')}
        </Alert>
      )}
      <Switch
        label="Archivierte anzeigen"
        checked={archiviert}
        onChange={(e) => setArchiviert(e.currentTarget.checked)}
      />
      {liste.isPending && <Loader m="md" aria-label="Wird geladen" />}
      {liste.isError && <Alert color="red">Die Liste konnte nicht geladen werden.</Alert>}
      {liste.data && liste.data.length === 0 && (
        <Text c="dimmed">Noch keine Rechnungssteller.</Text>
      )}
      {liste.data && liste.data.length > 0 && (
        <Paper withBorder p="md">
          <Stack gap="sm">{liste.data.map(zeile)}</Stack>
        </Paper>
      )}
    </Stack>
  );
}
