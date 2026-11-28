import {
  ActionIcon,
  Alert,
  Group,
  Input,
  Loader,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useElementSize } from '@mantine/hooks';
import { Fragment, useState } from 'react';
import {
  centAnzeigen,
  csvText,
  mengeAnzeigen,
  wareSuchen,
  type EinkaufAuswertungDto,
  type EinkaufWareDto,
} from '@c4/shared';
import { BereichLink } from '../BereichLink';
import { csvHerunterladen } from '../csvHerunterladen';
import { BETRAG_STIL, useAuswertungEinkauf } from '../finanzenDaten';
import { HILFE } from '../finanzenHilfe';
import { InfoHinweis } from '../InfoHinweis';
import {
  AuswertungTabelle,
  Betrag,
  JahreLeiste,
  KOPF_STIL,
  SUMME_STIL,
  useJahreFilter,
  useTextParam,
} from './Bausteine';
import { EinkaufKaufDiagramm } from './EinkaufKaufDiagramm';

function csvDaten(
  waren: EinkaufWareDto[],
  d: EinkaufAuswertungDto,
  brutto: boolean,
  gefiltert: boolean,
) {
  const art = brutto ? 'Brutto' : 'Netto';
  const kopf = [
    'Ware',
    'Menge',
    'Einheit',
    'Gebinde',
    art,
    `Durchschnittspreis je Einheit (${art})`,
    `Durchschnittspreis je Standard-Gebinde (${art})`,
    'Standard-Gebinde',
    'Pfand je Standard-Gebinde',
  ];
  const zeilen = waren.map((w) => {
    const preis = brutto ? w.preisJeEinheitBruttoCent : w.preisJeEinheitCent;
    const gebindePreis = brutto ? w.preisJeStandardGebindeBruttoCent : w.preisJeStandardGebindeCent;
    return [
      w.name,
      w.mengeMilli / 1000,
      w.einheitLabel,
      w.gebindeText,
      { cent: brutto ? w.bruttoCent : w.nettoCent },
      preis === null ? null : { cent: preis },
      gebindePreis === null ? null : { cent: gebindePreis },
      w.standardGebinde,
      w.standardGebindePfandCent === null ? null : { cent: w.standardGebindePfandCent },
    ];
  });
  // Summary rows: label in the first column, amount in the amount column, padded to the header width.
  const summe = (label: string, cent?: number) => {
    const zeile: (string | { cent: number } | null)[] = kopf.map(() => null);
    zeile[0] = label;
    if (cent !== undefined) zeile[4] = { cent };
    return zeile;
  };
  const gesamt = waren.reduce((sum, w) => sum + (brutto ? w.bruttoCent : w.nettoCent), 0);
  zeilen.push(summe(gefiltert ? 'Summe (gefiltert)' : 'Summe', gesamt), []);
  zeilen.push(summe('Pfandsaldo'), summe('Anfang', d.pfand.anfangCent));
  zeilen.push(summe('Zugang (Pfand bezahlt)', d.pfand.zugangCent));
  zeilen.push(summe('Abgang (Leergut zurück)', d.pfand.abgangCent));
  zeilen.push(summe('Ende', d.pfand.endeCent));
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

/** Purchases of the selected years per Ware (without deposit, gross or net) and the Pfandsaldo. */
export function EinkaufTab() {
  const f = useJahreFilter();
  const q = useAuswertungEinkauf(f.von, f.bis);
  const [suche, setSuche] = useTextParam('suche');
  const [betrag, setBetrag] = useTextParam('betrag', 'brutto');
  const [offen, setOffen] = useState<string | null>(null);
  const { ref: breiteRef, width: sichtbareBreite } = useElementSize();
  const brutto = betrag !== 'netto';
  const art = brutto ? 'Brutto' : 'Netto';
  const d = q.data;
  const treffer = wareSuchen(d?.waren ?? [], suche);
  const gefiltert = suche.trim() !== '';
  const summeCent = treffer.reduce(
    (sum, t) => sum + (brutto ? t.ware.bruttoCent : t.ware.nettoCent),
    0,
  );
  const zeitraum = f.vonJahr === f.bisJahr ? f.vonJahr : `${f.vonJahr}_${f.bisJahr}`;
  return (
    <Stack gap="md">
      <JahreLeiste
        f={f}
        csv={
          d
            ? () =>
                csvHerunterladen(
                  'einkauf',
                  zeitraum,
                  csvDaten(
                    treffer.map((t) => t.ware),
                    d,
                    brutto,
                    gefiltert,
                  ),
                )
            : null
        }
        extra={
          <>
            <Input.Wrapper label="Betrag">
              <SegmentedControl
                size="md"
                styles={{ label: { paddingBlock: 9 } }}
                value={brutto ? 'brutto' : 'netto'}
                onChange={setBetrag}
                data={[
                  { value: 'brutto', label: 'Brutto' },
                  { value: 'netto', label: 'Netto' },
                ]}
              />
            </Input.Wrapper>
            <TextInput
              label="Ware suchen"
              placeholder="Name oder Alias"
              value={suche}
              onChange={(e) => setSuche(e.currentTarget.value)}
              style={{ flex: '1 1 200px', maxWidth: 320 }}
            />
          </>
        }
      />
      <div ref={breiteRef} style={{ width: '100%', height: 0 }} />
      <Text size="sm" c="dimmed">
        Einkauf nach Belegdatum, {brutto ? 'brutto' : 'netto'} ohne Pfand.
        <InfoHinweis feld="Durchschnittspreis" text={HILFE.auswertungen.durchschnittspreis} />
      </Text>
      {q.isPending && f.von !== null && <Loader m="md" aria-label="Auswertung wird geladen" />}
      {q.isError && <Alert color="red">Die Auswertung konnte nicht geladen werden.</Alert>}
      {d &&
        (d.waren.length === 0 ? (
          <Text c="dimmed">Keine Einkäufe in diesem Zeitraum.</Text>
        ) : (
          <AuswertungTabelle minWidth={860}>
            <Table.Thead style={KOPF_STIL}>
              <Table.Tr>
                <Table.Th>Ware</Table.Th>
                <Table.Th style={BETRAG_STIL}>Menge</Table.Th>
                <Table.Th>Gebinde</Table.Th>
                <Table.Th style={BETRAG_STIL}>{art}</Table.Th>
                <Table.Th style={BETRAG_STIL}>Ø Preis je Einheit</Table.Th>
                <Table.Th style={BETRAG_STIL}>Ø Preis je Standard-Gebinde</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {treffer.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Text c="dimmed">Keine Ware gefunden.</Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {treffer.map(({ ware: w, alias }) => {
                const schluessel = `${w.wareId}-${w.einheit}`;
                const aufgeklappt = offen === schluessel;
                const preis = brutto ? w.preisJeEinheitBruttoCent : w.preisJeEinheitCent;
                const gebindePreis = brutto
                  ? w.preisJeStandardGebindeBruttoCent
                  : w.preisJeStandardGebindeCent;
                return (
                  <Fragment key={schluessel}>
                    <Table.Tr
                      style={{ cursor: 'pointer' }}
                      onClick={() => setOffen(aufgeklappt ? null : schluessel)}
                    >
                      <Table.Td fw={600}>
                        <Group gap={4} wrap="nowrap" align="flex-start">
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            size={42}
                            aria-expanded={aufgeklappt}
                            aria-label={`Einzelkäufe von ${w.name} ${aufgeklappt ? 'ausblenden' : 'anzeigen'}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOffen(aufgeklappt ? null : schluessel);
                            }}
                          >
                            {aufgeklappt ? <IconChevronDown /> : <IconChevronRight />}
                          </ActionIcon>
                          <div style={{ alignSelf: 'center' }}>
                            <span
                              role="presentation"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <BereichLink to={`/waren/${w.wareId}`}>{w.name}</BereichLink>
                            </span>
                            {alias !== null && (
                              <Text size="xs" c="dimmed" fw={400}>
                                Alias: {alias}
                              </Text>
                            )}
                          </div>
                        </Group>
                      </Table.Td>
                      <Table.Td style={BETRAG_STIL}>
                        {mengeAnzeigen(w.mengeMilli / 1000)} {w.einheitLabel}
                      </Table.Td>
                      <Table.Td>{w.gebindeText}</Table.Td>
                      <Table.Td style={BETRAG_STIL}>
                        <Betrag cent={brutto ? w.bruttoCent : w.nettoCent} />
                      </Table.Td>
                      <Table.Td style={BETRAG_STIL}>
                        {preis === null ? (
                          '–'
                        ) : (
                          <>
                            <Betrag cent={preis} /> / {w.einheitLabel}
                          </>
                        )}
                      </Table.Td>
                      <Table.Td style={BETRAG_STIL}>
                        {gebindePreis === null ? (
                          '–'
                        ) : (
                          <>
                            <Betrag cent={gebindePreis} />
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
                    {aufgeklappt && (
                      <Table.Tr>
                        <Table.Td colSpan={6}>
                          <div
                            style={{
                              position: 'sticky',
                              left: 0,
                              width: sichtbareBreite > 0 ? sichtbareBreite - 16 : '100%',
                              maxWidth: '100%',
                            }}
                          >
                            <EinkaufKaufDiagramm ware={w} brutto={brutto} />
                          </div>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Fragment>
                );
              })}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Td style={SUMME_STIL} colSpan={3}>
                  {gefiltert ? 'Summe (gefiltert)' : 'Summe aller Waren'}
                </Table.Td>
                <Table.Td style={{ ...SUMME_STIL, ...BETRAG_STIL }}>
                  <Betrag cent={summeCent} />
                </Table.Td>
                <Table.Td style={SUMME_STIL} colSpan={2} />
              </Table.Tr>
            </Table.Tfoot>
          </AuswertungTabelle>
        ))}
      {d && (
        <Stack gap="xs">
          <Group gap={2}>
            <Title order={4}>
              Pfandsaldo {d.vonJahr === d.bisJahr ? d.vonJahr : `${d.vonJahr} bis ${d.bisJahr}`}
            </Title>
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
