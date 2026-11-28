import { Alert, Anchor, List, Loader, Stack, Table, Text } from '@mantine/core';
import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { csvText, type EuerAuswertungDto, type EuerSeite } from '@c4/shared';
import { csvHerunterladen } from '../csvHerunterladen';
import { BETRAG_STIL, useAuswertungEuer } from '../finanzenDaten';
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

const SEITEN: {
  seite: EuerSeite;
  titel: string;
  summe: 'summeEinnahmenCent' | 'summeAusgabenCent';
}[] = [
  { seite: 'einnahme', titel: 'Einnahmen', summe: 'summeEinnahmenCent' },
  { seite: 'ausgabe', titel: 'Ausgaben', summe: 'summeAusgabenCent' },
];

function csvDaten(d: EuerAuswertungDto) {
  const zeilen: (string | { cent: number })[][] = [];
  for (const { seite, titel, summe } of SEITEN) {
    for (const z of d.zeilen.filter((x) => x.seite === seite && x.betragCent !== 0)) {
      zeilen.push([titel, z.label, '', { cent: z.betragCent }]);
      for (const k of z.konten) zeilen.push([titel, z.label, k.name, { cent: k.betragCent }]);
    }
    zeilen.push([titel, `Summe ${titel}`, '', { cent: d[summe] }]);
  }
  for (const k of d.nichtZugeordnet)
    zeilen.push([
      k.seite === 'einnahme' ? 'Einnahmen' : 'Ausgaben',
      'Nicht zugeordnet',
      k.name,
      { cent: k.betragCent },
    ]);
  zeilen.push(['Ergebnis', 'Überschuss / Fehlbetrag', '', { cent: d.ueberschussCent }]);
  return csvText(['Abschnitt', 'Zeile', 'Konto', 'Betrag'], zeilen);
}

/** Einnahmen-Überschuss-Rechnung of a year: lines with their Konten, unmapped Konten as a warning. */
export function EuerTab() {
  const f = useJahrFilter();
  const q = useAuswertungEuer(f.zahl);
  const d = q.data;
  return (
    <Stack gap="md">
      <JahrLeiste f={f} csv={d ? () => csvHerunterladen('euer', f.jahr, csvDaten(d)) : null} />
      <Text size="sm" c="dimmed">
        Einnahmen und Ausgaben nach Buchungsdatum.
        <InfoHinweis feld="EÜR" text={HILFE.auswertungen.euer} />
      </Text>
      {q.isPending && f.zahl !== null && <Loader m="md" aria-label="Auswertung wird geladen" />}
      {q.isError && <Alert color="red">Die Auswertung konnte nicht geladen werden.</Alert>}
      {d && d.nichtZugeordnet.length > 0 && (
        <Alert color="yellow" title="Konten ohne EÜR-Zeile">
          <Text size="sm">
            Diese Konten haben Buchungen, sind aber keiner EÜR-Zeile zugeordnet und fehlen in den
            Summen. Ordne sie im{' '}
            <Anchor component={Link} to="/finanzen/konten" inherit>
              Kontenplan
            </Anchor>{' '}
            zu.
          </Text>
          <List size="sm" mt="xs">
            {d.nichtZugeordnet.map((k) => (
              <List.Item key={k.kontoId}>
                {k.name} ({k.seite === 'einnahme' ? 'Einnahme' : 'Ausgabe'}):{' '}
                <Betrag cent={k.betragCent} />
              </List.Item>
            ))}
          </List>
        </Alert>
      )}
      {d && (
        <AuswertungTabelle minWidth={420}>
          <Table.Thead style={KOPF_STIL}>
            <Table.Tr>
              <Table.Th>Zeile</Table.Th>
              <Table.Th style={BETRAG_STIL}>Betrag</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {SEITEN.map(({ seite, titel, summe }) => {
              const zeilen = d.zeilen.filter((z) => z.seite === seite && z.betragCent !== 0);
              return (
                <Fragment key={seite}>
                  <Table.Tr style={{ background: 'var(--mantine-color-default-hover)' }}>
                    <Table.Td colSpan={2}>
                      <Text fw={700} size="sm">
                        {titel}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                  {zeilen.length === 0 && (
                    <Table.Tr>
                      <Table.Td colSpan={2}>
                        <Text c="dimmed" size="sm">
                          Keine Buchungen
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                  {zeilen.map((z) => (
                    <Fragment key={z.zeile}>
                      <Table.Tr>
                        <Table.Td fw={600}>
                          {z.label}
                          {z.berechnet && (
                            <Text component="span" size="xs" c="dimmed">
                              {' '}
                              (berechnet)
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td style={{ ...BETRAG_STIL, fontWeight: 600 }}>
                          <Betrag cent={z.betragCent} />
                        </Table.Td>
                      </Table.Tr>
                      {z.konten.map((k) => (
                        <Table.Tr key={k.kontoId}>
                          <Table.Td pl="xl">
                            <Anchor
                              component={Link}
                              to={`/finanzen/journal?konto=${encodeURIComponent(k.kontoId)}`}
                              inherit
                              c="dimmed"
                              size="xs"
                            >
                              {k.name}
                            </Anchor>
                          </Table.Td>
                          <Table.Td style={BETRAG_STIL}>
                            <Text component="span" size="xs" c="dimmed">
                              <Betrag cent={k.betragCent} />
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Fragment>
                  ))}
                  <Table.Tr style={{ fontWeight: 700 }}>
                    <Table.Td>Summe {titel}</Table.Td>
                    <Table.Td style={BETRAG_STIL}>
                      <Betrag cent={d[summe]} />
                    </Table.Td>
                  </Table.Tr>
                </Fragment>
              );
            })}
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr>
              <Table.Td style={SUMME_STIL}>Überschuss / Fehlbetrag</Table.Td>
              <Table.Td style={{ ...SUMME_STIL, ...BETRAG_STIL }}>
                <Betrag cent={d.ueberschussCent} />
              </Table.Td>
            </Table.Tr>
          </Table.Tfoot>
        </AuswertungTabelle>
      )}
    </Stack>
  );
}
