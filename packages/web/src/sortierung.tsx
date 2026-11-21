import { Group, Select, Table, UnstyledButton } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconArrowsSort } from '@tabler/icons-react';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';

export type Richtung = 'auf' | 'ab';

export interface SortSpalte<T> {
  /** Label in the "Sortieren nach" select. */
  label: string;
  /** Sort value; null/undefined sorts last in either direction. */
  wert: (eintrag: T) => string | number | null | undefined;
}

export interface Sortierung<K extends string = string> {
  key: K;
  richtung: Richtung;
}

/** Compares two sort values: numbers numerically, text with the German collation. */
export function vergleiche(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'de', { numeric: true, sensitivity: 'base' });
}

/** Sorted copy of `eintraege`; empty values stay at the end whatever the direction. Stable. */
export function sortiere<T, K extends string>(
  eintraege: readonly T[],
  spalten: Record<K, SortSpalte<T>>,
  sortierung: Sortierung<K> | null,
): T[] {
  if (!sortierung) return [...eintraege];
  const { wert } = spalten[sortierung.key];
  const vorzeichen = sortierung.richtung === 'auf' ? 1 : -1;
  return [...eintraege].sort((x, y) => {
    const a = wert(x);
    const b = wert(y);
    const aLeer = a === null || a === undefined || a === '';
    const bLeer = b === null || b === undefined || b === '';
    if (aLeer || bLeer) return aLeer === bLeer ? 0 : aLeer ? 1 : -1;
    return vorzeichen * vergleiche(a, b);
  });
}

/**
 * Client-side sorting of a list. `standard` null keeps the given order until a column is picked.
 * Clicking the active column again flips the direction.
 */
export function useSortierung<T, K extends string>(
  eintraege: readonly T[],
  spalten: Record<K, SortSpalte<T>>,
  standard: Sortierung<K> | null = null,
) {
  const [sortierung, setSortierung] = useState<Sortierung<K> | null>(standard);
  const sortiert = useMemo(
    () => sortiere(eintraege, spalten, sortierung),
    // `spalten` is a constant object per list
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eintraege, sortierung],
  );
  const umschalten = (key: K) =>
    setSortierung((s) => ({
      key,
      richtung: s?.key === key && s.richtung === 'auf' ? 'ab' : 'auf',
    }));
  return { sortiert, sortierung, setSortierung, umschalten };
}

/** Table header cell that sorts on click; shows the direction arrow and `aria-sort`. */
export function SortierKopf<K extends string>({
  spalte,
  sortierung,
  onUmschalten,
  style,
  children,
}: Readonly<{
  spalte: K;
  sortierung: Sortierung<K> | null;
  onUmschalten: (key: K) => void;
  style?: CSSProperties;
  children: ReactNode;
}>) {
  const aktiv = sortierung?.key === spalte;
  const Icon = !aktiv
    ? IconArrowsSort
    : sortierung.richtung === 'auf'
      ? IconArrowUp
      : IconArrowDown;
  return (
    <Table.Th
      style={style}
      aria-sort={!aktiv ? 'none' : sortierung.richtung === 'auf' ? 'ascending' : 'descending'}
    >
      <UnstyledButton
        onClick={() => onUmschalten(spalte)}
        style={{ font: 'inherit', fontWeight: 'inherit', color: 'inherit' }}
        aria-label={`Nach ${typeof children === 'string' ? children : 'dieser Spalte'} sortieren`}
      >
        <Group
          gap={4}
          wrap="nowrap"
          justify={style?.textAlign === 'right' ? 'flex-end' : undefined}
        >
          {children}
          <Icon size={14} opacity={aktiv ? 1 : 0.4} aria-hidden />
        </Group>
      </UnstyledButton>
    </Table.Th>
  );
}

/** Phone variant: "Sortieren nach" select with a direction select, shown below `sm`. */
export function SortierAuswahl<T, K extends string>({
  spalten,
  sortierung,
  onSortierung,
}: Readonly<{
  spalten: Record<K, SortSpalte<T>>;
  sortierung: Sortierung<K> | null;
  onSortierung: (s: Sortierung<K> | null) => void;
}>) {
  const keys = Object.keys(spalten) as K[];
  return (
    <Group gap="xs" grow hiddenFrom="sm" wrap="nowrap" align="flex-end">
      <Select
        label="Sortieren nach"
        placeholder="Standard"
        clearable
        data={keys.map((k) => ({ value: k, label: spalten[k].label }))}
        value={sortierung?.key ?? null}
        onChange={(v) =>
          onSortierung(v ? { key: v as K, richtung: sortierung?.richtung ?? 'auf' } : null)
        }
      />
      <Select
        label="Richtung"
        allowDeselect={false}
        disabled={!sortierung}
        data={[
          { value: 'auf', label: 'Aufsteigend' },
          { value: 'ab', label: 'Absteigend' },
        ]}
        value={sortierung?.richtung ?? 'auf'}
        onChange={(v) =>
          sortierung && onSortierung({ key: sortierung.key, richtung: v as Richtung })
        }
      />
    </Group>
  );
}
