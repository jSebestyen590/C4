import { Table } from '@mantine/core';
import { centAnzeigen, type SteuersatzSumme } from '@c4/shared';
import { satzText } from './belegFormular';
import { BETRAG_STIL } from './finanzenDaten';

/** Netto, Steuer and Brutto per tax rate plus the total of a Beleg. */
export function BelegSummen({
  jeSteuersatz,
  summeCent,
  pfand,
  ohneVorsteuer = false,
  leereSpalte = false,
}: Readonly<{
  jeSteuersatz: readonly SteuersatzSumme[];
  summeCent: number;
  /** Deposit (cent) per tax rate, already part of the Brutto; shown as an extra column when set. */
  pfand?: Readonly<Record<number, number>>;
  /** Eigenbeleg: no Vorsteuer and no Steuersatz; only the total (and its Pfand part) is shown. */
  ohneVorsteuer?: boolean;
  /** Empty column on the right (width of the delete column of the item tables above) so both line up. */
  leereSpalte?: boolean;
}>) {
  const mitPfand = pfand !== undefined && Object.keys(pfand).length > 0;
  const leer = leereSpalte ? <Table.Td w={44} p={0} /> : null;
  if (ohneVorsteuer) {
    const pfandSumme = Object.values(pfand ?? {}).reduce((s, c) => s + c, 0);
    return (
      <Table verticalSpacing={4} tabularNums aria-label="Summe">
        <Table.Tbody>
          <Table.Tr fw={700}>
            <Table.Td>Summe (Aufwand)</Table.Td>
            <Table.Td style={BETRAG_STIL}>{centAnzeigen(summeCent)}</Table.Td>
            {mitPfand && (
              <Table.Td visibleFrom="sm" style={BETRAG_STIL} fw={400} c="dimmed">
                davon Pfand {centAnzeigen(pfandSumme)}
              </Table.Td>
            )}
            {leer}
          </Table.Tr>
        </Table.Tbody>
      </Table>
    );
  }
  return (
    <Table verticalSpacing={4} tabularNums aria-label="Summen je Steuersatz">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Steuersatz</Table.Th>
          <Table.Th style={BETRAG_STIL}>Netto</Table.Th>
          <Table.Th style={BETRAG_STIL}>Steuer</Table.Th>
          <Table.Th style={BETRAG_STIL}>Brutto</Table.Th>
          {mitPfand && (
            <Table.Th visibleFrom="sm" style={BETRAG_STIL}>
              davon Pfand
            </Table.Th>
          )}
          {leereSpalte && <Table.Th w={44} p={0} />}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {jeSteuersatz.map((g) => (
          <Table.Tr key={g.satz}>
            <Table.Td>{satzText(g.satz)}</Table.Td>
            <Table.Td style={BETRAG_STIL}>{centAnzeigen(g.netto)}</Table.Td>
            <Table.Td style={BETRAG_STIL}>{centAnzeigen(g.steuer)}</Table.Td>
            <Table.Td style={BETRAG_STIL}>{centAnzeigen(g.brutto)}</Table.Td>
            {mitPfand && (
              <Table.Td visibleFrom="sm" style={BETRAG_STIL}>
                {centAnzeigen(pfand[g.satz] ?? 0)}
              </Table.Td>
            )}
            {leer}
          </Table.Tr>
        ))}
        <Table.Tr fw={700}>
          <Table.Td colSpan={3}>Summe</Table.Td>
          <Table.Td style={BETRAG_STIL}>{centAnzeigen(summeCent)}</Table.Td>
          {mitPfand && <Table.Td visibleFrom="sm" />}
          {leer}
        </Table.Tr>
      </Table.Tbody>
    </Table>
  );
}
