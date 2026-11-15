import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { unwrap, useApi } from './api';
import type { WareInfo } from './inventurDaten';
import type { BestandsZeile } from './lagerBestand';
import { useWarenStammdaten } from './warenDaten';
import { lagerortKeys, lagerortWarenKeys, warenKeys } from './warenDaten';

/**
 * Everything the stock pages need: Lagerorte and Gebinde (with archived), all wares, the current
 * stock of every node and the Warenlisten (ordered ware ids per node).
 */
export function useLagerBestand() {
  const api = useApi();
  const stamm = useWarenStammdaten();
  const bestand = useQuery({
    queryKey: lagerortKeys.bestand,
    queryFn: async (): Promise<BestandsZeile[]> => unwrap(await api.lagerorte.bestand.$get()),
  });
  const listen = useQuery({
    queryKey: lagerortWarenKeys.liste,
    queryFn: async () => unwrap(await api.lagerorte.warenlisten.$get()),
  });
  const katalog = useQuery({
    queryKey: warenKeys.liste(true),
    queryFn: async () => unwrap(await api.waren.$get({ query: { archiv: '1' } })),
  });

  const waren = useMemo(
    () => new Map<string, WareInfo>((katalog.data ?? []).map((w) => [w.id, w])),
    [katalog.data],
  );
  const warenlisten = useMemo(
    () => new Map((listen.data ?? []).map((l) => [l.lagerortId, l.wareIds])),
    [listen.data],
  );

  return {
    lagerorte: stamm.lagerorte,
    gebinde: stamm.gebinde,
    katalog: useMemo<WareInfo[]>(() => katalog.data ?? [], [katalog.data]),
    waren,
    warenlisten,
    bestand: useMemo(() => bestand.data ?? [], [bestand.data]),
    bestandGeladen: bestand.isSuccess && listen.isSuccess && katalog.isSuccess,
    laedt: stamm.laedt || bestand.isPending || listen.isPending || katalog.isPending,
    fehler: stamm.fehler || bestand.isError || listen.isError || katalog.isError,
  };
}
