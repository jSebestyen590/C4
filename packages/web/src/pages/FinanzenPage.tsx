import { Alert, Anchor, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import {
  IconBook2,
  IconCash,
  IconCoins,
  IconFileExport,
  IconLock,
  IconFileInvoice,
  IconReceiptRefund,
  IconListDetails,
  IconNotebook,
  IconPencilPlus,
  IconReportMoney,
  IconShieldCheck,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { heuteBerlin, monatAnzeigen } from '@c4/shared';
import { useAuth } from '../auth';
import { festschreibungFaellig } from '../FestschreibungHinweise';
import { useFestschreibungen } from '../finanzenDaten';

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
  const festschreibung = useFestschreibungen(can('finanzen:verwalten'));
  const faellig = festschreibung.data?.naechsterMonat ?? null;
  return (
    <Stack>
      <Title order={2}>Finanzen</Title>
      {can('finanzen:verwalten') && festschreibungFaellig(faellig, heuteBerlin()) && faellig && (
        <Alert color="orange" title="Festschreibung fällig">
          Der Monat {monatAnzeigen(faellig)} ist noch nicht festgeschrieben.{' '}
          <Anchor component={Link} to="/finanzen/festschreibung">
            Zur Festschreibung
          </Anchor>
        </Alert>
      )}
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
        <Kachel
          to="/finanzen/bargeld"
          icon={<IconCoins size={28} />}
          titel="Bargeld"
          text="Safe mit Fächern, Bestand je Münze und Schein, Umbuchen und Wechseln."
        />
        <Kachel
          to="/finanzen/kassen"
          icon={<IconCash size={28} />}
          titel="Kassen"
          text="Barkassen: Grundbestand, Dienst-Zählungen der Events und Abrechnung."
        />
        <Kachel
          to="/finanzen/bargeld/zaehlungen"
          icon={<IconReportMoney size={28} />}
          titel="Zählungen"
          text="Protokoll aller Zählungen mit Soll, Ist und Differenz."
        />
        <Kachel
          to="/finanzen/buch"
          icon={<IconNotebook size={28} />}
          titel="Buch"
          text="Strichlisten aller Mitglieder: Seiten, Abrechnung und Tarife."
        />
        <Kachel
          to="/finanzen/belege"
          icon={<IconFileInvoice size={28} />}
          titel="Belege"
          text="Rechnungen und Bons erfassen, buchen und ablegen."
        />
        <Kachel
          to="/finanzen/auslagen"
          icon={<IconReceiptRefund size={28} />}
          titel="Offene Auslagen"
          text="Was Mitglieder vorgestreckt haben, und die Sammelerstattung."
        />
        {can('finanzen:buchen') && (
          <Kachel
            to="/finanzen/buchen"
            icon={<IconPencilPlus size={28} />}
            titel="Buchen"
            text="Umbuchung oder freie Buchung anlegen."
          />
        )}
        <Kachel
          to="/finanzen/festschreibung"
          icon={<IconLock size={28} />}
          titel="Festschreibung"
          text="Monate abschließen: danach ist darin nichts mehr buchbar."
        />
        {(can('finanzen:pruefen') || can('finanzen:verwalten')) && (
          <Kachel
            to="/finanzen/datenexport"
            icon={<IconFileExport size={28} />}
            titel="Datenexport"
            text="Buchführung als ZIP für das Finanzamt."
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
