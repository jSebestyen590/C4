import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { unwrap, useApi } from './api';
import type { LagerKnoten } from './LagerBaum';

export interface KategorieEintrag {
  id: string;
  parentId: string | null;
  name: string;
  archiviert: boolean;
}

/** An assignment of a Gegenstand to a place; `verliehen` is the open lent amount from there. */
export interface PlatzEintrag {
  id: string;
  lagerortId: string | null;
  ifcoId: string | null;
  anzahl: number;
  verliehen: number;
}

/** A Gegenstand as returned by `GET /inventar/gegenstaende`: master data plus its Plätze. */
export interface GegenstandEintrag {
  id: string;
  name: string;
  beschreibung: string | null;
  kategorieId: string;
  /** Target total. */
  anzahl: number;
  archiviert: boolean;
  plaetze: PlatzEintrag[];
  /** Total open lent amount. */
  verliehen: number;
}

/** An Ifco as returned by `GET /inventar/ifcos`: master data plus its content. */
export interface IfcoEintrag {
  id: string;
  name: string;
  beschreibung: string | null;
  lagerortId: string | null;
  archiviert: boolean;
  inhalt: { gegenstandId: string; anzahl: number }[];
}

/** Query key prefix of everything below Inventar; invalidate it after a mutation. */
export const INVENTAR_KEY = ['inventar'] as const;

/** Lagerorte, Kategorien, Gegenstände and Ifcos including archived ones (filter client side). */
export function useInventar() {
  const api = useApi();
  const lagerorte = useQuery({
    queryKey: ['lagerorte', 'alle'],
    queryFn: async () => unwrap(await api.lagerorte.$get({ query: { archiv: '1' } })),
  });
  const kategorien = useQuery({
    queryKey: ['inventar', 'kategorien'],
    queryFn: async () => unwrap(await api.inventar.kategorien.$get({ query: { archiv: '1' } })),
  });
  const gegenstaende = useQuery({
    queryKey: ['inventar', 'gegenstaende'],
    queryFn: async () => unwrap(await api.inventar.gegenstaende.$get({ query: { archiv: '1' } })),
  });
  const ifcos = useQuery({
    queryKey: ['inventar', 'ifcos'],
    queryFn: async () => unwrap(await api.inventar.ifcos.$get({ query: { archiv: '1' } })),
  });
  return {
    lagerorte: useMemo<LagerKnoten[]>(() => lagerorte.data ?? [], [lagerorte.data]),
    kategorien: useMemo<KategorieEintrag[]>(() => kategorien.data ?? [], [kategorien.data]),
    gegenstaende: useMemo<GegenstandEintrag[]>(() => gegenstaende.data ?? [], [gegenstaende.data]),
    ifcos: useMemo<IfcoEintrag[]>(() => ifcos.data ?? [], [ifcos.data]),
    laedt: lagerorte.isPending || kategorien.isPending || gegenstaende.isPending || ifcos.isPending,
    fehler: lagerorte.isError || kategorien.isError || gegenstaende.isError || ifcos.isError,
  };
}
