import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BELEG_STATUS,
  BELEG_STATUS_LABELS,
  centAnzeigen,
  datumAnzeigen,
  ZAHLWEGE,
  ZAHLWEG_LABELS,
  type BelegListeDto,
} from '@c4/shared';
import { useAuth } from '../auth';
import { DatumFeld } from '../DatumFeld';
import {
  BETRAG_STIL,
  belegEntwurfPfad,
  belegPfad,
  useBelege,
  useRechnungssteller,
} from '../finanzenDaten';
import { KartenOderTabelle, KlickKarte } from '../KartenOderTabelle';
import { mitgliedName } from '../mitglied';
import { mitgliedOptionen, useMitgliederListe } from '../organisator';
import { StatusName } from '../StatusAnzeige';
import { ZurueckLink } from '../ZurueckLink';

const pfadVon = (b: BelegListeDto) =>
  b.status === 'entwurf' ? belegEntwurfPfad(b.id) : belegPfad(b.id);

function StatusBadge({ b }: Readonly<{ b: BelegListeDto }>) {
  if (b.status === 'gebucht') return null;
  return (
    <Badge color={b.status === 'entwurf' ? 'blue' : 'gray'} variant="light">
      {BELEG_STATUS_LABELS[b.status]}
    </Badge>
  );
}

const Mitglied = ({ b }: Readonly<{ b: BelegListeDto }>) =>
  b.mitglied ? (
    <StatusName status={b.mitglied.status}>{mitgliedName(b.mitglied)}</StatusName>
  ) : (
    <Text span>–</Text>
  );

/** All Belege: drafts first, then the booked ones, with filters. */
export function FinanzenBelegePage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const [rs, setRs] = useState<string | null>(null);
  const [von, setVon] = useState('');
  const [bis, setBis] = useState('');
  const [zahlweg, setZahlweg] = useState<string | null>(null);
  const [mitglied, setMitglied] = useState<string | null>(null);
  const belege = useBelege({
    status,
    rechnungsstellerId: rs,
    von,
    bis,
    zahlweg,
    mitgliedId: mitglied,
  });
  const rechnungssteller = useRechnungssteller(true);
  const mitglieder = useMitgliederListe();
  const liste = belege.data?.belege ?? [];

  return (
    <Stack maw={1200}>
      <ZurueckLink to="/finanzen">Finanzen</ZurueckLink>
      <Group justify="space-between" align="center">
        <Title order={2}>Belege</Title>
        <Group>
          <Button component={Link} to="/finanzen/auslagen" variant="default">
            Offene Auslagen
          </Button>
          <Button component={Link} to="/finanzen/rechnungssteller" variant="default">
            Rechnungssteller
          </Button>
          {can('finanzen:buchen') && (
            <Button component={Link} to="/finanzen/belege/neu" leftSection={<IconPlus size={18} />}>
              Neuer Beleg
            </Button>
          )}
        </Group>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
        <Select
          label="Status"
          placeholder="Alle"
          clearable
          data={BELEG_STATUS.map((s) => ({ value: s, label: BELEG_STATUS_LABELS[s] }))}
          value={status}
          onChange={setStatus}
        />
        <Select
          label="Rechnungssteller"
          placeholder="Alle"
          clearable
          searchable
          data={(rechnungssteller.data ?? []).map((r) => ({
            value: r.id,
            label: r.archiviert ? `${r.name} (archiviert)` : r.name,
          }))}
          value={rs}
          onChange={setRs}
        />
        <Select
          label="Zahlweg"
          placeholder="Alle"
          clearable
          data={ZAHLWEGE.map((z) => ({ value: z, label: ZAHLWEG_LABELS[z] }))}
          value={zahlweg}
          onChange={setZahlweg}
        />
        <DatumFeld label="Belegdatum von" value={von} onWert={setVon} />
        <DatumFeld label="Belegdatum bis" value={bis} onWert={setBis} />
        <Select
          label="Mitglied (Auslage)"
          placeholder="Alle"
          clearable
          searchable
          data={mitgliedOptionen(mitglieder.data ?? [])}
          value={mitglied}
          onChange={setMitglied}
        />
      </SimpleGrid>
      {belege.isPending && <Loader m="md" aria-label="Belege werden geladen" />}
      {belege.isError && <Alert color="red">Die Belege konnten nicht geladen werden.</Alert>}
      {belege.data && liste.length === 0 && <Text c="dimmed">Keine Belege gefunden.</Text>}
      {belege.data?.gekappt && (
        <Alert color="blue">Es werden die neuesten Belege gezeigt, grenze die Auswahl ein.</Alert>
      )}
      <KartenOderTabelle
        zeilen={liste}
        zeilenKey={(b) => b.id}
        minWidth={820}
        karte={(b) => (
          <KlickKarte to={pfadVon(b)}>
            <Stack gap={4}>
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                  {b.rechnungssteller ?? 'Ohne Rechnungssteller'}
                </Text>
                <Text fw={600} style={BETRAG_STIL}>
                  {b.summeCent === null ? '–' : centAnzeigen(b.summeCent)}
                </Text>
              </Group>
              <Group gap="xs">
                <StatusBadge b={b} />
                <Text size="sm" c="dimmed">
                  {b.nummer ?? 'Entwurf'}
                  {b.belegdatum ? ` · ${datumAnzeigen(b.belegdatum)}` : ''}
                </Text>
              </Group>
              {b.zahlweg && (
                <Text size="sm" c="dimmed">
                  {ZAHLWEG_LABELS[b.zahlweg]}
                  {b.mitglied && (
                    <>
                      {': '}
                      <Mitglied b={b} />
                    </>
                  )}
                </Text>
              )}
            </Stack>
          </KlickKarte>
        )}
        kopf={
          <Table.Tr>
            <Table.Th>Nummer</Table.Th>
            <Table.Th>Belegdatum</Table.Th>
            <Table.Th>Rechnungssteller</Table.Th>
            <Table.Th style={BETRAG_STIL}>Summe</Table.Th>
            <Table.Th>Zahlweg</Table.Th>
            <Table.Th>Mitglied</Table.Th>
            <Table.Th />
          </Table.Tr>
        }
        zeile={(b) => (
          <Table.Tr
            style={{ cursor: 'pointer' }}
            opacity={b.status === 'storniert' ? 0.6 : 1}
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest('a')) void navigate(pfadVon(b));
            }}
          >
            <Table.Td style={{ whiteSpace: 'nowrap' }}>
              <Link to={pfadVon(b)} style={{ color: 'inherit', textDecoration: 'none' }}>
                {b.nummer ?? 'Entwurf'}
              </Link>
            </Table.Td>
            <Table.Td style={{ whiteSpace: 'nowrap' }}>
              {b.belegdatum ? datumAnzeigen(b.belegdatum) : '–'}
            </Table.Td>
            <Table.Td style={{ overflowWrap: 'anywhere' }}>{b.rechnungssteller ?? '–'}</Table.Td>
            <Table.Td style={BETRAG_STIL}>
              {b.summeCent === null ? '–' : centAnzeigen(b.summeCent)}
            </Table.Td>
            <Table.Td>{b.zahlweg ? ZAHLWEG_LABELS[b.zahlweg] : '–'}</Table.Td>
            <Table.Td>
              <Mitglied b={b} />
            </Table.Td>
            <Table.Td>
              <StatusBadge b={b} />
            </Table.Td>
          </Table.Tr>
        )}
      />
    </Stack>
  );
}
