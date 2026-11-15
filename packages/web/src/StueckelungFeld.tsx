import { Table, Text, TextInput } from '@mantine/core';
import { useRef, type KeyboardEvent } from 'react';
import { ANZAHL_MAX, centAnzeigen, NENNWERTE_CENT, type StueckelungDto } from '@c4/shared';
import { bestandFehler, mengeVon, mengenSumme, type Mengen } from './bargeldFormular';
import { BETRAG_STIL } from './finanzenDaten';
import { naechstesFeld, type FeldReihenfolge } from './feldReihenfolge';

const ZAHL = new Intl.NumberFormat('de-DE');
const vorzeichen = (n: number) => (n > 0 ? `+${ZAHL.format(n)}` : ZAHL.format(n));

/** One count column of a `StueckelungFeld` with several columns. */
export interface StueckelungSpalte {
  id: string;
  label: string;
  value: Mengen;
  onChange: (m: Mengen) => void;
  /** `ab` takes from the stock (can be capped), `zu` adds to it. */
  richtung: 'ab' | 'zu';
  /** Counts above the stock are errors (needs `bestand`). */
  begrenzen?: boolean;
}

/**
 * Typed counts per denomination (1 ct up to 100 EUR), one integer field per row and count column.
 * Single column (`value`/`onChange`): optional stock column (`bestand`, `bestandLabel`) and the
 * difference to it, `begrenzen` makes a count above the stock a field error. Several columns
 * (`spalten`, e.g. Abgang and Zugang when changing money): stock, one column each and the stock
 * afterwards. Tab and Enter walk the fields row by row or column by column (`reihenfolge`); Enter
 * after the last field is left to the surrounding form. The footer sums the values live.
 */
export function StueckelungFeld({
  value,
  onChange,
  spalten,
  reihenfolge = 'zeilen',
  label,
  bestand,
  bestandLabel = 'Bestand',
  differenz = false,
  begrenzen = false,
  disabled = false,
}: Readonly<{
  value?: Mengen;
  onChange?: (m: Mengen) => void;
  spalten?: readonly StueckelungSpalte[];
  reihenfolge?: FeldReihenfolge;
  /** Accessible name of the whole table. */
  label: string;
  bestand?: readonly StueckelungDto[];
  bestandLabel?: string;
  /** Show `value - bestand` per row (single column, needs `bestand`). */
  differenz?: boolean;
  /** Single column: counts above the stock are errors (needs `bestand`). */
  begrenzen?: boolean;
  disabled?: boolean;
}>) {
  const tabelle = useRef<HTMLTableElement>(null);
  const mehrere = !!spalten;
  const cols: readonly StueckelungSpalte[] = spalten ?? [
    {
      id: 'anzahl',
      label: 'Anzahl',
      value: value ?? {},
      onChange: onChange ?? (() => undefined),
      richtung: 'ab',
      begrenzen,
    },
  ];
  const vorrat = new Map((bestand ?? []).map((s) => [s.nennwertCent, s.anzahl]));
  const fehler = cols.map((c) =>
    c.begrenzen && bestand ? bestandFehler(c.value, bestand) : new Map<number, string>(),
  );
  const bestandSumme = [...vorrat].reduce((s, [n, a]) => s + n * a, 0);
  const summen = cols.map((c) => mengenSumme(c.value));
  const einzel = cols[0]!;
  const diffSumme = summen[0]! - bestandSumme;
  const danach = (n: number) =>
    (vorrat.get(n) ?? 0) +
    cols.reduce((s, c) => s + (c.richtung === 'zu' ? 1 : -1) * mengeVon(c.value, n), 0);
  const danachSumme = NENNWERTE_CENT.reduce((s, n) => s + n * danach(n), 0);

  const fokus = (z: number, s: number) =>
    tabelle.current?.querySelector<HTMLElement>(`[data-pos="${z}-${s}"]`)?.focus();
  // Tab and Enter follow the chosen order; at its ends the browser / the form take over.
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>, z: number, s: number) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.nativeEvent.isComposing) return;
    const schritt = e.key === 'Tab' ? (e.shiftKey ? -1 : 1) : e.key === 'Enter' ? 1 : null;
    if (schritt === null) return;
    const ziel = naechstesFeld(NENNWERTE_CENT.length, cols.length, reihenfolge, z, s, schritt);
    if (!ziel) return;
    e.preventDefault();
    e.stopPropagation();
    fokus(ziel[0], ziel[1]);
  };

  return (
    <Table
      ref={tabelle}
      verticalSpacing={4}
      tabularNums
      aria-label={label}
      data-stueckelung=""
      style={{ maxWidth: mehrere ? 760 : 640 }}
    >
      <Table.Thead>
        <Table.Tr>
          <Table.Th style={BETRAG_STIL}>Wert</Table.Th>
          {bestand && <Table.Th style={BETRAG_STIL}>{bestandLabel}</Table.Th>}
          {cols.map((c) => (
            <Table.Th key={c.id} w={140} style={BETRAG_STIL}>
              {c.label}
            </Table.Th>
          ))}
          {!mehrere && differenz && bestand && <Table.Th style={BETRAG_STIL}>Differenz</Table.Th>}
          {mehrere && bestand && <Table.Th style={BETRAG_STIL}>Bestand danach</Table.Th>}
          {!mehrere && <Table.Th style={BETRAG_STIL}>Betrag</Table.Th>}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {NENNWERTE_CENT.map((n, z) => {
          const d = mengeVon(einzel.value, n) - (vorrat.get(n) ?? 0);
          const nach = danach(n);
          return (
            <Table.Tr key={n}>
              <Table.Td style={BETRAG_STIL}>{centAnzeigen(n)}</Table.Td>
              {bestand && (
                <Table.Td style={BETRAG_STIL} c="dimmed">
                  {ZAHL.format(vorrat.get(n) ?? 0)}
                </Table.Td>
              )}
              {cols.map((c, s) => {
                const wert = c.value[n];
                const meldung = fehler[s]!.get(n);
                return (
                  <Table.Td key={c.id}>
                    <TextInput
                      aria-label={`${c.label} ${centAnzeigen(n)}`}
                      value={wert === null || wert === undefined ? '' : String(wert)}
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={7}
                      placeholder="0"
                      disabled={disabled}
                      data-nav=""
                      data-pos={`${z}-${s}`}
                      error={!!meldung || mengeVon(c.value, n) > ANZAHL_MAX}
                      onKeyDown={(e) => onKeyDown(e, z, s)}
                      onChange={(e) => {
                        const ziffern = e.currentTarget.value.replace(/\D/g, '');
                        c.onChange({ ...c.value, [n]: ziffern === '' ? null : Number(ziffern) });
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
                    {meldung && (
                      <Text size="xs" c="red" ta="right" role="alert">
                        {meldung}
                      </Text>
                    )}
                  </Table.Td>
                );
              })}
              {!mehrere && differenz && bestand && (
                <Table.Td
                  style={BETRAG_STIL}
                  c={d === 0 ? 'dimmed' : d > 0 ? 'teal' : 'red'}
                  fw={d === 0 ? 400 : 600}
                >
                  {d === 0 ? '–' : vorzeichen(d)}
                </Table.Td>
              )}
              {mehrere && bestand && (
                <Table.Td style={BETRAG_STIL} c={nach < 0 ? 'red' : 'dimmed'}>
                  {ZAHL.format(nach)}
                </Table.Td>
              )}
              {!mehrere && (
                <Table.Td
                  style={BETRAG_STIL}
                  c={mengeVon(einzel.value, n) === 0 ? 'dimmed' : undefined}
                >
                  {mengeVon(einzel.value, n) === 0
                    ? '–'
                    : centAnzeigen(n * mengeVon(einzel.value, n))}
                </Table.Td>
              )}
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
          {mehrere ? (
            summen.map((s, i) => (
              <Table.Td key={cols[i]!.id} style={{ ...BETRAG_STIL, fontWeight: 600 }}>
                {centAnzeigen(s)}
              </Table.Td>
            ))
          ) : (
            <Table.Td />
          )}
          {!mehrere && differenz && bestand && (
            <Table.Td
              style={{ ...BETRAG_STIL, fontWeight: 600 }}
              c={diffSumme === 0 ? undefined : diffSumme > 0 ? 'teal' : 'red'}
            >
              {diffSumme === 0
                ? '–'
                : `${diffSumme > 0 ? '+' : '−'}${centAnzeigen(Math.abs(diffSumme))}`}
            </Table.Td>
          )}
          {mehrere && bestand && (
            <Table.Td style={{ ...BETRAG_STIL, fontWeight: 600 }}>
              {centAnzeigen(danachSumme)}
            </Table.Td>
          )}
          {!mehrere && (
            <Table.Td style={{ ...BETRAG_STIL, fontWeight: 600 }}>
              {centAnzeigen(summen[0]!)}
            </Table.Td>
          )}
        </Table.Tr>
      </Table.Tfoot>
    </Table>
  );
}
