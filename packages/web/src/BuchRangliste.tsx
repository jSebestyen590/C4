import { Alert, Group, Loader, Paper, Select, Stack, Table, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { centAnzeigen, type BuchRanglisteZeileDto } from '@c4/shared';
import { BuchInhaber, useBuchRangliste } from './buchDaten';
import { HILFE } from './finanzenHilfe';
import { InfoHinweis } from './InfoHinweis';
import { KartenOderTabelle } from './KartenOderTabelle';

const zeilenKey = (z: BuchRanglisteZeileDto, i: number) => z.mitglied?.sub ?? `extern-${i}`;

/** Turnover ranking with a year filter: cards on phones, a table from `sm`. Ties share a place. */
export function BuchRangliste() {
  const [jahr, setJahr] = useState('alle');
  const rangliste = useBuchRangliste(jahr);
  const daten = rangliste.data;
  const zeilen = daten?.rangliste ?? [];
  const platz = zeilen.map((z, i) => {
    let p = i;
    while (
      p > 0 &&
      zeilen[p - 1]?.umsatzCent === z.umsatzCent &&
      zeilen[p - 1]?.striche === z.striche
    )
      p--;
    return p + 1;
  });
  const optionen = [
    { value: 'alle', label: 'Gesamt' },
    ...[...new Set([daten?.aktuellesJahr, ...(daten?.jahre ?? [])])]
      .filter((j): j is number => j !== undefined)
      .sort((a, b) => b - a)
      .map((j) => ({ value: String(j), label: String(j) })),
  ];
  const nummerierte = zeilen.map((z, i) => ({ z, i, platz: platz[i] ?? i + 1 }));
  return (
    <Stack>
      <Group gap={2}>
        <Title order={3}>Rangliste</Title>
        <InfoHinweis feld="Rangliste" text={HILFE.buch.rangliste} />
      </Group>
      <Select
        size="md"
        label="Zeitraum"
        data={optionen}
        value={jahr}
        allowDeselect={false}
        onChange={(v) => v && setJahr(v)}
        maw={220}
      />
      {rangliste.isPending && <Loader m="md" aria-label="Rangliste wird geladen" />}
      {rangliste.isError && <Alert color="red">Die Rangliste konnte nicht geladen werden.</Alert>}
      {daten && zeilen.length === 0 && <Text c="dimmed">Dafür gibt es noch keine Einträge.</Text>}
      <KartenOderTabelle
        zeilen={nummerierte}
        zeilenKey={(n) => zeilenKey(n.z, n.i)}
        minWidth={420}
        kartenAlsStapel
        karte={({ z, platz: p }) => (
          <Paper withBorder p="sm" radius="md">
            <Group gap="sm" wrap="nowrap" align="center">
              <Text fw={700} c="dimmed" w={32} ta="center">
                {p}.
              </Text>
              <Text style={{ flex: 1, minWidth: 0 }}>
                <BuchInhaber seite={z} />
              </Text>
              <Stack gap={0} align="flex-end">
                <Text fw={600} style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  {centAnzeigen(z.umsatzCent)}
                </Text>
                <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                  {z.striche.toLocaleString('de-DE')} Striche
                </Text>
              </Stack>
            </Group>
          </Paper>
        )}
        kopf={
          <Table.Tr>
            <Table.Th w={80}>Platz</Table.Th>
            <Table.Th>Name</Table.Th>
            <Table.Th ta="right">Umsatz</Table.Th>
            <Table.Th ta="right">Striche</Table.Th>
          </Table.Tr>
        }
        zeile={({ z, platz: p }) => (
          <Table.Tr>
            <Table.Td>{p}.</Table.Td>
            <Table.Td>
              <BuchInhaber seite={z} />
            </Table.Td>
            <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {centAnzeigen(z.umsatzCent)}
            </Table.Td>
            <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {z.striche.toLocaleString('de-DE')}
            </Table.Td>
          </Table.Tr>
        )}
      />
    </Stack>
  );
}
