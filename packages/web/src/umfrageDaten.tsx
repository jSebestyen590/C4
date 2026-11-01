import { Anchor } from '@mantine/core';
import { useInfiniteQuery, useQuery, type QueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { UmfrageDetailDto, UmfrageListeDto, UmfragePerson } from '@c4/shared';
import { unwrap, useApi } from './api';
import { mitgliedLink, mitgliedName } from './mitglied';
import { StatusName } from './StatusAnzeige';

/** Every Umfrage query lives under this key, so one invalidation refreshes the whole area. */
export const UMFRAGEN_KEY = 'umfragen';

export const umfragenInvalidieren = (qc: QueryClient) =>
  qc.invalidateQueries({ queryKey: [UMFRAGEN_KEY] });

export const umfrageLink = (id: string) => `/umfragen/${encodeURIComponent(id)}`;

/** Running polls the caller may see. */
export function useUmfragen() {
  const api = useApi();
  return useQuery({
    queryKey: [UMFRAGEN_KEY, 'liste'],
    queryFn: async () => (await unwrap(await api.umfragen.$get())) as UmfrageListeDto[],
  });
}

/** Ended polls the caller may see, newest first, page by page. */
export function useBeendeteUmfragen() {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: [UMFRAGEN_KEY, 'beendet'],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (await unwrap(
        await api.umfragen.beendet.$get({ query: pageParam ? { nach: pageParam } : {} }),
      )) as { umfragen: UmfrageListeDto[]; weiter: string | null },
    getNextPageParam: (seite) => seite.weiter,
  });
}

export function useUmfrage(id: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: [UMFRAGEN_KEY, 'detail', id],
    enabled: !!id,
    queryFn: async () =>
      (await unwrap(await api.umfragen[':id'].$get({ param: { id: id! } }))) as UmfrageDetailDto,
  });
}

/** A member in a poll: bold in their status color, linked to their page. */
export function PersonLink({ person }: Readonly<{ person: UmfragePerson }>) {
  return (
    <Anchor component={Link} to={mitgliedLink(person)} underline="hover">
      <StatusName status={person.status}>{mitgliedName(person)}</StatusName>
    </Anchor>
  );
}

/** "Letzter Tag", "1 Tag vorher", "7 Tage vorher". */
export const erinnerungLabel = (tage: number) =>
  tage === 0 ? 'Letzter Tag' : tage === 1 ? '1 Tag vorher' : `${tage} Tage vorher`;
