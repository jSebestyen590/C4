import {
  Alert,
  Badge,
  Box,
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
import { IconCash, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { centAnzeigen, datumAnzeigen, stueckelungSumme, type KasseDto } from '@c4/shared';
import { useAuth } from '../auth';
import { BETRAG_STIL, detailPfad, useKassen } from '../finanzenDaten';
import { KasseFormular } from '../KasseFormular';
import { ZurueckLink } from '../ZurueckLink';

const abweichung = (k: KasseDto) => k.saldoCent - stueckelungSumme(k.grundbestand);
const abweichungText = (cent: number) =>
  cent === 0 ? '–' : `${cent > 0 ? '+' : '−'}${centAnzeigen(Math.abs(cent))}`;
const abweichungFarbe = (cent: number) => (cent === 0 ? 'dimmed' : cent > 0 ? 'teal' : 'red');

function LetzteAbrechnung({ k }: Readonly<{ k: KasseDto }>) {
  const a = k.letzteAbrechnung;
  if (!a)
    return (
      <Text span c="dimmed">
        noch nie
      </Text>
    );
  return (
    <Text span>
      {datumAnzeigen(a.datum)}
      {a.buchung && (
        <>
          {' · '}
          <Text span component={Link} to={detailPfad(a.buchung.id)} c="inherit" td="underline">
            Nr. {a.buchung.seq}
          </Text>
        </>
      )}
    </Text>
  );
}

function Aktionen({
  k,
  onBearbeiten,
}: Readonly<{ k: KasseDto; onBearbeiten: (k: KasseDto) => void }>) {
  const { can } = useAuth();
  return (
    <Group gap="xs" wrap="wrap">
      {can('finanzen:buchen') && !k.archiviert && (
        <Button
          component={Link}
          to={`/finanzen/kassen/${encodeURIComponent(k.kontoId)}/abrechnen`}
          leftSection={<IconCash size={18} />}
        >
          Abrechnen
        </Button>
      )}
      {can('finanzen:verwalten') && (
        <Button variant="default" onClick={() => onBearbeiten(k)}>
          Bearbeiten
        </Button>
      )}
    </Group>
  );
}

function KassenKarte({
  k,
  onBearbeiten,
}: Readonly<{ k: KasseDto; onBearbeiten: (k: KasseDto) => void }>) {
  const diff = abweichung(k);
  return (
    <Paper withBorder p="md">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
            {k.name}
          </Text>
          {k.archiviert && (
            <Badge color="gray" variant="light">
              Archiviert
            </Badge>
          )}
        </Group>
        <SimpleGrid cols={2} spacing="xs">
          <Text size="sm" c="dimmed">
            Bestand
          </Text>
          <Text size="sm" style={BETRAG_STIL}>
            {centAnzeigen(k.saldoCent)}
          </Text>
          <Text size="sm" c="dimmed">
            Grundbestand
          </Text>
          <Text size="sm" style={BETRAG_STIL}>
            {centAnzeigen(stueckelungSumme(k.grundbestand))}
          </Text>
          <Text size="sm" c="dimmed">
            Abweichung
          </Text>
          <Text size="sm" style={BETRAG_STIL} c={abweichungFarbe(diff)}>
            {abweichungText(diff)}
          </Text>
          <Text size="sm" c="dimmed">
            Offene Dienst-Zählungen
          </Text>
          <Text size="sm" style={BETRAG_STIL}>
            {k.offeneZaehlungen}
          </Text>
        </SimpleGrid>
        <Text size="sm" c="dimmed">
          Letzte Abrechnung: <LetzteAbrechnung k={k} />
        </Text>
        <Aktionen k={k} onBearbeiten={onBearbeiten} />
      </Stack>
    </Paper>
  );
}

/** The Kassen (Fächer of the Safe with Grundbestand): stock, deviation, open counts, and the way to the Abrechnung. */
export function FinanzenKassenPage() {
  const { can } = useAuth();
  const kassen = useKassen(true);
  const [formular, setFormular] = useState<KasseDto | 'neu' | null>(null);
  const liste = kassen.data ?? [];
  return (
    <Stack maw={1300}>
      <ZurueckLink to="/finanzen">Finanzen</ZurueckLink>
      <Group justify="space-between" wrap="wrap">
        <Title order={2}>Kassen</Title>
        <Group gap="sm" wrap="wrap">
          <Button component={Link} to="/finanzen/kassen/abrechnungen" variant="default">
            Abrechnungen
          </Button>
          {can('finanzen:verwalten') && (
            <Button leftSection={<IconPlus size={18} />} onClick={() => setFormular('neu')}>
              Kasse anlegen
            </Button>
          )}
        </Group>
      </Group>
      <Text c="dimmed" size="sm">
        Eine Kasse ist ein Fach des Safes mit Grundbestand. Wer Dienst hat, zählt sie am Event
        (unverbindlich), die Finanzer:in rechnet sie hier verbindlich ab.
      </Text>
      {kassen.isPending && <Loader m="md" aria-label="Kassen werden geladen" />}
      {kassen.isError && <Alert color="red">Die Kassen konnten nicht geladen werden.</Alert>}
      {kassen.data && liste.length === 0 && (
        <Alert color="blue" title="Noch keine Kassen">
          {can('finanzen:verwalten')
            ? 'Lege mit „Kasse anlegen“ die erste Kasse an.'
            : 'Die Finanzer:in kann Kassen anlegen.'}
        </Alert>
      )}
      {liste.length > 0 && (
        <>
          <SimpleGrid cols={1} hiddenFrom="sm">
            {liste.map((k) => (
              <KassenKarte key={k.kontoId} k={k} onBearbeiten={setFormular} />
            ))}
          </SimpleGrid>
          <Box visibleFrom="sm">
            <Table.ScrollContainer minWidth={720}>
              <Table verticalSpacing="xs" tabularNums>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Kasse</Table.Th>
                    <Table.Th style={BETRAG_STIL}>Bestand</Table.Th>
                    <Table.Th style={BETRAG_STIL}>Grundbestand</Table.Th>
                    <Table.Th style={BETRAG_STIL}>Abweichung</Table.Th>
                    <Table.Th style={BETRAG_STIL}>Offene Zählungen</Table.Th>
                    <Table.Th>Letzte Abrechnung</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {liste.map((k) => (
                    <Table.Tr key={k.kontoId} opacity={k.archiviert ? 0.6 : 1}>
                      <Table.Td style={{ overflowWrap: 'anywhere' }}>
                        <Group gap="xs">
                          <Text fw={600}>{k.name}</Text>
                          {k.archiviert && (
                            <Badge color="gray" variant="light">
                              Archiviert
                            </Badge>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td style={BETRAG_STIL}>{centAnzeigen(k.saldoCent)}</Table.Td>
                      <Table.Td style={BETRAG_STIL}>
                        {centAnzeigen(stueckelungSumme(k.grundbestand))}
                      </Table.Td>
                      <Table.Td style={BETRAG_STIL} c={abweichungFarbe(abweichung(k))}>
                        {abweichungText(abweichung(k))}
                      </Table.Td>
                      <Table.Td style={BETRAG_STIL}>{k.offeneZaehlungen}</Table.Td>
                      <Table.Td>
                        <LetzteAbrechnung k={k} />
                      </Table.Td>
                      <Table.Td>
                        <Aktionen k={k} onBearbeiten={setFormular} />
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Box>
        </>
      )}
      {formular && (
        <KasseFormular
          kasse={formular === 'neu' ? undefined : formular}
          onClose={() => setFormular(null)}
        />
      )}
    </Stack>
  );
}
