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
}: Readonly<{
  jeSteuersatz: readonly SteuersatzSumme[];
  summeCent: number;
  /** Deposit (cent) per tax rate, already part of the Brutto; shown as an extra column when set. */
  pfand?: Readonly<Record<number, number>>;
  /** Eigenbeleg: no Vorsteuer, the whole amount is expense; only the Brutto amount is shown. */
  ohneVorsteuer?: boolean;
}>) {
  const mitPfand = pfand !== undefined && Object.keys(pfand).length > 0;
  return (
    <Table verticalSpacing={4} tabularNums aria-label="Summen je Steuersatz">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Steuersatz</Table.Th>
          {!ohneVorsteuer && <Table.Th style={BETRAG_STIL}>Netto</Table.Th>}
          {!ohneVorsteuer && <Table.Th style={BETRAG_STIL}>Steuer</Table.Th>}
          <Table.Th style={BETRAG_STIL}>{ohneVorsteuer ? 'Betrag (Aufwand)' : 'Brutto'}</Table.Th>
          {mitPfand && (
            <Table.Th visibleFrom="sm" style={BETRAG_STIL}>
              davon Pfand
            </Table.Th>
          )}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {jeSteuersatz.map((g) => (
          <Table.Tr key={g.satz}>
            <Table.Td>{satzText(g.satz)}</Table.Td>
            {!ohneVorsteuer && <Table.Td style={BETRAG_STIL}>{centAnzeigen(g.netto)}</Table.Td>}
            {!ohneVorsteuer && <Table.Td style={BETRAG_STIL}>{centAnzeigen(g.steuer)}</Table.Td>}
            <Table.Td style={BETRAG_STIL}>{centAnzeigen(g.brutto)}</Table.Td>
            {mitPfand && (
              <Table.Td visibleFrom="sm" style={BETRAG_STIL}>
                {centAnzeigen(pfand[g.satz] ?? 0)}
              </Table.Td>
            )}
          </Table.Tr>
        ))}
        <Table.Tr fw={700}>
          <Table.Td colSpan={ohneVorsteuer ? 1 : 3}>Summe</Table.Td>
          <Table.Td style={BETRAG_STIL}>{centAnzeigen(summeCent)}</Table.Td>
          {mitPfand && <Table.Td visibleFrom="sm" />}
        </Table.Tr>
      </Table.Tbody>
    </Table>
  );
}
