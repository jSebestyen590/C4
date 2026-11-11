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
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  centAnzeigen,
  datumAnzeigen,
  QUELLE_TYP_LABELS,
  type BuchungListeDto,
  type BuchungRichtungDto,
} from '@c4/shared';
import { unwrap, useApi } from '../api';
import { useAuth } from '../auth';
import { DatumFeld } from '../DatumFeld';
import { BETRAG_STIL, detailPfad, FINANZEN_KEY, kontoOptionen, useKonten } from '../finanzenDaten';
import {
  bewegungText,
  RICHTUNG_MAX,
  richtungKurz,
  richtungText,
  richtungZeilen,
  saldoText,
  vonNachText,
} from '../finanzenJournal';
import { mitgliedLink, mitgliedName } from '../mitglied';
import { StatusName } from '../StatusAnzeige';
import { ZurueckLink } from '../ZurueckLink';

function Ersteller({ b, verlinkt = true }: Readonly<{ b: BuchungListeDto; verlinkt?: boolean }>) {
  const m = b.erstelltVon;
  if (!m) return <Text span>–</Text>;
  // Inside a card that is itself a link, the name stays plain text (no nested anchors).
  if (!verlinkt) return <StatusName status={m.status}>{mitgliedName(m)}</StatusName>;
  return (
    <Link to={mitgliedLink(m)} style={{ textDecoration: 'none' }}>
      <StatusName status={m.status}>{mitgliedName(m)}</StatusName>
    </Link>
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

/** "Von → Nach" in one truncated line; the tooltip lists every account with its amount. */
function VonNach({ b }: Readonly<{ b: BuchungListeDto }>) {
  const lang = b.abgang.length > RICHTUNG_MAX || b.zugang.length > RICHTUNG_MAX;
  return (
    <Tooltip
      multiline
      maw={360}
      disabled={!lang}
      events={{ hover: true, focus: true, touch: true }}
      label={
        <div>
          {[
            ...richtungZeilen(b.abgang).map((z) => `Von ${z}`),
            ...richtungZeilen(b.zugang).map((z) => `Nach ${z}`),
          ].map((z) => (
            <div key={z}>{z}</div>
          ))}
        </div>
      }
    >
      <Text span inline style={{ display: 'block', minWidth: 0 }} truncate="end">
        {vonNachText(b.abgang, b.zugang)}
      </Text>
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
  const seiten = useInfiniteQuery({
    queryKey: [...FINANZEN_KEY, 'buchungen', { kontoId, von, bis }],
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.finanzen.buchungen.$get({
          query: {
            ...(kontoId && { kontoId }),
            ...(von && { von }),
            ...(bis && { bis }),
            ...(pageParam !== undefined && { vorSeq: String(pageParam) }),
          },
        }),
      ),
    getNextPageParam: (letzte) => letzte.weiter ?? undefined,
  });
  const buchungen = seiten.data?.pages.flatMap((p) => p.buchungen) ?? [];

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
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
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
      {seiten.isPending && <Loader m="md" aria-label="Buchungen werden geladen" />}
      {seiten.isError && <Alert color="red">Das Journal konnte nicht geladen werden.</Alert>}
      {seiten.data && buchungen.length === 0 && <Text c="dimmed">Keine Buchungen gefunden.</Text>}

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
                Von <Ersteller b={b} verlinkt={false} />
              </Text>
            </Stack>
          </Paper>
        ))}
      </SimpleGrid>

      {buchungen.length > 0 && (
        <Box visibleFrom="sm">
          <Table
            verticalSpacing={6}
            highlightOnHover
            tabularNums
            stickyHeader
            stickyHeaderOffset={56}
          >
            <Table.Thead style={{ background: 'var(--mantine-color-body)' }}>
              <Table.Tr>
                <Table.Th w={70} style={BETRAG_STIL}>
                  Nr.
                </Table.Th>
                <Table.Th w={110}>Datum</Table.Th>
                <Table.Th>Text</Table.Th>
                <Table.Th w={200}>{kontoId ? 'Gegenkonto' : 'Von → Nach'}</Table.Th>
                <Table.Th w={160} style={BETRAG_STIL}>
                  {kontoId ? 'Bewegung' : 'Betrag'}
                </Table.Th>
                {kontoId && (
                  <Table.Th w={140} style={BETRAG_STIL}>
                    Saldo danach
                  </Table.Th>
                )}
                <Table.Th>Erstellt von</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {buchungen.map((b) => (
                <Table.Tr
                  key={b.id}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    // Inner links (Nr., Ersteller) navigate on their own.
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
                  <Table.Td style={{ maxWidth: 0, width: 200 }}>
                    {b.konto ? (
                      <Richtung konten={b.konto.betragCent < 0 ? b.zugang : b.abgang} />
                    ) : (
                      <VonNach b={b} />
                    )}
                  </Table.Td>
                  <Table.Td style={BETRAG_STIL}>
                    {b.konto ? <Bewegung cent={b.konto.betragCent} /> : centAnzeigen(b.betragCent)}
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
        </Box>
      )}
      {seiten.hasNextPage && (
        <Button
          variant="default"
          loading={seiten.isFetchingNextPage}
          onClick={() => void seiten.fetchNextPage()}
        >
          Mehr laden
        </Button>
      )}
    </Stack>
  );
}
