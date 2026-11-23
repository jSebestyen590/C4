import { useQuery } from '@tanstack/react-query';
import { unwrap, useApi } from './api';
import { useAuth } from './auth';

export const lagerAbgleichKeys = {
  alle: ['lager-abgleich'] as const,
  liste: ['lager-abgleich', 'liste'] as const,
  ware: (id: string | undefined) => ['lager-abgleich', 'ware', id] as const,
};

export const lagerAbgleichPfad = (wareId?: string) =>
  wareId ? `/finanzen/lager-abgleich/${encodeURIComponent(wareId)}` : '/finanzen/lager-abgleich';

/** Reading the Abgleich needs either of these permissions. */
export function useAbgleichRechte() {
  const { can } = useAuth();
  return {
    lesen: can('finanzen:lesen') || can('waren:verwalten'),
    schreiben: can('finanzen:buchen') || can('waren:verwalten'),
  };
}

/** All Waren with Ist, Soll, Korrektur and Diskrepanz since the Stichtag. */
export function useLagerAbgleich(enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: lagerAbgleichKeys.liste,
    enabled,
    queryFn: async () => unwrap(await api['lager-abgleich'].$get()),
  });
}

export function useLagerAbgleichWare(id: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: lagerAbgleichKeys.ware(id),
    enabled: !!id,
    retry: false,
    queryFn: async () =>
      unwrap(await api['lager-abgleich'].waren[':id'].$get({ param: { id: id! } })),
  });
}
