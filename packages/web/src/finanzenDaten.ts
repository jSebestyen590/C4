import { useQuery } from '@tanstack/react-query';
import { centAnzeigen, type KontoDto } from '@c4/shared';
import { unwrap, useApi } from './api';
import { pruefen } from './warenApi';

/** Prefix of all Finanzen queries; invalidate it after any change. */
export const FINANZEN_KEY = ['finanzen'] as const;

/** Chart of accounts; with `archiviert` also the archived accounts. */
export function useKonten(archiviert: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: [...FINANZEN_KEY, 'konten', { archiviert }],
    queryFn: async () =>
      unwrap(await api.finanzen.konten.$get({ query: archiviert ? { archiviert: '1' } : {} })),
  });
}

/** Amount with an explicit sign: `+12,50 €` / `-12,50 €`. */
export const betragMitVorzeichen = (cent: number): string =>
  `${cent > 0 ? '+' : ''}${centAnzeigen(cent)}`;

/** Parses the JSON body after checking the status; throws an `ApiFehler` with the API's German text. */
export async function jsonOderFehler<T>(res: {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}): Promise<T> {
  await pruefen(res);
  return (await res.json()) as T;
}

/** Konto id -> its name, for options and labels. */
export const kontoOptionen = (konten: readonly KontoDto[]) =>
  konten.map((k) => ({ value: k.id, label: k.name }));

export const detailPfad = (id: string) => `/finanzen/journal/${encodeURIComponent(id)}`;
