import { useQuery } from '@tanstack/react-query';
import { centAnzeigen, type KontoDto } from '@c4/shared';
import { unwrap, useApi } from './api';
import { pruefen } from './warenApi';

/** Prefix of all Finanzen queries; invalidate it after any change. */
export const finanzenKeys = {
  alle: ['finanzen'] as const,
  konten: (filter: { archiviert: boolean }) => ['finanzen', 'konten', filter] as const,
  bargeld: ['finanzen', 'bargeld'] as const,
  zaehlungen: (filter: { kontoId: string | null }) => ['finanzen', 'zaehlungen', filter] as const,
  buchungen: (filter: Record<string, unknown>) => ['finanzen', 'buchungen', filter] as const,
  buchung: (id: string | undefined) => ['finanzen', 'buchung', id] as const,
  zaehlung: (id: string | undefined) => ['finanzen', 'zaehlung', id] as const,
  kassen: (filter: { archiviert: boolean }) => ['finanzen', 'kassen', filter] as const,
  kassenabrechnungen: (filter: { kontoId: string | null }) =>
    ['finanzen', 'kassenabrechnungen', filter] as const,
  kassenabrechnung: (id: string | undefined) => ['finanzen', 'kassenabrechnung', id] as const,
  kassenAbrechnungVorschau: (kontoId: string | undefined) =>
    ['finanzen', 'kassenAbrechnungVorschau', kontoId] as const,
};

/** Key of the Dienst-Zählungen of an event (members without a Finanzen right read them, too). */
export const kassenzaehlungenKey = (eventId: string | undefined) =>
  ['kassen', 'zaehlungen', eventId] as const;
/** Key of the Kassen a member may count. */
export const kassenKurzKey = ['kassen', 'kurz'] as const;

/** Chart of accounts; with `archiviert` also the archived accounts. */
export function useKonten(archiviert: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: finanzenKeys.konten({ archiviert }),
    queryFn: async () =>
      unwrap(await api.finanzen.konten.$get({ query: archiviert ? { archiviert: '1' } : {} })),
  });
}

/** The Fächer of the Safe with their stock. */
export function useBargeld() {
  const api = useApi();
  return useQuery({
    queryKey: finanzenKeys.bargeld,
    queryFn: async () => unwrap(await api.finanzen.bargeld.$get()),
  });
}

/** Zählungen, newest first; optionally of one Fach. */
export function useZaehlungen(kontoId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: finanzenKeys.zaehlungen({ kontoId }),
    queryFn: async () =>
      unwrap(await api.finanzen.zaehlungen.$get({ query: kontoId ? { kontoId } : {} })),
  });
}

/** The Kassen with stock; with `archiviert` also the archived ones. */
export function useKassen(archiviert: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: finanzenKeys.kassen({ archiviert }),
    queryFn: async () =>
      unwrap(await api.finanzen.kassen.$get({ query: archiviert ? { archiviert: '1' } : {} })),
  });
}

/** Kassenabrechnungen, newest first; optionally of one Kasse. */
export function useKassenabrechnungen(kontoId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: finanzenKeys.kassenabrechnungen({ kontoId }),
    queryFn: async () =>
      unwrap(await api.finanzen.kassenabrechnungen.$get({ query: kontoId ? { kontoId } : {} })),
  });
}

export function useKassenabrechnung(id: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: finanzenKeys.kassenabrechnung(id),
    enabled: !!id,
    queryFn: async () =>
      unwrap(await api.finanzen.kassenabrechnungen[':id'].$get({ param: { id: id! } })),
  });
}

/** Stock, master data and open Dienst-Zählungen of a Kasse for the Abrechnung. */
export function useKassenAbrechnungVorschau(kontoId: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: finanzenKeys.kassenAbrechnungVorschau(kontoId),
    enabled: !!kontoId,
    queryFn: async () =>
      unwrap(
        await api.finanzen.kassen[':kontoId'].abrechnung.$get({ param: { kontoId: kontoId! } }),
      ),
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

export const kassenabrechnungPfad = (id: string) =>
  `/finanzen/kassen/abrechnungen/${encodeURIComponent(id)}`;
