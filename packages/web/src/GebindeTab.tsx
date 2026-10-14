import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
} from '@mantine/core';
import { IconArchive, IconArchiveOff, IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { centAnzeigen, gesamtPfandCent } from '@c4/shared';
import { AktionsMenue } from './AktionsMenue';
import { unwrap, useApi } from './api';
import { useAuth } from './auth';
import { GebindeFormular, type GebindeEintrag } from './GebindeFormular';
import { LoeschenDialog } from './LoeschenDialog';
import { fehlerAnzeigen, pruefen } from './warenApi';

/** List of Gebinde: cards on phones, a table from `sm`. */
export function GebindeTab() {
  const api = useApi();
  const qc = useQueryClient();
  const darfVerwalten = useAuth().can('waren:verwalten');
  const [archiv, setArchiv] = useState(false);
  const [formular, setFormular] = useState<{ gebinde?: GebindeEintrag } | null>(null);
  const [loeschZiel, setLoeschZiel] = useState<GebindeEintrag | null>(null);

  const daten = useQuery({
    queryKey: ['gebinde', 'alle'],
    queryFn: async () => unwrap(await api.gebinde.$get({ query: { archiv: '1' } })),
  });
  const alle: GebindeEintrag[] = useMemo(() => daten.data ?? [], [daten.data]);
  const sichtbar = useMemo(
    () =>
      [...(archiv ? alle : alle.filter((g) => !g.archiviert))].sort((a, b) =>
        a.name.localeCompare(b.name, 'de'),
      ),
    [alle, archiv],
  );
  const index = useMemo(() => new Map(alle.map((g) => [g.id, g])), [alle]);

  const neuLaden = () => qc.invalidateQueries({ queryKey: ['gebinde'] });
  const archivieren = async (g: GebindeEintrag, archiviert: boolean) => {
    await pruefen(
      await api.gebinde[':id'].archiv.$put({ param: { id: g.id }, json: { archiviert } }),
    );
    await neuLaden();
  };
  const archivMutation = useMutation({
    mutationFn: (g: GebindeEintrag) => archivieren(g, !g.archiviert),
    onError: (e) => fehlerAnzeigen(e),
  });

  const unterText = (g: GebindeEintrag) =>
    g.unterGebindeId && g.unterAnzahl
      ? `${g.unterAnzahl} × ${index.get(g.unterGebindeId)?.name ?? '?'}`
      : '–';

  const menue = (g: GebindeEintrag) => (
    <AktionsMenue
      label={`Aktionen für ${g.name}`}
      aktionen={[
        {
          text: 'Bearbeiten',
          icon: <IconEdit size={18} />,
          onClick: () => setFormular({ gebinde: g }),
          sichtbar: darfVerwalten,
        },
        {
          text: g.archiviert ? 'Wiederherstellen' : 'Archivieren',
          icon: g.archiviert ? <IconArchiveOff size={18} /> : <IconArchive size={18} />,
          onClick: () => archivMutation.mutate(g),
          sichtbar: darfVerwalten,
          trenner: true,
        },
        {
          text: 'Löschen',
          icon: <IconTrash size={18} />,
          color: 'red',
          onClick: () => setLoeschZiel(g),
          sichtbar: darfVerwalten,
        },
      ]}
    />
  );

  const archiviertBadge = (g: GebindeEintrag) =>
    g.archiviert && (
      <Badge color="gray" variant="light">
        Archiviert
      </Badge>
    );

  return (
    <Stack>
      <Group justify="space-between" wrap="wrap">
        <Switch
          label="Archivierte anzeigen"
          checked={archiv}
          onChange={(e) => setArchiv(e.currentTarget.checked)}
        />
        {darfVerwalten && (
          <Button leftSection={<IconPlus size={18} />} onClick={() => setFormular({})}>
            Gebinde anlegen
          </Button>
        )}
      </Group>
      {daten.isPending && <Loader m="md" aria-label="Gebinde werden geladen" />}
      {daten.isError && <Alert color="red">Die Gebinde konnten nicht geladen werden.</Alert>}
      {daten.data && sichtbar.length === 0 && <Text c="dimmed">Keine Gebinde vorhanden.</Text>}

      <SimpleGrid cols={1} hiddenFrom="sm">
        {sichtbar.map((g) => (
          <Paper key={g.id} withBorder p="sm" pr={4} opacity={g.archiviert ? 0.6 : 1}>
            <Group gap={4} wrap="nowrap" align="flex-start">
              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                <Group gap="xs">
                  <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                    {g.name}
                  </Text>
                  {archiviertBadge(g)}
                </Group>
                <Text size="sm">Pfand: {centAnzeigen(g.pfandCent)}</Text>
                {g.unterGebindeId && (
                  <>
                    <Text size="sm">Enthält: {unterText(g)}</Text>
                    <Text size="sm">Gesamtpfand: {centAnzeigen(gesamtPfandCent(g, alle))}</Text>
                  </>
                )}
              </Stack>
              {menue(g)}
            </Group>
          </Paper>
        ))}
      </SimpleGrid>

      {sichtbar.length > 0 && (
        <Table.ScrollContainer minWidth={620} visibleFrom="sm">
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Pfand</Table.Th>
                <Table.Th>Untergebinde</Table.Th>
                <Table.Th>Gesamtpfand</Table.Th>
                <Table.Th w={60} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sichtbar.map((g) => (
                <Table.Tr key={g.id} opacity={g.archiviert ? 0.6 : 1}>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <Text>{g.name}</Text>
                      {archiviertBadge(g)}
                    </Group>
                  </Table.Td>
                  <Table.Td>{centAnzeigen(g.pfandCent)}</Table.Td>
                  <Table.Td>{unterText(g)}</Table.Td>
                  <Table.Td>{centAnzeigen(gesamtPfandCent(g, alle))}</Table.Td>
                  <Table.Td>{menue(g)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      {formular && (
        <GebindeFormular gebinde={formular.gebinde} alle={alle} onClose={() => setFormular(null)} />
      )}
      {loeschZiel && (
        <LoeschenDialog
          titel="Gebinde löschen"
          name={loeschZiel.name}
          onClose={() => setLoeschZiel(null)}
          loeschen={async () => {
            await pruefen(await api.gebinde[':id'].$delete({ param: { id: loeschZiel.id } }));
            await neuLaden();
          }}
          archivieren={() => archivieren(loeschZiel, true)}
        />
      )}
    </Stack>
  );
}
