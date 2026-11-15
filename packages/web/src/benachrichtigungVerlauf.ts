import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { VerlaufFilter, VerlaufSeiteDto } from '@c4/shared';
import { useApi } from './api';
import { useAuth } from './auth';

const VERLAUF_KEY = 'benachrichtigung-verlauf';
const UNGELESEN_KEY = [VERLAUF_KEY, 'ungelesen'];

export interface VerlaufAnsicht extends VerlaufFilter {
  /** Only unread entries (the default view). */
  nurUngelesen: boolean;
}

type Seiten = InfiniteData<VerlaufSeiteDto, string | null>;

/** Whether an entry of type `art` matches a filter (type keys are `<bereich>.<name>`). */
const passt = (art: string, filter: VerlaufFilter) =>
  filter.art ? art === filter.art : filter.bereich ? art.startsWith(`${filter.bereich}.`) : true;

/** History entries newest first, page by page. */
export function useVerlauf(ansicht: VerlaufAnsicht) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: [VERLAUF_KEY, 'liste', ansicht],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const res = await api.me.benachrichtigungen.verlauf.$get({
        query: {
          ...(ansicht.art && { art: ansicht.art as never }),
          ...(ansicht.bereich && { bereich: ansicht.bereich }),
          ungelesen: ansicht.nurUngelesen ? 'true' : 'false',
          ...(pageParam && { vor: pageParam }),
        },
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return (await res.json()) as VerlaufSeiteDto;
    },
    getNextPageParam: (seite) => seite.weiter,
  });
}

/** Number of unread entries; refreshed every minute and when the window gets focus. */
export function useUngelesen(enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: UNGELESEN_KEY,
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const res = await api.me.benachrichtigungen.verlauf.ungelesen.$get();
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return ((await res.json()) as { anzahl: number }).anzahl;
    },
  });
}

/** Refreshes the count and marks the lists stale (without refetching, so removed cards can animate out). */
function aktualisieren(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: UNGELESEN_KEY });
  void qc.invalidateQueries({ queryKey: [VERLAUF_KEY, 'liste'], refetchType: 'none' });
}

function lokalGelesen(qc: QueryClient, passend: (e: { id: string; art: string }) => boolean): void {
  qc.setQueriesData<Seiten>({ queryKey: [VERLAUF_KEY, 'liste'] }, (alt) => {
    if (!alt) return alt;
    return {
      ...alt,
      pages: alt.pages.map((s) => ({
        ...s,
        eintraege: s.eintraege.map((e) => (passend(e) ? { ...e, gelesen: true } : e)),
      })),
    };
  });
}

/** Marks one entry as read (optimistically). */
export function useGelesenMarkieren() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.me.benachrichtigungen.verlauf[':id'].gelesen.$post({ param: { id } });
      // 404 = entry expired or deleted: nothing left to mark.
      if (!res.ok && (res.status as number) !== 404)
        throw new Error(`Request failed (${res.status})`);
    },
    onMutate: (id) => {
      const war = qc
        .getQueriesData<Seiten>({ queryKey: [VERLAUF_KEY, 'liste'] })
        .some(([, d]) => d?.pages.some((s) => s.eintraege.some((e) => e.id === id && !e.gelesen)));
      lokalGelesen(qc, (e) => e.id === id);
      if (war) qc.setQueryData<number>(UNGELESEN_KEY, (n) => Math.max(0, (n ?? 1) - 1));
    },
    onSettled: () => aktualisieren(qc),
  });
}

/** Marks all entries matching the filter as read (optimistically). */
export function useAlleGelesen() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (filter: VerlaufFilter) => {
      const res = await api.me.benachrichtigungen.verlauf.gelesen.$post({
        json: {
          ...(filter.art && { art: filter.art as never }),
          ...(filter.bereich && { bereich: filter.bereich }),
        },
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
    },
    onMutate: (filter) => {
      lokalGelesen(qc, (e) => passt(e.art, filter));
      void qc.invalidateQueries({ queryKey: UNGELESEN_KEY });
    },
    onSettled: () => aktualisieren(qc),
  });
}

/**
 * Mounted once in the app shell: marks the entry named by `?benachrichtigung=<id>` (set by the
 * service worker on a push click) as read and removes the parameter; refreshes the badge when the
 * service worker reports a new push.
 */
export function usePushGelesenParam() {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can } = useAuth();
  const darf = can('profil:bearbeiten');
  const { mutate } = useGelesenMarkieren();

  useEffect(() => {
    const params = new URLSearchParams(search);
    const id = params.get('benachrichtigung');
    if (!id) return;
    params.delete('benachrichtigung');
    if (darf) mutate(id);
    const rest = params.toString();
    navigate({ pathname, search: rest ? `?${rest}` : '', hash }, { replace: true });
  }, [search, pathname, hash, darf, mutate, navigate]);

  useEffect(() => {
    if (!darf || !('serviceWorker' in navigator)) return;
    const onMessage = (ev: MessageEvent) => {
      if ((ev.data as { typ?: string } | null)?.typ !== 'push') return;
      void qc.invalidateQueries({ queryKey: [VERLAUF_KEY] });
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [darf, qc]);
}
