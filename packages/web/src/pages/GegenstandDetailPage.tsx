import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  IconArchive,
  IconArchiveOff,
  IconChevronLeft,
  IconEdit,
  IconMapPin,
  IconTruckDelivery,
  IconTrash,
} from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { inventarAbweichung, pfad } from '@c4/shared';
import { AktionsMenue } from '../AktionsMenue';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { GegenstandFormular } from '../GegenstandFormular';
import { GegenstandPlaetzeModal } from '../GegenstandPlaetzeModal';
import { AusleiheStatus, startText } from '../AusleiheKarte';
import { gegenstandAbweichung, mengeText, platzZeilen, positionText } from '../inventarAnzeige';
import { INVENTAR_KEY, useAusleihen, useInventar } from '../inventarDaten';
import { zeitAnzeigen } from '../warenAnzeige';
import { LoeschenDialog } from '../LoeschenDialog';
import { fehlerAnzeigen, pruefen } from '../warenApi';

/** Detail of one Gegenstand: master data, target vs. assigned amount and the Plätze. */
export function GegenstandDetailPage() {
  const { id = '' } = useParams();
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = useAuth();
  const darfVerwalten = can('inventar:verwalten');
  const darfUmraeumen = can('inventar:umraeumen');
  const inv = useInventar();
  const ausleihenDaten = useAusleihen(false);
  const [bearbeiten, setBearbeiten] = useState(false);
  const [plaetze, setPlaetze] = useState(false);
  const [loeschen, setLoeschen] = useState(false);

  const archivieren = async (archiviert: boolean) => {
    await pruefen(
      await api.inventar.gegenstaende[':id'].archiv.$put({ param: { id }, json: { archiviert } }),
    );
    await qc.invalidateQueries({ queryKey: INVENTAR_KEY });
  };
  const archivMutation = useMutation({
    mutationFn: archivieren,
    onError: (e) => fehlerAnzeigen(e),
  });

  const zurueck = (
    <Anchor component={Link} to="/inventar" size="sm">
      <Group gap={4} wrap="nowrap">
        <IconChevronLeft size={16} />
        Zurück zum Inventar
      </Group>
    </Anchor>
  );

  if (inv.laedt) return <Loader m="md" aria-label="Gegenstand wird geladen" />;
  const g = inv.gegenstaende.find((x) => x.id === id);
  if (inv.fehler || !g)
    return (
      <Stack>
        {zurueck}
        <Alert color="red">
          {inv.fehler
            ? 'Der Gegenstand konnte nicht geladen werden.'
            : 'Der Gegenstand wurde nicht gefunden.'}
        </Alert>
      </Stack>
    );
  const abweichung = gegenstandAbweichung(g);
  const zeilen = platzZeilen(g, inv.lagerorte, inv.ifcos);
  const summe = inventarAbweichung(g.anzahl, g.plaetze).summe;
  // Ausleihen with a Position of this Gegenstand; those still holding some of it come first.
  const ausleihen = ausleihenDaten.ausleihen
    .map((a) => ({ a, eigene: a.positionen.filter((p) => p.gegenstandId === g.id) }))
    .filter((x) => x.eigene.length > 0)
    .map((x) => ({ ...x, offen: x.eigene.some((p) => p.zurueckAm === null) }))
    .sort((x, y) => Number(y.offen) - Number(x.offen));
  /** Open Ausleihen holding pieces from the given place, with the amount taken from there. */
  const offenAn = (ziel: { lagerortId: string | null; ifcoId: string | null }) =>
    ausleihen.flatMap(({ a, eigene }) => {
      const anzahl = eigene
        .filter(
          (p) =>
            p.zurueckAm === null && p.lagerortId === ziel.lagerortId && p.ifcoId === ziel.ifcoId,
        )
        .reduce((s, p) => s + p.anzahl, 0);
      return anzahl > 0 ? [{ a, anzahl }] : [];
    });
  const verliehenAn = (ziel: { lagerortId: string | null; ifcoId: string | null }) =>
    offenAn(ziel)
      .filter((x) => x.a.status !== 'geplant')
      .map((x) => x.a);
  const vorgemerktAn = (ziel: { lagerortId: string | null; ifcoId: string | null }) =>
    offenAn(ziel).filter((x) => x.a.status === 'geplant');

  return (
    <Stack maw={900}>
      {zurueck}
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap={4}>
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Title order={2} style={{ overflowWrap: 'anywhere' }}>
            {g.name}
          </Title>
          <Text size="sm">{pfad(inv.kategorien, g.kategorieId)}</Text>
          {g.beschreibung && (
            <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
              {g.beschreibung}
            </Text>
          )}
          <Group gap="xs">
            <Badge variant="light">Soll: {g.anzahl}×</Badge>
            {g.verliehen > 0 && (
              <Badge variant="light" color="grape">
                {g.verliehen} verliehen
              </Badge>
            )}
            {g.vorgemerkt > 0 && (
              <Badge variant="light" color="cyan">
                {g.vorgemerkt} vorgemerkt
              </Badge>
            )}
            {abweichung && (
              <Badge variant="light" color="orange">
                {abweichung}
              </Badge>
            )}
            {g.archiviert && (
              <Badge color="gray" variant="light">
                Archiviert
              </Badge>
            )}
          </Group>
        </Stack>
        <AktionsMenue
          label={`Aktionen für ${g.name}`}
          aktionen={[
            {
              text: 'Bearbeiten',
              icon: <IconEdit size={18} />,
              onClick: () => setBearbeiten(true),
              sichtbar: darfVerwalten,
            },
            {
              text: g.archiviert ? 'Wiederherstellen' : 'Archivieren',
              icon: g.archiviert ? <IconArchiveOff size={18} /> : <IconArchive size={18} />,
              onClick: () => archivMutation.mutate(!g.archiviert),
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

      <Group justify="space-between" wrap="wrap">
        <Title order={3}>Plätze</Title>
        <Text size="sm" c={abweichung ? 'orange' : 'dimmed'}>
          {summe} von {g.anzahl} zugeordnet
        </Text>
      </Group>
      {zeilen.length === 0 && <Text c="dimmed">Noch kein Platz zugeordnet.</Text>}
      <Stack gap="xs">
        {zeilen.map((z) => {
          const platz = g.plaetze.find((p) => p.id === z.id)!;
          const ifco = platz.ifcoId ? inv.ifcos.find((i) => i.id === platz.ifcoId) : undefined;
          return (
            <Paper key={z.id} withBorder p="sm">
              <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
                {ifco ? (
                  <Anchor
                    component={Link}
                    to={`/inventar/ifcos/${encodeURIComponent(ifco.id)}`}
                    style={{ overflowWrap: 'anywhere', minWidth: 0 }}
                  >
                    {z.text}
                  </Anchor>
                ) : (
                  <Text style={{ overflowWrap: 'anywhere', minWidth: 0 }}>{z.text}</Text>
                )}
                <Text fw={600} style={{ flex: 'none' }}>
                  {mengeText(z.anzahl, z.verliehen, z.vorgemerkt)}
                </Text>
              </Group>
              {z.verliehen > 0 && (
                <Text size="sm" c="grape" mt={4} style={{ overflowWrap: 'anywhere' }}>
                  verliehen: {z.verliehen} (an{' '}
                  {verliehenAn(platz).map((a, i) => (
                    <span key={a.id}>
                      {i > 0 && ', '}
                      <Anchor
                        component={Link}
                        to={`/inventar/ausleihen/${encodeURIComponent(a.id)}`}
                        inherit
                      >
                        {a.an}
                      </Anchor>
                    </span>
                  ))}
                  )
                </Text>
              )}
              {vorgemerktAn(platz).map(({ a, anzahl }) => (
                <Text key={a.id} size="sm" c="cyan" mt={4} style={{ overflowWrap: 'anywhere' }}>
                  vorgemerkt: {anzahl} ab {zeitAnzeigen(a.ausgeliehenAm)} (an{' '}
                  <Anchor
                    component={Link}
                    to={`/inventar/ausleihen/${encodeURIComponent(a.id)}`}
                    inherit
                  >
                    {a.an}
                  </Anchor>
                  )
                </Text>
              ))}
            </Paper>
          );
        })}
      </Stack>
      {darfUmraeumen && (
        <Button
          size="lg"
          mih={48}
          leftSection={<IconMapPin size={20} />}
          disabled={g.archiviert}
          onClick={() => setPlaetze(true)}
        >
          Plätze ändern
        </Button>
      )}
      {darfUmraeumen && !g.archiviert && (
        <Button
          component={Link}
          to={`/inventar/ausleihen/neu?gegenstand=${encodeURIComponent(g.id)}`}
          size="lg"
          mih={48}
          variant="light"
          leftSection={<IconTruckDelivery size={20} />}
          disabled={g.plaetze.length === 0}
        >
          Verleihen
        </Button>
      )}

      {ausleihen.length > 0 && (
        <>
          <Title order={3}>Ausleihen</Title>
          <Stack gap="xs">
            {ausleihen.map(({ a, eigene }) => (
              <Paper
                key={a.id}
                component={Link}
                to={`/inventar/ausleihen/${encodeURIComponent(a.id)}`}
                withBorder
                p="sm"
                opacity={a.erledigt ? 0.7 : 1}
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                <Stack gap={2}>
                  <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
                    <Text fw={600} style={{ overflowWrap: 'anywhere', minWidth: 0 }}>
                      {a.an}
                    </Text>
                    <AusleiheStatus a={a} />
                  </Group>
                  <Text size="sm" c="dimmed">
                    {startText(a)}
                  </Text>
                  {eigene.map((p) => (
                    <Text
                      key={p.id}
                      size="sm"
                      c={p.zurueckAm ? 'dimmed' : undefined}
                      style={{ overflowWrap: 'anywhere' }}
                    >
                      {positionText(p, inv.gegenstaende, inv.lagerorte, inv.ifcos)}
                      {p.zurueckAm && ` (zurück am ${zeitAnzeigen(p.zurueckAm)})`}
                    </Text>
                  ))}
                </Stack>
              </Paper>
            ))}
          </Stack>
        </>
      )}

      {bearbeiten && (
        <GegenstandFormular
          gegenstand={g}
          kategorien={inv.kategorien}
          onClose={() => setBearbeiten(false)}
        />
      )}
      {plaetze && (
        <GegenstandPlaetzeModal
          gegenstand={g}
          lagerorte={inv.lagerorte}
          ifcos={inv.ifcos}
          onClose={() => setPlaetze(false)}
        />
      )}
      {loeschen && (
        <LoeschenDialog
          titel="Gegenstand löschen"
          name={g.name}
          onClose={() => setLoeschen(false)}
          loeschen={async () => {
            await pruefen(await api.inventar.gegenstaende[':id'].$delete({ param: { id } }));
            await qc.invalidateQueries({ queryKey: INVENTAR_KEY });
            navigate('/inventar');
          }}
          archivieren={() => archivieren(true)}
        />
      )}
    </Stack>
  );
}
