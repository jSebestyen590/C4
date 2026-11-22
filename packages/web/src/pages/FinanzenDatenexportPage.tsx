import {
  Alert,
  Anchor,
  Button,
  Grid,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconDownload, IconFileExport } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  datenexportEingabeSchema,
  datumAnzeigen,
  heuteBerlin,
  type DatenexportDto,
  type DatenexportErgebnisDto,
} from '@c4/shared';
import { unwrap, useApi } from '../api';
import { DatumFeld } from '../DatumFeld';
import { formatDatumZeit } from '../datum';
import { finanzenKeys, jsonOderFehler } from '../finanzenDaten';
import { HILFE } from '../finanzenHilfe';
import { FeldLabel, InfoHinweis } from '../InfoHinweis';
import { KartenOderTabelle } from '../KartenOderTabelle';
import { mitgliedLink, mitgliedName } from '../mitglied';
import { StatusName } from '../StatusAnzeige';
import { fehlerText } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

function Von({ e }: Readonly<{ e: DatenexportDto }>) {
  const m = e.erstelltVon;
  if (!m) return <>–</>;
  return (
    <Anchor component={Link} to={mitgliedLink(m)} underline="never" inherit>
      <StatusName status={m.status}>{mitgliedName(m)}</StatusName>
    </Anchor>
  );
}

const Download = ({ e }: Readonly<{ e: DatenexportDto }>) => (
  <Button
    component="a"
    href={e.url}
    variant="light"
    leftSection={<IconDownload size={18} />}
    aria-label={`Export ${datumAnzeigen(e.von)} bis ${datumAnzeigen(e.bis)} herunterladen`}
  >
    Herunterladen
  </Button>
);

/** Data export for the tax office (ZIP with CSV files and index.xml), stored in the archive. */
export function FinanzenDatenexportPage() {
  const api = useApi();
  const qc = useQueryClient();
  const vorjahr = Number(heuteBerlin().slice(0, 4)) - 1;
  const [von, setVon] = useState(`${vorjahr}-01-01`);
  const [bis, setBis] = useState(`${vorjahr}-12-31`);
  const [versucht, setVersucht] = useState(false);

  const liste = useQuery({
    queryKey: finanzenKeys.datenexporte,
    queryFn: async () => unwrap(await api.finanzen.datenexporte.$get()),
  });
  const pruefung = datenexportEingabeSchema.safeParse({ von, bis });
  const fehler = pruefung.success
    ? null
    : (pruefung.error.issues[0]?.message ?? 'Bitte prüfe die Eingabe.');

  const erstellen = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () =>
      jsonOderFehler<DatenexportErgebnisDto>(
        await api.finanzen.datenexporte.$post({ json: { von, bis } }),
      ),
    onSuccess: async (e) => {
      await qc.invalidateQueries({ queryKey: finanzenKeys.datenexporte });
      window.location.assign(e.url);
    },
  });

  return (
    <Stack maw={900}>
      <ZurueckLink to="/finanzen">Finanzen</ZurueckLink>
      <Group gap={4}>
        <Title order={2}>Datenexport</Title>
        <InfoHinweis feld="Datenexport" text={HILFE.datenexport.export} />
      </Group>
      <Text c="dimmed">
        Exportiert die Buchführung für das Finanzamt als ZIP mit CSV-Dateien und Beschreibung. Der
        Export wird im Archiv abgelegt.
      </Text>
      <Paper withBorder p="md">
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            setVersucht(true);
            if (!fehler) erstellen.mutate();
          }}
        >
          <Stack>
            <Grid align="flex-end">
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <DatumFeld
                  label={<FeldLabel text="Von" hilfe={HILFE.datenexport.zeitraum} />}
                  value={von}
                  onWert={setVon}
                  loeschbar={false}
                  tippbar
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <DatumFeld label="Bis" value={bis} onWert={setBis} loeschbar={false} tippbar />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <Button
                  type="submit"
                  fullWidth
                  leftSection={<IconFileExport size={18} />}
                  loading={erstellen.isPending}
                >
                  Export erstellen
                </Button>
              </Grid.Col>
            </Grid>
            {versucht && fehler && (
              <Text c="red" size="sm">
                {fehler}
              </Text>
            )}
            {erstellen.isError && (
              <Alert color="red">
                {fehlerText(erstellen.error, 'Der Export ist fehlgeschlagen.')}
              </Alert>
            )}
          </Stack>
        </form>
      </Paper>
      <Title order={3}>Frühere Exporte</Title>
      {liste.isPending && <Loader m="md" aria-label="Wird geladen" />}
      {liste.isError && (
        <Alert color="red">{fehlerText(liste.error, 'Das Laden ist fehlgeschlagen.')}</Alert>
      )}
      {liste.data?.length === 0 && <Text c="dimmed">Noch kein Export erstellt.</Text>}
      <KartenOderTabelle
        zeilen={liste.data ?? []}
        zeilenKey={(e) => e.id}
        minWidth={640}
        karte={(e) => (
          <Paper withBorder p="md">
            <Stack gap="xs">
              <Text fw={600}>
                {datumAnzeigen(e.von)} bis {datumAnzeigen(e.bis)}
              </Text>
              <Text size="sm">
                Von <Von e={e} /> · {formatDatumZeit(e.erstelltAm, 'mittel')}
              </Text>
              <Download e={e} />
            </Stack>
          </Paper>
        )}
        kopf={
          <Table.Tr>
            <Table.Th>Zeitraum</Table.Th>
            <Table.Th>Erstellt von</Table.Th>
            <Table.Th>Am</Table.Th>
            <Table.Th />
          </Table.Tr>
        }
        zeile={(e) => (
          <Table.Tr>
            <Table.Td style={{ whiteSpace: 'nowrap' }}>
              {datumAnzeigen(e.von)} bis {datumAnzeigen(e.bis)}
            </Table.Td>
            <Table.Td>
              <Von e={e} />
            </Table.Td>
            <Table.Td style={{ whiteSpace: 'nowrap' }}>
              {formatDatumZeit(e.erstelltAm, 'mittel')}
            </Table.Td>
            <Table.Td>
              <Download e={e} />
            </Table.Td>
          </Table.Tr>
        )}
      />
    </Stack>
  );
}
