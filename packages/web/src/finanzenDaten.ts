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

/** The Fächer of the Safe with their stock. */
export function useBargeld() {
  const api = useApi();
  return useQuery({
    queryKey: [...FINANZEN_KEY, 'bargeld'],
    queryFn: async () => unwrap(await api.finanzen.bargeld.$get()),
  });
}

/** Zählungen, newest first; optionally of one Fach. */
export function useZaehlungen(kontoId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: [...FINANZEN_KEY, 'zaehlungen', { kontoId }],
    queryFn: async () =>
      unwrap(await api.finanzen.zaehlungen.$get({ query: kontoId ? { kontoId } : {} })),
  });
}

/** Style for amounts: right-aligned digits of equal width, never wrapped. */
export const BETRAG_STIL = {
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
} as const;

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

export const zaehlungPfad = (id: string) =>
  `/finanzen/bargeld/zaehlungen/${encodeURIComponent(id)}`;

/** Difference of a Zählung with sign, e.g. `−2,00 €`; `keine` when it is 0. */
export const differenzText = (cent: number) =>
  cent === 0 ? 'keine' : `${cent > 0 ? '+' : '−'}${centAnzeigen(Math.abs(cent))}`;
