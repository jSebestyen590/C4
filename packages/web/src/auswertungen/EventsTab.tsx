import { BarChart } from '@mantine/charts';
import { Alert, Anchor, Badge, Loader, Stack, Table, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';
import { csvText, datumAnzeigen, heuteBerlin, type EventAuswertungDto } from '@c4/shared';
import { csvHerunterladen } from '../csvHerunterladen';
import { BETRAG_STIL, useAuswertungEvents } from '../finanzenDaten';
import { HILFE } from '../finanzenHilfe';
import { InfoHinweis } from '../InfoHinweis';
import {
  AuswertungTabelle,
  Betrag,
  KOPF_STIL,
  SUMME_STIL,
  ZeitraumLeiste,
  useZeitraumFilter,
} from './Bausteine';

const euroRund = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const datumVon = (beginn: string) => datumAnzeigen(heuteBerlin(new Date(beginn)));

function csvDaten(d: EventAuswertungDto) {
  const kopf = [
    'Event',
    'Datum',
    'Kategorie',
    'Bar brutto',
    'Bar netto',
    'Karte brutto',
    'Karte netto',
    'Summe brutto',
    'Summe netto',
  ];
  const zeilen = d.events.map((e) => [
    e.titel,
    datumVon(e.beginn),
    e.kategorieName,
    { cent: e.barBruttoCent },
    { cent: e.barNettoCent },
    { cent: e.karteBruttoCent },
    { cent: e.karteNettoCent },
    { cent: e.summeBruttoCent },
    { cent: e.summeNettoCent },
  ]);
  zeilen.push([
    'Summe',
    '',
    '',
    { cent: d.summe.barBruttoCent },
    { cent: d.summe.barNettoCent },
    { cent: d.summe.karteBruttoCent },
    { cent: d.summe.karteNettoCent },
    { cent: d.summe.summeBruttoCent },
    { cent: d.summe.summeNettoCent },
  ]);
  return csvText(kopf, zeilen);
}

function Verlauf({ verlauf }: Readonly<{ verlauf: EventAuswertungDto['verlauf'] }>) {
  if (verlauf.kategorien.length === 0) return null;
  const daten = verlauf.zeitraeume.map((z) => {
    const zeile: Record<string, string | number> = { zeitraum: z.label };
    verlauf.kategorien.forEach((k, i) => {
      const p = verlauf.punkte.find((x) => x.schluessel === z.schluessel && x.kategorieId === k.id);
      zeile[`k${i}`] = (p?.bruttoCent ?? 0) / 100;
    });
    return zeile;
  });
  return (
    <Stack gap="xs">
      <Title order={4}>Einnahmen brutto je Event-Kategorie</Title>
      <BarChart
        h={260}
        data={daten}
        dataKey="zeitraum"
        type="stacked"
        withLegend
        valueFormatter={(v) => euroRund.format(v)}
        yAxisProps={{ width: 70 }}
        series={verlauf.kategorien.map((k, i) => ({
          name: `k${i}`,
          label: k.name,
          color: `${k.farbe}.6`,
        }))}
      />
    </Stack>
  );
}

/** Revenue per event (cash and card), with a chart per Event-Kategorie and period. */
export function EventsTab() {
  const f = useZeitraumFilter();
  const q = useAuswertungEvents(f.filter);
  const d = q.data;
  return (
    <Stack gap="md">
      <ZeitraumLeiste
        f={f}
        csv={d ? () => csvHerunterladen('events', `${f.von}_${f.bis}`, csvDaten(d)) : null}
      />
      <Text size="sm" c="dimmed">
        Nur Einnahmen der Events im Zeitraum (Beginn des Events), bar und per Karte.
        <InfoHinweis feld="Einnahmen der Events" text={HILFE.auswertungen.events} />
      </Text>
      {q.isPending && f.filter && <Loader m="md" aria-label="Auswertung wird geladen" />}
      {q.isError && <Alert color="red">Die Auswertung konnte nicht geladen werden.</Alert>}
      {d && (
        <>
          <Verlauf verlauf={d.verlauf} />
          {d.events.length === 0 ? (
            <Text c="dimmed">Keine Einnahmen von Events in diesem Zeitraum.</Text>
          ) : (
            <AuswertungTabelle minWidth={980}>
              <Table.Thead style={KOPF_STIL}>
                <Table.Tr>
                  <Table.Th>Event</Table.Th>
                  <Table.Th>Datum</Table.Th>
                  <Table.Th>Kategorie</Table.Th>
                  <Table.Th style={BETRAG_STIL}>Bar brutto</Table.Th>
                  <Table.Th style={BETRAG_STIL}>Bar netto</Table.Th>
                  <Table.Th style={BETRAG_STIL}>Karte brutto</Table.Th>
                  <Table.Th style={BETRAG_STIL}>Karte netto</Table.Th>
                  <Table.Th style={BETRAG_STIL}>Summe brutto</Table.Th>
                  <Table.Th style={BETRAG_STIL}>Summe netto</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {d.events.map((e) => (
                  <Table.Tr key={e.eventId}>
                    <Table.Td>
                      <Anchor component={Link} to={`/kalender/events/${e.eventId}`} inherit>
                        {e.titel}
                      </Anchor>
                    </Table.Td>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>{datumVon(e.beginn)}</Table.Td>
                    <Table.Td>
                      <Badge color={e.kategorieFarbe} variant="light">
                        {e.kategorieName}
                      </Badge>
                    </Table.Td>
                    {[
                      e.barBruttoCent,
                      e.barNettoCent,
                      e.karteBruttoCent,
                      e.karteNettoCent,
                      e.summeBruttoCent,
                      e.summeNettoCent,
                    ].map((c, i) => (
                      <Table.Td key={i} style={BETRAG_STIL}>
                        <Betrag cent={c} nullAlsStrich />
                      </Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
              <Table.Tfoot>
                <Table.Tr>
                  <Table.Td style={SUMME_STIL} colSpan={3}>
                    Summe
                  </Table.Td>
                  {[
                    d.summe.barBruttoCent,
                    d.summe.barNettoCent,
                    d.summe.karteBruttoCent,
                    d.summe.karteNettoCent,
                    d.summe.summeBruttoCent,
                    d.summe.summeNettoCent,
                  ].map((c, i) => (
                    <Table.Td key={i} style={{ ...SUMME_STIL, ...BETRAG_STIL }}>
                      <Betrag cent={c} />
                    </Table.Td>
                  ))}
                </Table.Tr>
              </Table.Tfoot>
            </AuswertungTabelle>
          )}
        </>
      )}
    </Stack>
  );
}
