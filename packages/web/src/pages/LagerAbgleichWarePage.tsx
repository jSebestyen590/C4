import {
  Alert,
  Anchor,
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
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ABGLEICH_GRUND_LABELS, datumAnzeigen, type LagerAbgleichEreignisDto } from '@c4/shared';
import { unwrap, useApi } from '../api';
import { belegPfad } from '../finanzenDaten';
import { LagerAbgleichKorrekturDialog } from '../LagerAbgleichKorrekturDialog';
import { useAbgleichRechte, useLagerAbgleichWare } from '../lagerAbgleichDaten';
import { mitgliedLink, mitgliedName } from '../mitglied';
import { StatusName } from '../StatusAnzeige';
import { warenKeys } from '../warenDaten';
import { ZurueckLink } from '../ZurueckLink';
import { DiskrepanzText } from './LagerAbgleichPage';

const ZAHL = { whiteSpace: 'nowrap', textAlign: 'right' } as const;

const ARTEN = { ist: 'Eingelagert', soll: 'Beleg', korrektur: 'Korrektur' } as const;

function Beschreibung({ e, wareId }: Readonly<{ e: LagerAbgleichEreignisDto; wareId: string }>) {
  if (e.art === 'ist')
    return (
      <Anchor component={Link} to={`/waren/${encodeURIComponent(wareId)}`}>
        {e.lagerortName ? `Eingelagert in ${e.lagerortName}` : 'Eingelagert'}
      </Anchor>
    );
  if (e.art === 'soll')
    return (
      <Anchor component={Link} to={belegPfad(e.belegId)}>
        Beleg {e.belegNummer}
      </Anchor>
    );
  return (
    <Stack gap={0}>
      <Text span>
        {ABGLEICH_GRUND_LABELS[e.grund]}
        {e.text ? `: ${e.text}` : ''}
      </Text>
      {e.person && (
        <Text span size="sm" c="dimmed">
          von{' '}
          <Anchor component={Link} to={mitgliedLink(e.person)} underline="never" inherit>
            <StatusName status={e.person.status}>{mitgliedName(e.person)}</StatusName>
          </Anchor>
        </Text>
      )}
    </Stack>
  );
}

/** Timeline of one Ware since the Stichtag, with the running Diskrepanz and the "Ausgleichen" dialog. */
export function LagerAbgleichWarePage() {
  const { wareId = '' } = useParams();
  const api = useApi();
  const { schreiben } = useAbgleichRechte();
  const daten = useLagerAbgleichWare(wareId);
  const ware = useQuery({
    queryKey: warenKeys.detail(wareId),
    queryFn: async () => unwrap(await api.waren[':id'].$get({ param: { id: wareId } })),
  });
  const [ausgleichen, setAusgleichen] = useState(false);
  const zurueck = <ZurueckLink to="/finanzen/lager-abgleich">Lager-Beleg-Abgleich</ZurueckLink>;

  if (daten.isPending) return <Loader m="md" aria-label="Ware wird geladen" />;
  if (daten.isError)
    return (
      <Stack>
        {zurueck}
        <Alert color="red">
          Der Abgleich dieser Ware konnte nicht geladen werden. Ist ein Stichtag festgelegt?
        </Alert>
      </Stack>
    );
  const { ware: z, zeitleiste, stichtag } = daten.data;

  return (
    <Stack maw={1000}>
      {zurueck}
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Title order={2} style={{ overflowWrap: 'anywhere' }}>
            {z.name}
          </Title>
          <Text size="sm" c="dimmed">
            {z.warengruppe ? `${z.warengruppe} · ` : ''}seit {datumAnzeigen(stichtag)}
          </Text>
          <Anchor component={Link} to={`/waren/${encodeURIComponent(z.wareId)}`} size="sm">
            Zur Ware
          </Anchor>
        </Stack>
        {schreiben && (
          <Button size="md" onClick={() => setAusgleichen(true)}>
            Ausgleichen
          </Button>
        )}
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        {[
          ['Lager (Ist)', z.istText],
          ['Belege (Soll)', z.sollText],
          ['Korrektur', z.korrekturText],
        ].map(([k, w]) => (
          <Paper key={k} withBorder p="sm">
            <Text size="sm" c="dimmed">
              {k}
            </Text>
            <Text fw={600}>{w}</Text>
          </Paper>
        ))}
        <Paper withBorder p="sm">
          <Text size="sm" c="dimmed">
            Diskrepanz
          </Text>
          <Text fw={600}>
            <DiskrepanzText zeile={z} />
          </Text>
        </Paper>
      </SimpleGrid>

      <Title order={3}>Verlauf</Title>
      {zeitleiste.length === 0 && <Text c="dimmed">Seit dem Stichtag gibt es keine Einträge.</Text>}
      {zeitleiste.length > 0 && (
        <>
          <Stack gap="xs" hiddenFrom="sm">
            {zeitleiste.map((e, i) => (
              <Paper key={i} withBorder p="sm">
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Text size="sm" c="dimmed">
                    {datumAnzeigen(e.datum)} · {ARTEN[e.art]}
                  </Text>
                  <Text fw={600} style={{ whiteSpace: 'nowrap' }}>
                    {e.mengeText}
                  </Text>
                </Group>
                <Beschreibung e={e} wareId={z.wareId} />
                <Text size="sm" c="dimmed">
                  Diskrepanz danach: {e.diskrepanzText}
                </Text>
              </Paper>
            ))}
          </Stack>
          <Table verticalSpacing="xs" visibleFrom="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Datum</Table.Th>
                <Table.Th>Art</Table.Th>
                <Table.Th>Einzelheiten</Table.Th>
                <Table.Th style={ZAHL}>Menge</Table.Th>
                <Table.Th style={ZAHL}>Diskrepanz danach</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {zeitleiste.map((e, i) => (
                <Table.Tr key={i}>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>{datumAnzeigen(e.datum)}</Table.Td>
                  <Table.Td>{ARTEN[e.art]}</Table.Td>
                  <Table.Td>
                    <Beschreibung e={e} wareId={z.wareId} />
                  </Table.Td>
                  <Table.Td style={ZAHL}>{e.mengeText}</Table.Td>
                  <Table.Td style={ZAHL}>{e.diskrepanzText}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}

      {ausgleichen && (
        <LagerAbgleichKorrekturDialog
          zeile={z}
          ware={ware.data}
          stichtag={stichtag}
          onClose={() => setAusgleichen(false)}
        />
      )}
    </Stack>
  );
}
