import {
  ActionIcon,
  Alert,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
  CopyButton,
} from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { Fragment, type ReactNode } from 'react';
import {
  centZuEuroText,
  csvText,
  elsterEuro,
  type UstAuswertungDto,
  type UstSatzArt,
  type UstZeitraumDto,
} from '@c4/shared';
import { csvHerunterladen } from '../csvHerunterladen';
import { BETRAG_STIL, useAuswertungUst } from '../finanzenDaten';
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

const ART_TEXT: Record<UstSatzArt, string> = {
  regel: 'Regelsatz',
  ermaessigt: 'ermäßigt',
  sonstige: 'sonstiger Satz (nicht in Kz 81/86)',
};

const satzText = (bp: number) => `${(bp / 100).toLocaleString('de-DE')} %`;

function Kopieren({ wert, label }: Readonly<{ wert: string; label: string }>) {
  return (
    <CopyButton value={wert} timeout={1500}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? 'Kopiert' : 'Kopieren'} withArrow>
          <ActionIcon
            variant="subtle"
            color={copied ? 'teal' : 'gray'}
            size={42}
            onClick={copy}
            aria-label={`${label} kopieren`}
          >
            {copied ? <IconCheck size={18} /> : <IconCopy size={18} />}
          </ActionIcon>
        </Tooltip>
      )}
    </CopyButton>
  );
}

function KennzahlZeile({
  kz,
  text,
  anzeige,
  wert,
  zusatz,
}: Readonly<{ kz: string; text: string; anzeige: ReactNode; wert: string; zusatz?: ReactNode }>) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="xs">
      <div style={{ minWidth: 0 }}>
        <Text size="sm" c="dimmed">
          {kz}: {text}
        </Text>
        <Text fw={700} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {anzeige}
        </Text>
        {zusatz && (
          <Text size="xs" c="dimmed">
            {zusatz}
          </Text>
        )}
      </div>
      <Kopieren wert={wert} label={kz} />
    </Group>
  );
}

function Kennzahlen({ z }: Readonly<{ z: UstZeitraumDto }>) {
  const k = z.kennzahlen;
  return (
    <Paper withBorder p="sm" aria-label={`Kennzahlen ${z.label}`}>
      <Stack gap={4}>
        <Text fw={700}>{z.label}</Text>
        <KennzahlZeile
          kz="Kz 81"
          text="Bemessung Regelsatz"
          anzeige={`${elsterEuro(k.kz81Cent).toLocaleString('de-DE')} €`}
          wert={String(elsterEuro(k.kz81Cent))}
        />
        <KennzahlZeile
          kz="Kz 86"
          text="Bemessung ermäßigt"
          anzeige={`${elsterEuro(k.kz86Cent).toLocaleString('de-DE')} €`}
          wert={String(elsterEuro(k.kz86Cent))}
        />
        <KennzahlZeile
          kz="Kz 66"
          text="Abziehbare Vorsteuer"
          anzeige={<Betrag cent={k.kz66Cent} />}
          wert={centZuEuroText(k.kz66Cent)}
        />
        <KennzahlZeile
          kz="Kz 83"
          text="Verbleibende Umsatzsteuer"
          anzeige={<Betrag cent={k.kz83Cent} />}
          wert={centZuEuroText(k.kz83Cent)}
          zusatz={
            <>
              Bereits gezahlt (Vorauszahlung): <Betrag cent={z.vorauszahlungCent} />
            </>
          }
        />
      </Stack>
    </Paper>
  );
}

function csvDaten(d: UstAuswertungDto) {
  const kopf = [
    'Zeitraum',
    'Steuersatz',
    'Art',
    'Bemessung',
    'Umsatzsteuer',
    'Vorsteuer',
    'Zahllast',
    'Kz 81 (Euro)',
    'Kz 86 (Euro)',
    'Kz 66',
    'Kz 83',
    'Vorauszahlung',
  ];
  const zeilen = d.zeitraeume.flatMap((z) =>
    z.zeilen.map((s, i) => [
      z.label,
      satzText(s.satz),
      ART_TEXT[s.art],
      { cent: s.bemessungCent },
      { cent: s.ustCent },
      { cent: s.vorsteuerCent },
      { cent: s.zahllastCent },
      i === 0 ? elsterEuro(z.kennzahlen.kz81Cent) : null,
      i === 0 ? elsterEuro(z.kennzahlen.kz86Cent) : null,
      i === 0 ? { cent: z.kennzahlen.kz66Cent } : null,
      i === 0 ? { cent: z.kennzahlen.kz83Cent } : null,
      i === 0 ? { cent: z.vorauszahlungCent } : null,
    ]),
  );
  return csvText(kopf, zeilen);
}

/** Umsatzsteuer per period and rate, plus the UStVA figures to type into ELSTER. */
export function UstTab() {
  const f = useZeitraumFilter('quartal');
  const q = useAuswertungUst(f.filter);
  const d = q.data;
  const summe = (feld: 'bemessungCent' | 'ustCent' | 'vorsteuerCent' | 'zahllastCent') =>
    (d?.zeitraeume ?? []).reduce((s, z) => s + z.zeilen.reduce((t, r) => t + r[feld], 0), 0);
  const hatZeilen = (d?.zeitraeume ?? []).some((z) => z.zeilen.length > 0);
  return (
    <Stack gap="md">
      <ZeitraumLeiste
        f={f}
        csv={d ? () => csvHerunterladen('ust', `${f.von}_${f.bis}`, csvDaten(d)) : null}
      />
      <Text size="sm" c="dimmed">
        Nach Buchungsdatum (Ist-Prinzip).
        <InfoHinweis feld="Ist-Prinzip" text={HILFE.auswertungen.istPrinzip} />
      </Text>
      {q.isPending && f.filter && <Loader m="md" aria-label="Auswertung wird geladen" />}
      {q.isError && <Alert color="red">Die Auswertung konnte nicht geladen werden.</Alert>}
      {d && (
        <>
          <Group gap={2}>
            <Title order={4}>Kennzahlen für ELSTER</Title>
            <InfoHinweis feld="Kennzahlen" text={HILFE.auswertungen.kennzahlen} />
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
            {d.zeitraeume.map((z) => (
              <Kennzahlen key={z.schluessel} z={z} />
            ))}
          </SimpleGrid>
          {hatZeilen ? (
            <AuswertungTabelle minWidth={760}>
              <Table.Thead style={KOPF_STIL}>
                <Table.Tr>
                  <Table.Th>Steuersatz</Table.Th>
                  <Table.Th style={BETRAG_STIL}>Bemessung (netto)</Table.Th>
                  <Table.Th style={BETRAG_STIL}>Umsatzsteuer</Table.Th>
                  <Table.Th style={BETRAG_STIL}>Vorsteuer</Table.Th>
                  <Table.Th style={BETRAG_STIL}>Zahllast</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {d.zeitraeume
                  .filter((z) => z.zeilen.length > 0)
                  .map((z) => (
                    <Fragment key={z.schluessel}>
                      <Table.Tr style={{ background: 'var(--mantine-color-default-hover)' }}>
                        <Table.Td colSpan={5}>
                          <Text fw={700} size="sm">
                            {z.label}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                      {z.zeilen.map((s) => (
                        <Table.Tr key={`${z.schluessel}-${s.satz}`}>
                          <Table.Td>
                            {satzText(s.satz)}{' '}
                            <Text component="span" size="xs" c="dimmed">
                              {ART_TEXT[s.art]}
                            </Text>
                          </Table.Td>
                          {[s.bemessungCent, s.ustCent, s.vorsteuerCent, s.zahllastCent].map(
                            (c, i) => (
                              <Table.Td key={i} style={BETRAG_STIL}>
                                <Betrag cent={c} />
                              </Table.Td>
                            ),
                          )}
                        </Table.Tr>
                      ))}
                    </Fragment>
                  ))}
              </Table.Tbody>
              <Table.Tfoot>
                <Table.Tr>
                  <Table.Td style={SUMME_STIL}>Summe</Table.Td>
                  {(['bemessungCent', 'ustCent', 'vorsteuerCent', 'zahllastCent'] as const).map(
                    (feld) => (
                      <Table.Td key={feld} style={{ ...SUMME_STIL, ...BETRAG_STIL }}>
                        <Betrag cent={summe(feld)} />
                      </Table.Td>
                    ),
                  )}
                </Table.Tr>
              </Table.Tfoot>
            </AuswertungTabelle>
          ) : (
            <Text c="dimmed">Keine Umsatzsteuer-Buchungen in diesem Zeitraum.</Text>
          )}
        </>
      )}
    </Stack>
  );
}
