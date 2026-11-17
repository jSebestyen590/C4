import { Anchor } from '@mantine/core';
import { useInfiniteQuery, useQuery, type QueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type {
  DurchgaengeSeiteDto,
  TrichterDto,
  TrichterMitgliedDto,
  TrichterUebersichtDto,
} from '@c4/shared';
import { unwrap, useApi } from './api';
import { mitgliedLink } from './mitglied';
import { StatusName } from './StatusAnzeige';
import { trichterName } from './trichterAnzeige';

/** Every Trichter query lives under this key, so one invalidation refreshes the whole area. */
export const trichterKeys = {
  alle: ['trichter'] as const,
  liste: (mitArchiv: boolean) => ['trichter', 'liste', mitArchiv] as const,
  uebersicht: (jahr: string) => ['trichter', 'uebersicht', jahr] as const,
  durchgaenge: ['trichter', 'durchgaenge'] as const,
};

export const trichterInvalidieren = (qc: QueryClient) =>
  qc.invalidateQueries({ queryKey: trichterKeys.alle });

export function useTrichterListe(mitArchiv = false) {
  const api = useApi();
  return useQuery({
    queryKey: trichterKeys.liste(mitArchiv),
    queryFn: async () =>
      (await unwrap(
        await api.trichter.$get({ query: mitArchiv ? { archiviert: '1' } : {} }),
      )) as TrichterDto[],
  });
}

/** Kings and ranking; `jahr` is a year or `alle`. */
export function useTrichterUebersicht(jahr: string) {
  const api = useApi();
  return useQuery({
    queryKey: trichterKeys.uebersicht(jahr),
    queryFn: async () =>
      (await unwrap(
        await api.trichter.uebersicht.$get({ query: { jahr } }),
      )) as TrichterUebersichtDto,
  });
}

/** Durchgänge newest first, page by page. */
export function useDurchgaenge() {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: trichterKeys.durchgaenge,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (await unwrap(
        await api.trichter.durchgaenge.$get({ query: pageParam ? { vor: pageParam } : {} }),
      )) as DurchgaengeSeiteDto,
    getNextPageParam: (seite) => seite.weiter,
  });
}

/** A member in the Trichter area: bold in their status color, linked to their page. */
export function TrichterPerson({ mitglied }: Readonly<{ mitglied: TrichterMitgliedDto }>) {
  return (
    <Anchor
      component={Link}
      to={mitgliedLink({ sub: mitglied.sub, username: mitglied.username })}
      underline="hover"
    >
      <StatusName status={mitglied.status}>{trichterName(mitglied)}</StatusName>
    </Anchor>
  );
}
