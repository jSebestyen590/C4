import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  eventTitel,
  type DienstformDto,
  type ErinnerungenDto,
  type EventDto,
  type EventKategorieDto,
  type ExterneDto,
  type GeburtstagDto,
  type SerieListeDto,
  type StatistikDto,
  type VorlageDto,
} from '@c4/shared';
import { unwrap, useApi } from './api';

/** Every Kalender query lives under this key, so one invalidation refreshes the whole area. */
export const kalenderKeys = {
  alle: ['kalender'] as const,
  events: (von: string, bis: string) => ['kalender', 'events', von, bis] as const,
  geburtstage: (von: string, bis: string) => ['kalender', 'geburtstage', von, bis] as const,
  event: (id: string | undefined) => ['kalender', 'event', id] as const,
  dienstformen: ['kalender', 'dienstformen'] as const,
  kategorien: ['kalender', 'kategorien'] as const,
  externe: (mitArchiv: boolean) => ['kalender', 'externe', mitArchiv] as const,
  vorlagen: (mitArchiv: boolean) => ['kalender', 'vorlagen', mitArchiv] as const,
  statistik: (jahr: number) => ['kalender', 'statistik', jahr] as const,
  token: ['kalender', 'token'] as const,
  erinnerungen: ['kalender', 'erinnerungen'] as const,
  serien: ['kalender', 'serien'] as const,
};

export const kalenderInvalidieren = (qc: QueryClient) =>
  qc.invalidateQueries({ queryKey: kalenderKeys.alle });

/** Events overlapping the date range `von`..`bis` (`YYYY-MM-DD`, inclusive). */
export function useKalenderEvents(von: string, bis: string) {
  const api = useApi();
  return useQuery({
    queryKey: kalenderKeys.events(von, bis),
    queryFn: async () =>
      (await unwrap(await api.kalender.events.$get({ query: { von, bis } }))) as EventDto[],
  });
}

/** Birthdays of members within `von`..`bis` (`YYYY-MM-DD`, inclusive; at most 400 days). */
export function useGeburtstage(von: string, bis: string) {
  const api = useApi();
  return useQuery({
    queryKey: kalenderKeys.geburtstage(von, bis),
    queryFn: async () =>
      (await unwrap(
        await api.kalender.geburtstage.$get({ query: { von, bis } }),
      )) as GeburtstagDto[],
  });
}

export function useKalenderEvent(id: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: kalenderKeys.event(id),
    enabled: id !== undefined,
    queryFn: async () =>
      (await unwrap(await api.kalender.events[':id'].$get({ param: { id: id! } }))) as EventDto,
  });
}

/** Dienstformen including archived ones (old events still show them); active ones via `aktive`. */
export function useDienstformen() {
  const api = useApi();
  const q = useQuery({
    queryKey: kalenderKeys.dienstformen,
    queryFn: async () =>
      (await unwrap(
        await api.kalender.dienstformen.$get({ query: { archiv: '1' } }),
      )) as DienstformDto[],
  });
  const liste = useMemo(() => q.data ?? [], [q.data]);
  const nachId = useMemo(() => new Map(liste.map((d) => [d.id, d])), [liste]);
  const aktive = useMemo(() => liste.filter((d) => !d.archiviert), [liste]);
  return { ...q, liste, nachId, aktive };
}

/** A Vorlage's title for lists; without one the Kategorie's name. */
export const vorlageTitel = (v: VorlageDto, kategorien: readonly EventKategorieDto[]): string =>
  eventTitel(
    v,
    kategorien.find((k) => k.id === v.kategorieId),
  );

export function useEventKategorien() {
  const api = useApi();
  const q = useQuery({
    queryKey: kalenderKeys.kategorien,
    queryFn: async () =>
      (await unwrap(
        await api.kalender.kategorien.$get({ query: { archiv: '1' } }),
      )) as EventKategorieDto[],
  });
  const liste = useMemo(() => q.data ?? [], [q.data]);
  const aktive = useMemo(() => liste.filter((k) => !k.archiviert), [liste]);
  return { ...q, liste, aktive };
}

export function useExterne(mitArchiv = false) {
  const api = useApi();
  return useQuery({
    queryKey: kalenderKeys.externe(mitArchiv),
    queryFn: async () =>
      (await unwrap(
        await api.kalender.externe.$get({ query: mitArchiv ? { archiv: '1' } : {} }),
      )) as ExterneDto[],
  });
}

export function useVorlagen(mitArchiv = false) {
  const api = useApi();
  return useQuery({
    queryKey: kalenderKeys.vorlagen(mitArchiv),
    queryFn: async () =>
      (await unwrap(
        await api.kalender.vorlagen.$get({ query: mitArchiv ? { archiv: '1' } : {} }),
      )) as VorlageDto[],
  });
}

export function useKalenderStatistik(jahr: number) {
  const api = useApi();
  return useQuery({
    queryKey: kalenderKeys.statistik(jahr),
    queryFn: async () =>
      (await unwrap(
        await api.kalender.statistik.$get({ query: { jahr: String(jahr) } }),
      )) as StatistikDto,
  });
}

/** Whether the caller already has a calendar feed token (the token itself is only shown once). */
export function useKalenderToken() {
  const api = useApi();
  return useQuery({
    queryKey: kalenderKeys.token,
    queryFn: async () => (await unwrap(await api.me['kalender-token'].$get())).vorhanden,
  });
}

/** Global "Dienste fehlen" reminders (minutes before the event begin, sorted descending). */
export function useErinnerungen() {
  const api = useApi();
  return useQuery({
    queryKey: kalenderKeys.erinnerungen,
    queryFn: async () => (await unwrap(await api.kalender.erinnerungen.$get())) as ErinnerungenDto,
  });
}

/** All event series with the number of their future events. */
export function useSerien() {
  const api = useApi();
  return useQuery({
    queryKey: kalenderKeys.serien,
    queryFn: async () => (await unwrap(await api.kalender.serien.$get())) as SerieListeDto[],
  });
}
