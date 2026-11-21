import { Alert, Badge, Button, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import {
  centAnzeigen,
  EINREICHUNG_STATUS_LABELS,
  type EinreichungDto,
  type EinreichungStatus,
} from '@c4/shared';
import { datumDe, einreichungPfad, useEinreichungen } from '../finanzenDaten';
import { KlickKarte } from '../KartenOderTabelle';

export const EINREICHUNG_FARBE: Record<EinreichungStatus, string> = {
  eingereicht: 'blue',
  verworfen: 'red',
  gebucht: 'green',
  erstattet: 'teal',
  storniert: 'gray',
};

export function EinreichungStatusBadge({ status }: Readonly<{ status: EinreichungStatus }>) {
  return (
    <Badge color={EINREICHUNG_FARBE[status]} variant="light" size="lg">
      {EINREICHUNG_STATUS_LABELS[status]}
    </Badge>
  );
}

/** One own submission as a card; the whole card opens the detail view. */
export function EinreichungKarte({ e }: Readonly<{ e: EinreichungDto }>) {
  return (
    <KlickKarte to={einreichungPfad(e.id)}>
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Text fw={600} truncate>
              {e.rechnungssteller ?? 'Ohne Rechnungssteller'}
            </Text>
            <Text c="dimmed" size="sm">
              {datumDe(e.belegdatum)}
            </Text>
          </Stack>
          <Text fw={600} style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            {e.betragCent === null ? '–' : centAnzeigen(e.betragCent)}
          </Text>
        </Group>
        <Group gap="xs">
          <EinreichungStatusBadge status={e.status} />
          {e.belegNummer && (
            <Text size="sm" c="dimmed">
              Beleg {e.belegNummer}
            </Text>
          )}
        </Group>
        {e.status === 'verworfen' && e.verworfenGrund && (
          <Text size="sm" c="red">
            Grund: {e.verworfenGrund}
          </Text>
        )}
      </Stack>
    </KlickKarte>
  );
}

/** "Meine Belege": the member's own submissions. */
export function MeineBelegePage() {
  const liste = useEinreichungen();
  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={2}>Meine Belege</Title>
      </Group>
      <Text c="dimmed" size="sm">
        Reiche Belege für Einkäufe aus eigener Tasche ein. Die Finanzer:innen buchen sie und
        erstatten dir den Betrag.
      </Text>
      <Button
        component={Link}
        to="/belege/einreichen"
        size="md"
        leftSection={<IconPlus size={20} />}
        fullWidth
      >
        Beleg einreichen
      </Button>
      {liste.isPending && <Loader />}
      {liste.isError && <Alert color="red">Deine Belege konnten nicht geladen werden.</Alert>}
      {liste.data?.length === 0 && <Text c="dimmed">Du hast noch keinen Beleg eingereicht.</Text>}
      <Stack gap="sm">
        {liste.data?.map((e) => (
          <EinreichungKarte key={e.id} e={e} />
        ))}
      </Stack>
    </Stack>
  );
}
