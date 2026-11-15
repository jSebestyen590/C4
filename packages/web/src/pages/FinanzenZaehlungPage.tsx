import { Alert, Anchor, Loader, Paper, Stack, Table, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { centAnzeigen, datumAnzeigen, NENNWERTE_CENT } from '@c4/shared';
import { unwrap, useApi } from '../api';
import { BETRAG_STIL, detailPfad, differenzText, FINANZEN_KEY } from '../finanzenDaten';
import { mitgliedName } from '../mitglied';
import { StatusName } from '../StatusAnzeige';
import { ZurueckLink } from '../ZurueckLink';

const ZAHL = new Intl.NumberFormat('de-DE');
const zeitText = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

/** One Zählung: Soll, Ist and Differenz per denomination, who counted, link to the booking. */
export function FinanzenZaehlungPage() {
  const api = useApi();
  const { id = '' } = useParams();
  const zaehlung = useQuery({
    queryKey: [...FINANZEN_KEY, 'zaehlung', id],
    queryFn: async () => unwrap(await api.finanzen.zaehlungen[':id'].$get({ param: { id } })),
  });
  const z = zaehlung.data;
  const posten = z
    ? NENNWERTE_CENT.map((n) => z.posten.find((p) => p.nennwertCent === n)).filter(
        (p) => p !== undefined,
      )
    : [];
  return (
    <Stack maw={900}>
      <ZurueckLink to="/finanzen/bargeld/zaehlungen">Zählungen</ZurueckLink>
      {zaehlung.isPending && <Loader m="md" aria-label="Zählung wird geladen" />}
      {zaehlung.isError && <Alert color="red">Die Zählung konnte nicht geladen werden.</Alert>}
      {z && (
        <>
          <Title order={2}>Zählung {z.kontoName}</Title>
          <Paper withBorder p="md">
            <Stack gap={4}>
              <Text>Datum: {datumAnzeigen(z.datum)}</Text>
              <Text>
                Gezählt von:{' '}
                {z.gezaehltVon ? (
                  <StatusName status={z.gezaehltVon.status}>
                    {mitgliedName(z.gezaehltVon)}
                  </StatusName>
                ) : (
                  '–'
                )}{' '}
                am {zeitText(z.gezaehltAm)}
              </Text>
              {z.text && <Text style={{ overflowWrap: 'anywhere' }}>Anmerkung: {z.text}</Text>}
              <Text>
                Soll <span style={BETRAG_STIL}>{centAnzeigen(z.sollCent)}</span> · Ist{' '}
                <span style={BETRAG_STIL}>{centAnzeigen(z.istCent)}</span> · Differenz{' '}
                <Text
                  span
                  fw={700}
                  c={z.differenzCent === 0 ? undefined : z.differenzCent > 0 ? 'teal' : 'red'}
                >
                  {differenzText(z.differenzCent)}
                </Text>
              </Text>
              {z.buchung ? (
                <Anchor component={Link} to={detailPfad(z.buchung.id)}>
                  Zur Buchung Nr. {z.buchung.seq}
                </Anchor>
              ) : (
                <Text c="dimmed">Es war keine Buchung nötig.</Text>
              )}
            </Stack>
          </Paper>
          <Table verticalSpacing={4} tabularNums style={{ maxWidth: 640 }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={BETRAG_STIL}>Wert</Table.Th>
                <Table.Th style={BETRAG_STIL}>Soll</Table.Th>
                <Table.Th style={BETRAG_STIL}>Ist</Table.Th>
                <Table.Th style={BETRAG_STIL}>Differenz</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {posten.map((p) => (
                <Table.Tr key={p.nennwertCent}>
                  <Table.Td style={BETRAG_STIL}>{centAnzeigen(p.nennwertCent)}</Table.Td>
                  <Table.Td style={BETRAG_STIL}>{ZAHL.format(p.sollAnzahl)}</Table.Td>
                  <Table.Td style={BETRAG_STIL}>{ZAHL.format(p.istAnzahl)}</Table.Td>
                  <Table.Td
                    style={BETRAG_STIL}
                    c={p.differenzAnzahl === 0 ? 'dimmed' : p.differenzAnzahl > 0 ? 'teal' : 'red'}
                    fw={p.differenzAnzahl === 0 ? 400 : 600}
                  >
                    {p.differenzAnzahl === 0
                      ? '–'
                      : `${p.differenzAnzahl > 0 ? '+' : '−'}${ZAHL.format(Math.abs(p.differenzAnzahl))}`}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}
    </Stack>
  );
}
