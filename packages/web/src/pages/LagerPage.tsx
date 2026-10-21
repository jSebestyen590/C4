import { Alert, Button, Group, Loader, Stack, Switch, Text, Title } from '@mantine/core';
import { IconArrowsMaximize, IconArrowsMinimize, IconPlus, IconTags } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { baumBauen, pfad } from '@c4/shared';
import { unwrap, useApi } from '../api';
import { useAuth } from '../auth';
import { inventarJeLagerort } from '../lagerInventar';
import { useGegenstaendeUndIfcos } from '../inventarDaten';
import { LagerBaum, type LagerKnoten, type LagerKontext } from '../LagerBaum';
import {
  alleSetzen,
  aufgeklapptLesen,
  istAufgeklappt,
  knotenMitKindern,
  nurBelegte,
  type Aufgeklappt,
} from '../lagerAnsicht';
import { LagerKachelDrawer } from '../LagerKachel';
import { bestandAnzeigeJeKnoten } from '../lagerBestand';
import { LagerortFormular } from '../LagerortFormular';
import { LoeschenDialog } from '../LoeschenDialog';
import { useLagerBestand } from '../useLagerBestand';
import { WarenlisteModal } from '../WarenlisteModal';
import { fehlerAnzeigen, pruefen } from '../warenApi';

type Formular = { parentId: string | null; lagerort?: LagerKnoten };

const BESTAND_KEY = 'lager.bestandAnzeigen';
const INVENTAR_ANZEIGEN_KEY = 'lager.inventarAnzeigen';
const NUR_BELEGTE_KEY = 'lager.nurBelegte';
const AUFGEKLAPPT_KEY = 'lager.aufgeklappt';

/** Remembered switch that is off by default. */
function gemerktAus(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'ja';
  } catch {
    return false;
  }
}

function aufgeklapptLaden(): Aufgeklappt {
  try {
    return aufgeklapptLesen(localStorage.getItem(AUFGEKLAPPT_KEY));
  } catch {
    return {};
  }
}

function aufgeklapptSpeichern(wert: Aufgeklappt): void {
  try {
    localStorage.setItem(AUFGEKLAPPT_KEY, JSON.stringify(wert));
  } catch {
    // The choice just is not remembered.
  }
}

/** Remembered on/off choice of a switch; on by default. */
function gemerkt(key: string): boolean {
  try {
    return localStorage.getItem(key) !== 'nein';
  } catch {
    return true;
  }
}

function merken(key: string, an: boolean): void {
  try {
    localStorage.setItem(key, an ? 'ja' : 'nein');
  } catch {
    // The choice just is not remembered.
  }
}

/** The Lagerort tree: browse, maintain (waren:verwalten) and start inventories (bestand:buchen). */
export function LagerPage() {
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = useAuth();
  const darfVerwalten = can('waren:verwalten');
  const darfBuchen = can('bestand:buchen');
  const darfInventar = can('inventar:lesen');
  const [archiv, setArchiv] = useState(false);
  const [bestandZeigen, setBestandZeigen] = useState(() => gemerkt(BESTAND_KEY));
  const [inventarZeigen, setInventarZeigen] = useState(() => gemerkt(INVENTAR_ANZEIGEN_KEY));
  const [nurBelegteZeigen, setNurBelegteZeigen] = useState(() => gemerktAus(NUR_BELEGTE_KEY));
  const [aufgeklappt, setAufgeklappt] = useState<Aufgeklappt>(aufgeklapptLaden);
  const [kachelId, setKachelId] = useState<string | null>(null);
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

  const lagerBestand = useLagerBestand();
  const bestandKarte = useMemo(
    () =>
      bestandZeigen && lagerBestand.bestandGeladen
        ? bestandAnzeigeJeKnoten(
            lagerBestand.bestand,
            lagerBestand.warenlisten,
            lagerBestand.waren,
            lagerBestand.gebinde,
          )
        : null,
    [
      bestandZeigen,
      lagerBestand.bestandGeladen,
      lagerBestand.bestand,
      lagerBestand.warenlisten,
      lagerBestand.waren,
      lagerBestand.gebinde,
    ],
  );

  const inventarDaten = useGegenstaendeUndIfcos(darfInventar && inventarZeigen);
  const inventarKarte = useMemo(
    () =>
      darfInventar && inventarZeigen && inventarDaten.geladen
        ? inventarJeLagerort(inventarDaten.gegenstaende, inventarDaten.ifcos)
        : null,
    [
      darfInventar,
      inventarZeigen,
      inventarDaten.geladen,
      inventarDaten.gegenstaende,
      inventarDaten.ifcos,
    ],
  );

  const alle: LagerKnoten[] = useMemo(() => lagerorte.data ?? [], [lagerorte.data]);
  const sichtbar = useMemo(
    () => (archiv ? alle : alle.filter((l) => !l.archiviert)),
    [alle, archiv],
  );
  const gesamtBaum = useMemo(() => baumBauen(sichtbar), [sichtbar]);
  const baum = useMemo(
    () =>
      nurBelegteZeigen
        ? nurBelegte(gesamtBaum, { bestand: bestandKarte, inventar: inventarKarte })
        : gesamtBaum,
    [nurBelegteZeigen, gesamtBaum, bestandKarte, inventarKarte],
  );
  const kachelKnoten = useMemo(
    () => (kachelId ? (sichtbar.find((l) => l.id === kachelId) ?? null) : null),
    [kachelId, sichtbar],
  );
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

  /** The sibling a node would swap places with (archived ones only count in archive mode). */
  const nachbarVon = (k: LagerKnoten, richtung: -1 | 1) => {
    const ids = geschwisterVon.get(k.parentId) ?? [];
    const byId = new Map(alle.map((l) => [l.id, l]));
    const gesehen = ids.filter((id) => archiv || !byId.get(id)?.archiviert);
    return gesehen[gesehen.indexOf(k.id) + richtung];
  };

  const verschieben = (k: LagerKnoten, richtung: -1 | 1) => {
    const nachbar = nachbarVon(k, richtung);
    if (!nachbar) return;
    const ids = [...(geschwisterVon.get(k.parentId) ?? [])];
    const a = ids.indexOf(k.id);
    const b = ids.indexOf(nachbar);
    [ids[a], ids[b]] = [ids[b]!, ids[a]!];
    reihenfolge.mutate({ parentId: k.parentId, ids });
  };

  const aufgeklapptSetzen = (neu: Aufgeklappt) => {
    setAufgeklappt(neu);
    aufgeklapptSpeichern(neu);
  };
  const alleAufZu = (auf: boolean) =>
    aufgeklapptSetzen(alleSetzen(aufgeklappt, knotenMitKindern(gesamtBaum), auf));

  const ctx: LagerKontext = {
    darfVerwalten,
    darfBuchen,
    bestand: bestandKarte,
    inventar: inventarKarte,
    offeneInventuren,
    aufgeklappt: (id, tiefe) => istAufgeklappt(id, tiefe, aufgeklappt),
    umschalten: (id, tiefe) =>
      aufgeklapptSetzen({ ...aufgeklappt, [id]: !istAufgeklappt(id, tiefe, aufgeklappt) }),
    kachelOeffnen: (k) => setKachelId(k.id),
    unterebene: (k) => setFormular({ parentId: k.id }),
    bearbeiten: (k) => setFormular({ parentId: k.parentId, lagerort: k }),
    kannVerschieben: (k, richtung) => nachbarVon(k, richtung) !== undefined,
    verschieben,
    waren: setWarenliste,
    entnehmen: (k) => navigate(`/lager/${encodeURIComponent(k.id)}/entnehmen`),
    einlagern: (k) => navigate(`/lager/${encodeURIComponent(k.id)}/einlagern`),
    umlagern: (k) => navigate(`/lager/${encodeURIComponent(k.id)}/umlagern`),
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
        Warengruppen &amp; Gebinde
      </Button>
      <Switch
        label="Bestand anzeigen"
        checked={bestandZeigen}
        onChange={(e) => {
          const an = e.currentTarget.checked;
          setBestandZeigen(an);
          merken(BESTAND_KEY, an);
        }}
      />
      {darfInventar && (
        <Switch
          label="Inventar anzeigen"
          checked={inventarZeigen}
          onChange={(e) => {
            const an = e.currentTarget.checked;
            setInventarZeigen(an);
            merken(INVENTAR_ANZEIGEN_KEY, an);
          }}
        />
      )}
      <Switch
        label="Nur belegte Plätze"
        checked={nurBelegteZeigen}
        onChange={(e) => {
          const an = e.currentTarget.checked;
          setNurBelegteZeigen(an);
          merken(NUR_BELEGTE_KEY, an);
        }}
      />
      <Switch
        label="Archivierte Lagerorte anzeigen"
        checked={archiv}
        onChange={(e) => setArchiv(e.currentTarget.checked)}
      />
      <Group gap="xs">
        <Button
          variant="default"
          mih={44}
          leftSection={<IconArrowsMaximize size={18} />}
          onClick={() => alleAufZu(true)}
        >
          Alle aufklappen
        </Button>
        <Button
          variant="default"
          mih={44}
          leftSection={<IconArrowsMinimize size={18} />}
          onClick={() => alleAufZu(false)}
        >
          Alle zuklappen
        </Button>
      </Group>
      {lagerorte.isPending && <Loader m="md" aria-label="Lager werden geladen" />}
      {lagerorte.isError && <Alert color="red">Die Lagerorte konnten nicht geladen werden.</Alert>}
      {lagerorte.data && gesamtBaum.length === 0 && (
        <Text c="dimmed">Keine Lagerorte vorhanden.</Text>
      )}
      <LagerBaum eintraege={baum} ctx={ctx} />
      {nurBelegteZeigen && lagerorte.data && baum.length === 0 && gesamtBaum.length > 0 && (
        <Text c="dimmed">Keine belegten Plätze.</Text>
      )}
      <LagerKachelDrawer
        node={kachelKnoten}
        alle={alle}
        ctx={ctx}
        onClose={() => setKachelId(null)}
      />

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
