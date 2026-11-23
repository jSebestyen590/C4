import { Alert, Badge, Button, Group, Loader, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import {
  IconArchive,
  IconArchiveOff,
  IconEdit,
  IconMinus,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { gebindeBezeichnung, pfad } from '@c4/shared';
import { AktionsMenue } from '../AktionsMenue';
import { unwrap, useApi } from '../api';
import { useAuth } from '../auth';
import { BuchungModal, type BuchungsModus } from '../BuchungModal';
import { LoeschenDialog } from '../LoeschenDialog';
import { MHD_ART_LABELS } from '../i18n';
import { WareBestand } from '../WareBestand';
import { WareFormular } from '../WareFormular';
import { WareHistorie } from '../WareHistorie';
import { WareVerlauf } from '../WareVerlauf';
import { fehlerAnzeigen, pruefen } from '../warenApi';
import { useWarenStammdaten, type WareEintrag } from '../warenDaten';
import { lagerAbgleichPfad, useAbgleichRechte, useLagerAbgleich } from '../lagerAbgleichDaten';
import { ZurueckLink } from '../ZurueckLink';
import { warenKeys } from '../warenDaten';

/** Detail of one Ware: master data, bookings, current stock, stock chart and history. */
export function WareDetailPage() {
  const { id = '' } = useParams();
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = useAuth();
  const darfVerwalten = can('waren:verwalten');
  const darfBuchen = can('bestand:buchen');
  const stamm = useWarenStammdaten();
  const abgleichRechte = useAbgleichRechte();
  const abgleich = useLagerAbgleich(abgleichRechte.lesen);
  const diskrepanz = abgleich.data?.waren.find((w) => w.wareId === id);
  const [bearbeiten, setBearbeiten] = useState(false);
  const [loeschen, setLoeschen] = useState(false);
  const [buchung, setBuchung] = useState<BuchungsModus | null>(null);

  const daten = useQuery({
    queryKey: warenKeys.detail(id),
    queryFn: async () => unwrap(await api.waren[':id'].$get({ param: { id } })),
  });

  const archivieren = async (archiviert: boolean) => {
    await pruefen(await api.waren[':id'].archiv.$put({ param: { id }, json: { archiviert } }));
    await qc.invalidateQueries({ queryKey: warenKeys.alle });
  };
  const archivMutation = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: archivieren,
    onError: (e) => fehlerAnzeigen(e),
  });

  const zurueck = <ZurueckLink to="/waren">Alle Waren</ZurueckLink>;

  if (daten.isPending || stamm.laedt) return <Loader m="md" aria-label="Ware wird geladen" />;
  if (daten.isError || stamm.fehler)
    return (
      <Stack>
        {zurueck}
        <Alert color="red">Die Ware konnte nicht geladen werden.</Alert>
      </Stack>
    );
  const ware: WareEintrag = daten.data;
  const eigene = stamm.gebinde.filter((g) => ware.gebindeIds.includes(g.id));

  return (
    <Stack maw={900}>
      {zurueck}
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap={4}>
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Title order={2} style={{ overflowWrap: 'anywhere' }}>
            {ware.name}
          </Title>
          {ware.aliase.length > 0 && (
            <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
              {ware.aliase.join(', ')}
            </Text>
          )}
          <Text size="sm">{pfad(stamm.warengruppen, ware.warengruppeId)}</Text>
          <Group gap="xs">
            <Badge variant="light">{MHD_ART_LABELS[ware.mhdArt]}</Badge>
            {ware.archiviert && (
              <Badge color="gray" variant="light">
                Archiviert
              </Badge>
            )}
          </Group>
        </Stack>
        <AktionsMenue
          label={`Aktionen für ${ware.name}`}
          aktionen={[
            {
              text: 'Bearbeiten',
              icon: <IconEdit size={18} />,
              onClick: () => setBearbeiten(true),
              sichtbar: darfVerwalten,
            },
            {
              text: ware.archiviert ? 'Wiederherstellen' : 'Archivieren',
              icon: ware.archiviert ? <IconArchiveOff size={18} /> : <IconArchive size={18} />,
              onClick: () => archivMutation.mutate(!ware.archiviert),
              sichtbar: darfVerwalten,
              trenner: true,
            },
            {
              text: 'Löschen',
              icon: <IconTrash size={18} />,
              color: 'red',
              onClick: () => setLoeschen(true),
              sichtbar: darfVerwalten,
            },
          ]}
        />
      </Group>

      <Stack gap={2}>
        <Text fw={600}>Gebinde</Text>
        {eigene.map((g) => (
          <Text key={g.id} size="sm">
            {gebindeBezeichnung(g, stamm.gebinde)}
            {g.id === ware.standardGebindeId ? ' (Standard)' : ''}
          </Text>
        ))}
      </Stack>

      {darfBuchen && (
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Button
            size="lg"
            mih={48}
            leftSection={<IconPlus size={20} />}
            disabled={ware.archiviert}
            onClick={() => setBuchung('einlagerung')}
          >
            Einlagern
          </Button>
          <Button
            size="lg"
            mih={48}
            variant="light"
            leftSection={<IconMinus size={20} />}
            disabled={ware.archiviert}
            onClick={() => setBuchung('entnahme')}
          >
            Entnehmen
          </Button>
        </SimpleGrid>
      )}

      {diskrepanz && diskrepanz.diskrepanz !== 0 && (
        <Alert color="red" title="Diskrepanz zwischen Lager und Belegen">
          <Group justify="space-between" align="center" wrap="wrap">
            <Text size="sm">{diskrepanz.diskrepanzText} laut Lager-Beleg-Abgleich.</Text>
            <Button
              component={Link}
              to={lagerAbgleichPfad(id)}
              variant="light"
              color="red"
              size="md"
            >
              Zum Abgleich
            </Button>
          </Group>
        </Alert>
      )}

      <Title order={3}>Bestand</Title>
      <WareBestand ware={ware} lagerorte={stamm.lagerorte} gebinde={stamm.gebinde} />

      <Title order={3}>Bestandsverlauf</Title>
      <WareVerlauf wareId={ware.id} gebinde={stamm.gebinde} />

      <Title order={3}>Vorgänge</Title>
      <WareHistorie
        ware={ware}
        lagerorte={stamm.lagerorte}
        gebinde={stamm.gebinde}
        darfBuchen={darfBuchen}
      />

      {bearbeiten && (
        <WareFormular
          ware={ware}
          warengruppen={stamm.warengruppen}
          gebinde={stamm.gebinde}
          onClose={() => setBearbeiten(false)}
        />
      )}
      {buchung && (
        <BuchungModal
          modus={buchung}
          ware={ware}
          lagerorte={stamm.lagerorte}
          gebinde={stamm.gebinde}
          onClose={() => setBuchung(null)}
        />
      )}
      {loeschen && (
        <LoeschenDialog
          titel="Ware löschen"
          name={ware.name}
          onClose={() => setLoeschen(false)}
          loeschen={async () => {
            await pruefen(await api.waren[':id'].$delete({ param: { id } }));
            await qc.invalidateQueries({ queryKey: warenKeys.alle });
            navigate('/waren');
          }}
          archivieren={() => archivieren(true)}
        />
      )}
    </Stack>
  );
}
