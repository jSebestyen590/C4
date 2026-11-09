import { useQuery, type QueryClient } from '@tanstack/react-query';
import type {
  PrivatpartyDetailDto,
  PrivatpartyListeDto,
  PrivatpartyMailStatusDto,
  PrivatpartyPersonDetailDto,
  PrivatpartyPersonDto,
  PrivatpartyStatus,
  PrivatpartyTerminDto,
} from '@c4/shared';
import { datumAnzeigen, privatpartyZeitText } from '@c4/shared';
import { unwrap, useApi } from './api';

/** Every Privatparty query lives under this key, so one invalidation refreshes the whole area. */
export const PRIVATPARTYS_KEY = 'privatpartys';

export const privatpartysInvalidieren = (qc: QueryClient) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: [PRIVATPARTYS_KEY] }),
    // Accepting creates and cancelling deletes events; the poll is created and ended.
    qc.invalidateQueries({ queryKey: ['kalender'] }),
    qc.invalidateQueries({ queryKey: ['umfragen'] }),
  ]);

export const privatpartyLink = (id: string) => `/privatpartys/${encodeURIComponent(id)}`;
export const privatpartyPersonLink = (id: string) =>
  `/privatpartys/personen/${encodeURIComponent(id)}`;

/** The list filter; "alle" shows every status. */
export type PrivatpartyFilter = PrivatpartyStatus | 'alle';

export function usePrivatpartys(status: PrivatpartyFilter) {
  const api = useApi();
  return useQuery({
    queryKey: [PRIVATPARTYS_KEY, 'liste', status],
    queryFn: async () =>
      (await unwrap(await api.privatpartys.$get({ query: { status } }))) as PrivatpartyListeDto[],
  });
}

export function usePrivatparty(id: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: [PRIVATPARTYS_KEY, 'detail', id],
    enabled: !!id,
    queryFn: async () =>
      (await unwrap(
        await api.privatpartys[':id'].$get({ param: { id: id! } }),
      )) as PrivatpartyDetailDto,
  });
}

export function usePrivatpartyPersonen() {
  const api = useApi();
  return useQuery({
    queryKey: [PRIVATPARTYS_KEY, 'personen'],
    queryFn: async () =>
      (await unwrap(await api.privatpartys.personen.$get())) as PrivatpartyPersonDto[],
  });
}

export function usePrivatpartyPerson(id: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: [PRIVATPARTYS_KEY, 'person', id],
    enabled: !!id,
    queryFn: async () =>
      (await unwrap(
        await api.privatpartys.personen[':id'].$get({ param: { id: id! } }),
      )) as PrivatpartyPersonDetailDto,
  });
}

const wochentagFormat = new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: 'UTC' });

/** "Sa, 14.03.2026" for a date `YYYY-MM-DD`. */
export const wunschTagText = (datum: string): string =>
  `${wochentagFormat.format(new Date(`${datum}T12:00:00Z`)).replace('.', '')}, ${datumAnzeigen(datum)}`;

/** "Sa, 14.03.2026, 19:00–02:00" */
export const wunschTerminText = (t: Pick<PrivatpartyTerminDto, 'datum' | 'beginn' | 'ende'>) =>
  `${wunschTagText(t.datum)}, ${privatpartyZeitText(t)}`;

export function usePrivatpartyMailStatus() {
  const api = useApi();
  return useQuery({
    queryKey: [PRIVATPARTYS_KEY, 'mail-status'],
    queryFn: async () =>
      (await unwrap(await api.privatpartys['mail-status'].$get())) as PrivatpartyMailStatusDto,
  });
}
