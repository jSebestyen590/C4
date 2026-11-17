import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  ProtokollAktionenAntwort,
  ProtokollAktionenAusfuehrenAntwort,
  ProtokollDokument,
  ProtokollDto,
  ProtokollKopf,
  ProtokollListeEintragDto,
  ProtokollMitgliedDto,
  ProtokollSitzungDto,
  ProtokollStatus,
  ProtokollStatusAntwort,
} from '@c4/shared';
import { unwrap, useApi } from './api';
import { pruefen } from './warenApi';
import { kalenderKeys } from './kalenderDaten';
import { mitgliederKeys, postenKeys } from './queryKeys';

/** Every Protokolle query lives under this key, so one invalidation refreshes the whole area. */
export const protokollKeys = {
  alle: ['protokolle'] as const,
  liste: ['protokolle', 'liste'] as const,
  sitzungen: ['protokolle', 'sitzungen'] as const,
  detail: (id: string | undefined) => ['protokolle', 'detail', id] as const,
  aktionen: (id: string | undefined) => ['protokolle', 'aktionen', id] as const,
};

export const protokolleInvalidieren = (qc: QueryClient) =>
  qc.invalidateQueries({ queryKey: protokollKeys.alle });

/** The lists only (not the open protocol, whose editor must not be replaced behind the user's back). */
const listenInvalidieren = async (qc: QueryClient) => {
  await Promise.all([
    qc.invalidateQueries({ queryKey: protokollKeys.liste }),
    qc.invalidateQueries({ queryKey: protokollKeys.sitzungen }),
  ]);
};

export const protokollLink = (id: string) => `/protokolle/${encodeURIComponent(id)}`;

export function useProtokolle() {
  const api = useApi();
  return useQuery({
    queryKey: protokollKeys.liste,
    queryFn: async () => (await unwrap(await api.protokolle.$get())) as ProtokollListeEintragDto[],
  });
}

/**
 * One protocol. The editor is uncontrolled, so the page decides when a new server version may replace
 * it: no refetch on focus, and the cache entry is dropped as soon as the page closes (`gcTime: 0`), so
 * reopening never shows a stale document first.
 */
export function useProtokoll(id: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: protokollKeys.detail(id),
    enabled: !!id,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () =>
      (await unwrap(await api.protokolle[':id'].$get({ param: { id: id! } }))) as ProtokollDto,
  });
}

/** Sitzungen a protocol can still be written for. */
export function useProtokollSitzungen() {
  const api = useApi();
  return useQuery({
    queryKey: protokollKeys.sitzungen,
    queryFn: async () =>
      (await unwrap(await api.protokolle.sitzungen.$get())) as ProtokollSitzungDto[],
  });
}

/** Creates the protocol of a Sitzung (the server fills in the suggestion); resolves to the new id. */
export function useProtokollAnlegen() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (eventId: string) => {
      const res = await api.protokolle.$post({ json: { eventId } });
      await pruefen(res);
      return ((await res.json()) as { id: string }).id;
    },
    onSuccess: () => listenInvalidieren(qc),
  });
}

/**
 * Random id of this browser tab, kept in memory for the lifetime of the page: the edit lock belongs to
 * a tab, so the same person in a second tab or on another device is locked out, too.
 */
export const TAB_ID = crypto.randomUUID();
const tabKopf = { headers: { 'x-tab-id': TAB_ID } };

/** Who holds the edit lock (409 of the lock routes, the save and the status change). */
export interface SperreBelegt {
  /** Null when unknown (the lock just lapsed). */
  von: ProtokollMitgliedDto | null;
  /** The same person, in another tab or on another device. */
  eigene: boolean;
}

export type SperreErgebnis = { art: 'ok' } | ({ art: 'gesperrt' } & SperreBelegt);

/** Takes, extends (heartbeat) and releases the edit lock of the open draft. */
export function useProtokollSperreApi() {
  const api = useApi();
  return {
    async nehmen(id: string): Promise<SperreErgebnis> {
      const res = await api.protokolle[':id'].sperre.$post({ param: { id } }, tabKopf);
      if (res.status === 409) {
        const body = (await res.json().catch(() => null)) as { sperre?: SperreBelegt } | null;
        if (body?.sperre) return { art: 'gesperrt', ...body.sperre };
      }
      await pruefen(res);
      return { art: 'ok' };
    },
    /** `keepalive` lets the request survive the page being closed. */
    async loesen(id: string): Promise<void> {
      await api.protokolle[':id'].sperre.$delete(
        { param: { id } },
        { ...tabKopf, init: { keepalive: true } },
      );
    },
  };
}

export type SpeichernErgebnis =
  | { art: 'ok'; version: number }
  | ({ art: 'gesperrt' } & SperreBelegt)
  | { art: 'konflikt'; version: number | null; geaendertVon: ProtokollMitgliedDto | null };

/** PUT with the version we loaded; a 409 is a result (somebody else saved), other failures throw. */
export function useProtokollSpeichern() {
  const api = useApi();
  return async (
    id: string,
    daten: { inhalt: ProtokollDokument; kopf: ProtokollKopf; version: number },
  ): Promise<SpeichernErgebnis> => {
    const res = await api.protokolle[':id'].$put({ param: { id }, json: daten as never }, tabKopf);
    if (res.status === 409) {
      const body = (await res.json().catch(() => null)) as {
        version?: number;
        geaendertVon?: ProtokollMitgliedDto | null;
        sperre?: SperreBelegt;
      } | null;
      if (body?.sperre) return { art: 'gesperrt', ...body.sperre };
      return {
        art: 'konflikt',
        version: body?.version ?? null,
        geaendertVon: body?.geaendertVon ?? null,
      };
    }
    await pruefen(res);
    const body = (await res.json()) as { version: number };
    return { art: 'ok', version: body.version };
  };
}

/** Actions run on closing or retry change events, members and Posten: refresh those areas, too. */
const aktionenFolgenInvalidieren = (qc: QueryClient) =>
  Promise.all([
    protokolleInvalidieren(qc),
    qc.invalidateQueries({ queryKey: kalenderKeys.alle }),
    qc.invalidateQueries({ queryKey: mitgliederKeys.alle }),
    qc.invalidateQueries({ queryKey: postenKeys.alle }),
  ]);

/** Closes (running the chosen Aktionen) or reopens; resolves to the API's answer with the Aktion outcomes. */
export function useProtokollStatus() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async ({
      id,
      status,
      aktionen,
    }: {
      id: string;
      status: ProtokollStatus;
      aktionen?: string[];
    }) => {
      const res = await api.protokolle[':id'].status.$put(
        {
          param: { id },
          json: (aktionen ? { status, aktionen } : { status }) as never,
        },
        tabKopf,
      );
      await pruefen(res);
      return (await res.json()) as unknown as ProtokollStatusAntwort;
    },
    onSuccess: () => aktionenFolgenInvalidieren(qc),
  });
}

/** The Aktionen derived from the saved document (the closing dialog and the card of a closed protocol). */
export function useProtokollAktionen(id: string, aktiv = true) {
  const api = useApi();
  return useQuery({
    queryKey: protokollKeys.aktionen(id),
    enabled: aktiv,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async () =>
      (
        (await unwrap(
          await api.protokolle[':id'].aktionen.$get({ param: { id } }),
        )) as ProtokollAktionenAntwort
      ).aktionen,
  });
}

/** Runs (or retries) Aktionen of a closed protocol. */
export function useProtokollAktionenAusfuehren() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async ({ id, aktionen }: { id: string; aktionen: string[] }) => {
      const res = await api.protokolle[':id'].aktionen.$post({
        param: { id },
        json: { aktionen } as never,
      });
      await pruefen(res);
      return (await res.json()) as unknown as ProtokollAktionenAusfuehrenAntwort;
    },
    onSuccess: () => aktionenFolgenInvalidieren(qc),
  });
}

export function useProtokollLoeschen() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (id: string) => {
      await pruefen(await api.protokolle[':id'].$delete({ param: { id } }, tabKopf));
    },
    onSuccess: () => listenInvalidieren(qc),
  });
}
