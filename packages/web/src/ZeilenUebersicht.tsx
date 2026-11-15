import { Table, Text } from '@mantine/core';
import { centAnzeigen } from '@c4/shared';
import { richtungWort, zeilenBetragText } from './buchungFormular';
import { BETRAG_STIL } from './finanzenDaten';

export interface UebersichtZeile {
  key: string | number;
  konto: string;
  /** Signed: positive = Zugang, negative = Abgang. */
  betragCent: number;
}

/** Lines of a booking as words and amounts (Konto, Zugang/Abgang, Betrag), for summaries before booking. */
export function ZeilenUebersicht({ zeilen }: Readonly<{ zeilen: readonly UebersichtZeile[] }>) {
  const zugang = zeilen.filter((z) => z.betragCent > 0).reduce((s, z) => s + z.betragCent, 0);
  const abgang = -zeilen.filter((z) => z.betragCent < 0).reduce((s, z) => s + z.betragCent, 0);
  return (
    <Table verticalSpacing={6} tabularNums>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Konto</Table.Th>
          <Table.Th>Zugang/Abgang</Table.Th>
          <Table.Th style={BETRAG_STIL}>Betrag</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {zeilen.map((z) => (
          <Table.Tr key={z.key}>
            <Table.Td style={{ overflowWrap: 'anywhere' }}>{z.konto}</Table.Td>
            <Table.Td>{richtungWort(z.betragCent)}</Table.Td>
            <Table.Td style={BETRAG_STIL}>{zeilenBetragText(z.betragCent)}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
      <Table.Tfoot>
        <Table.Tr>
          <Table.Td colSpan={2}>
            <Text fw={600} size="sm">
              Summe Zugang
            </Text>
          </Table.Td>
          <Table.Td style={{ ...BETRAG_STIL, fontWeight: 600 }}>{centAnzeigen(zugang)}</Table.Td>
        </Table.Tr>
        <Table.Tr>
          <Table.Td colSpan={2}>
            <Text fw={600} size="sm">
              Summe Abgang
            </Text>
          </Table.Td>
          <Table.Td style={{ ...BETRAG_STIL, fontWeight: 600 }}>{centAnzeigen(abgang)}</Table.Td>
        </Table.Tr>
      </Table.Tfoot>
    </Table>
  );
}
