import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  type MantineSpacing,
  type PaperProps,
  type TableProps,
} from '@mantine/core';

/**
 * A list as cards on phones (below `sm`) and as a table from `sm` upward. The caller renders the
 * card, the head row and one table row per entry; the component only owns the breakpoint switch,
 * the card list and the scrollable table. Renders nothing for an empty list.
 */
export function KartenOderTabelle<T>({
  zeilen,
  zeilenKey,
  karte,
  kopf,
  zeile,
  minWidth,
  kartenAbstand,
  kartenAlsStapel = false,
  tabelle,
  spalten,
}: Readonly<{
  zeilen: readonly T[];
  zeilenKey: (zeile: T) => string;
  /** One card; for a clickable card use `KlickKarte`. */
  karte: (zeile: T) => ReactNode;
  /** The `<Table.Tr>` with the column headings. */
  kopf: ReactNode;
  /** One `<Table.Tr>` (give it an `onClick` for clickable rows). */
  zeile: (zeile: T) => ReactNode;
  /** Table width below which the table scrolls horizontally; without it the table is not wrapped in a scroll container. */
  minWidth?: number;
  /** Gap between the cards (Mantine spacing). */
  kartenAbstand?: MantineSpacing;
  /** Lay out the cards with a `Stack` instead of a one-column `SimpleGrid`. */
  kartenAlsStapel?: boolean;
  /** Extra props of the Mantine `Table`. */
  tabelle?: TableProps;
  /** Optional `<colgroup>` of the table. */
  spalten?: ReactNode;
}>) {
  if (zeilen.length === 0) return null;
  const tabelleNode = (
    <Table verticalSpacing="xs" {...tabelle}>
      {spalten}
      <Table.Thead>{kopf}</Table.Thead>
      <Table.Tbody>
        {zeilen.map((z) => (
          <Fragment key={zeilenKey(z)}>{zeile(z)}</Fragment>
        ))}
      </Table.Tbody>
    </Table>
  );
  const karten = zeilen.map((z) => <Fragment key={zeilenKey(z)}>{karte(z)}</Fragment>);
  return (
    <>
      {kartenAlsStapel ? (
        <Stack gap={kartenAbstand ?? 'xs'} hiddenFrom="sm">
          {karten}
        </Stack>
      ) : (
        <SimpleGrid cols={1} spacing={kartenAbstand} hiddenFrom="sm">
          {karten}
        </SimpleGrid>
      )}
      {minWidth === undefined ? (
        <Box visibleFrom="sm">{tabelleNode}</Box>
      ) : (
        <Table.ScrollContainer minWidth={minWidth} visibleFrom="sm">
          {tabelleNode}
        </Table.ScrollContainer>
      )}
    </>
  );
}

/** Card whose whole area is a link (keyboard accessible, opens in the same tab). */
export function KlickKarte({
  to,
  children,
  ...rest
}: Readonly<{ to: string; children: ReactNode } & PaperProps>) {
  return (
    <Paper
      component={Link}
      to={to}
      withBorder
      p="md"
      style={{ color: 'inherit', textDecoration: 'none' }}
      {...rest}
    >
      {children}
    </Paper>
  );
}
