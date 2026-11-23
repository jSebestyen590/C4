import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  RECHNUNG_STATUS,
  RECHNUNG_STATUS_LABELS,
  centAnzeigen,
  datumAnzeigen,
  heuteBerlin,
  type RechnungListeDto,
} from '@c4/shared';
import { useAuth } from '../auth';
import { BETRAG_STIL, rechnungEntwurfPfad, rechnungPfad, useRechnungen } from '../finanzenDaten';
import { KartenOderTabelle, KlickKarte } from '../KartenOderTabelle';
import { mitgliedName } from '../mitglied';
import { StatusName } from '../StatusAnzeige';
import { ZurueckLink } from '../ZurueckLink';

const pfadVon = (r: RechnungListeDto) =>
  r.status === 'entwurf' ? rechnungEntwurfPfad(r.id) : rechnungPfad(r.id);

const STATUS_FARBE = {
  entwurf: 'blue',
  gestellt: 'orange',
  bezahlt: 'green',
  storniert: 'gray',
} as const;

function StatusMarke({ r }: Readonly<{ r: RechnungListeDto }>) {
  if (r.ueberfaellig)
    return (
      <Badge color="red" variant="light">
        Überfällig
      </Badge>
    );
  return (
    <Badge color={STATUS_FARBE[r.status]} variant="light">
      {r.istStorno ? 'Stornorechnung' : RECHNUNG_STATUS_LABELS[r.status]}
    </Badge>
  );
}

const Empfaenger = ({ r }: Readonly<{ r: RechnungListeDto }>) =>
  r.mitglied ? (
    <StatusName status={r.mitglied.status}>{mitgliedName(r.mitglied)}</StatusName>
  ) : (
    <Text span style={{ overflowWrap: 'anywhere' }}>
      {r.empfaengerName ?? '–'}
    </Text>
  );

const nummerText = (r: RechnungListeDto) => r.nummer ?? 'Entwurf';

/** Kennzahl tile of the list: a label and a value. */
const Kennzahl = ({
  label,
  wert,
  rot = false,
}: Readonly<{ label: string; wert: string; rot?: boolean }>) => (
  <Paper withBorder p="sm">
    <Text size="sm" c="dimmed">
      {label}
    </Text>
    <Text fw={700} size="lg" c={rot ? 'red' : undefined} style={BETRAG_STIL}>
      {wert}
    </Text>
  </Paper>
);

/** All Rechnungen: drafts first, then the issued ones, with filters, search and key figures. */
export function FinanzenRechnungenPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<string | null>(null);
  const [jahr, setJahr] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  const rechnungen = useRechnungen({ status, jahr, q: suche.trim() });
  const liste = rechnungen.data?.rechnungen ?? [];
  const aktuellesJahr = Number(heuteBerlin().slice(0, 4));
  const jahre = Array.from({ length: 6 }, (_, i) => String(aktuellesJahr + 1 - i));

  return (
    <Stack>
      <ZurueckLink to="/finanzen">Finanzen</ZurueckLink>
      <Group justify="space-between" align="flex-end">
        <Title order={2}>Rechnungen</Title>
        {can('finanzen:buchen') && (
          <Button
            component={Link}
            to="/finanzen/rechnungen/neu"
            leftSection={<IconPlus size={18} />}
          >
            Neue Rechnung
          </Button>
        )}
      </Group>
      <Group gap="md">
        <Text size="sm">
          <Link to="/finanzen/rechnungsempfaenger">Empfänger</Link>
        </Text>
        <Text size="sm">
          <Link to="/finanzen/rechnungen/einstellungen">Einstellungen</Link>
        </Text>
      </Group>
      {rechnungen.data && (
        <SimpleGrid cols={{ base: 2, sm: 3, lg: 4 }}>
          <Kennzahl
            label="Offene Rechnungen"
            wert={centAnzeigen(rechnungen.data.offeneSummeCent)}
          />
          <Kennzahl
            label="Überfällig"
            wert={String(rechnungen.data.ueberfaelligAnzahl)}
            rot={rechnungen.data.ueberfaelligAnzahl > 0}
          />
        </SimpleGrid>
      )}
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <TextInput
          label="Suche"
          placeholder="Nummer, Empfänger oder Betreff"
          value={suche}
          onChange={(e) => setSuche(e.currentTarget.value)}
        />
        <Select
          label="Status"
          placeholder="Alle"
          clearable
          data={RECHNUNG_STATUS.map((s) => ({ value: s, label: RECHNUNG_STATUS_LABELS[s] }))}
          value={status}
          onChange={setStatus}
        />
        <Select
          label="Jahr"
          placeholder="Alle"
          clearable
          data={jahre}
          value={jahr}
          onChange={setJahr}
        />
      </SimpleGrid>
      {rechnungen.isPending && <Loader m="md" aria-label="Rechnungen werden geladen" />}
      {rechnungen.isError && (
        <Alert color="red">Die Rechnungen konnten nicht geladen werden.</Alert>
      )}
      {rechnungen.data && liste.length === 0 && <Text c="dimmed">Keine Rechnungen gefunden.</Text>}
      {rechnungen.data?.gekappt && (
        <Alert color="blue">
          Es werden die neuesten Rechnungen gezeigt, grenze die Auswahl ein.
        </Alert>
      )}
      <KartenOderTabelle
        zeilen={liste}
        zeilenKey={(r) => r.id}
        minWidth={820}
        karte={(r) => (
          <KlickKarte to={pfadVon(r)}>
            <Stack gap={4}>
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                  <Empfaenger r={r} />
                </Text>
                <Text fw={600} style={BETRAG_STIL}>
                  {r.bruttoCent === null ? '–' : centAnzeigen(r.bruttoCent)}
                </Text>
              </Group>
              <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                {r.betreff || 'Ohne Betreff'}
              </Text>
              <Group gap="xs">
                <StatusMarke r={r} />
                <Text size="sm" c="dimmed">
                  {nummerText(r)}
                  {r.rechnungsdatum ? ` · ${datumAnzeigen(r.rechnungsdatum)}` : ''}
                  {r.faelligAm && r.status === 'gestellt'
                    ? ` · fällig ${datumAnzeigen(r.faelligAm)}`
                    : ''}
                </Text>
              </Group>
            </Stack>
          </KlickKarte>
        )}
        kopf={
          <Table.Tr>
            <Table.Th>Nummer</Table.Th>
            <Table.Th>Datum</Table.Th>
            <Table.Th>Empfänger</Table.Th>
            <Table.Th>Betreff</Table.Th>
            <Table.Th style={BETRAG_STIL}>Betrag</Table.Th>
            <Table.Th>Fällig</Table.Th>
            <Table.Th>Status</Table.Th>
          </Table.Tr>
        }
        zeile={(r) => (
          <Table.Tr
            style={{ cursor: 'pointer' }}
            opacity={r.status === 'storniert' ? 0.6 : 1}
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest('a')) void navigate(pfadVon(r));
            }}
          >
            <Table.Td style={{ whiteSpace: 'nowrap' }}>
              <Link to={pfadVon(r)} style={{ color: 'inherit', textDecoration: 'none' }}>
                {nummerText(r)}
              </Link>
            </Table.Td>
            <Table.Td style={{ whiteSpace: 'nowrap' }}>
              {r.rechnungsdatum ? datumAnzeigen(r.rechnungsdatum) : '–'}
            </Table.Td>
            <Table.Td style={{ overflowWrap: 'anywhere' }}>
              <Empfaenger r={r} />
            </Table.Td>
            <Table.Td style={{ overflowWrap: 'anywhere' }}>{r.betreff || '–'}</Table.Td>
            <Table.Td style={BETRAG_STIL}>
              {r.bruttoCent === null ? '–' : centAnzeigen(r.bruttoCent)}
            </Table.Td>
            <Table.Td style={{ whiteSpace: 'nowrap' }}>
              {r.faelligAm && !r.istStorno ? datumAnzeigen(r.faelligAm) : '–'}
            </Table.Td>
            <Table.Td>
              <StatusMarke r={r} />
            </Table.Td>
          </Table.Tr>
        )}
      />
    </Stack>
  );
}
