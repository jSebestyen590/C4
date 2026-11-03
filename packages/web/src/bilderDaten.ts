import { useEffect } from 'react';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { BilderListeDto, OneDriveStatusDto } from '@c4/shared';
import { unwrap, useApi } from './api';

/** Every Bilder query lives under this key, so one invalidation refreshes the whole area. */
export const BILDER_KEY = 'bilder';

export const bilderInvalidieren = (qc: QueryClient) =>
  qc.invalidateQueries({ queryKey: [BILDER_KEY] });

const LOKAL_KEY = 'c4.bilder.liste';

/** Last list of this device (per-viewer convenience; storage may be missing or blocked). */
function lokaleListe(): BilderListeDto | undefined {
  try {
    const roh = localStorage.getItem(LOKAL_KEY);
    const liste = roh ? (JSON.parse(roh) as BilderListeDto) : undefined;
    return liste && Array.isArray(liste.ordner) ? liste : undefined;
  } catch {
    return undefined;
  }
}

function lokalSpeichern(liste: BilderListeDto) {
  try {
    localStorage.setItem(LOKAL_KEY, JSON.stringify(liste));
  } catch {
    // Not available (private window, quota): the server snapshot still works.
  }
}

/**
 * The OneDrive photo folders (empty with `verbunden: false` while OneDrive is not connected). Two requests:
 * the stored snapshot (`quelle=cache`, fast) and the live list from OneDrive (slow). The live list wins as
 * soon as it is there; until then the snapshot (or the list last seen on this device) is shown.
 */
export function useBilderOrdner() {
  const api = useApi();
  const cache = useQuery({
    queryKey: [BILDER_KEY, 'ordner', 'cache'],
    staleTime: 60_000,
    initialData: lokaleListe,
    initialDataUpdatedAt: 0,
    queryFn: async () =>
      (await unwrap(
        await api.bilder.ordner.$get({ query: { quelle: 'cache' } }),
      )) as BilderListeDto,
  });
  const live = useQuery({
    queryKey: [BILDER_KEY, 'ordner', 'live'],
    staleTime: 30_000,
    queryFn: async () =>
      (await unwrap(await api.bilder.ordner.$get({ query: {} }))) as BilderListeDto,
  });
  const daten = live.data ?? cache.data;
  useEffect(() => {
    if (daten?.verbunden && daten.stand) lokalSpeichern(daten);
  }, [daten]);
  return {
    daten,
    /** True while the shown list is a snapshot, not yet the live list. */
    ausCache: !live.data && !!cache.data,
    /** The live list is loading (a list may already be shown). */
    aktualisiert: live.isFetching,
    /** The live request failed. */
    aktualisierenFehlgeschlagen: live.isError && !live.data,
    /** Nothing to show yet: neither snapshot nor live list. */
    laedt: !daten && (live.isPending || cache.isPending),
    fehler: !daten && live.isError && cache.isError,
  };
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
