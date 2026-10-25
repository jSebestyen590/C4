import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Bestandsposten, MhdArt } from '@c4/shared';
import { unwrap, useApi } from './api';
import type { GebindeEintrag } from './GebindeFormular';
import type { LagerKnoten } from './LagerBaum';

/** A Ware as returned by `GET /waren`: master data plus the current stock. */
export interface WareEintrag {
  id: string;
  name: string;
  warengruppeId: string;
  mhdArt: MhdArt;
  archiviert: boolean;
  aliase: string[];
  gebindeIds: string[];
  bestand: Bestandsposten[];
  fruehestesMhd: string | null;
}

export interface WarengruppeEintrag {
  id: string;
  parentId: string | null;
  name: string;
  archiviert: boolean;
}

/** Lagerorte, Warengruppen and Gebinde including archived ones (filter client side). */
export function useWarenStammdaten() {
  const api = useApi();
  const lagerorte = useQuery({
    queryKey: ['lagerorte', 'alle'],
    queryFn: async () => unwrap(await api.lagerorte.$get({ query: { archiv: '1' } })),
  });
  const warengruppen = useQuery({
    queryKey: ['warengruppen', 'alle'],
    queryFn: async () => unwrap(await api.warengruppen.$get({ query: { archiv: '1' } })),
  });
  const gebinde = useQuery({
    queryKey: ['gebinde', 'alle'],
    queryFn: async () => unwrap(await api.gebinde.$get({ query: { archiv: '1' } })),
  });
  return {
    lagerorte: useMemo<LagerKnoten[]>(() => lagerorte.data ?? [], [lagerorte.data]),
    warengruppen: useMemo<WarengruppeEintrag[]>(() => warengruppen.data ?? [], [warengruppen.data]),
    gebinde: useMemo<GebindeEintrag[]>(() => gebinde.data ?? [], [gebinde.data]),
    laedt: lagerorte.isPending || warengruppen.isPending || gebinde.isPending,
    fehler: lagerorte.isError || warengruppen.isError || gebinde.isError,
  };
}
