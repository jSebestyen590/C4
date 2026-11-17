import {
  Alert,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  centAnzeigen,
  datumAnzeigen,
  gueltigerTarif,
  heuteBerlin,
  MITGLIED_STATI,
  type MitgliedStatus,
} from '@c4/shared';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { BestaetigenDialog } from '../BestaetigenDialog';
import { BetragFeld } from '../BetragFeld';
import { buchKeys, useBuchTarife } from '../buchDaten';
import { DatumFeld } from '../DatumFeld';
import { HILFE } from '../finanzenHilfe';
import { FeldLabel } from '../InfoHinweis';
import { MITGLIED_STATUS_MEHRZAHL } from '../i18n';
import { useVerwerfenWarnung } from '../useVerwerfenWarnung';
import { pruefen } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

const STATUS_OPTIONEN = MITGLIED_STATI.map((s) => ({
  value: s,
  label: MITGLIED_STATUS_MEHRZAHL[s],
}));
const BETRAG = {
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
} as const;

/** Tarife per status (Strichwert, maximum overdraft, valid from); new ones only for `finanzen:verwalten`. */
export function FinanzenBuchTarifePage() {
  const api = useApi();
  const qc = useQueryClient();
  const { can } = useAuth();
  const tarife = useBuchTarife();
  const heute = heuteBerlin();
  const [status, setStatus] = useState<string | null>(null);
  const [strichwert, setStrichwert] = useState<number | null>(null);
  const [ueberzug, setUeberzug] = useState<number | null>(null);
  const [gueltigAb, setGueltigAb] = useState(heute);
  const [bestaetigen, setBestaetigen] = useState(false);
  const [versucht, setVersucht] = useState(false);
  const warnung = useVerwerfenWarnung(status !== null || strichwert !== null || ueberzug !== null);
  const liste = tarife.data ?? [];

  const fehler = {
    status: status === null ? 'Bitte wähle einen Status.' : undefined,
    strichwert:
      strichwert === null || strichwert < 1 ? 'Der Strichwert muss größer als 0 sein.' : undefined,
    ueberzug: ueberzug === null ? 'Bitte gib den maximalen Überzug an.' : undefined,
    datum: gueltigAb === '' ? 'Bitte gib ein Datum an.' : undefined,
  };
  const gueltig = !Object.values(fehler).some(Boolean);

  const speichern = async () => {
    await pruefen(
      await api.buch.tarife.$post({
        json: {
          status: status as MitgliedStatus,
          strichwertCent: strichwert ?? 0,
          maxUeberzugCent: ueberzug ?? 0,
          gueltigAb,
        },
      }),
    );
    warnung.abgeschlossen();
    await qc.invalidateQueries({ queryKey: buchKeys.alle });
    notifications.show({ color: 'green', message: 'Der Tarif wurde gespeichert.' });
    setStatus(null);
    setStrichwert(null);
    setUeberzug(null);
    setGueltigAb(heute);
    setVersucht(false);
  };

  return (
    <Stack maw={1000}>
      <ZurueckLink to="/finanzen/buch">Buch</ZurueckLink>
      <Title order={2}>Tarife</Title>
      <Text c="dimmed" size="sm">
        Strichwert und maximaler Überzug je Status. Tarife werden nie geändert, ein neuer ersetzt
        den alten ab seinem Datum.
      </Text>
      {tarife.isPending && <Loader m="md" aria-label="Tarife werden geladen" />}
      {tarife.isError && <Alert color="red">Die Tarife konnten nicht geladen werden.</Alert>}
      {tarife.data && (
        <>
          <Title order={3}>Aktuell</Title>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
            {MITGLIED_STATI.map((s) => {
              const t = gueltigerTarif(liste, s, heute);
              return (
                <Paper key={s} withBorder p="md">
                  <Stack gap={2}>
                    <Text fw={600}>{MITGLIED_STATUS_MEHRZAHL[s]}</Text>
                    {t ? (
                      <>
                        <Text>Strich {centAnzeigen(t.strichwertCent)}</Text>
                        <Text size="sm" c="dimmed">
                          Überzug bis {centAnzeigen(t.maxUeberzugCent)} · seit{' '}
                          {datumAnzeigen(t.gueltigAb)}
                        </Text>
                      </>
                    ) : (
                      <Text c="orange">Noch kein Tarif</Text>
                    )}
                  </Stack>
                </Paper>
              );
            })}
          </SimpleGrid>
        </>
      )}
      {can('finanzen:verwalten') && (
        <Paper withBorder p="md">
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              setVersucht(true);
              if (gueltig) setBestaetigen(true);
            }}
          >
            <Stack>
              <Title order={3}>Neuer Tarif</Title>
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
                <Select
                  size="md"
                  label={<FeldLabel text="Status" hilfe={HILFE.buch.tarifStatus} />}
                  data={STATUS_OPTIONEN}
                  value={status}
                  onChange={setStatus}
                  error={versucht ? fehler.status : undefined}
                />
                <BetragFeld
                  size="md"
                  label={<FeldLabel text="Strichwert" hilfe={HILFE.buch.strichwert} />}
                  value={strichwert}
                  onWert={setStrichwert}
                  error={versucht ? fehler.strichwert : undefined}
                />
                <BetragFeld
                  size="md"
                  label={<FeldLabel text="Max. Überzug" hilfe={HILFE.buch.maxUeberzug} />}
                  value={ueberzug}
                  onWert={setUeberzug}
                  error={versucht ? fehler.ueberzug : undefined}
                />
                <DatumFeld
                  size="md"
                  label={<FeldLabel text="Gültig ab" hilfe={HILFE.buch.gueltigAb} />}
                  value={gueltigAb}
                  onWert={setGueltigAb}
                  loeschbar={false}
                  error={versucht ? fehler.datum : undefined}
                />
              </SimpleGrid>
              <Group>
                <Button type="submit">Tarif prüfen und speichern</Button>
              </Group>
            </Stack>
          </form>
        </Paper>
      )}
      {liste.length > 0 && (
        <>
          <Title order={3}>Verlauf</Title>
          <Table.ScrollContainer minWidth={420}>
            <Table verticalSpacing={6} tabularNums>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Gültig ab</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th style={BETRAG}>Strichwert</Table.Th>
                  <Table.Th style={BETRAG}>Max. Überzug</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {liste.map((t) => (
                  <Table.Tr key={t.id}>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>
                      {datumAnzeigen(t.gueltigAb)}
                    </Table.Td>
                    <Table.Td>{MITGLIED_STATUS_MEHRZAHL[t.status]}</Table.Td>
                    <Table.Td style={BETRAG}>{centAnzeigen(t.strichwertCent)}</Table.Td>
                    <Table.Td style={BETRAG}>{centAnzeigen(t.maxUeberzugCent)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </>
      )}
      {bestaetigen && (
        <BestaetigenDialog
          titel="Tarif speichern"
          bestaetigenText="Tarif speichern"
          color="blue"
          onClose={() => setBestaetigen(false)}
          onBestaetigt={speichern}
        >
          <Text>
            Ab {datumAnzeigen(gueltigAb)} gilt für{' '}
            {status ? MITGLIED_STATUS_MEHRZAHL[status as MitgliedStatus] : ''}: Strich{' '}
            {centAnzeigen(strichwert ?? 0)}, Überzug bis {centAnzeigen(ueberzug ?? 0)}.
          </Text>
          <Text size="sm" c="dimmed">
            Ein gespeicherter Tarif lässt sich nicht mehr ändern.
          </Text>
        </BestaetigenDialog>
      )}
      {warnung.dialog}
    </Stack>
  );
}
