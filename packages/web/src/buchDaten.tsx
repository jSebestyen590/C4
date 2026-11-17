import { Anchor, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  buchSaldoStufe,
  centAnzeigen,
  type BuchSaldoStufe,
  type BuchSeiteDto,
  type FinanzMitgliedDto,
} from '@c4/shared';
import { unwrap, useApi } from './api';
import { mitgliedLink, mitgliedName } from './mitglied';
import { StatusName } from './StatusAnzeige';

/** Prefix of all Buch queries; invalidate it after any change. */
export const BUCH_KEY = ['buch'] as const;

/** The caller's own active page(s) with the Verlauf. */
export function useBuchMeine() {
  const api = useApi();
  return useQuery({
    queryKey: [...BUCH_KEY, 'meine'],
    queryFn: async () => unwrap(await api.buch.meine.$get()),
  });
}

/** Turnover ranking; `jahr` is a year or `alle`. */
export function useBuchRangliste(jahr: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...BUCH_KEY, 'rangliste', jahr],
    queryFn: async () => unwrap(await api.buch.rangliste.$get({ query: { jahr } })),
  });
}

/** Active (or archived) pages with their balance. */
export function useBuchSeiten(archiviert: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: [...BUCH_KEY, 'seiten', { archiviert }],
    queryFn: async () =>
      unwrap(await api.buch.seiten.$get({ query: archiviert ? { archiviert: 'true' } : {} })),
  });
}

export function useBuchSeite(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...BUCH_KEY, 'seite', id],
    queryFn: async () => unwrap(await api.buch.seiten[':id'].$get({ param: { id } })),
  });
}

export function useBuchTarife() {
  const api = useApi();
  return useQuery({
    queryKey: [...BUCH_KEY, 'tarife'],
    queryFn: async () => unwrap(await api.buch.tarife.$get()),
  });
}

/** Balance with a real minus sign: `−12,50 €`. */
export const saldoText = (cent: number) =>
  cent < 0 ? `−${centAnzeigen(-cent)}` : centAnzeigen(cent);

/** Effect of an entry with an explicit sign: `+3,00 €`, `−4,50 €`, `0,00 €`. */
export const wirkungText = (cent: number) =>
  cent > 0 ? `+${centAnzeigen(cent)}` : cent < 0 ? `−${centAnzeigen(-cent)}` : centAnzeigen(0);

const STUFEN_FARBE: Record<BuchSaldoStufe, string> = {
  gut: 'light-dark(var(--mantine-color-green-8), var(--mantine-color-green-4))',
  warnung: 'light-dark(var(--mantine-color-yellow-9), var(--mantine-color-yellow-4))',
  ueberzug: 'light-dark(var(--mantine-color-red-7), var(--mantine-color-red-4))',
};

/**
 * A Buch balance in its colour: green from 0, yellow while negative within `maxUeberzugCent`, red
 * below it (pass 0 without a tarif). Digits of equal width, never wrapped.
 */
export function BuchSaldo({
  cent,
  maxUeberzugCent,
  fett = true,
}: Readonly<{ cent: number; maxUeberzugCent: number | null | undefined; fett?: boolean }>) {
  return (
    <Text
      span
      fw={fett ? 700 : undefined}
      style={{
        color: STUFEN_FARBE[buchSaldoStufe(cent, maxUeberzugCent ?? 0)],
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      {saldoText(cent)}
    </Text>
  );
}

/** A plain signed amount (effect of an entry, sums): no status colour. */
export function Betrag({ cent, fett = false }: Readonly<{ cent: number; fett?: boolean }>) {
  return (
    <Text
      span
      fw={fett ? 700 : undefined}
      style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
    >
      {wirkungText(cent)}
    </Text>
  );
}

/** Owner of a page: the member (bold, status color, linked) or the external name. */
export function BuchInhaber({
  seite,
  verlinken = true,
}: Readonly<{ seite: Pick<BuchSeiteDto, 'mitglied' | 'externName'>; verlinken?: boolean }>) {
  const m: FinanzMitgliedDto | null = seite.mitglied;
  if (!m) return <Text span>{seite.externName ?? '–'}</Text>;
  const name = <StatusName status={m.status}>{mitgliedName(m)}</StatusName>;
  if (!verlinken) return name;
  return (
    <Anchor component={Link} to={mitgliedLink(m)} underline="hover">
      {name}
    </Anchor>
  );
}

/** Label of a page in selects and messages: `Seite 12 (username)`. */
export const seitenName = (s: Pick<BuchSeiteDto, 'nummer' | 'mitglied' | 'externName'>) =>
  `Seite ${s.nummer} (${s.mitglied ? mitgliedName(s.mitglied) : (s.externName ?? '–')})`;

export const seitePfad = (id: string) => `/finanzen/buch/seiten/${encodeURIComponent(id)}`;
