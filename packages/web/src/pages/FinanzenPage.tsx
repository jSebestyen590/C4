import { Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconBook2, IconListDetails, IconPencilPlus, IconShieldCheck } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';

function Kachel({
  to,
  icon,
  titel,
  text,
}: Readonly<{ to: string; icon: ReactNode; titel: string; text: string }>) {
  return (
    <Paper
      withBorder
      p="md"
      component={Link}
      to={to}
      style={{ color: 'inherit', textDecoration: 'none' }}
    >
      <Stack gap={4}>
        {icon}
        <Text fw={600}>{titel}</Text>
        <Text size="sm" c="dimmed">
          {text}
        </Text>
      </Stack>
    </Paper>
  );
}

/** Entry page of the Finanzen area: tiles to the sub pages the user may open. */
export function FinanzenPage() {
  const { can } = useAuth();
  return (
    <Stack>
      <Title order={2}>Finanzen</Title>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <Kachel
          to="/finanzen/konten"
          icon={<IconListDetails size={28} />}
          titel="Kontenplan"
          text="Alle Konten mit ihrem aktuellen Saldo."
        />
        <Kachel
          to="/finanzen/journal"
          icon={<IconBook2 size={28} />}
          titel="Journal"
          text="Alle Buchungen, lückenlos nummeriert."
        />
        {can('finanzen:buchen') && (
          <Kachel
            to="/finanzen/buchen"
            icon={<IconPencilPlus size={28} />}
            titel="Buchen"
            text="Umbuchung oder freie Buchung anlegen."
          />
        )}
        {can('finanzen:pruefen') && (
          <Kachel
            to="/finanzen/kette"
            icon={<IconShieldCheck size={28} />}
            titel="Kette prüfen"
            text="Prüft, ob das Journal unverändert ist."
          />
        )}
      </SimpleGrid>
    </Stack>
  );
}
