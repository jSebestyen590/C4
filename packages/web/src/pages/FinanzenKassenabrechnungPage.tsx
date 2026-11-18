import {
  Alert,
  Anchor,
  Badge,
  Box,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { Link, useParams } from 'react-router-dom';
import { centAnzeigen, datumAnzeigen } from '@c4/shared';
import { formatDatumZeit } from '../datum';
import { BETRAG_STIL, detailPfad, differenzText, useKassenabrechnung } from '../finanzenDaten';
import { mitgliedLink, mitgliedName } from '../mitglied';
import { StatusName } from '../StatusAnzeige';
import { ZurueckLink } from '../ZurueckLink';

const ZAHL = new Intl.NumberFormat('de-DE');

/** One Kassenabrechnung: figures, the stock per denomination, transfers, events and the error. */
export function FinanzenKassenabrechnungPage() {
  const { id } = useParams();
  const abrechnung = useKassenabrechnung(id);
  const a = abrechnung.data;
  return (
    <Stack maw={1000}>
      <ZurueckLink to="/finanzen/kassen/abrechnungen">Abrechnungen</ZurueckLink>
      {abrechnung.isPending && <Loader m="md" aria-label="Abrechnung wird geladen" />}
      {abrechnung.isError && <Alert color="red">Die Abrechnung konnte nicht geladen werden.</Alert>}
      {a && (
        <>
          <Group gap="sm">
            <Title order={2}>Abrechnung {a.kontoName}</Title>
            {a.storniert && (
              <Badge color="gray" variant="light" size="lg">
                storniert
              </Badge>
            )}
          </Group>
          {a.storniert && (
            <Alert color="gray">
              Die Buchung dieser Abrechnung wurde storniert. Die Dienst-Zählungen erscheinen in der
              nächsten Abrechnung wieder.
            </Alert>
          )}
          <Paper withBorder p="md">
            <Stack gap={4}>
              <Text>Datum: {datumAnzeigen(a.datum)}</Text>
              <Text>
                Abgerechnet von:{' '}
                {a.erstelltVon ? (
                  <Anchor component={Link} to={mitgliedLink(a.erstelltVon)} underline="never">
                    <StatusName status={a.erstelltVon.status}>
                      {mitgliedName(a.erstelltVon)}
                    </StatusName>
                  </Anchor>
                ) : (
                  '–'
                )}{' '}
                am {formatDatumZeit(a.erstelltAm, 'mittel')}
              </Text>
              <Text>
                Erlöskonto: {a.erloesKonto.name} · Ziel-Fach: {a.zielFach.name}
              </Text>
              <Text>
                Bestand <span style={BETRAG_STIL}>{centAnzeigen(a.sollCent)}</span> · Ist{' '}
                <span style={BETRAG_STIL}>{centAnzeigen(a.istCent)}</span> · Einnahme{' '}
                <Text span fw={700}>
                  {centAnzeigen(a.einnahmeCent)}
                </Text>
              </Text>
              <Text>
                Fehler ohne Event:{' '}
                <Text span fw={700} c={a.fehlerCent === 0 ? undefined : 'orange.8'}>
                  {differenzText(a.fehlerCent)}
                </Text>
              </Text>
              <Text>
                {a.buchung ? (
                  <>
                    Buchung:{' '}
                    <Anchor component={Link} to={detailPfad(a.buchung.id)}>
                      Nr. {a.buchung.seq}
                    </Anchor>
                  </>
                ) : (
                  'Es stimmte alles, es wurde keine Buchung angelegt.'
                )}
              </Text>
            </Stack>
          </Paper>

          <Title order={4}>Münzen und Scheine</Title>
          <Box style={{ overflowX: 'auto' }}>
            <Table tabularNums verticalSpacing={4}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={BETRAG_STIL}>Wert</Table.Th>
                  <Table.Th style={BETRAG_STIL}>Bestand</Table.Th>
                  <Table.Th style={BETRAG_STIL}>Ist</Table.Th>
                  <Table.Th style={BETRAG_STIL}>Grundbestand</Table.Th>
                  <Table.Th style={BETRAG_STIL}>Kasse danach</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {a.posten.map((p) => (
                  <Table.Tr key={p.nennwertCent}>
                    <Table.Td style={BETRAG_STIL}>{centAnzeigen(p.nennwertCent)}</Table.Td>
                    <Table.Td style={BETRAG_STIL}>{ZAHL.format(p.soll)}</Table.Td>
                    <Table.Td style={BETRAG_STIL}>{ZAHL.format(p.ist)}</Table.Td>
                    <Table.Td style={BETRAG_STIL}>{ZAHL.format(p.grundbestand)}</Table.Td>
                    <Table.Td
                      style={BETRAG_STIL}
                      c={p.danach === p.grundbestand ? undefined : 'orange.8'}
                      fw={p.danach === p.grundbestand ? 400 : 700}
                    >
                      {ZAHL.format(p.danach)}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Box>

          {a.transfers.length > 0 && (
            <>
              <Title order={4}>Transfers</Title>
              <Stack gap={2}>
                {a.transfers.map((t) => (
                  <Text key={`${t.fachId}-${t.nennwertCent}`} size="sm">
                    {t.fachName}: {t.anzahl > 0 ? '+' : '−'}
                    {ZAHL.format(Math.abs(t.anzahl))} × {centAnzeigen(t.nennwertCent)}
                  </Text>
                ))}
              </Stack>
            </>
          )}

          <Title order={4}>Zuordnung zu Events</Title>
          {a.events.length === 0 ? (
            <Text c="dimmed">Keine Events zugeordnet.</Text>
          ) : (
            <Box style={{ overflowX: 'auto' }}>
              <Table tabularNums verticalSpacing={4}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Event</Table.Th>
                    <Table.Th style={BETRAG_STIL}>Einnahme</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {a.events.map((e) => (
                    <Table.Tr key={e.eventId}>
                      <Table.Td>
                        <Anchor
                          component={Link}
                          to={`/kalender/events/${encodeURIComponent(e.eventId)}`}
                        >
                          {e.eventTitel}
                        </Anchor>
                        <Text size="xs" c="dimmed">
                          {datumAnzeigen(e.eventBeginn.slice(0, 10))}
                        </Text>
                      </Table.Td>
                      <Table.Td style={BETRAG_STIL}>{centAnzeigen(e.betragCent)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
                <Table.Tfoot>
                  <Table.Tr>
                    <Table.Td fw={700}>Fehler ohne Event</Table.Td>
                    <Table.Td
                      style={{ ...BETRAG_STIL, fontWeight: 700 }}
                      c={a.fehlerCent === 0 ? undefined : 'orange.8'}
                    >
                      {centAnzeigen(a.fehlerCent)}
                    </Table.Td>
                  </Table.Tr>
                </Table.Tfoot>
              </Table>
            </Box>
          )}
        </>
      )}
    </Stack>
  );
}
