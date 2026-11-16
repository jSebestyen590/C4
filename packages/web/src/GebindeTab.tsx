import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Switch,
  Table,
  Text,
} from '@mantine/core';
import { IconArchive, IconArchiveOff, IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  centAnzeigen,
  gebindeBezeichnung,
  gebindeKurz,
  gebindeSortieren,
  pfandGesamtCent,
} from '@c4/shared';
import { AktionsMenue } from './AktionsMenue';
import { unwrap, useApi } from './api';
import { useAuth } from './auth';
import { GebindeFormular, type GebindeEintrag } from './GebindeFormular';
import { LoeschenDialog } from './LoeschenDialog';
import { fehlerAnzeigen, pruefen } from './warenApi';
import { KartenOderTabelle } from './KartenOderTabelle';

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
    () => gebindeSortieren(archiv ? alle : alle.filter((g) => !g.archiviert), alle),
    [alle, archiv],
  );
  const titel = (g: GebindeEintrag) => gebindeBezeichnung(g, alle);
  const pfandText = (cent: number | null) => (cent === null ? 'kein Pfand' : centAnzeigen(cent));

  const neuLaden = () => qc.invalidateQueries({ queryKey: ['gebinde'] });
  const archivieren = async (g: GebindeEintrag, archiviert: boolean) => {
    await pruefen(
      await api.gebinde[':id'].archiv.$put({ param: { id: g.id }, json: { archiviert } }),
    );
    await neuLaden();
  };
  const archivMutation = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: (g: GebindeEintrag) => archivieren(g, !g.archiviert),
    onError: (e) => fehlerAnzeigen(e),
  });

  const menue = (g: GebindeEintrag) => (
    <AktionsMenue
      label={`Aktionen für ${titel(g)}`}
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

      <KartenOderTabelle
        zeilen={sichtbar}
        zeilenKey={(g) => g.id}
        minWidth={620}
        karte={(g) => (
          <Paper withBorder p="sm" pr={4} opacity={g.archiviert ? 0.6 : 1}>
            <Group gap={4} wrap="nowrap" align="flex-start">
              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                <Group gap="xs">
                  <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                    {titel(g)}
                  </Text>
                  {archiviertBadge(g)}
                </Group>
                <Text size="sm">Verpackung: {gebindeKurz(g)}</Text>
                <Text size="sm">Pfand: {pfandText(g.pfandCent)}</Text>
                {g.unterGebindeId && (
                  <Text size="sm">Gesamtpfand: {pfandText(pfandGesamtCent(g, alle))}</Text>
                )}
              </Stack>
              {menue(g)}
            </Group>
          </Paper>
        )}
        kopf={
          <Table.Tr>
            <Table.Th>Gebinde</Table.Th>
            <Table.Th>Verpackung</Table.Th>
            <Table.Th>Pfand</Table.Th>
            <Table.Th>Gesamtpfand</Table.Th>
            <Table.Th w={60} />
          </Table.Tr>
        }
        zeile={(g) => (
          <Table.Tr opacity={g.archiviert ? 0.6 : 1}>
            <Table.Td>
              <Group gap="xs" wrap="nowrap">
                <Text>{titel(g)}</Text>
                {archiviertBadge(g)}
              </Group>
            </Table.Td>
            <Table.Td>{gebindeKurz(g)}</Table.Td>
            <Table.Td>{pfandText(g.pfandCent)}</Table.Td>
            <Table.Td>{g.unterGebindeId ? pfandText(pfandGesamtCent(g, alle)) : '–'}</Table.Td>
            <Table.Td>{menue(g)}</Table.Td>
          </Table.Tr>
        )}
      />

      {formular && (
        <GebindeFormular gebinde={formular.gebinde} alle={alle} onClose={() => setFormular(null)} />
      )}
      {loeschZiel && (
        <LoeschenDialog
          titel="Gebinde löschen"
          name={titel(loeschZiel)}
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
