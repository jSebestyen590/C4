import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  IconArchive,
  IconArchiveOff,
  IconChevronLeft,
  IconEdit,
  IconListDetails,
  IconSwitchHorizontal,
  IconTruckDelivery,
  IconTrash,
} from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { pfad } from '@c4/shared';
import { AktionsMenue } from '../AktionsMenue';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { IfcoFormular } from '../IfcoFormular';
import { IfcoInhaltModal } from '../IfcoInhaltModal';
import { IfcoUmstellenModal } from '../IfcoUmstellenModal';
import { mengeText } from '../inventarAnzeige';
import { INVENTAR_KEY, useInventar } from '../inventarDaten';
import { LoeschenDialog } from '../LoeschenDialog';
import { fehlerAnzeigen, pruefen } from '../warenApi';

/** Detail of one Ifco: place (movable) and content. */
export function IfcoDetailPage() {
  const { id = '' } = useParams();
  const api = useApi();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = useAuth();
  const darfVerwalten = can('inventar:verwalten');
  const darfUmraeumen = can('inventar:umraeumen');
  const inv = useInventar();
  const [bearbeiten, setBearbeiten] = useState(false);
  const [umstellen, setUmstellen] = useState(false);
  const [inhalt, setInhalt] = useState(false);
  const [loeschen, setLoeschen] = useState(false);

  const archivieren = async (archiviert: boolean) => {
    await pruefen(
      await api.inventar.ifcos[':id'].archiv.$put({ param: { id }, json: { archiviert } }),
    );
    await qc.invalidateQueries({ queryKey: INVENTAR_KEY });
  };
  const archivMutation = useMutation({
    mutationFn: archivieren,
    onError: (e) => fehlerAnzeigen(e),
  });

  const zurueck = (
    <Anchor component={Link} to="/inventar?ansicht=ifcos" size="sm">
      <Group gap={4} wrap="nowrap">
        <IconChevronLeft size={16} />
        Alle Ifcos
      </Group>
    </Anchor>
  );

  if (inv.laedt) return <Loader m="md" aria-label="Ifco wird geladen" />;
  const ifco = inv.ifcos.find((x) => x.id === id);
  if (inv.fehler || !ifco)
    return (
      <Stack>
        {zurueck}
        <Alert color="red">
          {inv.fehler ? 'Die Ifco konnte nicht geladen werden.' : 'Die Ifco wurde nicht gefunden.'}
        </Alert>
      </Stack>
    );
  const zeilen = ifco.inhalt
    .map((p) => {
      const g = inv.gegenstaende.find((x) => x.id === p.gegenstandId);
      const platz = g?.plaetze.find((x) => x.ifcoId === ifco.id);
      return {
        ...p,
        name: g?.name ?? 'Unbekannt',
        verliehen: platz?.verliehen ?? 0,
        vorgemerkt: platz?.vorgemerkt ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  return (
    <Stack maw={900}>
      {zurueck}
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap={4}>
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Title order={2} style={{ overflowWrap: 'anywhere' }}>
            {ifco.name}
          </Title>
          {ifco.beschreibung && (
            <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
              {ifco.beschreibung}
            </Text>
          )}
          {ifco.archiviert && (
            <Group gap="xs">
              <Badge color="gray" variant="light">
                Archiviert
              </Badge>
            </Group>
          )}
        </Stack>
        <AktionsMenue
          label={`Aktionen für ${ifco.name}`}
          aktionen={[
            {
              text: 'Bearbeiten',
              icon: <IconEdit size={18} />,
              onClick: () => setBearbeiten(true),
              sichtbar: darfVerwalten,
            },
            {
              text: ifco.archiviert ? 'Wiederherstellen' : 'Archivieren',
              icon: ifco.archiviert ? <IconArchiveOff size={18} /> : <IconArchive size={18} />,
              onClick: () => archivMutation.mutate(!ifco.archiviert),
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

      <Title order={3}>Platz</Title>
      <Paper withBorder p="sm">
        {ifco.lagerortId ? (
          <Text style={{ overflowWrap: 'anywhere' }}>{pfad(inv.lagerorte, ifco.lagerortId)}</Text>
        ) : (
          <Text c="orange">Ohne Platz</Text>
        )}
      </Paper>
      {darfUmraeumen && (
        <Button
          size="lg"
          mih={48}
          variant="light"
          leftSection={<IconSwitchHorizontal size={20} />}
          disabled={ifco.archiviert}
          onClick={() => setUmstellen(true)}
        >
          Umstellen
        </Button>
      )}

      <Title order={3}>Inhalt</Title>
      {zeilen.length === 0 && <Text c="dimmed">Die Ifco ist leer.</Text>}
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
        {zeilen.map((z) => (
          <Paper key={z.gegenstandId} withBorder p="sm">
            <Group justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
              <Anchor
                component={Link}
                to={`/inventar/gegenstaende/${encodeURIComponent(z.gegenstandId)}`}
                style={{ overflowWrap: 'anywhere', minWidth: 0 }}
              >
                {z.name}
              </Anchor>
              <Text fw={600} style={{ flex: 'none' }}>
                {mengeText(z.anzahl, z.verliehen, z.vorgemerkt)}
              </Text>
            </Group>
          </Paper>
        ))}
      </SimpleGrid>
      {darfUmraeumen && (
        <Button
          size="lg"
          mih={48}
          leftSection={<IconListDetails size={20} />}
          disabled={ifco.archiviert}
          onClick={() => setInhalt(true)}
        >
          Inhalt bearbeiten
        </Button>
      )}
      {darfUmraeumen && !ifco.archiviert && (
        <Button
          component={Link}
          to={`/inventar/ausleihen/neu?ifco=${encodeURIComponent(ifco.id)}`}
          size="lg"
          mih={48}
          variant="light"
          leftSection={<IconTruckDelivery size={20} />}
          disabled={zeilen.every((z) => z.anzahl - z.verliehen - z.vorgemerkt <= 0)}
        >
          Ganze Ifco verleihen
        </Button>
      )}

      {bearbeiten && (
        <IfcoFormular ifco={ifco} lagerorte={inv.lagerorte} onClose={() => setBearbeiten(false)} />
      )}
      {umstellen && (
        <IfcoUmstellenModal
          ifco={ifco}
          lagerorte={inv.lagerorte}
          onClose={() => setUmstellen(false)}
        />
      )}
      {inhalt && (
        <IfcoInhaltModal
          ifco={ifco}
          gegenstaende={inv.gegenstaende}
          kategorien={inv.kategorien}
          onClose={() => setInhalt(false)}
        />
      )}
      {loeschen && (
        <LoeschenDialog
          titel="Ifco löschen"
          name={ifco.name}
          onClose={() => setLoeschen(false)}
          loeschen={async () => {
            await pruefen(await api.inventar.ifcos[':id'].$delete({ param: { id } }));
            await qc.invalidateQueries({ queryKey: INVENTAR_KEY });
            navigate('/inventar?ansicht=ifcos');
          }}
          archivieren={() => archivieren(true)}
        />
      )}
    </Stack>
  );
}
