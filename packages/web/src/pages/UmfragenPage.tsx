import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { datumAnzeigen, type UmfrageListeDto } from '@c4/shared';
import { umfrageLink, useUmfragen } from '../umfrageDaten';

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

function UmfrageKarte({ u }: Readonly<{ u: UmfrageListeDto }>) {
  return (
    <Paper withBorder p="md" opacity={u.laeuft ? 1 : 0.75}>
      <Stack gap="xs">
        <Anchor
          component={Link}
          to={umfrageLink(u.id)}
          fw={600}
          c="inherit"
          underline="hover"
          style={{ overflowWrap: 'anywhere' }}
        >
          {u.titel}
        </Anchor>
        <UmfrageBadges u={u} />
        <Text size="sm" c="dimmed">
          {laufzeitText(u)} · {u.abgaben} von {u.kreisGroesse} abgestimmt
        </Text>
      </Stack>
    </Paper>
  );
}

function Abschnitt({ titel, liste }: Readonly<{ titel: string; liste: UmfrageListeDto[] }>) {
  if (liste.length === 0) return null;
  return (
    <>
      <Title order={3}>{titel}</Title>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
        {liste.map((u) => (
          <UmfrageKarte key={u.id} u={u} />
        ))}
      </SimpleGrid>
    </>
  );
}

/** Polls the caller may see: open ones for them first, then running and ended ones. */
export function UmfragenPage() {
  const liste = useUmfragen();
  const daten = liste.data ?? [];
  const offen = daten.filter((u) => u.laeuft && u.meinKreis !== null && !u.abgestimmt);
  const laufend = daten.filter((u) => u.laeuft && !offen.includes(u));
  const beendet = daten.filter((u) => !u.laeuft);

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
      {liste.data && daten.length === 0 && <Text c="dimmed">Noch keine Umfragen.</Text>}
      <Abschnitt titel="Offen für dich" liste={offen} />
      <Abschnitt titel="Laufend" liste={laufend} />
      <Abschnitt titel="Beendet" liste={beendet} />
    </Stack>
  );
}
