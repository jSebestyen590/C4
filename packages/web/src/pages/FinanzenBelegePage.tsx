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
  if (b.entwurfStatus === 'eingereicht')
    return (
      <Badge color="orange" variant="light">
        Eingereicht
      </Badge>
    );
  return (
    <Badge color={b.status === 'entwurf' ? 'blue' : 'gray'} variant="light">
      {BELEG_STATUS_LABELS[b.status]}
    </Badge>
  );
}

const Einreicher = ({ b }: Readonly<{ b: BelegListeDto }>) =>
  b.eingereichtVon ? (
    <StatusName status={b.eingereichtVon.status}>{mitgliedName(b.eingereichtVon)}</StatusName>
  ) : null;

const summeVon = (b: BelegListeDto) => b.summeCent ?? b.eingereichtBetragCent;

const Mitglied = ({ b }: Readonly<{ b: BelegListeDto }>) =>
  b.mitglied ? (
    <StatusName status={b.mitglied.status}>{mitgliedName(b.mitglied)}</StatusName>
  ) : (
    <Text span>–</Text>
  );

/** Cards on phones, table from `sm`: one list of Belege. */
function BelegTabelle({ zeilen }: Readonly<{ zeilen: readonly BelegListeDto[] }>) {
  const navigate = useNavigate();
  return (
    <KartenOderTabelle
      zeilen={zeilen}
      zeilenKey={(b) => b.id}
      minWidth={820}
      karte={(b) => (
        <KlickKarte to={pfadVon(b)}>
          <Stack gap={4}>
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                <StellerAnzeige b={b} leer="Ohne Rechnungssteller" />
              </Text>
              <Text fw={600} style={BETRAG_STIL}>
                {summeVon(b) === null ? '–' : centAnzeigen(summeVon(b)!)}
              </Text>
            </Group>
            <Group gap="xs">
              <StatusBadge b={b} />
              <Text size="sm" c="dimmed">
                {b.nummer ?? 'Entwurf'}
                {b.belegdatum ? ` · ${datumAnzeigen(b.belegdatum)}` : ''}
              </Text>
            </Group>
            {b.eingereichtVon && (
              <Text size="sm" c="dimmed">
                Eingereicht von <Einreicher b={b} />
              </Text>
            )}
            {b.zahlweg && (
              <Text size="sm" c="dimmed">
                {ZAHLWEG_LABELS[b.zahlweg]}
                {b.mitglied && (
                  <>
                    {': '}
                    {b.entwurfStatus === 'eingereicht' ? <Einreicher b={b} /> : <Mitglied b={b} />}
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
          <Table.Th>Mitglied / Einreicher:in</Table.Th>
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
          <Table.Td style={{ overflowWrap: 'anywhere' }}>
            <StellerAnzeige b={b} leer="–" />
          </Table.Td>
          <Table.Td style={BETRAG_STIL}>
            {summeVon(b) === null ? '–' : centAnzeigen(summeVon(b)!)}
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
  );
}

/** All Belege: drafts first, then the booked ones, with filters. */
export function FinanzenBelegePage() {
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
  const eingereicht = liste.filter((b) => b.entwurfStatus === 'eingereicht');
  const rest = liste.filter((b) => b.entwurfStatus !== 'eingereicht');

  return (
    <Stack maw={1200}>
      <ZurueckLink to="/finanzen">Finanzen</ZurueckLink>
      <Group justify="space-between" align="center">
        <Title order={2}>Belege</Title>
        <Group wrap="wrap">
          <Button component={Link} to="/finanzen/auslagen" variant="default">
            Offene Auslagen
          </Button>
          <Button component={Link} to="/finanzen/artikel" variant="default">
            Artikel
          </Button>
          <Button component={Link} to="/finanzen/rechnungssteller" variant="default">
            Rechnungssteller
          </Button>
          <Button component={Link} to="/finanzen/warengruppen-kategorien" variant="default">
            Warengruppen und Kategorien
          </Button>
          <Button component={Link} to="/finanzen/lager-abgleich" variant="default">
            Lager-Beleg-Abgleich
          </Button>
          {can('finanzen:buchen') && (
            <Button component={Link} to="/finanzen/belege/neu" leftSection={<IconPlus size={18} />}>
              Neuer Beleg
            </Button>
          )}
        </Group>
      </Group>
      <SimpleGrid style={{ alignItems: 'end' }} cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
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
      {eingereicht.length > 0 && (
        <Stack gap="xs">
          <Group gap="xs">
            <Title order={3}>Eingereicht</Title>
            <Badge
              variant="light"
              color="orange"
              aria-label={`${eingereicht.length} eingereichte Belege`}
            >
              {eingereicht.length}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            Mitglieder haben diese Belege eingereicht. Prüfe sie, ergänze sie und buche sie, oder
            verwirf sie mit einer Begründung.
          </Text>
          <BelegTabelle zeilen={eingereicht} />
        </Stack>
      )}
      {eingereicht.length > 0 && rest.length > 0 && <Title order={3}>Alle Belege</Title>}
      <BelegTabelle zeilen={rest} />
    </Stack>
  );
}

/** Rechnungssteller of a Beleg; for a submission only the member's free name, shown as a suggestion. */
function StellerAnzeige({
  b,
  leer,
}: {
  b: { rechnungssteller: string | null; rechnungsstellerName: string | null };
  leer: string;
}) {
  if (b.rechnungssteller) return <>{b.rechnungssteller}</>;
  if (b.rechnungsstellerName)
    return (
      <Text span fs="italic" c="dimmed" inherit>
        {b.rechnungsstellerName} (Vorschlag)
      </Text>
    );
  return <>{leer}</>;
}
