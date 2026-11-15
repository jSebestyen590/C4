import {
  Alert,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconArrowsExchange, IconCoins, IconPlus, IconReportMoney } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { centAnzeigen, NENNWERTE_CENT, type BargeldFachDto } from '@c4/shared';
import { useAuth } from '../auth';
import { BETRAG_STIL, useBargeld } from '../finanzenDaten';
import { ZurueckLink } from '../ZurueckLink';

const ZAHL = new Intl.NumberFormat('de-DE');
const anzahlVon = (
  f: { bestand: readonly { nennwertCent: number; anzahl: number }[] },
  n: number,
) => f.bestand.find((b) => b.nennwertCent === n)?.anzahl ?? 0;

/** Card of one Fach for narrow screens: balance and the denominations that are in stock. */
function FachKarte({ fach }: Readonly<{ fach: BargeldFachDto }>) {
  const vorhanden = NENNWERTE_CENT.filter((n) => anzahlVon(fach, n) > 0);
  return (
    <Paper withBorder p="md">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
            {fach.name}
          </Text>
          <Text fw={600} style={BETRAG_STIL}>
            {centAnzeigen(fach.saldoCent)}
          </Text>
        </Group>
        {vorhanden.length === 0 ? (
          <Text size="sm" c="dimmed">
            Leer
          </Text>
        ) : (
          <Text size="sm" c="dimmed">
            {vorhanden
              .map((n) => `${ZAHL.format(anzahlVon(fach, n))} × ${centAnzeigen(n)}`)
              .join(' · ')}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

/** Bargeld overview: the Fächer of the Safe with their stock per coin and note, and the way to the actions. */
export function FinanzenBargeldPage() {
  const { can } = useAuth();
  const bargeld = useBargeld();
  const b = bargeld.data;
  return (
    <Stack maw={1300}>
      <ZurueckLink to="/finanzen">Finanzen</ZurueckLink>
      <Group justify="space-between" wrap="wrap">
        <Title order={2}>Bargeld</Title>
        <Group gap="sm" wrap="wrap">
          {can('finanzen:buchen') && (
            <>
              <Button
                component={Link}
                to="/finanzen/bargeld/umbuchen"
                leftSection={<IconArrowsExchange size={18} />}
              >
                Umbuchen
              </Button>
              <Button
                component={Link}
                to="/finanzen/bargeld/wechseln"
                variant="default"
                leftSection={<IconCoins size={18} />}
              >
                Wechseln
              </Button>
              <Button
                component={Link}
                to="/finanzen/bargeld/zaehlen"
                variant="default"
                leftSection={<IconReportMoney size={18} />}
              >
                Zählen
              </Button>
            </>
          )}
          <Button component={Link} to="/finanzen/bargeld/zaehlungen" variant="subtle">
            Zählungen
          </Button>
          {can('finanzen:verwalten') && (
            <Button
              component={Link}
              to="/finanzen/konten"
              variant="subtle"
              leftSection={<IconPlus size={18} />}
            >
              Fach anlegen
            </Button>
          )}
        </Group>
      </Group>
      {bargeld.isPending && <Loader m="md" aria-label="Bargeld wird geladen" />}
      {bargeld.isError && <Alert color="red">Das Bargeld konnte nicht geladen werden.</Alert>}
      {b && b.faecher.length === 0 && (
        <Alert color="blue" title="Noch keine Fächer">
          Der Safe hat noch keine Fächer.{' '}
          {can('finanzen:verwalten')
            ? 'Lege im Kontenplan ein Konto mit Stückelung unter „Safe“ an, z. B. „Wechselgeld“.'
            : 'Die Finanzer:in kann im Kontenplan Fächer anlegen.'}
        </Alert>
      )}
      {b && b.faecher.length > 0 && (
        <>
          <SimpleGrid cols={1} hiddenFrom="sm">
            {b.faecher.map((f) => (
              <FachKarte key={f.id} fach={f} />
            ))}
            <Paper withBorder p="md">
              <Group justify="space-between">
                <Text fw={700}>Gesamt</Text>
                <Text fw={700} style={BETRAG_STIL}>
                  {centAnzeigen(b.summeCent)}
                </Text>
              </Group>
            </Paper>
          </SimpleGrid>
          <Box visibleFrom="sm">
            <Table.ScrollContainer minWidth={480}>
              <Table verticalSpacing={6} tabularNums stickyHeader stickyHeaderOffset={56}>
                <Table.Thead style={{ background: 'var(--mantine-color-body)' }}>
                  <Table.Tr>
                    <Table.Th style={BETRAG_STIL}>Wert</Table.Th>
                    {b.faecher.map((f) => (
                      <Table.Th key={f.id} style={BETRAG_STIL}>
                        {f.name}
                      </Table.Th>
                    ))}
                    <Table.Th style={BETRAG_STIL}>Gesamt</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {NENNWERTE_CENT.map((n) => (
                    <Table.Tr key={n}>
                      <Table.Td style={BETRAG_STIL}>{centAnzeigen(n)}</Table.Td>
                      {b.faecher.map((f) => {
                        const a = anzahlVon(f, n);
                        return (
                          <Table.Td
                            key={f.id}
                            style={BETRAG_STIL}
                            c={a === 0 ? 'dimmed' : undefined}
                          >
                            {a === 0 ? '–' : ZAHL.format(a)}
                          </Table.Td>
                        );
                      })}
                      <Table.Td style={{ ...BETRAG_STIL, fontWeight: 600 }}>
                        {ZAHL.format(anzahlVon({ bestand: b.summeBestand }, n))}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
                <Table.Tfoot>
                  <Table.Tr>
                    <Table.Td>
                      <Text fw={700} size="sm" ta="right">
                        Betrag
                      </Text>
                    </Table.Td>
                    {b.faecher.map((f) => (
                      <Table.Td key={f.id} style={{ ...BETRAG_STIL, fontWeight: 700 }}>
                        {centAnzeigen(f.saldoCent)}
                      </Table.Td>
                    ))}
                    <Table.Td style={{ ...BETRAG_STIL, fontWeight: 700 }}>
                      {centAnzeigen(b.summeCent)}
                    </Table.Td>
                  </Table.Tr>
                </Table.Tfoot>
              </Table>
            </Table.ScrollContainer>
          </Box>
        </>
      )}
    </Stack>
  );
}
