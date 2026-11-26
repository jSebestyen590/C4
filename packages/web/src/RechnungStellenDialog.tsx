import { Alert, Button, Checkbox, Group, Modal, Stack, Table, Text } from '@mantine/core';
import { useState, type ReactNode } from 'react';
import {
  BELEG_MODUS_LABELS,
  centAnzeigen,
  datumAnzeigen,
  type BelegBerechnung,
  type BelegModus,
  type BelegWarnungDto,
} from '@c4/shared';
import { BelegSummen } from './BelegSummen';
import { VerschiebHinweis } from './FestschreibungHinweise';
import { BETRAG_STIL } from './finanzenDaten';
import { HILFE } from './finanzenHilfe';

export interface StellenPosten {
  key: string;
  text: string;
  betragCent: number;
}

/**
 * Summary before issuing a Rechnung: the number is assigned now, recipient, dates, items, totals and
 * the plausibility warnings, each of which must be ticked off. Mount it only while it is open.
 */
export function RechnungStellenDialog({
  empfaenger,
  anschrift,
  betreff,
  rechnungsdatum,
  leistungVon,
  leistungBis,
  faelligAm,
  modus,
  posten,
  berechnung,
  pfand,
  warnungen,
  laeuft,
  fehler,
  onStellen,
  onClose,
}: Readonly<{
  empfaenger: ReactNode;
  anschrift: string | null;
  betreff: string;
  rechnungsdatum: string;
  leistungVon: string;
  leistungBis: string | null;
  faelligAm: string;
  modus: BelegModus;
  posten: readonly StellenPosten[];
  berechnung: BelegBerechnung;
  pfand: Readonly<Record<number, number>>;
  warnungen: readonly BelegWarnungDto[];
  laeuft: boolean;
  fehler: string | null;
  onStellen: (bestaetigt: string[]) => void;
  onClose: () => void;
}>) {
  const [bestaetigt, setBestaetigt] = useState<ReadonlySet<string>>(new Set());
  const offen = warnungen.some((w) => !bestaetigt.has(w.code));
  const umschalten = (code: string, an: boolean) =>
    setBestaetigt((alt) => {
      const neu = new Set(alt);
      if (an) neu.add(code);
      else neu.delete(code);
      return neu;
    });
  return (
    <Modal
      opened
      onClose={laeuft ? () => undefined : onClose}
      title="Rechnung prüfen und stellen"
      size="lg"
      closeOnClickOutside={!laeuft}
    >
      <Stack>
        <VerschiebHinweis datum={rechnungsdatum} />
        <Text size="sm" c="dimmed">
          {HILFE.rechnungen.nummer} Eine gestellte Rechnung lässt sich nicht mehr ändern, nur
          stornieren. Danach wird das PDF erzeugt und im Archiv abgelegt.
        </Text>
        <Stack gap={2}>
          <Text style={{ overflowWrap: 'anywhere' }}>
            <Text span fw={600}>
              Empfänger:
            </Text>{' '}
            {empfaenger}
          </Text>
          {anschrift && (
            <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
              {anschrift}
            </Text>
          )}
          <Text style={{ overflowWrap: 'anywhere' }}>
            <Text span fw={600}>
              Betreff:
            </Text>{' '}
            {betreff}
          </Text>
          <Text>
            <Text span fw={600}>
              Rechnungsdatum:
            </Text>{' '}
            {datumAnzeigen(rechnungsdatum)} (heute)
          </Text>
          <Text>
            <Text span fw={600}>
              Leistung:
            </Text>{' '}
            {datumAnzeigen(leistungVon)}
            {leistungBis ? ` bis ${datumAnzeigen(leistungBis)}` : ''}
          </Text>
          <Text>
            <Text span fw={600}>
              Fällig am:
            </Text>{' '}
            {datumAnzeigen(faelligAm)}
          </Text>
          <Text size="sm" c="dimmed">
            Preise sind {BELEG_MODUS_LABELS[modus].toLowerCase()}.
          </Text>
        </Stack>
        <Table verticalSpacing={4} tabularNums>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Posten</Table.Th>
              <Table.Th style={BETRAG_STIL}>Betrag</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {posten.map((p) => (
              <Table.Tr key={p.key}>
                <Table.Td style={{ overflowWrap: 'anywhere' }}>{p.text}</Table.Td>
                <Table.Td style={BETRAG_STIL}>{centAnzeigen(p.betragCent)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <BelegSummen
          jeSteuersatz={berechnung.jeSteuersatz}
          summeCent={berechnung.summe}
          pfand={pfand}
        />
        {warnungen.length > 0 && (
          <Alert color="orange" title="Bitte prüfen">
            <Stack gap="xs">
              {warnungen.map((w) => (
                <Checkbox
                  key={w.code}
                  checked={bestaetigt.has(w.code)}
                  onChange={(e) => umschalten(w.code, e.currentTarget.checked)}
                  label={w.text}
                  aria-label={w.text}
                  disabled={laeuft}
                />
              ))}
            </Stack>
          </Alert>
        )}
        {fehler && <Alert color="red">{fehler}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={laeuft}>
            Zurück zur Rechnung
          </Button>
          <Button
            onClick={() => onStellen([...bestaetigt])}
            loading={laeuft}
            disabled={offen}
            data-autofocus
          >
            Rechnung stellen
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
