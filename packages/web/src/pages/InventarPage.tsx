import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus, IconSearch, IconSettings } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { pfad, platzText, teilbaumIds } from '@c4/shared';
import { useAuth } from '../auth';
import { GegenstandFormular } from '../GegenstandFormular';
import { IfcoFormular } from '../IfcoFormular';
import { typAnzeige } from '../ifcoPlatz';
import {
  anzahlText,
  gegenstandAbweichung,
  ifcoAusleiheKurz,
  kategorieOptionen,
  mengeName,
  mengeText,
  platzZeilen,
} from '../inventarAnzeige';
import { useInventar, type GegenstandEintrag, type IfcoEintrag } from '../inventarDaten';
import { VerlieheneAnsicht } from '../VerlieheneAnsicht';

type Ansicht = 'gegenstaende' | 'ifcos' | 'verliehen';

const kartenStil = { color: 'inherit', textDecoration: 'none' } as const;

function GegenstandKarte({
  g,
  inv,
}: Readonly<{ g: GegenstandEintrag; inv: ReturnType<typeof useInventar> }>) {
  const abweichung = gegenstandAbweichung(g);
  const zeilen = platzZeilen(g, inv.lagerorte, inv.ifcos);
  return (
    <Paper
      component={Link}
      to={`/inventar/gegenstaende/${encodeURIComponent(g.id)}`}
      withBorder
      p="md"
      opacity={g.archiviert ? 0.6 : 1}
      style={kartenStil}
    >
      <Stack gap={4}>
        <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
          <Text fw={600} style={{ overflowWrap: 'anywhere', minWidth: 0 }}>
            {g.name}
            {g.archiviert && (
              <Text span c="dimmed" fw={400}>
                {' '}
                (archiviert)
              </Text>
            )}
          </Text>
          {g.anzahl !== 1 && (
            <Text fw={600} style={{ flex: 'none' }}>
              {anzahlText(g.anzahl)}
            </Text>
          )}
        </Group>
        <Text size="sm" c="dimmed">
          {pfad(inv.kategorien, g.kategorieId)}
        </Text>
        {zeilen.map((z) => (
          <Text key={z.id} size="sm" style={{ overflowWrap: 'anywhere' }}>
            {[z.text, mengeText(z.anzahl, z.verliehen, z.vorgemerkt)].filter(Boolean).join(' · ')}
          </Text>
        ))}
        {zeilen.length === 0 && (
          <Text size="sm" c="dimmed">
            Kein Platz zugeordnet
          </Text>
        )}
        {abweichung && (
          <Badge color="orange" variant="light" style={{ alignSelf: 'flex-start' }}>
            {abweichung}
          </Badge>
        )}
      </Stack>
    </Paper>
  );
}

const MAX_INHALT = 4;

function IfcoKarte({
  ifco,
  inv,
}: Readonly<{ ifco: IfcoEintrag; inv: ReturnType<typeof useInventar> }>) {
  const inhalt = ifco.inhalt
    .map((p) => ({
      ...p,
      name: inv.gegenstaende.find((g) => g.id === p.gegenstandId)?.name ?? 'Unbekannt',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return (
    <Paper
      component={Link}
      to={`/inventar/ifcos/${encodeURIComponent(ifco.id)}`}
      withBorder
      p="md"
      opacity={ifco.archiviert ? 0.6 : 1}
      style={kartenStil}
    >
      <Stack gap={4}>
        <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
          {ifco.name}
          {ifco.archiviert && (
            <Text span c="dimmed" fw={400}>
              {' '}
              (archiviert)
            </Text>
          )}
        </Text>
        <Text size="sm" c="dimmed">
          {typAnzeige(ifco.typId, inv.ifcoTypen)}
        </Text>
        {ifco.lagerortId ? (
          <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
            {pfad(inv.lagerorte, ifco.lagerortId)}
          </Text>
        ) : (
          <Badge color="orange" variant="light" style={{ alignSelf: 'flex-start' }}>
            Ohne Platz
          </Badge>
        )}
        {ifco.ausleihe && (
          <Badge
            color={ifco.ausleihe.status === 'geplant' ? 'cyan' : 'grape'}
            variant="light"
            style={{ alignSelf: 'flex-start', maxWidth: '100%' }}
          >
            {ifcoAusleiheKurz(ifco.ausleihe)}
          </Badge>
        )}
        {inhalt.slice(0, MAX_INHALT).map((p) => (
          <Text key={p.gegenstandId} size="sm" style={{ overflowWrap: 'anywhere' }}>
            {mengeName(p.anzahl, p.name)}
          </Text>
        ))}
        {inhalt.length > MAX_INHALT && (
          <Text size="sm" c="dimmed">
            + {inhalt.length - MAX_INHALT} weitere
          </Text>
        )}
        {inhalt.length === 0 && (
          <Text size="sm" c="dimmed">
            Leer
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

/** Where is what? Gegenstände and Ifcos with their places, search, Kategorie filter and archive switch. */
export function InventarPage() {
  const inv = useInventar();
  const navigate = useNavigate();
  const darfVerwalten = useAuth().can('inventar:verwalten');
  const [params, setParams] = useSearchParams();
  const ansichtParam = params.get('ansicht');
  const ansicht: Ansicht =
    ansichtParam === 'ifcos' || ansichtParam === 'verliehen' ? ansichtParam : 'gegenstaende';
  const [suche, setSuche] = useState('');
  const [kategorie, setKategorie] = useState<string | null>(null);
  const [archiv, setArchiv] = useState(false);
  const [anlegen, setAnlegen] = useState(false);

  const waehleAnsicht = (wert: string) =>
    setParams(wert === 'gegenstaende' ? {} : { ansicht: wert }, { replace: true });

  const kategorienDaten = useMemo(
    () => kategorieOptionen(inv.kategorien, kategorie),
    [inv.kategorien, kategorie],
  );

  const gegenstaende = useMemo(() => {
    const ids = kategorie ? new Set(teilbaumIds(inv.kategorien, kategorie)) : null;
    const q = suche.trim().toLowerCase();
    return inv.gegenstaende
      .filter((g) => archiv || !g.archiviert)
      .filter((g) => !ids || ids.has(g.kategorieId))
      .filter((g) => {
        if (!q) return true;
        if (g.name.toLowerCase().includes(q) || g.beschreibung?.toLowerCase().includes(q))
          return true;
        // Also find a Gegenstand by the Ifco or the Lagerort it lies in.
        return g.plaetze.some((p) =>
          platzText(inv.lagerorte, inv.ifcos, p).toLowerCase().includes(q),
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [inv.gegenstaende, inv.kategorien, inv.lagerorte, inv.ifcos, kategorie, suche, archiv]);

  const ifcos = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const name = (id: string) => inv.gegenstaende.find((g) => g.id === id)?.name ?? '';
    return inv.ifcos
      .filter((i) => archiv || !i.archiviert)
      .filter(
        (i) =>
          !q ||
          i.name.toLowerCase().includes(q) ||
          i.beschreibung?.toLowerCase().includes(q) ||
          (i.lagerortId !== null && pfad(inv.lagerorte, i.lagerortId).toLowerCase().includes(q)) ||
          i.inhalt.some((p) => name(p.gegenstandId).toLowerCase().includes(q)),
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [inv.ifcos, inv.gegenstaende, inv.lagerorte, suche, archiv]);

  const imGegenstand = ansicht === 'gegenstaende';
  const leer = imGegenstand ? gegenstaende.length === 0 : ifcos.length === 0;

  return (
    <Stack>
      <Title order={2}>Inventar</Title>
      <SegmentedControl
        fullWidth
        size="md"
        value={ansicht}
        onChange={waehleAnsicht}
        data={[
          { value: 'gegenstaende', label: 'Gegenstände' },
          { value: 'ifcos', label: 'Ifcos' },
          { value: 'verliehen', label: 'Verliehen' },
        ]}
      />
      {ansicht === 'verliehen' && <VerlieheneAnsicht inv={inv} />}
      {ansicht !== 'verliehen' && darfVerwalten && (
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <Button leftSection={<IconPlus size={18} />} onClick={() => setAnlegen(true)}>
            {imGegenstand ? 'Gegenstand anlegen' : 'Ifco anlegen'}
          </Button>
          <Button
            variant="default"
            component={Link}
            to="/inventar/stammdaten"
            leftSection={<IconSettings size={18} />}
          >
            Kategorien
          </Button>
        </SimpleGrid>
      )}
      {ansicht !== 'verliehen' && (
        <>
          <SimpleGrid cols={{ base: 1, sm: imGegenstand ? 2 : 1 }}>
            <TextInput
              placeholder={
                imGegenstand ? 'Name, Ifco oder Platz suchen' : 'Name oder Inhalt suchen'
              }
              aria-label="Suche"
              leftSection={<IconSearch size={18} />}
              value={suche}
              onChange={(e) => setSuche(e.currentTarget.value)}
            />
            {imGegenstand && (
              <Select
                placeholder="Alle Kategorien"
                aria-label="Kategorie"
                searchable
                clearable
                inputMode="text"
                nothingFoundMessage="Keine Kategorie gefunden"
                data={kategorienDaten}
                value={kategorie}
                onChange={setKategorie}
              />
            )}
          </SimpleGrid>
          <Switch
            label="Archivierte anzeigen"
            checked={archiv}
            onChange={(e) => setArchiv(e.currentTarget.checked)}
          />
          {inv.laedt && <Loader m="md" aria-label="Inventar wird geladen" />}
          {inv.fehler && <Alert color="red">Das Inventar konnte nicht geladen werden.</Alert>}
          {!inv.laedt && !inv.fehler && leer && (
            <Text c="dimmed">
              {imGegenstand ? 'Keine Gegenstände gefunden.' : 'Keine Ifcos gefunden.'}
            </Text>
          )}
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
            {imGegenstand
              ? gegenstaende.map((g) => <GegenstandKarte key={g.id} g={g} inv={inv} />)
              : ifcos.map((i) => <IfcoKarte key={i.id} ifco={i} inv={inv} />)}
          </SimpleGrid>
        </>
      )}
      {anlegen && imGegenstand && (
        <GegenstandFormular
          kategorien={inv.kategorien}
          onClose={() => setAnlegen(false)}
          onAngelegt={(id) => navigate(`/inventar/gegenstaende/${encodeURIComponent(id)}`)}
        />
      )}
      {anlegen && ansicht === 'ifcos' && (
        <IfcoFormular
          lagerorte={inv.lagerorte}
          ifcos={inv.ifcos}
          typen={inv.ifcoTypen}
          onClose={() => setAnlegen(false)}
          onAngelegt={(id) => navigate(`/inventar/ifcos/${encodeURIComponent(id)}`)}
        />
      )}
    </Stack>
  );
}
