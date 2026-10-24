import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import {
  IconChevronDown,
  IconChevronUp,
  IconPlus,
  IconSearch,
  IconSelector,
  IconSettings,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { pfad, platzText, teilbaumIds } from '@c4/shared';
import { useAuth } from '../auth';
import { GegenstandFormular } from '../GegenstandFormular';
import { IfcoFormular } from '../IfcoFormular';
import { typAnzeige } from '../ifcoPlatz';
import {
  anzahlText,
  GEGENSTAND_SORTIERUNGEN,
  IFCO_SORTIERUNGEN,
  ifcosSortieren,
  type IfcoSortierung,
  gegenstandAbweichung,
  gegenstaendeSortieren,
  type GegenstandSortierung,
  ifcoAusleiheKurz,
  kategorieOptionen,
  mengeName,
  mengeText,
  platzZeilen,
  verbautZeilen,
} from '../inventarAnzeige';
import {
  useAufraeumen,
  useInventar,
  type AufraeumFertigEintrag,
  type GegenstandEintrag,
  type IfcoEintrag,
} from '../inventarDaten';
import { AufraeumHinweis, AufraeumPanel, FertigBadge, FertigKnopf } from '../Aufraeumen';
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
        {verbautZeilen(g).map((v) => (
          <Text key={v.id} size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
            {[v.text, anzahlText(v.anzahl)].filter(Boolean).join(' · ')}
          </Text>
        ))}
        {zeilen.length === 0 && g.verbaut.length === 0 && (
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

const gegenstandLink = (id: string) => `/inventar/gegenstaende/${encodeURIComponent(id)}`;

/** Column header that sorts the table; the Select above the list offers the same on phones. */
function SortKopf<S extends string>({
  spalte,
  label,
  sortierung,
  umgekehrt,
  onSort,
}: Readonly<{
  spalte: S;
  label: string;
  sortierung: S;
  umgekehrt: boolean;
  onSort: (spalte: S) => void;
}>) {
  const aktiv = sortierung === spalte;
  const Icon = !aktiv ? IconSelector : umgekehrt ? IconChevronDown : IconChevronUp;
  return (
    <Table.Th aria-sort={!aktiv ? 'none' : umgekehrt ? 'descending' : 'ascending'}>
      <UnstyledButton onClick={() => onSort(spalte)} py="xs" fw={600}>
        <Group gap={4} wrap="nowrap">
          {label}
          <Icon size={16} aria-hidden />
        </Group>
      </UnstyledButton>
    </Table.Th>
  );
}

/** Table of Gegenstände from `sm` on; the whole row opens the detail page. */
function GegenstandTabelle({
  liste,
  inv,
  sortierung,
  umgekehrt,
  onSort,
}: Readonly<{
  liste: GegenstandEintrag[];
  inv: ReturnType<typeof useInventar>;
  sortierung: GegenstandSortierung;
  umgekehrt: boolean;
  onSort: (spalte: GegenstandSortierung) => void;
}>) {
  const navigate = useNavigate();
  const kopf = (spalte: GegenstandSortierung, label: string) => (
    <SortKopf
      spalte={spalte}
      label={label}
      sortierung={sortierung}
      umgekehrt={umgekehrt}
      onSort={onSort}
    />
  );
  return (
    <Table.ScrollContainer minWidth={760} visibleFrom="sm">
      <Table verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            {kopf('name', 'Name')}
            {kopf('kategorie', 'Kategorie')}
            {kopf('anzahl', 'Anzahl')}
            {kopf('platz', 'Plätze')}
            <Table.Th>Status</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {liste.map((g) => {
            const abweichung = gegenstandAbweichung(g);
            const zeilen = platzZeilen(g, inv.lagerorte, inv.ifcos);
            return (
              <Table.Tr
                key={g.id}
                opacity={g.archiviert ? 0.6 : 1}
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  // The name is a real link (keyboard, middle click); it navigates on its own.
                  if (!(e.target as HTMLElement).closest('a')) navigate(gegenstandLink(g.id));
                }}
              >
                <Table.Td>
                  {/* A real link for keyboard use, but plain text; the whole row is clickable. */}
                  <Link to={gegenstandLink(g.id)} style={kartenStil}>
                    <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                      {g.name}
                    </Text>
                  </Link>
                  {g.beschreibung && (
                    <Text size="sm" c="dimmed" lineClamp={1}>
                      {g.beschreibung}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                    {pfad(inv.kategorien, g.kategorieId)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text fw={600}>{anzahlText(g.anzahl)}</Text>
                </Table.Td>
                <Table.Td>
                  {zeilen.map((z) => (
                    <Text key={z.id} size="sm" style={{ overflowWrap: 'anywhere' }}>
                      {[anzahlText(z.anzahl), z.text].filter(Boolean).join(' ')}
                      {z.verliehen > 0 && (
                        <Text span size="xs" c="grape" inherit>
                          {' · '}
                          {z.verliehen} verliehen
                        </Text>
                      )}
                      {z.vorgemerkt > 0 && (
                        <Text span size="xs" c="cyan" inherit>
                          {' · '}
                          {z.vorgemerkt} vorgemerkt
                        </Text>
                      )}
                    </Text>
                  ))}
                  {verbautZeilen(g).map((v) => (
                    <Text key={v.id} size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                      {[anzahlText(v.anzahl), v.text].filter(Boolean).join(' ')}
                    </Text>
                  ))}
                  {zeilen.length === 0 && g.verbaut.length === 0 && (
                    <Text size="sm" c="dimmed">
                      Kein Platz zugeordnet
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    {abweichung && (
                      <Badge color="orange" variant="light">
                        {abweichung}
                      </Badge>
                    )}
                    {g.archiviert && (
                      <Badge color="gray" variant="light">
                        Archiviert
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

const MAX_INHALT = 4;

function IfcoKarte({
  ifco,
  inv,
  aufraeumen,
}: Readonly<{
  ifco: IfcoEintrag;
  inv: ReturnType<typeof useInventar>;
  /** Set while an Aufräumaktion runs: the done entry of this IFCO, if any. */
  aufraeumen?: { fertig: AufraeumFertigEintrag | undefined };
}>) {
  const inhalt = ifco.inhalt
    .map((p) => ({
      ...p,
      name: inv.gegenstaende.find((g) => g.id === p.gegenstandId)?.name ?? 'Unbekannt',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const link = `/inventar/ifcos/${encodeURIComponent(ifco.id)}`;
  const fertig = aufraeumen?.fertig;
  const inhaltAnzeige = (
    <Stack gap={4}>
      {fertig && <FertigBadge f={fertig} />}
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
  );
  // While clearing up, the button sits below the link area (no button inside a link).
  if (aufraeumen)
    return (
      <Paper withBorder p="md" opacity={fertig ? 0.6 : 1}>
        <Stack gap="sm">
          <Box component={Link} to={link} style={kartenStil}>
            {inhaltAnzeige}
          </Box>
          <FertigKnopf ifcoId={ifco.id} fertig={!!fertig} />
        </Stack>
      </Paper>
    );
  return (
    <Paper
      component={Link}
      to={link}
      withBorder
      p="md"
      opacity={ifco.archiviert ? 0.6 : 1}
      style={kartenStil}
    >
      {inhaltAnzeige}
    </Paper>
  );
}

const ifcoLink = (id: string) => `/inventar/ifcos/${encodeURIComponent(id)}`;

/**
 * Table of IFCOs from `sm` on; the whole row opens the IFCO. While clearing up, the last column
 * holds "Fertig" / "Wieder öffnen".
 */
function IfcoTabelle({
  liste,
  inv,
  sortierung,
  umgekehrt,
  onSort,
  aufraeumen,
}: Readonly<{
  liste: IfcoEintrag[];
  inv: ReturnType<typeof useInventar>;
  sortierung: IfcoSortierung;
  umgekehrt: boolean;
  onSort: (spalte: IfcoSortierung) => void;
  /** Set while an Aufräumaktion runs. */
  aufraeumen: Map<string, AufraeumFertigEintrag> | null;
}>) {
  const navigate = useNavigate();
  const kopf = (spalte: IfcoSortierung, label: string) => (
    <SortKopf
      spalte={spalte}
      label={label}
      sortierung={sortierung}
      umgekehrt={umgekehrt}
      onSort={onSort}
    />
  );
  const name = (id: string) => inv.gegenstaende.find((g) => g.id === id)?.name ?? 'Unbekannt';
  return (
    <Table.ScrollContainer minWidth={760} visibleFrom="sm">
      <Table verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            {kopf('name', 'Name')}
            {kopf('platz', 'Standort')}
            <Table.Th>Inhalt</Table.Th>
            <Table.Th>Status</Table.Th>
            {aufraeumen && <Table.Th>Aufräumen</Table.Th>}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {liste.map((i) => {
            const inhalt = i.inhalt
              .map((p) => ({ ...p, name: name(p.gegenstandId) }))
              .sort((a, b) => a.name.localeCompare(b.name, 'de'));
            const fertig = aufraeumen?.get(i.id);
            return (
              <Table.Tr
                key={i.id}
                opacity={i.archiviert || fertig ? 0.6 : 1}
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  // Links and buttons in the row act on their own.
                  if (!(e.target as HTMLElement).closest('a, button')) navigate(ifcoLink(i.id));
                }}
              >
                <Table.Td>
                  <Link to={ifcoLink(i.id)} style={kartenStil}>
                    <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                      {i.name}
                    </Text>
                  </Link>
                  <Text size="sm" c="dimmed">
                    {typAnzeige(i.typId, inv.ifcoTypen)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {i.lagerortId ? (
                    <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                      {pfad(inv.lagerorte, i.lagerortId)}
                    </Text>
                  ) : (
                    <Badge color="orange" variant="light">
                      Ohne Platz
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>
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
                </Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    {fertig && <FertigBadge f={fertig} />}
                    {i.ausleihe && (
                      <Badge
                        color={i.ausleihe.status === 'geplant' ? 'cyan' : 'grape'}
                        variant="light"
                        style={{ maxWidth: '100%' }}
                      >
                        {ifcoAusleiheKurz(i.ausleihe)}
                      </Badge>
                    )}
                    {i.archiviert && (
                      <Badge color="gray" variant="light">
                        Archiviert
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
                {aufraeumen && (
                  <Table.Td>
                    {!i.archiviert && <FertigKnopf ifcoId={i.id} fertig={!!fertig} />}
                  </Table.Td>
                )}
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

/** Where is what? Gegenstände and IFCOs with their places, search, Kategorie filter and archive switch. */
export function InventarPage() {
  const inv = useInventar();
  const darfVerwalten = useAuth().can('inventar:verwalten');
  const [params, setParams] = useSearchParams();
  const ansichtParam = params.get('ansicht');
  const ansicht: Ansicht =
    ansichtParam === 'ifcos' || ansichtParam === 'verliehen' ? ansichtParam : 'gegenstaende';
  const [suche, setSuche] = useState('');
  const [kategorie, setKategorie] = useState<string | null>(null);
  const [archiv, setArchiv] = useState(false);
  const [sortierung, setSortierung] = useState<GegenstandSortierung>('name');
  const [umgekehrt, setUmgekehrt] = useState(false);
  const [anlegen, setAnlegen] = useState(false);
  const [ifcoSortierung, setIfcoSortierung] = useState<IfcoSortierung>('name');
  const [ifcoUmgekehrt, setIfcoUmgekehrt] = useState(false);
  const aufraeumen = useAufraeumen();
  const [nurOffen, setNurOffen] = useState(false);

  const ifcosSortierenNach = (spalte: IfcoSortierung) => {
    if (spalte === ifcoSortierung) setIfcoUmgekehrt((u) => !u);
    else {
      setIfcoSortierung(spalte);
      setIfcoUmgekehrt(false);
    }
  };

  const sortieren = (spalte: GegenstandSortierung) => {
    if (spalte === sortierung) setUmgekehrt((u) => !u);
    else {
      setSortierung(spalte);
      setUmgekehrt(false);
    }
  };

  const waehleAnsicht = (wert: string) =>
    setParams(wert === 'gegenstaende' ? {} : { ansicht: wert }, { replace: true });

  const kategorienDaten = useMemo(
    () => kategorieOptionen(inv.kategorien, kategorie),
    [inv.kategorien, kategorie],
  );

  const gegenstaende = useMemo(() => {
    const ids = kategorie ? new Set(teilbaumIds(inv.kategorien, kategorie)) : null;
    const q = suche.trim().toLowerCase();
    const treffer = inv.gegenstaende
      .filter((g) => archiv || !g.archiviert)
      .filter((g) => !ids || ids.has(g.kategorieId))
      .filter((g) => {
        if (!q) return true;
        if (g.name.toLowerCase().includes(q) || g.beschreibung?.toLowerCase().includes(q))
          return true;
        if (g.verbaut.some((v) => v.ort.toLowerCase().includes(q))) return true;
        // Also find a Gegenstand by the IFCO or the Lagerort it lies in.
        return g.plaetze.some((p) =>
          platzText(inv.lagerorte, inv.ifcos, p).toLowerCase().includes(q),
        );
      });
    return gegenstaendeSortieren(
      treffer,
      sortierung,
      { kategorien: inv.kategorien, lagerorte: inv.lagerorte, ifcos: inv.ifcos },
      umgekehrt,
    );
  }, [
    inv.gegenstaende,
    inv.kategorien,
    inv.lagerorte,
    inv.ifcos,
    kategorie,
    suche,
    archiv,
    sortierung,
    umgekehrt,
  ]);

  const ifcos = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const name = (id: string) => inv.gegenstaende.find((g) => g.id === id)?.name ?? '';
    const treffer = inv.ifcos
      .filter((i) => archiv || !i.archiviert)
      .filter(
        (i) =>
          !q ||
          i.name.toLowerCase().includes(q) ||
          i.beschreibung?.toLowerCase().includes(q) ||
          (i.lagerortId !== null && pfad(inv.lagerorte, i.lagerortId).toLowerCase().includes(q)) ||
          i.inhalt.some((p) => name(p.gegenstandId).toLowerCase().includes(q)),
      );
    return ifcosSortieren(treffer, ifcoSortierung, inv.lagerorte, ifcoUmgekehrt);
  }, [inv.ifcos, inv.gegenstaende, inv.lagerorte, suche, archiv, ifcoSortierung, ifcoUmgekehrt]);

  // Clearing up covers the non-archived IFCOs; open ones come first, done ones after.
  const zuRaeumen = inv.ifcos.filter((i) => !i.archiviert);
  const fertigZahl = zuRaeumen.filter((i) => aufraeumen.fertig.has(i.id)).length;
  const ifcoListe = aufraeumen.aktion
    ? ifcos
        .filter((i) => !nurOffen || !aufraeumen.fertig.has(i.id))
        .sort((a, b) => Number(aufraeumen.fertig.has(a.id)) - Number(aufraeumen.fertig.has(b.id)))
    : ifcos;

  const imGegenstand = ansicht === 'gegenstaende';
  const leer = imGegenstand ? gegenstaende.length === 0 : ifcoListe.length === 0;

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
          { value: 'ifcos', label: 'IFCOs' },
          { value: 'verliehen', label: 'Verliehen' },
        ]}
      />
      {aufraeumen.aktion && ansicht !== 'ifcos' && (
        <AufraeumHinweis gesamt={zuRaeumen.length} fertig={fertigZahl} />
      )}
      {ansicht === 'ifcos' && !aufraeumen.laedt && (
        <AufraeumPanel
          aktion={aufraeumen.aktion}
          gesamt={zuRaeumen.length}
          fertig={fertigZahl}
          nurOffen={nurOffen}
          onNurOffen={setNurOffen}
        />
      )}
      {ansicht === 'verliehen' && <VerlieheneAnsicht inv={inv} />}
      {ansicht !== 'verliehen' && darfVerwalten && (
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <Button leftSection={<IconPlus size={18} />} onClick={() => setAnlegen(true)}>
            {imGegenstand ? 'Gegenstand anlegen' : 'IFCO anlegen'}
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
                imGegenstand ? 'Name, IFCO oder Platz suchen' : 'Name oder Inhalt suchen'
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
          {imGegenstand ? (
            <Select
              label="Sortieren nach"
              data={GEGENSTAND_SORTIERUNGEN}
              value={sortierung}
              onChange={(v) => {
                if (v) {
                  setSortierung(v as GegenstandSortierung);
                  setUmgekehrt(false);
                }
              }}
              allowDeselect={false}
              maw={{ sm: 280 }}
            />
          ) : (
            <Select
              label="Sortieren nach"
              data={IFCO_SORTIERUNGEN}
              value={ifcoSortierung}
              onChange={(v) => {
                if (v) {
                  setIfcoSortierung(v as IfcoSortierung);
                  setIfcoUmgekehrt(false);
                }
              }}
              allowDeselect={false}
              maw={{ sm: 280 }}
            />
          )}
          <Switch
            label="Archivierte anzeigen"
            checked={archiv}
            onChange={(e) => setArchiv(e.currentTarget.checked)}
          />
          {inv.laedt && <Loader m="md" aria-label="Inventar wird geladen" />}
          {inv.fehler && <Alert color="red">Das Inventar konnte nicht geladen werden.</Alert>}
          {!inv.laedt && !inv.fehler && leer && (
            <Text c="dimmed">
              {imGegenstand
                ? 'Keine Gegenstände gefunden.'
                : nurOffen && aufraeumen.aktion
                  ? 'Keine offenen IFCOs.'
                  : 'Keine IFCOs gefunden.'}
            </Text>
          )}
          {imGegenstand ? (
            <>
              <SimpleGrid cols={1} hiddenFrom="sm">
                {gegenstaende.map((g) => (
                  <GegenstandKarte key={g.id} g={g} inv={inv} />
                ))}
              </SimpleGrid>
              {gegenstaende.length > 0 && (
                <GegenstandTabelle
                  liste={gegenstaende}
                  inv={inv}
                  sortierung={sortierung}
                  umgekehrt={umgekehrt}
                  onSort={sortieren}
                />
              )}
            </>
          ) : (
            <>
              <SimpleGrid cols={1} hiddenFrom="sm">
                {ifcoListe.map((i) => (
                  <IfcoKarte
                    key={i.id}
                    ifco={i}
                    inv={inv}
                    aufraeumen={
                      aufraeumen.aktion && !i.archiviert
                        ? { fertig: aufraeumen.fertig.get(i.id) }
                        : undefined
                    }
                  />
                ))}
              </SimpleGrid>
              {ifcoListe.length > 0 && (
                <IfcoTabelle
                  liste={ifcoListe}
                  inv={inv}
                  sortierung={ifcoSortierung}
                  umgekehrt={ifcoUmgekehrt}
                  onSort={ifcosSortierenNach}
                  aufraeumen={aufraeumen.aktion ? aufraeumen.fertig : null}
                />
              )}
            </>
          )}
        </>
      )}
      {anlegen && imGegenstand && (
        <GegenstandFormular
          kategorien={inv.kategorien}
          lagerorte={inv.lagerorte}
          ifcos={inv.ifcos}
          onClose={() => setAnlegen(false)}
        />
      )}
      {anlegen && ansicht === 'ifcos' && (
        <IfcoFormular
          lagerorte={inv.lagerorte}
          ifcos={inv.ifcos}
          typen={inv.ifcoTypen}
          gegenstaende={inv.gegenstaende}
          kategorien={inv.kategorien}
          onClose={() => setAnlegen(false)}
        />
      )}
    </Stack>
  );
}
