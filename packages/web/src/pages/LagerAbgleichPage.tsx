import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { datumAnzeigen, type LagerAbgleichZeileDto } from '@c4/shared';
import { useApi } from '../api';
import { DatumFeld } from '../DatumFeld';
import { HILFE } from '../finanzenHilfe';
import { InfoHinweis } from '../InfoHinweis';
import { KartenOderTabelle, KlickKarte } from '../KartenOderTabelle';
import {
  lagerAbgleichKeys,
  lagerAbgleichPfad,
  useAbgleichRechte,
  useLagerAbgleich,
} from '../lagerAbgleichDaten';
import { fehlerAnzeigen, pruefen } from '../warenApi';
import { ZurueckLink } from '../ZurueckLink';

const ZAHL = { whiteSpace: 'nowrap', textAlign: 'right' } as const;

export function DiskrepanzText({ zeile }: Readonly<{ zeile: LagerAbgleichZeileDto }>) {
  return zeile.diskrepanz === 0 ? (
    <Text span>0</Text>
  ) : (
    <Text span fw={700} c="red">
      {zeile.diskrepanz > 0 ? '+' : ''}
      {zeile.diskrepanzText}
    </Text>
  );
}

function StichtagBereich({ stichtag }: Readonly<{ stichtag: string | null }>) {
  const api = useApi();
  const qc = useQueryClient();
  const { schreiben } = useAbgleichRechte();
  const [bearbeiten, setBearbeiten] = useState(stichtag === null);
  const [wert, setWert] = useState(stichtag ?? '');
  const speichern = useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async () => {
      await pruefen(await api['lager-abgleich'].stichtag.$put({ json: { stichtag: wert } }));
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: lagerAbgleichKeys.alle });
      setBearbeiten(false);
    },
    onError: (e) => fehlerAnzeigen(e),
  });
  return (
    <Paper withBorder p="md">
      <Stack gap="xs">
        <Group gap={4}>
          <Text fw={600}>Stichtag</Text>
          <InfoHinweis feld="Stichtag" text={HILFE.lagerAbgleich.stichtag} />
        </Group>
        {!bearbeiten && stichtag && (
          <Group justify="space-between" align="center">
            <Text>{datumAnzeigen(stichtag)}</Text>
            {schreiben && (
              <Button variant="default" size="md" onClick={() => setBearbeiten(true)}>
                Ändern
              </Button>
            )}
          </Group>
        )}
        {bearbeiten &&
          (schreiben ? (
            <Group align="flex-end" wrap="wrap">
              <DatumFeld
                label="Stichtag"
                size="md"
                loeschbar={false}
                value={wert}
                onWert={setWert}
              />
              <Button
                size="md"
                disabled={!wert}
                loading={speichern.isPending}
                onClick={() => speichern.mutate()}
              >
                Stichtag speichern
              </Button>
              {stichtag && (
                <Button variant="default" size="md" onClick={() => setBearbeiten(false)}>
                  Abbrechen
                </Button>
              )}
            </Group>
          ) : (
            <Text c="dimmed">Noch kein Stichtag festgelegt.</Text>
          ))}
      </Stack>
    </Paper>
  );
}

/** Per Ware: Lager (Ist) against Belege (Soll) since the Stichtag. */
export function LagerAbgleichPage() {
  const navigate = useNavigate();
  const abgleich = useLagerAbgleich();
  const [nurDiskrepanz, setNurDiskrepanz] = useState(true);
  const waren = (abgleich.data?.waren ?? []).filter((w) => !nurDiskrepanz || w.diskrepanz !== 0);

  return (
    <Stack maw={1100}>
      <ZurueckLink to="/finanzen/belege">Belege</ZurueckLink>
      <Group gap="xs">
        <Title order={2}>Lager-Beleg-Abgleich</Title>
        <InfoHinweis feld="Lager-Beleg-Abgleich" text={HILFE.lagerAbgleich.erklaerung} />
      </Group>
      {abgleich.isPending && <Loader m="md" aria-label="Abgleich wird geladen" />}
      {abgleich.isError && <Alert color="red">Der Abgleich konnte nicht geladen werden.</Alert>}
      {abgleich.data && (
        <>
          <StichtagBereich stichtag={abgleich.data.stichtag} />
          {abgleich.data.stichtag === null ? (
            <Alert color="blue" title="Lege einen Stichtag fest">
              Ohne Stichtag gibt es keinen Abgleich. Ab dem Stichtag zählen Einlagerungen, Belege
              und Korrekturen.
            </Alert>
          ) : (
            <>
              <Switch
                label="Nur mit Diskrepanz"
                checked={nurDiskrepanz}
                onChange={(e) => setNurDiskrepanz(e.currentTarget.checked)}
              />
              {waren.length === 0 && (
                <Text c="dimmed">
                  {nurDiskrepanz ? 'Keine Ware mit Diskrepanz.' : 'Keine Waren im Abgleich.'}
                </Text>
              )}
              <KartenOderTabelle
                zeilen={waren}
                zeilenKey={(w) => w.wareId}
                karte={(w) => (
                  <KlickKarte to={lagerAbgleichPfad(w.wareId)}>
                    <Stack gap={4}>
                      <Group justify="space-between" wrap="nowrap" align="flex-start">
                        <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                          {w.name}
                        </Text>
                        {w.diskrepanz !== 0 && (
                          <Badge color="red" variant="light">
                            <DiskrepanzText zeile={w} />
                          </Badge>
                        )}
                      </Group>
                      {w.warengruppe && (
                        <Text size="sm" c="dimmed">
                          {w.warengruppe}
                        </Text>
                      )}
                      <Text size="sm">Lager: {w.istText}</Text>
                      <Text size="sm">Belege: {w.sollText}</Text>
                      <Text size="sm">Korrektur: {w.korrekturText}</Text>
                    </Stack>
                  </KlickKarte>
                )}
                kopf={
                  <Table.Tr>
                    <Table.Th>Ware</Table.Th>
                    <Table.Th>Warengruppe</Table.Th>
                    <Table.Th style={ZAHL}>Lager (Ist)</Table.Th>
                    <Table.Th style={ZAHL}>Belege (Soll)</Table.Th>
                    <Table.Th style={ZAHL}>Korrektur</Table.Th>
                    <Table.Th style={ZAHL}>Diskrepanz</Table.Th>
                  </Table.Tr>
                }
                zeile={(w) => (
                  <Table.Tr
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      if (!(e.target as HTMLElement).closest('a'))
                        void navigate(lagerAbgleichPfad(w.wareId));
                    }}
                  >
                    <Table.Td>
                      <Link
                        to={lagerAbgleichPfad(w.wareId)}
                        style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}
                      >
                        {w.name}
                      </Link>
                    </Table.Td>
                    <Table.Td>{w.warengruppe ?? '–'}</Table.Td>
                    <Table.Td style={ZAHL}>{w.istText}</Table.Td>
                    <Table.Td style={ZAHL}>{w.sollText}</Table.Td>
                    <Table.Td style={ZAHL}>{w.korrekturText}</Table.Td>
                    <Table.Td style={ZAHL}>
                      <DiskrepanzText zeile={w} />
                    </Table.Td>
                  </Table.Tr>
                )}
              />
            </>
          )}
        </>
      )}
    </Stack>
  );
}
