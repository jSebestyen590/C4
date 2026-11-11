import {
  ActionIcon,
  Alert,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import {
  IconArrowDown,
  IconArrowUp,
  IconSortAscending,
  IconSortDescending,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import {
  sortiereRangliste,
  type RanglisteSpalte,
  type RanglisteZeileDto,
  type Sortierrichtung,
} from '@c4/shared';
import { TrichterPerson, useTrichterUebersicht } from './trichterDaten';
import { literAnzeigen, trichterName } from './trichterAnzeige';

const SPALTEN: { value: RanglisteSpalte; label: string }[] = [
  { value: 'anzahl', label: 'Anzahl' },
  { value: 'liter', label: 'Liter' },
  { value: 'name', label: 'Name' },
];

const zeilenName = (z: RanglisteZeileDto) => trichterName(z.mitglied);

/** Place in the default ranking (count, then volume); ties share a place. */
function plaetze(zeilen: readonly RanglisteZeileDto[]): Map<string, number> {
  const standard = sortiereRangliste(zeilen, 'anzahl', 'ab', zeilenName);
  const map = new Map<string, number>();
  standard.forEach((z, i) => {
    const davor = standard[i - 1];
    const platz =
      davor && davor.anzahl === z.anzahl && davor.ml === z.ml
        ? (map.get(davor.mitglied.sub) ?? i + 1)
        : i + 1;
    map.set(z.mitglied.sub, platz);
  });
  return map;
}

function Kopfzelle({
  text,
  spalte,
  sortierung,
  onSortieren,
}: Readonly<{
  text: string;
  spalte: RanglisteSpalte;
  sortierung: { spalte: RanglisteSpalte; richtung: Sortierrichtung };
  onSortieren: (spalte: RanglisteSpalte) => void;
}>) {
  const aktiv = sortierung.spalte === spalte;
  return (
    <Table.Th>
      <UnstyledButton onClick={() => onSortieren(spalte)} fw={600} mih={42}>
        <Group gap={4} wrap="nowrap">
          {text}
          {aktiv &&
            (sortierung.richtung === 'ab' ? (
              <IconArrowDown size={14} />
            ) : (
              <IconArrowUp size={14} />
            ))}
        </Group>
      </UnstyledButton>
    </Table.Th>
  );
}

/** Ranking with a year filter: cards and a sort select on phones, a table with sortable headers from `sm`. */
export function TrichterRangliste({
  aktuellesJahr,
  jahre,
  jahr,
  onJahr,
}: Readonly<{
  aktuellesJahr: number;
  jahre: number[];
  jahr: string;
  onJahr: (jahr: string) => void;
}>) {
  const uebersicht = useTrichterUebersicht(jahr);
  const [sortierung, setSortierung] = useState<{
    spalte: RanglisteSpalte;
    richtung: Sortierrichtung;
  }>({ spalte: 'anzahl', richtung: 'ab' });

  const zeilen = useMemo(() => uebersicht.data?.rangliste ?? [], [uebersicht.data]);
  const platz = useMemo(() => plaetze(zeilen), [zeilen]);
  const sortiert = useMemo(
    () => sortiereRangliste(zeilen, sortierung.spalte, sortierung.richtung, zeilenName),
    [zeilen, sortierung],
  );

  const optionen = [
    { value: 'alle', label: 'Alle Einträge' },
    ...[...new Set([aktuellesJahr, ...jahre])]
      .sort((a, b) => b - a)
      .map((j) => ({ value: String(j), label: String(j) })),
  ];

  // Clicking the active column flips the direction; a new column starts descending (name: ascending).
  const sortieren = (spalte: RanglisteSpalte) =>
    setSortierung((s) =>
      s.spalte === spalte
        ? { spalte, richtung: s.richtung === 'ab' ? 'auf' : 'ab' }
        : { spalte, richtung: spalte === 'name' ? 'auf' : 'ab' },
    );

  return (
    <Stack>
      <Title order={3}>Rangliste</Title>
      <Group align="flex-end" gap="sm" wrap="wrap">
        <Select
          size="md"
          label="Zeitraum"
          data={optionen}
          value={jahr}
          allowDeselect={false}
          onChange={(v) => v && onJahr(v)}
          maw={220}
          style={{ flex: '1 1 160px' }}
        />
        <Group
          gap="xs"
          align="flex-end"
          wrap="nowrap"
          hiddenFrom="sm"
          style={{ flex: '2 1 200px' }}
        >
          <Select
            size="md"
            label="Sortieren nach"
            data={SPALTEN}
            value={sortierung.spalte}
            allowDeselect={false}
            onChange={(v) =>
              v &&
              setSortierung({
                spalte: v as RanglisteSpalte,
                richtung: v === 'name' ? 'auf' : 'ab',
              })
            }
            style={{ flex: 1 }}
          />
          <ActionIcon
            variant="default"
            size={42}
            aria-label={sortierung.richtung === 'ab' ? 'Absteigend' : 'Aufsteigend'}
            onClick={() =>
              setSortierung((s) => ({ ...s, richtung: s.richtung === 'ab' ? 'auf' : 'ab' }))
            }
          >
            {sortierung.richtung === 'ab' ? (
              <IconSortDescending size={22} />
            ) : (
              <IconSortAscending size={22} />
            )}
          </ActionIcon>
        </Group>
      </Group>

      {uebersicht.isPending && <Loader m="md" aria-label="Rangliste wird geladen" />}
      {uebersicht.isError && <Alert color="red">Die Rangliste konnte nicht geladen werden.</Alert>}
      {uebersicht.data && zeilen.length === 0 && (
        <Text c="dimmed">Dafür gibt es noch keine Einträge.</Text>
      )}
      {sortiert.length > 0 && (
        <>
          <Stack gap="xs" hiddenFrom="sm">
            {sortiert.map((z) => (
              <Paper key={z.mitglied.sub} withBorder p="sm" radius="md">
                <Group gap="sm" wrap="nowrap" align="center">
                  <Text fw={700} c="dimmed" w={32} ta="center">
                    {platz.get(z.mitglied.sub)}.
                  </Text>
                  <Text style={{ flex: 1, minWidth: 0 }}>
                    <TrichterPerson mitglied={z.mitglied} />
                  </Text>
                  <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                    {z.anzahl}× · {literAnzeigen(z.ml)}
                  </Text>
                </Group>
              </Paper>
            ))}
          </Stack>
          <Table.ScrollContainer minWidth={420} visibleFrom="sm">
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={80}>Platz</Table.Th>
                  <Kopfzelle
                    text="Mitglied"
                    spalte="name"
                    sortierung={sortierung}
                    onSortieren={sortieren}
                  />
                  <Kopfzelle
                    text="Anzahl"
                    spalte="anzahl"
                    sortierung={sortierung}
                    onSortieren={sortieren}
                  />
                  <Kopfzelle
                    text="Liter"
                    spalte="liter"
                    sortierung={sortierung}
                    onSortieren={sortieren}
                  />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {sortiert.map((z) => (
                  <Table.Tr key={z.mitglied.sub}>
                    <Table.Td>{platz.get(z.mitglied.sub)}.</Table.Td>
                    <Table.Td>
                      <TrichterPerson mitglied={z.mitglied} />
                    </Table.Td>
                    <Table.Td>{z.anzahl}</Table.Td>
                    <Table.Td>{literAnzeigen(z.ml)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </>
      )}
    </Stack>
  );
}
