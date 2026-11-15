import {
  Alert,
  Box,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { centAnzeigen, datumAnzeigen, type ZaehlungListeDto } from '@c4/shared';
import { faecherAus } from '../bargeldFormular';
import {
  BETRAG_STIL,
  differenzText,
  useKonten,
  useZaehlungen,
  zaehlungPfad,
} from '../finanzenDaten';
import { mitgliedName } from '../mitglied';
import { StatusName } from '../StatusAnzeige';
import { ZurueckLink } from '../ZurueckLink';

const differenzFarbe = (cent: number) => (cent === 0 ? 'dimmed' : cent > 0 ? 'teal' : 'red');

function Zaehler({ z }: Readonly<{ z: ZaehlungListeDto }>) {
  const m = z.gezaehltVon;
  if (!m) return <Text span>–</Text>;
  return <StatusName status={m.status}>{mitgliedName(m)}</StatusName>;
}

/** All Zählungen of the Safe's Fächer, newest first, optionally of one Fach. */
export function FinanzenZaehlungenPage() {
  const navigate = useNavigate();
  const [fach, setFach] = useState<string | null>(null);
  const konten = useKonten(true);
  const zaehlungen = useZaehlungen(fach);
  const liste = zaehlungen.data?.zaehlungen ?? [];
  const optionen = faecherAus(konten.data ?? []).map((k) => ({ value: k.id, label: k.name }));
  return (
    <Stack maw={1100}>
      <ZurueckLink to="/finanzen/bargeld">Bargeld</ZurueckLink>
      <Title order={2}>Zählungen</Title>
      <Select
        label="Fach"
        placeholder="Alle Fächer"
        clearable
        data={optionen}
        value={fach}
        onChange={setFach}
        w={{ base: '100%', sm: 320 }}
      />
      {zaehlungen.isPending && <Loader m="md" aria-label="Zählungen werden geladen" />}
      {zaehlungen.isError && <Alert color="red">Die Zählungen konnten nicht geladen werden.</Alert>}
      {zaehlungen.data && liste.length === 0 && <Text c="dimmed">Noch keine Zählungen.</Text>}
      {zaehlungen.data?.gekappt && (
        <Alert color="blue">Es werden die neuesten 2.000 Zählungen gezeigt – wähle ein Fach.</Alert>
      )}
      <SimpleGrid cols={1} hiddenFrom="sm">
        {liste.map((z) => (
          <Paper
            key={z.id}
            withBorder
            p="md"
            component={Link}
            to={zaehlungPfad(z.id)}
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            <Stack gap="xs">
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Text fw={600}>{z.kontoName}</Text>
                <Text fw={600} c={differenzFarbe(z.differenzCent)} style={BETRAG_STIL}>
                  {differenzText(z.differenzCent)}
                </Text>
              </Group>
              <Text size="sm" c="dimmed">
                {datumAnzeigen(z.datum)} · Soll {centAnzeigen(z.sollCent)} · Ist{' '}
                {centAnzeigen(z.istCent)}
              </Text>
              <Text size="sm">
                Von <Zaehler z={z} />
                {z.buchung && ` · Buchung Nr. ${z.buchung.seq}`}
              </Text>
            </Stack>
          </Paper>
        ))}
      </SimpleGrid>
      {liste.length > 0 && (
        <Box visibleFrom="sm">
          <Table verticalSpacing={6} tabularNums highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Datum</Table.Th>
                <Table.Th>Fach</Table.Th>
                <Table.Th style={BETRAG_STIL}>Soll</Table.Th>
                <Table.Th style={BETRAG_STIL}>Ist</Table.Th>
                <Table.Th style={BETRAG_STIL}>Differenz</Table.Th>
                <Table.Th>Gezählt von</Table.Th>
                <Table.Th style={BETRAG_STIL}>Buchung</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {liste.map((z) => (
                <Table.Tr
                  key={z.id}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest('a')) void navigate(zaehlungPfad(z.id));
                  }}
                >
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>
                    <Link
                      to={zaehlungPfad(z.id)}
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      {datumAnzeigen(z.datum)}
                    </Link>
                  </Table.Td>
                  <Table.Td style={{ overflowWrap: 'anywhere' }}>{z.kontoName}</Table.Td>
                  <Table.Td style={BETRAG_STIL}>{centAnzeigen(z.sollCent)}</Table.Td>
                  <Table.Td style={BETRAG_STIL}>{centAnzeigen(z.istCent)}</Table.Td>
                  <Table.Td style={BETRAG_STIL} c={differenzFarbe(z.differenzCent)} fw={600}>
                    {differenzText(z.differenzCent)}
                  </Table.Td>
                  <Table.Td>
                    <Zaehler z={z} />
                  </Table.Td>
                  <Table.Td style={BETRAG_STIL}>{z.buchung ? z.buchung.seq : '–'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
      )}
    </Stack>
  );
}
