import { Alert, Button, Checkbox, Group, Modal, Stack, Table, Text } from '@mantine/core';
import { useState } from 'react';
import {
  belegdatumAlt,
  centAnzeigen,
  datumAnzeigen,
  heuteBerlin,
  ZAHLWEG_LABELS,
  type BelegBerechnung,
  type BelegWarnungDto,
  type Zahlweg,
} from '@c4/shared';
import { useDatumsgrenze, verschiebText } from './FestschreibungHinweise';
import { BelegSummen } from './BelegSummen';
import { BETRAG_STIL } from './finanzenDaten';
import { stueckelungText } from './bargeldFormular';
import { EIGENBELEG_HINWEIS, formularEigenbeleg, stueckelungAus } from './belegFormular';
import type { BelegFormular } from './belegFormular';

export interface BuchenPosten {
  key: string;
  kategorie: string;
  text: string;
  betragCent: number;
}

/**
 * Summary before booking a Beleg: the number is assigned now, items, totals, Zahlweg and the
 * plausibility warnings, each of which must be ticked off. Mount it only while it is open.
 */
export function BelegBuchenDialog({
  form,
  rechnungssteller,
  zahlwegZusatz,
  posten,
  berechnung,
  warnungen,
  laeuft,
  fehler,
  onBuchen,
  onClose,
}: Readonly<{
  form: BelegFormular;
  rechnungssteller: string;
  /** Name of the Fach or Mitglied that goes with the Zahlweg. */
  zahlwegZusatz: string | null;
  posten: readonly BuchenPosten[];
  berechnung: BelegBerechnung;
  warnungen: readonly BelegWarnungDto[];
  laeuft: boolean;
  fehler: string | null;
  onBuchen: (bestaetigt: string[]) => void;
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
  const zahlweg = form.zahlweg as Zahlweg;
  const { festBis } = useDatumsgrenze();
  const verschiebung = verschiebText(
    zahlweg === 'auslage' ? form.belegdatum : form.bezahldatum,
    festBis,
  );
  const eigenbeleg = formularEigenbeleg(form);
  const stueckelung = stueckelungAus(form.gegeben, form.wechselgeld);
  return (
    <Modal
      opened
      onClose={laeuft ? () => undefined : onClose}
      title="Beleg prüfen und buchen"
      size="lg"
      closeOnClickOutside={!laeuft}
    >
      <Stack>
        {verschiebung && (
          <Alert color="yellow" title="Buchungsdatum verschoben">
            {verschiebung}
          </Alert>
        )}
        <Text size="sm" c="dimmed">
          Die Belegnummer wird beim Buchen vergeben. Ein gebuchter Beleg lässt sich nicht mehr
          ändern.
        </Text>
        <Stack gap={2}>
          <Text style={{ overflowWrap: 'anywhere' }}>
            <Text span fw={600}>
              Rechnungssteller:
            </Text>{' '}
            {rechnungssteller}
          </Text>
          <Text>
            <Text span fw={600}>
              Belegdatum:
            </Text>{' '}
            {datumAnzeigen(form.belegdatum)}
            {belegdatumAlt(form.belegdatum, heuteBerlin()) && (
              <Text span c="orange.8">
                {' '}
                – liegt mehr als 2 Monate zurück
              </Text>
            )}
          </Text>
          <Text style={{ overflowWrap: 'anywhere' }}>
            <Text span fw={600}>
              Zahlweg:
            </Text>{' '}
            {ZAHLWEG_LABELS[zahlweg]}
            {zahlwegZusatz ? `: ${zahlwegZusatz}` : ''}
            {zahlweg !== 'auslage' && form.bezahldatum
              ? `, bezahlt am ${datumAnzeigen(form.bezahldatum)}`
              : ''}
          </Text>
          {zahlweg === 'bar' && (
            <Text size="sm">
              {[
                [
                  'Abgang',
                  stueckelung.filter((x) => x.anzahl < 0).map((x) => ({ ...x, anzahl: -x.anzahl })),
                ],
                [
                  berechnung.summe < 0 ? 'Eingang' : 'Wechselgeld',
                  stueckelung.filter((x) => x.anzahl > 0),
                ],
              ]
                .filter(([, liste]) => (liste?.length ?? 0) > 0)
                .map(
                  ([titel, liste]) => `${titel}: ${stueckelungText(liste as typeof stueckelung)}`,
                )
                .join('; ')}
            </Text>
          )}
          <Text size="sm" c="dimmed">
            {form.datei
              ? `Datei: ${form.datei.name}`
              : `Eigenbeleg ohne Datei: ${form.eigenbelegBegruendung}`}
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
                <Table.Td style={{ overflowWrap: 'anywhere' }}>
                  {p.kategorie}
                  {p.text ? ` – ${p.text}` : ''}
                </Table.Td>
                <Table.Td style={BETRAG_STIL}>{centAnzeigen(p.betragCent)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <BelegSummen
          jeSteuersatz={berechnung.jeSteuersatz}
          summeCent={berechnung.summe}
          ohneVorsteuer={eigenbeleg}
        />
        {eigenbeleg && (
          <Text size="sm" c="dimmed">
            {EIGENBELEG_HINWEIS}
          </Text>
        )}
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
            Zurück zum Beleg
          </Button>
          <Button
            onClick={() => onBuchen([...bestaetigt])}
            loading={laeuft}
            disabled={offen}
            data-autofocus
          >
            Buchen
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
