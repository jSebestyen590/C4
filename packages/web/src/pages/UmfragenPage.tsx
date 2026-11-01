import {
  Alert,
  Badge,
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
import { IconPlus } from '@tabler/icons-react';
import { Link, useNavigate } from 'react-router-dom';
import { datumAnzeigen, type UmfrageListeDto } from '@c4/shared';
import { PersonLink, umfrageLink, useBeendeteUmfragen, useUmfragen } from '../umfrageDaten';

/** Badges for the caller's state: mandatory/optional, voted, vote again, anonymous, ended. */
export function UmfrageBadges({ u }: Readonly<{ u: UmfrageListeDto }>) {
  return (
    <Group gap={6}>
      {!u.laeuft && (
        <Badge color="gray" variant="light">
          Beendet
        </Badge>
      )}
      {u.meinKreis === 'pflicht' && (
        <Badge color="red" variant="light">
          Pflicht
        </Badge>
      )}
      {u.meinKreis === 'optional' && (
        <Badge color="blue" variant="light">
          Optional
        </Badge>
      )}
      {u.abgestimmt && (
        <Badge color="green" variant="light">
          Abgestimmt
        </Badge>
      )}
      {u.erneutNoetig && u.laeuft && (
        <Badge color="orange" variant="light">
          Bitte erneut abstimmen
        </Badge>
      )}
      {u.terminumfrage && (
        <Badge color="violet" variant="light">
          Terminfindung
        </Badge>
      )}
      {u.anonym && (
        <Badge color="gray" variant="outline">
          Anonym
        </Badge>
      )}
    </Group>
  );
}

/** "läuft bis 10.11.2026" or "beendet". */
export const laufzeitText = (u: UmfrageListeDto) =>
  u.laeuft ? `läuft bis ${datumAnzeigen(u.endetAm)}` : 'beendet';

/** Card on phones; the whole card opens the poll. */
function UmfrageKarte({ u }: Readonly<{ u: UmfrageListeDto }>) {
  return (
    <Paper
      component={Link}
      to={umfrageLink(u.id)}
      withBorder
      p="md"
      opacity={u.laeuft ? 1 : 0.75}
      style={{ color: 'inherit', textDecoration: 'none' }}
    >
      <Stack gap="xs">
        <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
          {u.titel}
        </Text>
        <UmfrageBadges u={u} />
        <Text size="sm" c="dimmed">
          {laufzeitText(u)} · {u.abgaben} von {u.kreisGroesse} abgestimmt
        </Text>
      </Stack>
    </Paper>
  );
}

/** Table from `sm` upward (like Mitglieder and Schlüssel); the whole row opens the poll. */
function UmfrageTabelle({ liste }: Readonly<{ liste: UmfrageListeDto[] }>) {
  const navigate = useNavigate();
  return (
    <Table.ScrollContainer minWidth={720} visibleFrom="sm">
      <Table verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Umfrage</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th>Läuft bis</Table.Th>
            <Table.Th>Abgestimmt</Table.Th>
            <Table.Th>Erstellt von</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {liste.map((u) => (
            <Table.Tr
              key={u.id}
              opacity={u.laeuft ? 1 : 0.75}
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                // Links (e.g. the creator) act on their own.
                if ((e.target as HTMLElement).closest('a')) return;
                navigate(umfrageLink(u.id));
              }}
            >
              <Table.Td>
                {/* A real link for keyboard use, but plain text; the whole row is clickable. */}
                <Link to={umfrageLink(u.id)} style={{ color: 'inherit', textDecoration: 'none' }}>
                  <Text component="span" fw={600} style={{ overflowWrap: 'anywhere' }}>
                    {u.titel}
                  </Text>
                </Link>
              </Table.Td>
              <Table.Td>
                <UmfrageBadges u={u} />
              </Table.Td>
              <Table.Td>{u.laeuft ? datumAnzeigen(u.endetAm) : 'beendet'}</Table.Td>
              <Table.Td>
                {u.abgaben} von {u.kreisGroesse}
              </Table.Td>
              <Table.Td>{u.ersteller ? <PersonLink person={u.ersteller} /> : '–'}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function Abschnitt({ titel, liste }: Readonly<{ titel: string; liste: UmfrageListeDto[] }>) {
  if (liste.length === 0) return null;
  // Cards on phones, a table from `sm` upward.
  return (
    <>
      <Title order={3}>{titel}</Title>
      <SimpleGrid cols={1} spacing="sm" hiddenFrom="sm">
        {liste.map((u) => (
          <UmfrageKarte key={u.id} u={u} />
        ))}
      </SimpleGrid>
      <UmfrageTabelle liste={liste} />
    </>
  );
}

/**
 * Polls the caller may see: open ones for them first, then running ones, then the ended ones page
 * by page.
 */
export function UmfragenPage() {
  const liste = useUmfragen();
  const beendete = useBeendeteUmfragen();
  // A poll may end while the page is open; it then shows up among the running ones until reload.
  const daten = liste.data ?? [];
  const offen = daten.filter((u) => u.laeuft && u.meinKreis !== null && !u.abgestimmt);
  const laufend = daten.filter((u) => !offen.includes(u));
  const beendet = beendete.data?.pages.flatMap((p) => p.umfragen) ?? [];
  const leer = liste.data && beendete.data && daten.length === 0 && beendet.length === 0;

  return (
    <Stack>
      <Group justify="space-between" wrap="nowrap">
        <Title order={2}>Umfragen</Title>
        <Button component={Link} to="/umfragen/neu" leftSection={<IconPlus size={18} />}>
          Erstellen
        </Button>
      </Group>
      {liste.isPending && <Loader m="md" aria-label="Umfragen werden geladen" />}
      {liste.isError && <Alert color="red">Die Umfragen konnten nicht geladen werden.</Alert>}
      {leer && <Text c="dimmed">Noch keine Umfragen.</Text>}
      <Abschnitt titel="Offen für dich" liste={offen} />
      <Abschnitt titel="Laufend" liste={laufend} />
      <Abschnitt titel="Beendet" liste={beendet} />
      {beendete.isError && (
        <Alert color="red">Die beendeten Umfragen konnten nicht geladen werden.</Alert>
      )}
      {beendete.hasNextPage && (
        <Button
          variant="default"
          loading={beendete.isFetchingNextPage}
          onClick={() => void beendete.fetchNextPage()}
        >
          Ältere laden
        </Button>
      )}
    </Stack>
  );
}
