import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconArchive, IconArchiveOff, IconEdit, IconPlus } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { centAnzeigen, KONTO_ART_LABELS, KONTO_ARTEN, type KontoDto } from '@c4/shared';
import { AktionsMenue } from '../AktionsMenue';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { BETRAG_STIL, FINANZEN_KEY, useKonten } from '../finanzenDaten';
import { InfoHinweis } from '../InfoHinweis';
import { HILFE } from '../finanzenHilfe';
import { KontoFormular } from '../KontoFormular';
import { fehlerAnzeigen, pruefen } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

const nachName = (a: KontoDto, b: KontoDto) =>
  a.name.localeCompare(b.name, 'de', { numeric: true });

interface Zeile {
  konto: KontoDto;
  tiefe: number;
}

/** Accounts of one art in tree order; sub accounts follow their parent, indented. */
function baum(gruppe: readonly KontoDto[]): Zeile[] {
  const ids = new Set(gruppe.map((k) => k.id));
  const kinder = new Map<string, KontoDto[]>();
  const wurzeln: KontoDto[] = [];
  for (const k of [...gruppe].sort(nachName)) {
    if (k.parentId && ids.has(k.parentId)) {
      kinder.set(k.parentId, [...(kinder.get(k.parentId) ?? []), k]);
    } else wurzeln.push(k);
  }
  const zeilen: Zeile[] = [];
  const hinzu = (k: KontoDto, tiefe: number) => {
    zeilen.push({ konto: k, tiefe });
    for (const kind of kinder.get(k.id) ?? []) hinzu(kind, tiefe + 1);
  };
  for (const w of wurzeln) hinzu(w, 0);
  return zeilen;
}

/** Chart of accounts grouped by art, with saldo; managers can create, edit and archive. */
export function FinanzenKontenPage() {
  const api = useApi();
  const qc = useQueryClient();
  const darfVerwalten = useAuth().can('finanzen:verwalten');
  const [archiv, setArchiv] = useState(false);
  const [formular, setFormular] = useState<{ konto?: KontoDto } | null>(null);
  // Always load the archived accounts too (parent options, names); the switch only filters.
  const konten = useKonten(true);
  const namen = useMemo(
    () => new Map((konten.data ?? []).map((k) => [k.id, k.name])),
    [konten.data],
  );

  const archivMutation = useMutation({
    mutationFn: async (k: KontoDto) =>
      pruefen(
        await api.finanzen.konten[':id'].archiv.$put({
          param: { id: k.id },
          json: { archiviert: !k.archiviert },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: FINANZEN_KEY }),
    onError: (e) => fehlerAnzeigen(e),
  });

  const aktionsMenue = (k: KontoDto) => (
    <AktionsMenue
      label={`Aktionen für ${k.name}`}
      aktionen={[
        {
          text: 'Bearbeiten',
          icon: <IconEdit size={18} />,
          onClick: () => setFormular({ konto: k }),
          sichtbar: darfVerwalten,
        },
        {
          text: k.archiviert ? 'Wiederherstellen' : 'Archivieren',
          icon: k.archiviert ? <IconArchiveOff size={18} /> : <IconArchive size={18} />,
          onClick: () => archivMutation.mutate(k),
          sichtbar: darfVerwalten,
          trenner: true,
        },
      ]}
    />
  );

  const gruppen = KONTO_ARTEN.map((art) => ({
    art,
    zeilen: baum((konten.data ?? []).filter((k) => k.art === art && (archiv || !k.archiviert))),
  })).filter((g) => g.zeilen.length > 0);

  return (
    <Stack maw={1100}>
      <ZurueckLink to="/finanzen">Finanzen</ZurueckLink>
      <Group justify="space-between" wrap="wrap">
        <Title order={2}>Kontenplan</Title>
        {darfVerwalten && (
          <Button leftSection={<IconPlus size={18} />} onClick={() => setFormular({})}>
            Konto anlegen
          </Button>
        )}
      </Group>
      <Group gap={2}>
        <Switch
          label="Archivierte anzeigen"
          checked={archiv}
          onChange={(e) => setArchiv(e.currentTarget.checked)}
        />
        <InfoHinweis feld="Archivieren" text={HILFE.konto.archivieren} />
      </Group>
      {konten.isPending && <Loader m="md" aria-label="Konten werden geladen" />}
      {konten.isError && <Alert color="red">Die Konten konnten nicht geladen werden.</Alert>}
      {konten.data && gruppen.length === 0 && <Text c="dimmed">Keine Konten vorhanden.</Text>}
      <Stack hiddenFrom="sm" gap="md">
        {gruppen.map(({ art, zeilen }) => (
          <Stack key={art} gap="xs">
            <Title order={4}>{KONTO_ART_LABELS[art]}</Title>
            {zeilen.map(({ konto: k, tiefe }) => (
              <Paper
                key={k.id}
                withBorder
                p={4}
                pl="sm"
                ml={tiefe * 20}
                opacity={k.archiviert ? 0.6 : 1}
              >
                <Group gap={4} wrap="nowrap" mih={42}>
                  <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                    <Group gap="xs">
                      <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                        {k.name}
                      </Text>
                      {k.stueckelung && (
                        <Badge variant="light" color="gray">
                          Stückelung
                        </Badge>
                      )}
                      {k.archiviert && (
                        <Badge color="gray" variant="light">
                          Archiviert
                        </Badge>
                      )}
                    </Group>
                    {k.parentId && !zeilen.some((z) => z.konto.id === k.parentId) && (
                      <Text size="sm" c="dimmed">
                        Unter {namen.get(k.parentId) ?? 'unbekannt'}
                      </Text>
                    )}
                    {k.steuersatzStandard !== null && (
                      <Text size="sm" c="dimmed">
                        Steuersatz {(k.steuersatzStandard / 100).toLocaleString('de-DE')} %
                      </Text>
                    )}
                  </Stack>
                  <Text
                    fw={600}
                    component={Link}
                    to={`/finanzen/journal?konto=${encodeURIComponent(k.id)}`}
                    c={k.saldoGesamtCent < 0 ? 'red' : undefined}
                    style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}
                    aria-label={`Buchungen von ${k.name}, Saldo ${centAnzeigen(k.saldoGesamtCent)}`}
                  >
                    {centAnzeigen(k.saldoGesamtCent)}
                  </Text>
                  {aktionsMenue(k)}
                </Group>
              </Paper>
            ))}
          </Stack>
        ))}
      </Stack>
      {gruppen.length > 0 && (
        <Box visibleFrom="sm">
          <Table verticalSpacing={6} tabularNums stickyHeader stickyHeaderOffset={56}>
            <Table.Thead style={{ background: 'var(--mantine-color-body)' }}>
              <Table.Tr>
                <Table.Th>Konto</Table.Th>
                <Table.Th w={130}>Stückelung</Table.Th>
                <Table.Th w={160} style={BETRAG_STIL}>
                  Saldo
                </Table.Th>
                <Table.Th w={120}>Status</Table.Th>
                <Table.Th w={56} aria-label="Aktionen" />
              </Table.Tr>
            </Table.Thead>
            {gruppen.map(({ art, zeilen }) => (
              <Table.Tbody key={art}>
                <Table.Tr style={{ background: 'var(--mantine-color-default-hover)' }}>
                  <Table.Td colSpan={5}>
                    <Text fw={700} size="sm">
                      {KONTO_ART_LABELS[art]}
                    </Text>
                  </Table.Td>
                </Table.Tr>
                {zeilen.map(({ konto: k, tiefe }) => (
                  <Table.Tr key={k.id} opacity={k.archiviert ? 0.6 : 1}>
                    <Table.Td
                      style={{ paddingLeft: `calc(var(--mantine-spacing-xs) + ${tiefe * 24}px)` }}
                    >
                      <Text fw={tiefe === 0 ? 600 : 400} style={{ overflowWrap: 'anywhere' }}>
                        {k.name}
                      </Text>
                      {k.parentId && !zeilen.some((z) => z.konto.id === k.parentId) && (
                        <Text size="xs" c="dimmed">
                          Unter {namen.get(k.parentId) ?? 'unbekannt'}
                        </Text>
                      )}
                      {k.steuersatzStandard !== null && (
                        <Text size="xs" c="dimmed">
                          Steuersatz {(k.steuersatzStandard / 100).toLocaleString('de-DE')} %
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {k.stueckelung && (
                        <Badge variant="light" color="gray">
                          Stückelung
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td style={BETRAG_STIL}>
                      <Text
                        fw={600}
                        component={Link}
                        to={`/finanzen/journal?konto=${encodeURIComponent(k.id)}`}
                        c={k.saldoGesamtCent < 0 ? 'red' : undefined}
                        style={{ textDecoration: 'none', ...BETRAG_STIL }}
                        aria-label={`Buchungen von ${k.name}, Saldo ${centAnzeigen(k.saldoGesamtCent)}`}
                      >
                        {centAnzeigen(k.saldoGesamtCent)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {k.archiviert ? (
                        <Badge color="gray" variant="light">
                          Archiviert
                        </Badge>
                      ) : (
                        <Badge color="teal" variant="light">
                          Aktiv
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>{aktionsMenue(k)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            ))}
          </Table>
        </Box>
      )}
      {formular && (
        <KontoFormular
          konto={formular.konto}
          konten={konten.data ?? []}
          onClose={() => setFormular(null)}
        />
      )}
    </Stack>
  );
}
