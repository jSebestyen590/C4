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
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { baumBauen, type BaumEintrag } from '@c4/shared';
import { AktionsMenue } from './AktionsMenue';
import { useAuth } from './auth';
import { BaumKnotenFormular, type BaumKnoten, type BaumTexte } from './BaumKnotenFormular';
import { LoeschenDialog } from './LoeschenDialog';
import { fehlerAnzeigen } from './warenApi';

/** The backend calls a tree needs; every call throws on a non-2xx answer. */
export interface BaumApi {
  /** All nodes including archived ones. */
  laden: () => Promise<BaumKnoten[]>;
  /** Creates (`id` null) or updates a node. */
  speichern: (id: string | null, json: { name: string; parentId: string | null }) => Promise<void>;
  archivieren: (id: string, archiviert: boolean) => Promise<void>;
  loeschen: (id: string) => Promise<void>;
}

export interface BaumKonfiguration {
  texte: BaumTexte;
  api: BaumApi;
  /** Query key of the node list. */
  queryKey: QueryKey;
  /** Query key prefix invalidated after every change. */
  invalidieren: QueryKey;
  /** Permission needed to change the tree. */
  recht: 'waren:verwalten' | 'inventar:verwalten';
  /** Validates the form input (`warengruppeSchema`, `kategorieSchema`). */
  schema: {
    safeParse: (v: unknown) => { success: boolean; error?: { issues: { message: string }[] } };
  };
}

type Formular = { parentId: string | null; knoten?: BaumKnoten };

function Zeilen({
  eintraege,
  texte,
  darfVerwalten,
  unterKnoten,
  bearbeiten,
  archivieren,
  loeschen,
}: Readonly<{
  eintraege: BaumEintrag<BaumKnoten>[];
  texte: BaumTexte;
  darfVerwalten: boolean;
  unterKnoten: (g: BaumKnoten) => void;
  bearbeiten: (g: BaumKnoten) => void;
  archivieren: (g: BaumKnoten) => void;
  loeschen: (g: BaumKnoten) => void;
}>) {
  return (
    <Stack gap="xs">
      {eintraege.map(({ node, kinder }) => (
        <Stack key={node.id} gap="xs">
          <Paper withBorder p={4} pl="sm" opacity={node.archiviert ? 0.6 : 1}>
            <Group gap={4} wrap="nowrap" mih={42}>
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
                    text: `${texte.unter} anlegen`,
                    icon: <IconPlus size={18} />,
                    onClick: () => unterKnoten(node),
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
                texte={texte}
                darfVerwalten={darfVerwalten}
                unterKnoten={unterKnoten}
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

/** Generic management of a tree of named nodes (sorted by name): Warengruppen, Kategorien. */
export function BaumVerwaltung({ konfig }: Readonly<{ konfig: BaumKonfiguration }>) {
  const { texte, api, queryKey, invalidieren, recht, schema } = konfig;
  const qc = useQueryClient();
  const darfVerwalten = useAuth().can(recht);
  const [archiv, setArchiv] = useState(false);
  const [formular, setFormular] = useState<Formular | null>(null);
  const [loeschZiel, setLoeschZiel] = useState<BaumKnoten | null>(null);

  const knoten = useQuery({ queryKey, queryFn: api.laden });
  const alle: BaumKnoten[] = useMemo(() => knoten.data ?? [], [knoten.data]);
  const baum = useMemo(
    () => baumBauen(archiv ? alle : alle.filter((g) => !g.archiviert)),
    [alle, archiv],
  );

  const neuLaden = () => qc.invalidateQueries({ queryKey: invalidieren });
  const archivieren = async (g: BaumKnoten, archiviert: boolean) => {
    await api.archivieren(g.id, archiviert);
    await neuLaden();
  };
  const archivMutation = useMutation({
    mutationFn: (g: BaumKnoten) => archivieren(g, !g.archiviert),
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
            {texte.singular} anlegen
          </Button>
        )}
      </Group>
      {knoten.isPending && <Loader m="md" aria-label={`${texte.plural} werden geladen`} />}
      {knoten.isError && (
        <Alert color="red">Die {texte.plural} konnten nicht geladen werden.</Alert>
      )}
      {knoten.data && baum.length === 0 && <Text c="dimmed">Keine {texte.plural} vorhanden.</Text>}
      <Zeilen
        eintraege={baum}
        texte={texte}
        darfVerwalten={darfVerwalten}
        unterKnoten={(g) => setFormular({ parentId: g.id })}
        bearbeiten={(g) => setFormular({ parentId: g.parentId, knoten: g })}
        archivieren={(g) => archivMutation.mutate(g)}
        loeschen={setLoeschZiel}
      />
      {formular && (
        <BaumKnotenFormular
          knoten={formular.knoten}
          parentId={formular.parentId}
          alle={alle}
          texte={texte}
          schema={schema}
          speichern={api.speichern}
          invalidieren={invalidieren}
          onClose={() => setFormular(null)}
        />
      )}
      {loeschZiel && (
        <LoeschenDialog
          titel={`${texte.singular} löschen`}
          name={loeschZiel.name}
          onClose={() => setLoeschZiel(null)}
          loeschen={async () => {
            await api.loeschen(loeschZiel.id);
            await neuLaden();
          }}
          archivieren={() => archivieren(loeschZiel, true)}
        />
      )}
    </Stack>
  );
}
