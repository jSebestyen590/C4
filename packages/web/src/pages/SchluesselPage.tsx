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
  Switch,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { datumAnzeigen, datumBerlin, type SchluesselDto } from '@c4/shared';
import { useAuth } from '../auth';
import { useEigeneSub } from '../organisator';
import { SchluesselAktionen } from '../SchluesselAktionen';
import { SchluesselFormular } from '../SchluesselFormular';
import { HalterName, istHalter, schluesselLink, useSchluesselListe } from '../schluesselDaten';

/** "bei <Halter> seit <Datum>". */
export function HalterZeile({ schluessel }: Readonly<{ schluessel: SchluesselDto }>) {
  return (
    <Text>
      Bei <HalterName halter={schluessel.halter} />
      {schluessel.halterSeit && ` seit ${datumAnzeigen(datumBerlin(schluessel.halterSeit))}`}
    </Text>
  );
}

function SchluesselKarte({
  schluessel,
  personenVorschlaege,
}: Readonly<{ schluessel: SchluesselDto; personenVorschlaege: string[] }>) {
  return (
    <Paper withBorder p="md" opacity={schluessel.archiviert ? 0.6 : 1}>
      <Stack gap="sm">
        <Group gap="xs" justify="space-between" wrap="nowrap" align="flex-start">
          <Anchor
            component={Link}
            to={schluesselLink(schluessel.id)}
            fw={600}
            c="inherit"
            underline="hover"
            style={{ overflowWrap: 'anywhere' }}
          >
            {schluessel.name}
          </Anchor>
          {schluessel.archiviert && (
            <Badge color="gray" variant="light">
              Archiviert
            </Badge>
          )}
        </Group>
        {schluessel.beschreibung && (
          <Text size="sm" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
            {schluessel.beschreibung}
          </Text>
        )}
        <HalterZeile schluessel={schluessel} />
        <SchluesselAktionen schluessel={schluessel} personenVorschlaege={personenVorschlaege} />
      </Stack>
    </Paper>
  );
}

/** Table from `sm` upward (like Mitglieder and Posten); the whole row opens the key. */
function SchluesselTabelle({
  schluessel,
  personenVorschlaege,
}: Readonly<{ schluessel: SchluesselDto[]; personenVorschlaege: string[] }>) {
  const navigate = useNavigate();
  return (
    <Table.ScrollContainer minWidth={760} visibleFrom="sm">
      <Table verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Schlüssel</Table.Th>
            <Table.Th>Bei</Table.Th>
            <Table.Th>Seit</Table.Th>
            <Table.Th>Beschreibung</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {schluessel.map((s) => (
            <Table.Tr
              key={s.id}
              opacity={s.archiviert ? 0.6 : 1}
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                // Links and buttons act on their own; dialogs render in a portal outside the row.
                const ziel = e.target as HTMLElement;
                if (!e.currentTarget.contains(ziel) || ziel.closest('a, button')) return;
                navigate(schluesselLink(s.id));
              }}
            >
              <Table.Td>
                <Group gap="xs" wrap="nowrap">
                  {/* A real link for keyboard use, but plain text; the whole row is clickable. */}
                  <Link
                    to={schluesselLink(s.id)}
                    style={{ color: 'inherit', textDecoration: 'none' }}
                  >
                    <Text component="span" fw={600} style={{ overflowWrap: 'anywhere' }}>
                      {s.name}
                    </Text>
                  </Link>
                  {s.archiviert && (
                    <Badge color="gray" variant="light">
                      Archiviert
                    </Badge>
                  )}
                </Group>
              </Table.Td>
              <Table.Td>
                <HalterName halter={s.halter} />
              </Table.Td>
              <Table.Td>{s.halterSeit ? datumAnzeigen(datumBerlin(s.halterSeit)) : '–'}</Table.Td>
              <Table.Td>
                <Text lineClamp={2} style={{ whiteSpace: 'pre-line' }}>
                  {s.beschreibung}
                </Text>
              </Table.Td>
              <Table.Td>
                <SchluesselAktionen schluessel={s} personenVorschlaege={personenVorschlaege} />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

/** Names of persons without the app that held a key, as suggestions for the next Übergabe. */
export const personenNamen = (liste: SchluesselDto[]) =>
  [...new Set(liste.flatMap((s) => (s.halter?.art === 'person' ? [s.halter.name] : [])))].sort(
    (a, b) => a.localeCompare(b, 'de'),
  );

/** All club keys and who has them; the key management may also create and archive keys. */
export function SchluesselPage() {
  const darfVerwalten = useAuth().can('schluessel:verwalten');
  const eigeneSub = useEigeneSub();
  const [archiv, setArchiv] = useState(false);
  const [anlegen, setAnlegen] = useState(false);
  const liste = useSchluesselListe(darfVerwalten && archiv);

  const daten = useMemo(() => liste.data ?? [], [liste.data]);
  const eigene = daten.filter((s) => istHalter(s.halter, eigeneSub));
  const andere = daten.filter((s) => !istHalter(s.halter, eigeneSub));
  const vorschlaege = useMemo(() => personenNamen(daten), [daten]);
  // Cards on phones, a table from `sm` upward.
  const karten = (schluessel: SchluesselDto[]) => (
    <>
      <SimpleGrid cols={1} hiddenFrom="sm">
        {schluessel.map((s) => (
          <SchluesselKarte key={s.id} schluessel={s} personenVorschlaege={vorschlaege} />
        ))}
      </SimpleGrid>
      <SchluesselTabelle schluessel={schluessel} personenVorschlaege={vorschlaege} />
    </>
  );

  return (
    <Stack>
      <Group justify="space-between" wrap="nowrap">
        <Title order={2}>Schlüssel</Title>
        {darfVerwalten && (
          <Button leftSection={<IconPlus size={18} />} onClick={() => setAnlegen(true)}>
            Anlegen
          </Button>
        )}
      </Group>
      {darfVerwalten && (
        <Switch
          size="md"
          label="Archivierte Schlüssel anzeigen"
          checked={archiv}
          onChange={(e) => setArchiv(e.currentTarget.checked)}
        />
      )}
      {liste.isPending && <Loader m="md" aria-label="Schlüssel werden geladen" />}
      {liste.isError && <Alert color="red">Die Schlüssel konnten nicht geladen werden.</Alert>}
      {liste.data && daten.length === 0 && <Text c="dimmed">Keine Schlüssel vorhanden.</Text>}
      {eigene.length > 0 && (
        <>
          <Title order={3}>Deine Schlüssel</Title>
          {karten(eigene)}
          {andere.length > 0 && <Title order={3}>Alle anderen</Title>}
        </>
      )}
      {andere.length > 0 && karten(andere)}
      {anlegen && <SchluesselFormular onClose={() => setAnlegen(false)} />}
    </Stack>
  );
}
