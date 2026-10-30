import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  eventTitel,
  type DienstformDto,
  type ErinnerungenDto,
  type EventDto,
  type EventKategorieDto,
  type ExterneDto,
  type SerieListeDto,
  type StatistikDto,
  type VorlageDto,
} from '@c4/shared';
import { unwrap, useApi } from './api';

/** Every Kalender query lives under this key, so one invalidation refreshes the whole area. */
export const KALENDER_KEY = 'kalender';

export const kalenderInvalidieren = (qc: QueryClient) =>
  qc.invalidateQueries({ queryKey: [KALENDER_KEY] });

/** Events overlapping the date range `von`..`bis` (`YYYY-MM-DD`, inclusive). */
export function useKalenderEvents(von: string, bis: string) {
  const api = useApi();
  return useQuery({
    queryKey: [KALENDER_KEY, 'events', von, bis],
    queryFn: async () =>
      (await unwrap(await api.kalender.events.$get({ query: { von, bis } }))) as EventDto[],
  });
}

export function useKalenderEvent(id: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: [KALENDER_KEY, 'event', id],
    enabled: id !== undefined,
    queryFn: async () =>
      (await unwrap(await api.kalender.events[':id'].$get({ param: { id: id! } }))) as EventDto,
  });
}

/** Dienstformen including archived ones (old events still show them); active ones via `aktive`. */
export function useDienstformen() {
  const api = useApi();
  const q = useQuery({
    queryKey: [KALENDER_KEY, 'dienstformen'],
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
    queryKey: [KALENDER_KEY, 'kategorien'],
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
    queryKey: [KALENDER_KEY, 'externe', mitArchiv],
    queryFn: async () =>
      (await unwrap(
        await api.kalender.externe.$get({ query: mitArchiv ? { archiv: '1' } : {} }),
      )) as ExterneDto[],
  });
}

export function useVorlagen(mitArchiv = false) {
  const api = useApi();
  return useQuery({
    queryKey: [KALENDER_KEY, 'vorlagen', mitArchiv],
    queryFn: async () =>
      (await unwrap(
        await api.kalender.vorlagen.$get({ query: mitArchiv ? { archiv: '1' } : {} }),
      )) as VorlageDto[],
  });
}

export function useKalenderStatistik(jahr: number) {
  const api = useApi();
  return useQuery({
    queryKey: [KALENDER_KEY, 'statistik', jahr],
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
    queryKey: [KALENDER_KEY, 'token'],
    queryFn: async () => (await unwrap(await api.me['kalender-token'].$get())).vorhanden,
  });
}

/** Global "Dienste fehlen" reminders (minutes before the event begin, sorted descending). */
export function useErinnerungen() {
  const api = useApi();
  return useQuery({
    queryKey: [KALENDER_KEY, 'erinnerungen'],
    queryFn: async () => (await unwrap(await api.kalender.erinnerungen.$get())) as ErinnerungenDto,
  });
}

/** All event series with the number of their future events. */
export function useSerien() {
  const api = useApi();
  return useQuery({
    queryKey: [KALENDER_KEY, 'serien'],
    queryFn: async () => (await unwrap(await api.kalender.serien.$get())) as SerieListeDto[],
  });
}
