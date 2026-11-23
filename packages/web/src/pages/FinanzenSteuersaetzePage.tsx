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
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import {
  datumAnzeigen,
  heuteBerlin,
  steuersatzZeitraumAm,
  zeitraumEnde,
  type SteuersatzZeitraumDto,
} from '@c4/shared';
import { useAuth } from '../auth';
import { BestaetigenDialog } from '../BestaetigenDialog';
import { DatumFeld } from '../DatumFeld';
import {
  useSteuersatzZeitraeume,
  useSteuersatzZeitraumAnlegen,
  useSteuersatzZeitraumLoeschen,
} from '../finanzenDaten';
import { HILFE } from '../finanzenHilfe';
import { InfoHinweis } from '../InfoHinweis';
import { KartenOderTabelle } from '../KartenOderTabelle';
import { satzProzent } from '../steuersaetze';
import { fehlerText } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

/** "19" or "5,5" -> basis points (1900, 550); null when it is no percentage with at most 2 decimals. */
export function prozentAlsBasispunkte(text: string): number | null {
  const t = text.trim().replace(/\s*%$/, '').replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

/** Last day of the period: the day before the next one starts, null for the open last period. */
function gueltigBis(zeitraeume: readonly SteuersatzZeitraumDto[], ab: string): string | null {
  const ende = zeitraumEnde(zeitraeume, ab);
  if (!ende) return null;
  const d = new Date(`${ende}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function ZeitraumFormular({ onFertig }: Readonly<{ onFertig: () => void }>) {
  const anlegen = useSteuersatzZeitraumAnlegen();
  const [ab, setAb] = useState('');
  const [regel, setRegel] = useState('');
  const [ermaessigt, setErmaessigt] = useState('');
  const [versucht, setVersucht] = useState(false);
  const regelBp = prozentAlsBasispunkte(regel);
  const ermBp = prozentAlsBasispunkte(ermaessigt);
  const fehler = {
    ab: ab === '' ? 'Bitte gib das Datum an.' : undefined,
    regel: regelBp === null ? 'Bitte gib den Regelsatz in Prozent an, z. B. 19.' : undefined,
    ermaessigt:
      ermBp === null
        ? 'Bitte gib den ermäßigten Satz in Prozent an, z. B. 7.'
        : regelBp !== null && ermBp >= regelBp
          ? 'Der ermäßigte Satz muss kleiner als der Regelsatz sein.'
          : undefined,
  };
  const senden = () => {
    setVersucht(true);
    if (fehler.ab || fehler.regel || fehler.ermaessigt) return;
    anlegen.mutate(
      { ab, regel: regelBp!, ermaessigt: ermBp! },
      {
        onSuccess: () => {
          notifications.show({ color: 'green', message: 'Der Zeitraum wurde hinzugefügt.' });
          onFertig();
        },
      },
    );
  };
  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Title order={4}>Zeitraum hinzufügen</Title>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <DatumFeld
            label="Gültig ab"
            size="md"
            value={ab}
            onWert={setAb}
            loeschbar={false}
            tippbar
            error={versucht ? fehler.ab : undefined}
          />
          <TextInput
            label="Regelsatz (%)"
            size="md"
            inputMode="decimal"
            autoComplete="off"
            placeholder="19"
            value={regel}
            onChange={(e) => setRegel(e.currentTarget.value)}
            error={versucht ? fehler.regel : undefined}
          />
          <TextInput
            label="Ermäßigt (%)"
            size="md"
            inputMode="decimal"
            autoComplete="off"
            placeholder="7"
            value={ermaessigt}
            onChange={(e) => setErmaessigt(e.currentTarget.value)}
            error={versucht ? fehler.ermaessigt : undefined}
          />
        </SimpleGrid>
        {anlegen.error && (
          <Alert color="red">
            {fehlerText(anlegen.error, 'Der Zeitraum konnte nicht angelegt werden.')}
          </Alert>
        )}
        <Group>
          <Button size="md" onClick={senden} loading={anlegen.isPending}>
            Hinzufügen
          </Button>
          <Button size="md" variant="default" onClick={onFertig}>
            Abbrechen
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

/** Tax rate periods: which Regelsatz and ermäßigter Satz apply from which date. */
export function FinanzenSteuersaetzePage() {
  const { can } = useAuth();
  const darfVerwalten = can('finanzen:verwalten');
  const zeitraeume = useSteuersatzZeitraeume();
  const loeschen = useSteuersatzZeitraumLoeschen();
  const [neu, setNeu] = useState(false);
  const [zuLoeschen, setZuLoeschen] = useState<SteuersatzZeitraumDto | null>(null);
  const liste = zeitraeume.data ?? [];
  const aktuell = steuersatzZeitraumAm(liste, heuteBerlin())?.id;
  // Newest first: the current period is what matters.
  const anzeige = [...liste].reverse();
  const bis = (z: SteuersatzZeitraumDto) => {
    const b = gueltigBis(liste, z.ab);
    return b ? datumAnzeigen(b) : 'unbefristet';
  };
  const Aktuell = ({ z }: Readonly<{ z: SteuersatzZeitraumDto }>) =>
    z.id === aktuell ? (
      <Badge variant="light" color="green">
        Aktuell
      </Badge>
    ) : null;
  const Loeschen = ({ z }: Readonly<{ z: SteuersatzZeitraumDto }>) =>
    darfVerwalten && z.loeschbar ? (
      <Button
        variant="subtle"
        color="red"
        size="md"
        leftSection={<IconTrash size={18} />}
        onClick={() => setZuLoeschen(z)}
        aria-label={`Zeitraum ab ${datumAnzeigen(z.ab)} löschen`}
      >
        Löschen
      </Button>
    ) : null;

  return (
    <Stack maw={900}>
      <ZurueckLink to="/finanzen/belege">Belege</ZurueckLink>
      <Group justify="space-between" wrap="wrap">
        <Group gap={2}>
          <Title order={2}>Steuersätze</Title>
          <InfoHinweis feld="Steuersätze" text={HILFE.steuersaetze.zeitraeume} />
        </Group>
        {darfVerwalten && !neu && (
          <Button leftSection={<IconPlus size={18} />} onClick={() => setNeu(true)}>
            Zeitraum hinzufügen
          </Button>
        )}
      </Group>
      {neu && <ZeitraumFormular onFertig={() => setNeu(false)} />}
      {zeitraeume.isPending && <Loader m="md" aria-label="Steuersätze werden geladen" />}
      {zeitraeume.isError && (
        <Alert color="red">Die Steuersätze konnten nicht geladen werden.</Alert>
      )}
      <KartenOderTabelle<SteuersatzZeitraumDto>
        zeilen={anzeige}
        zeilenKey={(z) => z.id}
        kartenAlsStapel
        karte={(z) => (
          <Paper withBorder p="sm">
            <Stack gap={4}>
              <Group justify="space-between" wrap="nowrap">
                <Text fw={600}>Ab {datumAnzeigen(z.ab)}</Text>
                <Aktuell z={z} />
              </Group>
              <Text size="sm">
                Regelsatz {satzProzent(z.regel)}, ermäßigt {satzProzent(z.ermaessigt)}
              </Text>
              <Text size="sm" c="dimmed">
                Gültig bis {bis(z)}
              </Text>
              <Loeschen z={z} />
            </Stack>
          </Paper>
        )}
        kopf={
          <Table.Tr>
            <Table.Th>Gültig ab</Table.Th>
            <Table.Th>Gültig bis</Table.Th>
            <Table.Th>Regelsatz</Table.Th>
            <Table.Th>Ermäßigt</Table.Th>
            <Table.Th />
            <Table.Th />
          </Table.Tr>
        }
        zeile={(z) => (
          <Table.Tr>
            <Table.Td>{datumAnzeigen(z.ab)}</Table.Td>
            <Table.Td>{bis(z)}</Table.Td>
            <Table.Td>{satzProzent(z.regel)}</Table.Td>
            <Table.Td>{satzProzent(z.ermaessigt)}</Table.Td>
            <Table.Td>
              <Aktuell z={z} />
            </Table.Td>
            <Table.Td>
              <Loeschen z={z} />
            </Table.Td>
          </Table.Tr>
        )}
      />
      {zuLoeschen && (
        <BestaetigenDialog
          titel="Zeitraum löschen?"
          bestaetigenText="Löschen"
          onClose={() => setZuLoeschen(null)}
          onBestaetigt={async () => {
            await loeschen.mutateAsync(zuLoeschen.id);
            notifications.show({ color: 'green', message: 'Der Zeitraum wurde gelöscht.' });
          }}
        >
          <Text>
            Der Zeitraum ab {datumAnzeigen(zuLoeschen.ab)} wird gelöscht.{' '}
            {HILFE.steuersaetze.loeschen}
          </Text>
        </BestaetigenDialog>
      )}
    </Stack>
  );
}
