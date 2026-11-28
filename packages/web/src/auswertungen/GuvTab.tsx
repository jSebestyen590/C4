import { Alert, Anchor, Loader, Stack, Table, Text } from '@mantine/core';
import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { csvText, type GuvAuswertungDto, type GuvKontoZeileDto } from '@c4/shared';
import { csvHerunterladen } from '../csvHerunterladen';
import { BETRAG_STIL, useAuswertungGuv } from '../finanzenDaten';
import { HILFE } from '../finanzenHilfe';
import { InfoHinweis } from '../InfoHinweis';
import {
  AuswertungTabelle,
  Betrag,
  ERSTE_SPALTE_STIL,
  KOPF_STIL,
  SUMME_STIL,
  ZeitraumLeiste,
  useZeitraumFilter,
} from './Bausteine';

function csvDaten(d: GuvAuswertungDto) {
  const kopf = ['Konto', 'Art', ...d.zeitraeume.map((z) => z.label), 'Summe'];
  const konto = (k: GuvKontoZeileDto) => [
    `${'  '.repeat(k.ebene)}${k.name}`,
    k.art === 'erloes' ? 'Erlöse' : 'Aufwand',
    ...k.werteCent.map((cent) => ({ cent })),
    { cent: k.summeCent },
  ];
  const summe = (text: string, werte: number[], gesamt: number) => [
    text,
    '',
    ...werte.map((cent) => ({ cent })),
    { cent: gesamt },
  ];
  return csvText(kopf, [
    ...d.erloese.map(konto),
    summe('Summe Erlöse', d.summen.erloeseCent, d.gesamt.erloeseCent),
    ...d.aufwand.map(konto),
    summe('Summe Aufwand', d.summen.aufwandCent, d.gesamt.aufwandCent),
    summe('Ergebnis', d.summen.ergebnisCent, d.gesamt.ergebnisCent),
  ]);
}

/** Gewinn- und Verlustrechnung: Erlöse and Aufwand per Konto, periods as columns. */
export function GuvTab() {
  const f = useZeitraumFilter();
  const q = useAuswertungGuv(f.filter);
  const d = q.data;

  const abschnitt = (titel: string, konten: GuvKontoZeileDto[], summe: number[], gesamt: number) =>
    d && (
      <Fragment>
        <Table.Tr style={{ background: 'var(--mantine-color-default-hover)' }}>
          <Table.Td
            style={{ ...ERSTE_SPALTE_STIL, background: 'var(--mantine-color-default-hover)' }}
          >
            <Text fw={700} size="sm">
              {titel}
            </Text>
          </Table.Td>
          <Table.Td colSpan={d.zeitraeume.length + 1} />
        </Table.Tr>
        {konten.map((k) => (
          <Table.Tr key={k.kontoId}>
            <Table.Td
              style={{
                ...ERSTE_SPALTE_STIL,
                paddingLeft: `calc(var(--mantine-spacing-xs) + ${k.ebene * 16}px)`,
              }}
            >
              <Anchor
                component={Link}
                to={`/finanzen/journal?konto=${encodeURIComponent(k.kontoId)}`}
                inherit
                c="inherit"
                fw={k.ebene === 0 ? 600 : 400}
              >
                {k.name}
              </Anchor>
            </Table.Td>
            {k.werteCent.map((c, i) => (
              <Table.Td key={i} style={BETRAG_STIL}>
                <Betrag cent={c} nullAlsStrich />
              </Table.Td>
            ))}
            <Table.Td style={{ ...BETRAG_STIL, fontWeight: 600 }}>
              <Betrag cent={k.summeCent} />
            </Table.Td>
          </Table.Tr>
        ))}
        <Table.Tr style={{ fontWeight: 700 }}>
          <Table.Td style={ERSTE_SPALTE_STIL}>Summe {titel}</Table.Td>
          {summe.map((c, i) => (
            <Table.Td key={i} style={BETRAG_STIL}>
              <Betrag cent={c} />
            </Table.Td>
          ))}
          <Table.Td style={BETRAG_STIL}>
            <Betrag cent={gesamt} />
          </Table.Td>
        </Table.Tr>
      </Fragment>
    );

  return (
    <Stack gap="md">
      <ZeitraumLeiste
        f={f}
        csv={d ? () => csvHerunterladen('guv', `${f.von}_${f.bis}`, csvDaten(d)) : null}
      />
      <Text size="sm" c="dimmed">
        Erlöse und Aufwand netto nach Buchungsdatum.
        <InfoHinweis feld="G+V" text={HILFE.auswertungen.guv} />
      </Text>
      {q.isPending && f.filter && <Loader m="md" aria-label="Auswertung wird geladen" />}
      {q.isError && <Alert color="red">Die Auswertung konnte nicht geladen werden.</Alert>}
      {d &&
        (d.erloese.length === 0 && d.aufwand.length === 0 ? (
          <Text c="dimmed">Keine Erlöse oder Aufwände in diesem Zeitraum.</Text>
        ) : (
          <AuswertungTabelle minWidth={320 + d.zeitraeume.length * 110}>
            <Table.Thead style={KOPF_STIL}>
              <Table.Tr>
                <Table.Th style={{ ...ERSTE_SPALTE_STIL, background: 'var(--mantine-color-body)' }}>
                  Konto
                </Table.Th>
                {d.zeitraeume.map((z) => (
                  <Table.Th key={z.schluessel} style={BETRAG_STIL}>
                    {z.label}
                  </Table.Th>
                ))}
                <Table.Th style={BETRAG_STIL}>Summe</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {abschnitt('Erlöse', d.erloese, d.summen.erloeseCent, d.gesamt.erloeseCent)}
              {abschnitt('Aufwand', d.aufwand, d.summen.aufwandCent, d.gesamt.aufwandCent)}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Td style={{ ...SUMME_STIL, left: 0, zIndex: 1 }}>
                  Ergebnis (Überschuss / Fehlbetrag)
                </Table.Td>
                {d.summen.ergebnisCent.map((c, i) => (
                  <Table.Td key={i} style={{ ...SUMME_STIL, ...BETRAG_STIL }}>
                    <Betrag cent={c} />
                  </Table.Td>
                ))}
                <Table.Td style={{ ...SUMME_STIL, ...BETRAG_STIL }}>
                  <Betrag cent={d.gesamt.ergebnisCent} />
                </Table.Td>
              </Table.Tr>
            </Table.Tfoot>
          </AuswertungTabelle>
        ))}
    </Stack>
  );
}
