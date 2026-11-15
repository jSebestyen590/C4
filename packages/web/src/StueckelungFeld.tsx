import { Table, Text, TextInput } from '@mantine/core';
import { ANZAHL_MAX, centAnzeigen, NENNWERTE_CENT, type StueckelungDto } from '@c4/shared';
import { bestandFehler, mengeVon, mengenSumme, type Mengen } from './bargeldFormular';
import { BETRAG_STIL } from './finanzenDaten';

const ZAHL = new Intl.NumberFormat('de-DE');
const vorzeichen = (n: number) => (n > 0 ? `+${ZAHL.format(n)}` : ZAHL.format(n));

/**
 * Typed counts per denomination (1 ct up to 100 EUR), one integer field per row, tab order top to
 * bottom (Enter moves on when the form handles `data-nav`). Optional columns: the stock (`bestand`,
 * labelled `bestandLabel`) and the difference to it; with `begrenzen` a count above the stock is an
 * error on the field. The footer sums the values live. Desktop first, no phone keyboard tricks yet.
 */
export function StueckelungFeld({
  value,
  onChange,
  label,
  bestand,
  bestandLabel = 'Bestand',
  differenz = false,
  begrenzen = false,
  disabled = false,
}: Readonly<{
  value: Mengen;
  onChange: (m: Mengen) => void;
  /** Accessible name of the whole table. */
  label: string;
  bestand?: readonly StueckelungDto[];
  bestandLabel?: string;
  /** Show `value - bestand` per row (needs `bestand`). */
  differenz?: boolean;
  /** Counts above the stock are errors (needs `bestand`). */
  begrenzen?: boolean;
  disabled?: boolean;
}>) {
  const vorrat = new Map((bestand ?? []).map((s) => [s.nennwertCent, s.anzahl]));
  const fehler = begrenzen && bestand ? bestandFehler(value, bestand) : new Map<number, string>();
  const bestandSumme = [...vorrat].reduce((s, [n, a]) => s + n * a, 0);
  const summe = mengenSumme(value);
  const diffSumme = summe - bestandSumme;

  return (
    <Table
      verticalSpacing={4}
      tabularNums
      aria-label={label}
      data-stueckelung=""
      style={{ maxWidth: 640 }}
    >
      <Table.Thead>
        <Table.Tr>
          <Table.Th style={BETRAG_STIL}>Wert</Table.Th>
          {bestand && <Table.Th style={BETRAG_STIL}>{bestandLabel}</Table.Th>}
          <Table.Th w={140} style={BETRAG_STIL}>
            Anzahl
          </Table.Th>
          {differenz && bestand && <Table.Th style={BETRAG_STIL}>Differenz</Table.Th>}
          <Table.Th style={BETRAG_STIL}>Betrag</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {NENNWERTE_CENT.map((n) => {
          const anzahl = mengeVon(value, n);
          const d = anzahl - (vorrat.get(n) ?? 0);
          return (
            <Table.Tr key={n}>
              <Table.Td style={BETRAG_STIL}>{centAnzeigen(n)}</Table.Td>
              {bestand && (
                <Table.Td style={BETRAG_STIL} c="dimmed">
                  {ZAHL.format(vorrat.get(n) ?? 0)}
                </Table.Td>
              )}
              <Table.Td>
                <TextInput
                  aria-label={`Anzahl ${centAnzeigen(n)}`}
                  value={value[n] === null || value[n] === undefined ? '' : String(value[n])}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={7}
                  placeholder="0"
                  disabled={disabled}
                  data-nav=""
                  error={fehler.has(n) || anzahl > ANZAHL_MAX}
                  onChange={(e) => {
                    const ziffern = e.currentTarget.value.replace(/\D/g, '');
                    onChange({ ...value, [n]: ziffern === '' ? null : Number(ziffern) });
                  }}
                  onFocus={(e) => e.currentTarget.select()}
                  styles={{
                    input: {
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: 'max(16px, 1rem)',
                    },
                  }}
                />
                {fehler.get(n) && (
                  <Text size="xs" c="red" ta="right" role="alert">
                    {fehler.get(n)}
                  </Text>
                )}
              </Table.Td>
              {differenz && bestand && (
                <Table.Td
                  style={BETRAG_STIL}
                  c={d === 0 ? 'dimmed' : d > 0 ? 'teal' : 'red'}
                  fw={d === 0 ? 400 : 600}
                >
                  {d === 0 ? '–' : vorzeichen(d)}
                </Table.Td>
              )}
              <Table.Td style={BETRAG_STIL} c={anzahl === 0 ? 'dimmed' : undefined}>
                {anzahl === 0 ? '–' : centAnzeigen(n * anzahl)}
              </Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
      <Table.Tfoot>
        <Table.Tr>
          <Table.Td>
            <Text fw={600} size="sm" ta="right">
              Summe
            </Text>
          </Table.Td>
          {bestand && (
            <Table.Td style={{ ...BETRAG_STIL, fontWeight: 600 }}>
              {centAnzeigen(bestandSumme)}
            </Table.Td>
          )}
          <Table.Td />
          {differenz && bestand && (
            <Table.Td
              style={{ ...BETRAG_STIL, fontWeight: 600 }}
              c={diffSumme === 0 ? undefined : diffSumme > 0 ? 'teal' : 'red'}
            >
              {diffSumme === 0
                ? '–'
                : `${diffSumme > 0 ? '+' : '−'}${centAnzeigen(Math.abs(diffSumme))}`}
            </Table.Td>
          )}
          <Table.Td style={{ ...BETRAG_STIL, fontWeight: 600 }}>{centAnzeigen(summe)}</Table.Td>
        </Table.Tr>
      </Table.Tfoot>
    </Table>
  );
}
