import { Alert, Button, Group, Loader, Stack, Switch, Text, Title } from '@mantine/core';
import { IconPlus, IconTags } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { baumBauen, pfad } from '@c4/shared';
import { unwrap, useApi } from '../api';
import { useAuth } from '../auth';
import { LagerBaum, type LagerKnoten, type LagerKontext } from '../LagerBaum';
import { LagerortFormular } from '../LagerortFormular';
import { LoeschenDialog } from '../LoeschenDialog';
import { WarenlisteModal } from '../WarenlisteModal';
import { fehlerAnzeigen, pruefen } from '../warenApi';

type Formular = { parentId: string | null; lagerort?: LagerKnoten };

/** The Lagerort tree: browse, maintain (waren:verwalten) and start inventories (bestand:buchen). */
export function LagerPage() {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = useAuth();
  const darfVerwalten = can('waren:verwalten');
  const darfBuchen = can('bestand:buchen');
  const [archiv, setArchiv] = useState(false);
  const [eingeklappt, setEingeklappt] = useState<Set<string>>(new Set());
  const [formular, setFormular] = useState<Formular | null>(null);
  const [warenliste, setWarenliste] = useState<LagerKnoten | null>(null);
  const [loeschZiel, setLoeschZiel] = useState<LagerKnoten | null>(null);

  // Always load everything: reordering must name all siblings, archived ones included.
  const lagerorte = useQuery({
    queryKey: ['lagerorte', 'alle'],
    queryFn: async () => unwrap(await api.lagerorte.$get({ query: { archiv: '1' } })),
  });
  const inventuren = useQuery({
    queryKey: ['inventuren', 'offen'],
    queryFn: async () => unwrap(await api.inventuren.$get({ query: { status: 'offen' } })),
  });

  const alle: LagerKnoten[] = useMemo(() => lagerorte.data ?? [], [lagerorte.data]);
  const sichtbar = useMemo(
    () => (archiv ? alle : alle.filter((l) => !l.archiviert)),
    [alle, archiv],
  );
  const baum = useMemo(() => baumBauen(sichtbar), [sichtbar]);
  const offeneInventuren = useMemo(
    () => new Map((inventuren.data ?? []).map((i) => [i.lagerortId, i.id])),
    [inventuren.data],
  );

  /** Children of every node (and the top level under `null`) in display order, archived included. */
  const geschwisterVon = useMemo(() => {
    const karte = new Map<string | null, string[]>();
    const sammeln = (
      eintraege: ReturnType<typeof baumBauen<LagerKnoten>>,
      parent: string | null,
    ) => {
      karte.set(
        parent,
        eintraege.map((e) => e.node.id),
      );
      for (const e of eintraege) sammeln(e.kinder, e.node.id);
    };
    sammeln(baumBauen(alle), null);
    return karte;
  }, [alle]);

  const neuLaden = () => qc.invalidateQueries({ queryKey: ['lagerorte'] });

  const reihenfolge = useMutation({
    mutationFn: async ({ parentId, ids }: { parentId: string | null; ids: string[] }) =>
      pruefen(
        await api.lagerorte[':id'].reihenfolge.$put({
          param: { id: parentId ?? 'root' },
          json: { ids },
        }),
      ),
    onSuccess: neuLaden,
    onError: (e) => fehlerAnzeigen(e),
  });

  const archivieren = async (k: LagerKnoten, archiviert: boolean) => {
    await pruefen(
      await api.lagerorte[':id'].archiv.$put({ param: { id: k.id }, json: { archiviert } }),
    );
    await neuLaden();
  };
  const archivMutation = useMutation({
    mutationFn: ({ k, archiviert }: { k: LagerKnoten; archiviert: boolean }) =>
      archivieren(k, archiviert),
    onError: (e) => fehlerAnzeigen(e),
  });

  const inventurStarten = useMutation({
    mutationFn: async (k: LagerKnoten) => {
      const offen = offeneInventuren.get(k.id);
      if (offen) return offen;
      const res = await api.inventuren.$post({ json: { lagerortId: k.id } });
      await pruefen(res);
      return ((await res.json()) as { id: string }).id;
    },
    onSuccess: async (id) => {
      await qc.invalidateQueries({ queryKey: ['inventuren'] });
      navigate(`/lager/inventur/${encodeURIComponent(id)}`);
    },
    onError: (e) => fehlerAnzeigen(e),
  });

  const verschieben = (k: LagerKnoten, richtung: -1 | 1) => {
    const ids = [...(geschwisterVon.get(k.parentId) ?? [])];
    const byId = new Map(alle.map((l) => [l.id, l]));
    const gesehen = ids.filter((id) => archiv || !byId.get(id)?.archiviert);
    const nachbar = gesehen[gesehen.indexOf(k.id) + richtung];
    if (!nachbar) return;
    const a = ids.indexOf(k.id);
    const b = ids.indexOf(nachbar);
    [ids[a], ids[b]] = [ids[b]!, ids[a]!];
    reihenfolge.mutate({ parentId: k.parentId, ids });
  };

  const ctx: LagerKontext = {
    darfVerwalten,
    darfBuchen,
    offeneInventuren,
    eingeklappt,
    umschalten: (id) =>
      setEingeklappt((alt) => {
        const neu = new Set(alt);
        if (!neu.delete(id)) neu.add(id);
        return neu;
      }),
    unterebene: (k) => setFormular({ parentId: k.id }),
    bearbeiten: (k) => setFormular({ parentId: k.parentId, lagerort: k }),
    verschieben,
    waren: setWarenliste,
    inventur: (k) => inventurStarten.mutate(k),
    archivieren: (k) => archivMutation.mutate({ k, archiviert: !k.archiviert }),
    loeschen: setLoeschZiel,
  };

  return (
    <Stack maw={900}>
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Title order={2}>Lager</Title>
        {darfVerwalten && (
          <Button
            leftSection={<IconPlus size={18} />}
            onClick={() => setFormular({ parentId: null })}
          >
            Lager anlegen
          </Button>
        )}
      </Group>
      <Button
        component={Link}
        to="/lager/stammdaten"
        variant="default"
        leftSection={<IconTags size={18} />}
        w="fit-content"
      >
        Stammdaten (Warengruppen &amp; Gebinde)
      </Button>
      <Switch
        label="Archivierte Lagerorte anzeigen"
        checked={archiv}
        onChange={(e) => setArchiv(e.currentTarget.checked)}
      />
      {lagerorte.isPending && <Loader m="md" aria-label="Lager werden geladen" />}
      {lagerorte.isError && <Alert color="red">Die Lagerorte konnten nicht geladen werden.</Alert>}
      {lagerorte.data && baum.length === 0 && <Text c="dimmed">Keine Lagerorte vorhanden.</Text>}
      <LagerBaum eintraege={baum} ctx={ctx} />

      {formular && (
        <LagerortFormular
          lagerort={formular.lagerort}
          parentId={formular.parentId}
          parentPfad={
            formular.parentId && !formular.lagerort ? pfad(alle, formular.parentId) : undefined
          }
          onClose={() => setFormular(null)}
        />
      )}
      {warenliste && <WarenlisteModal lagerort={warenliste} onClose={() => setWarenliste(null)} />}
      {loeschZiel && (
        <LoeschenDialog
          titel="Lagerort löschen"
          name={loeschZiel.name}
          onClose={() => setLoeschZiel(null)}
          loeschen={async () => {
            await pruefen(await api.lagerorte[':id'].$delete({ param: { id: loeschZiel.id } }));
            await neuLaden();
          }}
          archivieren={() => archivieren(loeschZiel, true)}
        />
      )}
    </Stack>
  );
}
