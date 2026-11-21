import {
  Alert,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { bestandAnzeigen, mhdAnzeigen, pfad, teilbaumIds } from '@c4/shared';
import { unwrap, useApi } from '../api';
import { useAuth } from '../auth';
import { WareFormular } from '../WareFormular';
import { useWarenStammdaten, type WareEintrag } from '../warenDaten';
import { warenKeys } from '../warenDaten';

/** Overview of all Waren with search, Warengruppe filter and the current stock. */
export function WarenPage() {
  const api = useApi();
  const darfVerwalten = useAuth().can('waren:verwalten');
  const stamm = useWarenStammdaten();
  const [suche, setSuche] = useState('');
  const [gruppe, setGruppe] = useState<string | null>(null);
  const [archiv, setArchiv] = useState(false);
  const [anlegen, setAnlegen] = useState(false);

  const daten = useQuery({
    queryKey: warenKeys.liste(true),
    queryFn: async () => unwrap(await api.waren.$get({ query: { archiv: '1' } })),
  });

  const gruppenDaten = useMemo(
    () =>
      stamm.warengruppen
        .filter((g) => !g.archiviert || g.id === gruppe)
        .map((g) => ({ value: g.id, label: pfad(stamm.warengruppen, g.id) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'de')),
    [stamm.warengruppen, gruppe],
  );

  const sichtbar = useMemo(() => {
    const alle: WareEintrag[] = daten.data ?? [];
    const gruppenIds = gruppe ? new Set(teilbaumIds(stamm.warengruppen, gruppe)) : null;
    const q = suche.trim().toLowerCase();
    return alle
      .filter((w) => archiv || !w.archiviert)
      .filter((w) => !gruppenIds || gruppenIds.has(w.warengruppeId))
      .filter(
        (w) =>
          !q ||
          w.name.toLowerCase().includes(q) ||
          w.aliase.some((a) => a.toLowerCase().includes(q)),
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [daten.data, stamm.warengruppen, gruppe, suche, archiv]);

  return (
    <Stack>
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Title order={2}>Waren</Title>
        {darfVerwalten && (
          <Button leftSection={<IconPlus size={18} />} onClick={() => setAnlegen(true)}>
            Ware anlegen
          </Button>
        )}
      </Group>
      <SimpleGrid style={{ alignItems: 'end' }} cols={{ base: 1, sm: 2 }}>
        <TextInput
          placeholder="Name oder Alias suchen"
          aria-label="Suche"
          leftSection={<IconSearch size={18} />}
          value={suche}
          onChange={(e) => setSuche(e.currentTarget.value)}
        />
        <Select
          placeholder="Alle Warengruppen"
          aria-label="Warengruppe"
          searchable
          clearable
          inputMode="text"
          nothingFoundMessage="Keine Warengruppe gefunden"
          data={gruppenDaten}
          value={gruppe}
          onChange={setGruppe}
        />
      </SimpleGrid>
      <Switch
        label="Archivierte Waren anzeigen"
        checked={archiv}
        onChange={(e) => setArchiv(e.currentTarget.checked)}
      />
      {(daten.isPending || stamm.laedt) && <Loader m="md" aria-label="Waren werden geladen" />}
      {(daten.isError || stamm.fehler) && (
        <Alert color="red">Die Waren konnten nicht geladen werden.</Alert>
      )}
      {daten.data && sichtbar.length === 0 && <Text c="dimmed">Keine Waren gefunden.</Text>}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        {sichtbar.map((w) => {
          const mhd = mhdAnzeigen(w.fruehestesMhd, w.mhdArt);
          const negativ = w.bestand.some((b) => b.menge < 0);
          return (
            <Paper
              key={w.id}
              component={Link}
              to={`/waren/${encodeURIComponent(w.id)}`}
              withBorder
              p="md"
              opacity={w.archiviert ? 0.6 : 1}
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              <Stack gap={4}>
                <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                  {w.name}
                  {w.archiviert && (
                    <Text span c="dimmed" fw={400}>
                      {' '}
                      (archiviert)
                    </Text>
                  )}
                </Text>
                {w.aliase.length > 0 && (
                  <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                    {w.aliase.join(', ')}
                  </Text>
                )}
                <Text size="sm" c="dimmed">
                  {pfad(stamm.warengruppen, w.warengruppeId)}
                </Text>
                <Text size="sm" fw={500} c={negativ ? 'red' : undefined}>
                  {bestandAnzeigen(w.bestand, stamm.gebinde)}
                </Text>
                {mhd && <Text size="sm">Frühestes MHD: {mhd}</Text>}
              </Stack>
            </Paper>
          );
        })}
      </SimpleGrid>
      {anlegen && (
        <WareFormular
          warengruppen={stamm.warengruppen}
          gebinde={stamm.gebinde}
          onClose={() => setAnlegen(false)}
        />
      )}
    </Stack>
  );
}
