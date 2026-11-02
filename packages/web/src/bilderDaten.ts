import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { BilderListeDto, OneDriveStatusDto } from '@c4/shared';
import { unwrap, useApi } from './api';

/** Every Bilder query lives under this key, so one invalidation refreshes the whole area. */
export const BILDER_KEY = 'bilder';

export const bilderInvalidieren = (qc: QueryClient) =>
  qc.invalidateQueries({ queryKey: [BILDER_KEY] });

/** The OneDrive photo folders (empty with `verbunden: false` while OneDrive is not connected). */
export function useBilderOrdner() {
  const api = useApi();
  return useQuery({
    queryKey: [BILDER_KEY, 'ordner'],
    queryFn: async () => (await unwrap(await api.bilder.ordner.$get())) as BilderListeDto,
  });
}

/** Connection status of OneDrive (admins only). */
export function useOneDriveStatus(enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: [BILDER_KEY, 'verbindung'],
    enabled,
    queryFn: async () => (await unwrap(await api.bilder.verbindung.$get())) as OneDriveStatusDto,
  });
}
