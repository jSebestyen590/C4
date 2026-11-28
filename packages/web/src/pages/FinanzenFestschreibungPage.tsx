import {
  Alert,
  Button,
  Group,
  List,
  Loader,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { BereichLink } from '../BereichLink';
import { IconLock } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  datumAnzeigen,
  monatAnzeigen,
  monatsEnde,
  type FestschreibungDto,
  type FestschreibungErgebnisDto,
} from '@c4/shared';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { formatDatumZeit } from '../datum';
import { finanzenKeys, jsonOderFehler, useFestschreibungen } from '../finanzenDaten';
import { HILFE } from '../finanzenHilfe';
import { HashAnzeige } from '../HashAnzeige';
import { FeldLabel, InfoHinweis } from '../InfoHinweis';
import { KartenOderTabelle } from '../KartenOderTabelle';
import { mitgliedLink, mitgliedName } from '../mitglied';
import { StatusName } from '../StatusAnzeige';
import { fehlerText } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

const monatName = (monat: string) =>
  new Date(`${monat.slice(0, 7)}-01T12:00:00`).toLocaleDateString('de-DE', {
    month: 'long',
    year: 'numeric',
  });

function Von({ f }: Readonly<{ f: FestschreibungDto }>) {
  const m = f.festgeschriebenVon;
  if (!m) return <>–</>;
  return (
    <BereichLink to={mitgliedLink(m)} underline="never" inherit>
      <StatusName status={m.status}>{mitgliedName(m)}</StatusName>
    </BereichLink>
  );
}

/** Closed months (Festschreibung): shows the state and closes the next month, one after the other. */
export function FinanzenFestschreibungPage() {
  const api = useApi();
  const qc = useQueryClient();
  const { can } = useAuth();
  const uebersicht = useFestschreibungen();
  const [offen, setOffen] = useState(false);
  const schluessel = useRef<string | null>(null);
  const u = uebersicht.data;

  const festschreiben = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (monat: string) => {
      schluessel.current ??= crypto.randomUUID();
      return jsonOderFehler<FestschreibungErgebnisDto>(
        await api.finanzen.festschreibungen.$post({
          json: { monat, idempotenzSchluessel: schluessel.current },
        }),
      );
    },
    onSuccess: async () => {
      schluessel.current = null;
      setOffen(false);
      await qc.invalidateQueries({ queryKey: finanzenKeys.alle });
    },
  });

  const monat = u?.naechsterMonat ?? null;
  const schliessen = () => {
    if (festschreiben.isPending) return;
    festschreiben.reset();
    setOffen(false);
  };

  return (
    <Stack maw={900}>
      <ZurueckLink to="/finanzen">Finanzen</ZurueckLink>
      <Group gap={4}>
        <Title order={2}>Festschreibung</Title>
        <InfoHinweis feld="Festschreibung" text={HILFE.festschreibung.monat} />
      </Group>
      {uebersicht.isPending && <Loader m="md" aria-label="Wird geladen" />}
      {uebersicht.isError && (
        <Alert color="red">{fehlerText(uebersicht.error, 'Das Laden ist fehlgeschlagen.')}</Alert>
      )}
      {u && (
        <>
          <Group gap={4}>
            <Text fw={600}>
              {u.festgeschriebenBis
                ? `Festgeschrieben bis ${datumAnzeigen(u.festgeschriebenBis)}`
                : 'Noch kein Monat festgeschrieben'}
            </Text>
            <InfoHinweis feld="Festgeschrieben bis" text={HILFE.festschreibung.bis} />
          </Group>
          <Paper withBorder p="md">
            {monat ? (
              <Stack>
                <Text fw={600}>{monatName(monat)}</Text>
                {u.hinweise.length > 0 && (
                  <Alert color="orange" title="Noch offen in diesem Monat">
                    <List size="sm" spacing={4}>
                      {u.hinweise.map((h) => (
                        <List.Item key={h.art}>{h.text}</List.Item>
                      ))}
                    </List>
                  </Alert>
                )}
                {can('finanzen:verwalten') ? (
                  <Button
                    leftSection={<IconLock size={18} />}
                    onClick={() => setOffen(true)}
                    w={{ base: '100%', sm: 'fit-content' }}
                  >
                    Monat {monatAnzeigen(monat)} festschreiben
                  </Button>
                ) : (
                  <Text size="sm" c="dimmed">
                    Festschreiben darf nur, wer Finanzen verwalten darf.
                  </Text>
                )}
              </Stack>
            ) : (
              <Text c="dimmed">Es gibt keinen Monat, der festgeschrieben werden kann.</Text>
            )}
          </Paper>
          <Title order={3}>Festgeschriebene Monate</Title>
          {u.liste.length === 0 && <Text c="dimmed">Noch nichts festgeschrieben.</Text>}
          <KartenOderTabelle
            zeilen={u.liste}
            zeilenKey={(f) => f.id}
            minWidth={760}
            karte={(f) => (
              <Paper withBorder p="md">
                <Stack gap={4}>
                  <Text fw={600}>{monatName(f.monat)}</Text>
                  <Text size="sm" c="dimmed">
                    {f.anzahl} Buchungen, bis Nr. {f.bisSeq}
                  </Text>
                  <HashAnzeige label="Kopf-Hash" wert={f.kopfHash} />
                  <Text size="sm">
                    Von <Von f={f} /> · {formatDatumZeit(f.festgeschriebenAm, 'mittel')}
                  </Text>
                </Stack>
              </Paper>
            )}
            kopf={
              <Table.Tr>
                <Table.Th>Monat</Table.Th>
                <Table.Th>Buchungen</Table.Th>
                <Table.Th>Bis Nr.</Table.Th>
                <Table.Th>
                  <FeldLabel text="Kopf-Hash" hilfe={HILFE.festschreibung.kopfHash} />
                </Table.Th>
                <Table.Th>Von</Table.Th>
                <Table.Th>Am</Table.Th>
              </Table.Tr>
            }
            zeile={(f) => (
              <Table.Tr>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>{monatAnzeigen(f.monat)}</Table.Td>
                <Table.Td>{f.anzahl}</Table.Td>
                <Table.Td>{f.bisSeq}</Table.Td>
                <Table.Td style={{ maxWidth: 260 }}>
                  <HashAnzeige label="" wert={f.kopfHash} />
                </Table.Td>
                <Table.Td>
                  <Von f={f} />
                </Table.Td>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>
                  {formatDatumZeit(f.festgeschriebenAm, 'mittel')}
                </Table.Td>
              </Table.Tr>
            )}
          />
        </>
      )}
      <Modal
        opened={offen && monat !== null}
        onClose={schliessen}
        title={monat ? `Monat ${monatAnzeigen(monat)} festschreiben?` : ''}
        centered
      >
        {monat && (
          <Stack>
            <Text>
              Danach kannst du keine Buchung mit Datum im {monatName(monat)} mehr anlegen (bis{' '}
              {datumAnzeigen(monatsEnde(monat))}). Das lässt sich nicht rückgängig machen.
            </Text>
            {(u?.hinweise ?? []).length > 0 && (
              <Alert color="orange" title="Noch offen">
                <List size="sm" spacing={4}>
                  {(u?.hinweise ?? []).map((h) => (
                    <List.Item key={h.art}>{h.text}</List.Item>
                  ))}
                </List>
              </Alert>
            )}
            {festschreiben.isError && (
              <Alert color="red">
                {fehlerText(festschreiben.error, 'Das Festschreiben ist fehlgeschlagen.')}
              </Alert>
            )}
            <Button
              fullWidth
              loading={festschreiben.isPending}
              onClick={() => festschreiben.mutate(monat)}
            >
              Endgültig festschreiben
            </Button>
            <Button fullWidth variant="default" onClick={schliessen}>
              Abbrechen
            </Button>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
