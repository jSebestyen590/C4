import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Switch,
  Text,
} from '@mantine/core';
import { IconArchive, IconArchiveOff, IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { baumBauen, type BaumEintrag } from '@c4/shared';
import { AktionsMenue } from './AktionsMenue';
import { unwrap, useApi } from './api';
import { useAuth } from './auth';
import { LoeschenDialog } from './LoeschenDialog';
import { WarengruppeFormular, type WarengruppeKnoten } from './WarengruppeFormular';
import { fehlerAnzeigen, pruefen } from './warenApi';

type Formular = { parentId: string | null; warengruppe?: WarengruppeKnoten };

function Zeilen({
  eintraege,
  darfVerwalten,
  unterGruppe,
  bearbeiten,
  archivieren,
  loeschen,
}: Readonly<{
  eintraege: BaumEintrag<WarengruppeKnoten>[];
  darfVerwalten: boolean;
  unterGruppe: (g: WarengruppeKnoten) => void;
  bearbeiten: (g: WarengruppeKnoten) => void;
  archivieren: (g: WarengruppeKnoten) => void;
  loeschen: (g: WarengruppeKnoten) => void;
}>) {
  return (
    <Stack gap="xs">
      {eintraege.map(({ node, kinder }) => (
        <Stack key={node.id} gap="xs">
          <Paper withBorder p={4} pl="sm" opacity={node.archiviert ? 0.6 : 1}>
            <Group gap={4} wrap="nowrap" mih={44}>
              <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
                <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                  {node.name}
                </Text>
                {node.archiviert && (
                  <Badge color="gray" variant="light">
                    Archiviert
                  </Badge>
                )}
              </Group>
              <AktionsMenue
                label={`Aktionen für ${node.name}`}
                aktionen={[
                  {
                    text: 'Untergruppe anlegen',
                    icon: <IconPlus size={18} />,
                    onClick: () => unterGruppe(node),
                    sichtbar: darfVerwalten && !node.archiviert,
                  },
                  {
                    text: 'Bearbeiten',
                    icon: <IconEdit size={18} />,
                    onClick: () => bearbeiten(node),
                    sichtbar: darfVerwalten,
                  },
                  {
                    text: node.archiviert ? 'Wiederherstellen' : 'Archivieren',
                    icon: node.archiviert ? (
                      <IconArchiveOff size={18} />
                    ) : (
                      <IconArchive size={18} />
                    ),
                    onClick: () => archivieren(node),
                    sichtbar: darfVerwalten,
                    trenner: true,
                  },
                  {
                    text: 'Löschen',
                    icon: <IconTrash size={18} />,
                    color: 'red',
                    onClick: () => loeschen(node),
                    sichtbar: darfVerwalten,
                  },
                ]}
              />
            </Group>
          </Paper>
          {kinder.length > 0 && (
            <Box
              ml={10}
              pl={8}
              style={{ borderLeft: '2px solid var(--mantine-color-default-border)' }}
            >
              <Zeilen
                eintraege={kinder}
                darfVerwalten={darfVerwalten}
                unterGruppe={unterGruppe}
                bearbeiten={bearbeiten}
                archivieren={archivieren}
                loeschen={loeschen}
              />
            </Box>
          )}
        </Stack>
      ))}
    </Stack>
  );
}

/** Tree of Warengruppen (sorted by name). */
export function WarengruppenTab() {
  const api = useApi();
  const qc = useQueryClient();
  const darfVerwalten = useAuth().can('waren:verwalten');
  const [archiv, setArchiv] = useState(false);
  const [formular, setFormular] = useState<Formular | null>(null);
  const [loeschZiel, setLoeschZiel] = useState<WarengruppeKnoten | null>(null);

  const gruppen = useQuery({
    queryKey: ['warengruppen', 'alle'],
    queryFn: async () => unwrap(await api.warengruppen.$get({ query: { archiv: '1' } })),
  });
  const alle: WarengruppeKnoten[] = useMemo(() => gruppen.data ?? [], [gruppen.data]);
  const baum = useMemo(
    () => baumBauen(archiv ? alle : alle.filter((g) => !g.archiviert)),
    [alle, archiv],
  );

  const neuLaden = () => qc.invalidateQueries({ queryKey: ['warengruppen'] });
  const archivieren = async (g: WarengruppeKnoten, archiviert: boolean) => {
    await pruefen(
      await api.warengruppen[':id'].archiv.$put({ param: { id: g.id }, json: { archiviert } }),
    );
    await neuLaden();
  };
  const archivMutation = useMutation({
    mutationFn: (g: WarengruppeKnoten) => archivieren(g, !g.archiviert),
    onError: (e) => fehlerAnzeigen(e),
  });

  return (
    <Stack>
      <Group justify="space-between" wrap="wrap">
        <Switch
          label="Archivierte anzeigen"
          checked={archiv}
          onChange={(e) => setArchiv(e.currentTarget.checked)}
        />
        {darfVerwalten && (
          <Button
            leftSection={<IconPlus size={18} />}
            onClick={() => setFormular({ parentId: null })}
          >
            Warengruppe anlegen
          </Button>
        )}
      </Group>
      {gruppen.isPending && <Loader m="md" aria-label="Warengruppen werden geladen" />}
      {gruppen.isError && <Alert color="red">Die Warengruppen konnten nicht geladen werden.</Alert>}
      {gruppen.data && baum.length === 0 && <Text c="dimmed">Keine Warengruppen vorhanden.</Text>}
      <Zeilen
        eintraege={baum}
        darfVerwalten={darfVerwalten}
        unterGruppe={(g) => setFormular({ parentId: g.id })}
        bearbeiten={(g) => setFormular({ parentId: g.parentId, warengruppe: g })}
        archivieren={(g) => archivMutation.mutate(g)}
        loeschen={setLoeschZiel}
      />
      {formular && (
        <WarengruppeFormular
          warengruppe={formular.warengruppe}
          parentId={formular.parentId}
          alle={alle}
          onClose={() => setFormular(null)}
        />
      )}
      {loeschZiel && (
        <LoeschenDialog
          titel="Warengruppe löschen"
          name={loeschZiel.name}
          onClose={() => setLoeschZiel(null)}
          loeschen={async () => {
            await pruefen(await api.warengruppen[':id'].$delete({ param: { id: loeschZiel.id } }));
            await neuLaden();
          }}
          archivieren={() => archivieren(loeschZiel, true)}
        />
      )}
    </Stack>
  );
}
