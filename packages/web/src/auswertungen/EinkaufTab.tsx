import {
  Alert,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useState } from 'react';
import { centAnzeigen, csvText, mengeAnzeigen, type EinkaufAuswertungDto } from '@c4/shared';
import { csvHerunterladen } from '../csvHerunterladen';
import { BETRAG_STIL, useAuswertungEinkauf } from '../finanzenDaten';
import { HILFE } from '../finanzenHilfe';
import { InfoHinweis } from '../InfoHinweis';
import {
  AuswertungTabelle,
  Betrag,
  JahrLeiste,
  KOPF_STIL,
  SUMME_STIL,
  useJahrFilter,
} from './Bausteine';

function csvDaten(d: EinkaufAuswertungDto) {
  const kopf = [
    'Ware',
    'Menge',
    'Einheit',
    'Gebinde',
    'Netto',
    'Durchschnittspreis je Einheit',
    'Durchschnittspreis je Standard-Gebinde',
    'Standard-Gebinde',
    'Pfand je Standard-Gebinde',
  ];
  const zeilen = d.waren.map((w) => [
    w.name,
    w.mengeMilli / 1000,
    w.einheitLabel,
    w.gebindeText,
    { cent: w.nettoCent },
    w.preisJeEinheitCent === null ? null : { cent: w.preisJeEinheitCent },
    w.preisJeStandardGebindeCent === null ? null : { cent: w.preisJeStandardGebindeCent },
    w.standardGebinde,
    w.standardGebindePfandCent === null ? null : { cent: w.standardGebindePfandCent },
  ]);
  zeilen.push(['Summe', null, null, null, { cent: d.nettoCent }, null, null, null]);
  zeilen.push([]);
  zeilen.push(['Pfandsaldo', null, null, null, null, null, null, null]);
  zeilen.push(['Anfang', null, null, null, { cent: d.pfand.anfangCent }, null, null, null]);
  zeilen.push([
    'Zugang (Pfand bezahlt)',
    null,
    null,
    null,
    { cent: d.pfand.zugangCent },
    null,
    null,
    null,
  ]);
  zeilen.push([
    'Abgang (Leergut zurück)',
    null,
    null,
    null,
    { cent: d.pfand.abgangCent },
    null,
    null,
    null,
  ]);
  zeilen.push(['Ende', null, null, null, { cent: d.pfand.endeCent }, null, null, null]);
  return csvText(kopf, zeilen);
}

/** The Gebinde name below the price, with its Pfand labelled explicitly. */
function GebindeZusatz({ name, pfandCent }: Readonly<{ name: string; pfandCent: number | null }>) {
  return (
    <Text size="xs" c="dimmed">
      je {name}
      {pfandCent !== null && ` (zzgl. ${centAnzeigen(pfandCent)} Pfand)`}
    </Text>
  );
}

/** Purchases of the year per Ware (net, without deposit) and the Pfandsaldo. */
export function EinkaufTab() {
  const f = useJahrFilter();
  const q = useAuswertungEinkauf(f.zahl);
  const [suche, setSuche] = useState('');
  const d = q.data;
  const gefiltert = (d?.waren ?? []).filter((w) =>
    w.name.toLocaleLowerCase('de').includes(suche.trim().toLocaleLowerCase('de')),
  );
  return (
    <Stack gap="md">
      <JahrLeiste
        f={f}
        csv={d ? () => csvHerunterladen('einkauf', f.jahr, csvDaten(d)) : null}
        extra={
          <TextInput
            label="Ware suchen"
            placeholder="Name der Ware"
            value={suche}
            onChange={(e) => setSuche(e.currentTarget.value)}
            style={{ flex: '1 1 200px', maxWidth: 320 }}
          />
        }
      />
      <Text size="sm" c="dimmed">
        Einkauf nach Belegdatum, netto ohne Pfand.
        <InfoHinweis feld="Durchschnittspreis" text={HILFE.auswertungen.durchschnittspreis} />
      </Text>
      {q.isPending && f.zahl !== null && <Loader m="md" aria-label="Auswertung wird geladen" />}
      {q.isError && <Alert color="red">Die Auswertung konnte nicht geladen werden.</Alert>}
      {d &&
        (d.waren.length === 0 ? (
          <Text c="dimmed">Keine Einkäufe in diesem Jahr.</Text>
        ) : (
          <AuswertungTabelle minWidth={860}>
            <Table.Thead style={KOPF_STIL}>
              <Table.Tr>
                <Table.Th>Ware</Table.Th>
                <Table.Th style={BETRAG_STIL}>Menge</Table.Th>
                <Table.Th>Gebinde</Table.Th>
                <Table.Th style={BETRAG_STIL}>Netto</Table.Th>
                <Table.Th style={BETRAG_STIL}>Ø Preis je Einheit</Table.Th>
                <Table.Th style={BETRAG_STIL}>Ø Preis je Standard-Gebinde</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {gefiltert.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Text c="dimmed">Keine Ware gefunden.</Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {gefiltert.map((w) => (
                <Table.Tr key={`${w.wareId}-${w.einheit}`}>
                  <Table.Td fw={600}>{w.name}</Table.Td>
                  <Table.Td style={BETRAG_STIL}>
                    {mengeAnzeigen(w.mengeMilli / 1000)} {w.einheitLabel}
                  </Table.Td>
                  <Table.Td>{w.gebindeText}</Table.Td>
                  <Table.Td style={BETRAG_STIL}>
                    <Betrag cent={w.nettoCent} />
                  </Table.Td>
                  <Table.Td style={BETRAG_STIL}>
                    {w.preisJeEinheitCent === null ? (
                      '–'
                    ) : (
                      <>
                        <Betrag cent={w.preisJeEinheitCent} /> / {w.einheitLabel}
                      </>
                    )}
                  </Table.Td>
                  <Table.Td style={BETRAG_STIL}>
                    {w.preisJeStandardGebindeCent === null ? (
                      '–'
                    ) : (
                      <>
                        <Betrag cent={w.preisJeStandardGebindeCent} />
                        {w.standardGebinde && (
                          <GebindeZusatz
                            name={w.standardGebinde}
                            pfandCent={w.standardGebindePfandCent}
                          />
                        )}
                      </>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Td style={SUMME_STIL} colSpan={3}>
                  Summe aller Waren
                </Table.Td>
                <Table.Td style={{ ...SUMME_STIL, ...BETRAG_STIL }}>
                  <Betrag cent={d.nettoCent} />
                </Table.Td>
                <Table.Td style={SUMME_STIL} colSpan={2} />
              </Table.Tr>
            </Table.Tfoot>
          </AuswertungTabelle>
        ))}
      {d && (
        <Stack gap="xs">
          <Group gap={2}>
            <Title order={4}>Pfandsaldo {d.jahr}</Title>
            <InfoHinweis feld="Pfandsaldo" text={HILFE.auswertungen.pfandsaldo} />
          </Group>
          <SimpleGrid cols={{ base: 2, sm: 4 }}>
            {(
              [
                ['Anfang', d.pfand.anfangCent],
                ['Zugang (Pfand bezahlt)', d.pfand.zugangCent],
                ['Abgang (Leergut zurück)', d.pfand.abgangCent],
                ['Ende', d.pfand.endeCent],
              ] as const
            ).map(([text, cent]) => (
              <Paper key={text} withBorder p="sm">
                <Text size="sm" c="dimmed">
                  {text}
                </Text>
                <Text
                  fw={700}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                  aria-label={`${text}: ${centAnzeigen(cent)}`}
                >
                  <Betrag cent={cent} />
                </Text>
              </Paper>
            ))}
          </SimpleGrid>
        </Stack>
      )}
    </Stack>
  );
}
