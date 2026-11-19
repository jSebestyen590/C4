import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconPlus, IconSelector } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  centAnzeigen,
  datumAnzeigen,
  JOURNAL_MAX,
  QUELLE_TYP_LABELS,
  type BuchungListeDto,
  type BuchungRichtungDto,
} from '@c4/shared';
import { unwrap, useApi } from '../api';
import { useAuth } from '../auth';
import { DatumFeld } from '../DatumFeld';
import { BETRAG_STIL, detailPfad, finanzenKeys, kontoOptionen, useKonten } from '../finanzenDaten';
import {
  bewegungText,
  journalSortieren,
  richtungKurz,
  richtungText,
  richtungZeilen,
  saldoText,
  SORT_SPALTEN,
  sortAusParams,
  sortLabel,
  vonNachText,
  type SortRichtung,
  type SortSpalte,
} from '../finanzenJournal';
import { mitgliedName } from '../mitglied';
import { StatusName } from '../StatusAnzeige';
import { ZurueckLink } from '../ZurueckLink';

/** The creator as plain bold, status-colored text (no link). */
function Ersteller({ b }: Readonly<{ b: BuchungListeDto }>) {
  const m = b.erstelltVon;
  if (!m) return <Text span>–</Text>;
  return <StatusName status={m.status}>{mitgliedName(m)}</StatusName>;
}

/** Clickable column header: shows the sort state and toggles the direction. */
function SortKopf({
  spalte,
  aktiv,
  richtung,
  mitKonto,
  rechts,
  onSort,
}: Readonly<{
  spalte: SortSpalte;
  aktiv: SortSpalte;
  richtung: SortRichtung;
  mitKonto: boolean;
  rechts?: boolean;
  onSort: (spalte: SortSpalte) => void;
}>) {
  const istAktiv = spalte === aktiv;
  const Icon = !istAktiv ? IconSelector : richtung === 'asc' ? IconArrowUp : IconArrowDown;
  return (
    <UnstyledButton
      onClick={() => onSort(spalte)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        minHeight: 42,
        width: '100%',
        justifyContent: rechts ? 'flex-end' : 'flex-start',
        font: 'inherit',
        fontWeight: 'inherit',
      }}
    >
      <span>{sortLabel(spalte, mitKonto)}</span>
      <Icon size={14} aria-hidden style={{ flexShrink: 0, opacity: istAktiv ? 1 : 0.5 }} />
    </UnstyledButton>
  );
}

function StornoBadges({ b }: Readonly<{ b: BuchungListeDto }>) {
  return (
    <>
      {b.stornoVon && (
        <Badge color="orange" variant="light">
          Storno von Nr. {b.stornoVon.seq}
        </Badge>
      )}
      {b.storniertDurch && (
        <Badge color="red" variant="light">
          Storniert durch Nr. {b.storniertDurch.seq}
        </Badge>
      )}
    </>
  );
}

const NEGATIV_FARBE = 'var(--mantine-color-red-7)';

/** One side of a booking, truncated with ellipsis; a tooltip lists all accounts when shortened. */
function Richtung({ konten }: Readonly<{ konten: BuchungRichtungDto[] }>) {
  const { namen, weitere } = richtungKurz(konten);
  const text =
    namen.length === 0 ? '–' : namen.join(', ') + (weitere > 0 ? ` + ${weitere} weitere` : '');
  const inhalt = (
    <Text span inline style={{ display: 'block', minWidth: 0 }} truncate="end">
      {text}
    </Text>
  );
  return (
    <Tooltip
      multiline
      maw={320}
      label={richtungZeilen(konten).map((z) => (
        <div key={z}>{z}</div>
      ))}
      disabled={weitere === 0 && text.length < 30}
      events={{ hover: true, focus: true, touch: true }}
    >
      {inhalt}
    </Tooltip>
  );
}

/** Account-statement amount: the word says the direction, red and bold only add to it. */
function Bewegung({ cent }: Readonly<{ cent: number }>) {
  return (
    <Text
      span
      fw={cent < 0 ? 600 : 400}
      style={{ ...BETRAG_STIL, color: cent < 0 ? NEGATIV_FARBE : undefined }}
    >
      {bewegungText(cent)}
    </Text>
  );
}

function Saldo({ cent }: Readonly<{ cent: number }>) {
  return (
    <Text span style={{ ...BETRAG_STIL, color: cent < 0 ? NEGATIV_FARBE : undefined }}>
      {saldoText(cent)}
    </Text>
  );
}

/** The journal, newest first, as cards on phones and a table from `sm`; filter by account and period. */
export function FinanzenJournalPage() {
  const api = useApi();
  const navigate = useNavigate();
  const darfBuchen = useAuth().can('finanzen:buchen');
  const [params, setParams] = useSearchParams();
  const kontoId = params.get('konto') ?? '';
  const von = params.get('von') ?? '';
  const bis = params.get('bis') ?? '';
  const setFilter = (name: string, wert: string | null) =>
    setParams(
      (alt) => {
        const neu = new URLSearchParams(alt);
        if (wert) neu.set(name, wert);
        else neu.delete(name);
        return neu;
      },
      { replace: true },
    );

  const konten = useKonten(true);
  const nurStorno = params.get('storno') === '1';
  const sort = sortAusParams(params.get('sort'), params.get('richtung'), kontoId !== '');
  const setSort = (spalte: SortSpalte, richtung: SortRichtung) =>
    setParams(
      (alt) => {
        const neu = new URLSearchParams(alt);
        neu.set('sort', spalte);
        neu.set('richtung', richtung);
        return neu;
      },
      { replace: true },
    );
  // Same column again: flip the direction; a new column starts descending for Nr./Datum/amounts.
  const sortUmschalten = (spalte: SortSpalte) =>
    setSort(
      spalte,
      spalte === sort.spalte
        ? sort.richtung === 'asc'
          ? 'desc'
          : 'asc'
        : ['text', 'von', 'nach', 'erstellt'].includes(spalte)
          ? 'asc'
          : 'desc',
    );
  const sortOptionen = SORT_SPALTEN.filter((s) =>
    s === 'saldo' ? kontoId !== '' : s === 'nach' ? kontoId === '' : true,
  ).flatMap((s) => [
    { value: `${s}:asc`, label: `${sortLabel(s, kontoId !== '')}, aufsteigend` },
    { value: `${s}:desc`, label: `${sortLabel(s, kontoId !== '')}, absteigend` },
  ]);

  const seiten = useQuery({
    queryKey: finanzenKeys.buchungen({ kontoId, von, bis, nurStorno }),
    queryFn: async () =>
      unwrap(
        await api.finanzen.buchungen.$get({
          query: {
            ...(kontoId && { kontoId }),
            ...(von && { von }),
            ...(bis && { bis }),
            ...(nurStorno && { storno: '1' }),
          },
        }),
      ),
  });
  // Sorted here over the complete result, so every column sorts correctly.
  const buchungen = useMemo(
    () =>
      journalSortieren(seiten.data?.buchungen ?? [], sort.spalte, sort.richtung, kontoId !== ''),
    [seiten.data, sort.spalte, sort.richtung, kontoId],
  );

  const ariaSort = (spalte: SortSpalte) =>
    spalte === sort.spalte ? (sort.richtung === 'asc' ? 'ascending' : 'descending') : 'none';
  const kopfProps = {
    aktiv: sort.spalte,
    richtung: sort.richtung,
    mitKonto: kontoId !== '',
    onSort: sortUmschalten,
  };

  return (
    <Stack>
      <ZurueckLink to="/finanzen">Finanzen</ZurueckLink>
      <Group justify="space-between" wrap="nowrap">
        <Title order={2}>Journal</Title>
        {darfBuchen && (
          <Button component={Link} to="/finanzen/buchen" leftSection={<IconPlus size={18} />}>
            Buchen
          </Button>
        )}
      </Group>
      <SimpleGrid style={{ alignItems: 'end' }} cols={{ base: 1, sm: 3 }}>
        <Select
          selectFirstOptionOnChange
          label="Konto"
          placeholder="Alle Konten"
          clearable
          searchable
          data={kontoOptionen(konten.data ?? [])}
          value={kontoId || null}
          onChange={(v) => setFilter('konto', v)}
          nothingFoundMessage="Kein Konto gefunden"
        />
        <DatumFeld label="Von" value={von} onWert={(v) => setFilter('von', v)} />
        <DatumFeld label="Bis" value={bis} onWert={(v) => setFilter('bis', v)} />
      </SimpleGrid>
      <Switch
        size="md"
        label="Nur Stornos (mit den stornierten Buchungen)"
        checked={nurStorno}
        onChange={(e) => setFilter('storno', e.currentTarget.checked ? '1' : null)}
      />
      {seiten.data?.gekappt && (
        <Alert color="yellow">
          Es werden die neuesten {JOURNAL_MAX.toLocaleString('de-DE')} Buchungen gezeigt – grenze
          den Zeitraum ein.
        </Alert>
      )}
      {seiten.isPending && <Loader m="md" aria-label="Buchungen werden geladen" />}
      {seiten.isError && <Alert color="red">Das Journal konnte nicht geladen werden.</Alert>}
      {seiten.data && buchungen.length === 0 && <Text c="dimmed">Keine Buchungen gefunden.</Text>}

      {buchungen.length > 0 && (
        <Select
          hiddenFrom="sm"
          label="Sortieren nach"
          allowDeselect={false}
          data={sortOptionen}
          value={`${sort.spalte}:${sort.richtung}`}
          onChange={(v) => {
            const [spalte, richtung] = (v ?? '').split(':');
            setSort(spalte as SortSpalte, richtung as SortRichtung);
          }}
        />
      )}
      <SimpleGrid cols={1} hiddenFrom="sm">
        {buchungen.map((b) => (
          <Paper
            key={b.id}
            withBorder
            p="md"
            component={Link}
            to={detailPfad(b.id)}
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            <Stack gap="xs">
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Text fw={600}>Nr. {b.seq}</Text>
                {b.konto ? (
                  <Bewegung cent={b.konto.betragCent} />
                ) : (
                  <Text fw={600} style={BETRAG_STIL}>
                    {centAnzeigen(b.betragCent)}
                  </Text>
                )}
              </Group>
              <Text style={{ overflowWrap: 'anywhere' }}>{b.text}</Text>
              <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                {b.konto
                  ? b.konto.betragCent < 0
                    ? `Nach ${richtungText(b.zugang)}`
                    : `Von ${richtungText(b.abgang)}`
                  : vonNachText(b.abgang, b.zugang)}
              </Text>
              <Text size="sm" c="dimmed">
                {datumAnzeigen(b.datum)} ·{' '}
                {QUELLE_TYP_LABELS[b.quelleTyp as keyof typeof QUELLE_TYP_LABELS] ?? b.quelleTyp}
              </Text>
              {b.konto && (
                <Text size="sm">
                  Saldo danach: <Saldo cent={b.konto.saldoNachCent} />
                </Text>
              )}
              {(b.stornoVon || b.storniertDurch) && (
                <Group gap="xs">
                  <StornoBadges b={b} />
                </Group>
              )}
              <Text size="sm">
                Von <Ersteller b={b} />
              </Text>
            </Stack>
          </Paper>
        ))}
      </SimpleGrid>

      {buchungen.length > 0 && (
        <Box visibleFrom="sm">
          <Table.ScrollContainer
            minWidth={900}
            maxHeight="max(360px, calc(100dvh - 120px))"
            type="native"
          >
            <Table
              verticalSpacing={6}
              highlightOnHover
              tabularNums
              stickyHeader
              stickyHeaderOffset={0}
            >
              <Table.Thead style={{ background: 'var(--mantine-color-body)' }}>
                <Table.Tr>
                  <Table.Th w={80} style={BETRAG_STIL} aria-sort={ariaSort('nr')}>
                    <SortKopf spalte="nr" rechts {...kopfProps} />
                  </Table.Th>
                  <Table.Th w={120} aria-sort={ariaSort('datum')}>
                    <SortKopf spalte="datum" {...kopfProps} />
                  </Table.Th>
                  <Table.Th miw={200} aria-sort={ariaSort('text')}>
                    <SortKopf spalte="text" {...kopfProps} />
                  </Table.Th>
                  <Table.Th w={160} aria-sort={ariaSort('von')}>
                    <SortKopf spalte="von" {...kopfProps} />
                  </Table.Th>
                  {!kontoId && (
                    <Table.Th w={160} aria-sort={ariaSort('nach')}>
                      <SortKopf spalte="nach" {...kopfProps} />
                    </Table.Th>
                  )}
                  <Table.Th w={170} style={BETRAG_STIL} aria-sort={ariaSort('betrag')}>
                    <SortKopf spalte="betrag" rechts {...kopfProps} />
                  </Table.Th>
                  {kontoId && (
                    <Table.Th w={150} style={BETRAG_STIL} aria-sort={ariaSort('saldo')}>
                      <SortKopf spalte="saldo" rechts {...kopfProps} />
                    </Table.Th>
                  )}
                  <Table.Th aria-sort={ariaSort('erstellt')}>
                    <SortKopf spalte="erstellt" {...kopfProps} />
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {buchungen.map((b) => (
                  <Table.Tr
                    key={b.id}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      // The Nr. link navigates on its own.
                      if (!(e.target as HTMLElement).closest('a')) void navigate(detailPfad(b.id));
                    }}
                  >
                    <Table.Td style={BETRAG_STIL}>
                      <Link
                        to={detailPfad(b.id)}
                        style={{ color: 'inherit', textDecoration: 'none' }}
                      >
                        {b.seq}
                      </Link>
                    </Table.Td>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>{datumAnzeigen(b.datum)}</Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Text span style={{ overflowWrap: 'anywhere' }}>
                          {b.text}
                        </Text>
                        <StornoBadges b={b} />
                      </Group>
                    </Table.Td>
                    <Table.Td style={{ maxWidth: 0, width: 160 }}>
                      <Richtung konten={b.konto && b.konto.betragCent < 0 ? b.zugang : b.abgang} />
                    </Table.Td>
                    {!b.konto && (
                      <Table.Td style={{ maxWidth: 0, width: 160 }}>
                        <Richtung konten={b.zugang} />
                      </Table.Td>
                    )}
                    <Table.Td style={BETRAG_STIL}>
                      {b.konto ? (
                        <Bewegung cent={b.konto.betragCent} />
                      ) : (
                        centAnzeigen(b.betragCent)
                      )}
                    </Table.Td>
                    {b.konto && (
                      <Table.Td style={BETRAG_STIL}>
                        <Saldo cent={b.konto.saldoNachCent} />
                      </Table.Td>
                    )}
                    <Table.Td>
                      <Ersteller b={b} />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Box>
      )}
    </Stack>
  );
}
