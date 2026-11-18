import { Alert, Badge, Group, Loader, Select, Stack, Table, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { centAnzeigen, datumAnzeigen, type KassenabrechnungListeDto } from '@c4/shared';
import {
  BETRAG_STIL,
  differenzText,
  kassenabrechnungPfad,
  useKassen,
  useKassenabrechnungen,
} from '../finanzenDaten';
import { KartenOderTabelle, KlickKarte } from '../KartenOderTabelle';
import { mitgliedName } from '../mitglied';
import { StatusName } from '../StatusAnzeige';
import { ZurueckLink } from '../ZurueckLink';

function Ersteller({ a }: Readonly<{ a: KassenabrechnungListeDto }>) {
  const m = a.erstelltVon;
  if (!m) return <Text span>–</Text>;
  return <StatusName status={m.status}>{mitgliedName(m)}</StatusName>;
}

const Storniert = () => (
  <Badge color="gray" variant="light">
    storniert
  </Badge>
);

/** All Kassenabrechnungen, newest first, optionally of one Kasse. */
export function FinanzenKassenabrechnungenPage() {
  const navigate = useNavigate();
  const [kasse, setKasse] = useState<string | null>(null);
  const kassen = useKassen(true);
  const abrechnungen = useKassenabrechnungen(kasse);
  const liste = abrechnungen.data?.abrechnungen ?? [];
  return (
    <Stack maw={1100}>
      <ZurueckLink to="/finanzen/kassen">Kassen</ZurueckLink>
      <Title order={2}>Kassenabrechnungen</Title>
      <Select
        label="Kasse"
        placeholder="Alle Kassen"
        clearable
        data={(kassen.data ?? []).map((k) => ({ value: k.kontoId, label: k.name }))}
        value={kasse}
        onChange={setKasse}
        w={{ base: '100%', sm: 320 }}
      />
      {abrechnungen.isPending && <Loader m="md" aria-label="Abrechnungen werden geladen" />}
      {abrechnungen.isError && (
        <Alert color="red">Die Abrechnungen konnten nicht geladen werden.</Alert>
      )}
      {abrechnungen.data && liste.length === 0 && <Text c="dimmed">Noch keine Abrechnungen.</Text>}
      {abrechnungen.data?.gekappt && (
        <Alert color="blue">
          Es werden die neuesten 2.000 Abrechnungen gezeigt – wähle eine Kasse.
        </Alert>
      )}
      <KartenOderTabelle
        zeilen={liste}
        zeilenKey={(a) => a.id}
        minWidth={760}
        karte={(a) => (
          <KlickKarte to={kassenabrechnungPfad(a.id)}>
            <Stack gap={4}>
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                  {a.kontoName}
                </Text>
                {a.storniert ? (
                  <Storniert />
                ) : (
                  <Text fw={600} style={BETRAG_STIL}>
                    {centAnzeigen(a.einnahmeCent)}
                  </Text>
                )}
              </Group>
              <Text size="sm" c="dimmed">
                {datumAnzeigen(a.datum)} · Fehler {differenzText(a.fehlerCent)}
              </Text>
              <Text size="sm">
                Von <Ersteller a={a} />
                {a.buchung && ` · Buchung Nr. ${a.buchung.seq}`}
              </Text>
            </Stack>
          </KlickKarte>
        )}
        kopf={
          <Table.Tr>
            <Table.Th>Datum</Table.Th>
            <Table.Th>Kasse</Table.Th>
            <Table.Th style={BETRAG_STIL}>Einnahme</Table.Th>
            <Table.Th style={BETRAG_STIL}>Fehler</Table.Th>
            <Table.Th>Von</Table.Th>
            <Table.Th style={BETRAG_STIL}>Buchung</Table.Th>
            <Table.Th />
          </Table.Tr>
        }
        zeile={(a) => (
          <Table.Tr
            style={{ cursor: 'pointer' }}
            opacity={a.storniert ? 0.6 : 1}
            onClick={(e) => {
              if (!(e.target as HTMLElement).closest('a'))
                void navigate(kassenabrechnungPfad(a.id));
            }}
          >
            <Table.Td style={{ whiteSpace: 'nowrap' }}>
              <Link
                to={kassenabrechnungPfad(a.id)}
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                {datumAnzeigen(a.datum)}
              </Link>
            </Table.Td>
            <Table.Td style={{ overflowWrap: 'anywhere' }}>{a.kontoName}</Table.Td>
            <Table.Td style={BETRAG_STIL}>{centAnzeigen(a.einnahmeCent)}</Table.Td>
            <Table.Td style={BETRAG_STIL} c={a.fehlerCent === 0 ? 'dimmed' : 'orange.8'}>
              {differenzText(a.fehlerCent)}
            </Table.Td>
            <Table.Td>
              <Ersteller a={a} />
            </Table.Td>
            <Table.Td style={BETRAG_STIL}>{a.buchung ? a.buchung.seq : '–'}</Table.Td>
            <Table.Td>{a.storniert && <Storniert />}</Table.Td>
          </Table.Tr>
        )}
      />
    </Stack>
  );
}
