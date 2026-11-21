import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Bestandsposten, MhdArt } from '@c4/shared';
import { unwrap, useApi } from './api';
import type { GebindeEintrag } from './GebindeFormular';
import type { LagerKnoten } from './LagerBaum';

export const warenKeys = {
  alle: ['waren'] as const,
  liste: (archiv: boolean) => ['waren', { archiv }] as const,
  detail: (id: string | undefined) => ['waren', 'detail', id] as const,
  vorgaenge: (wareId: string) => ['waren', wareId, 'vorgaenge'] as const,
  verlauf: (wareId: string) => ['waren', wareId, 'verlauf'] as const,
};

export const lagerortKeys = {
  alle: ['lagerorte'] as const,
  liste: ['lagerorte', 'alle'] as const,
  bestand: ['lagerorte', 'bestand'] as const,
};

export const lagerortWarenKeys = {
  alle: ['lagerort-waren'] as const,
  liste: ['lagerort-waren', 'alle'] as const,
  eins: (lagerortId: string) => ['lagerort-waren', lagerortId] as const,
};

export const warengruppeKeys = {
  alle: ['warengruppen'] as const,
  liste: ['warengruppen', 'alle'] as const,
};

export const gebindeKeys = {
  alle: ['gebinde'] as const,
  liste: ['gebinde', 'alle'] as const,
};

/** A Ware as returned by `GET /waren`: master data plus the current stock. */
export interface WareEintrag {
  id: string;
  name: string;
  warengruppeId: string;
  mhdArt: MhdArt;
  archiviert: boolean;
  aliase: string[];
  gebindeIds: string[];
  standardGebindeId: string | null;
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
    queryKey: lagerortKeys.liste,
    queryFn: async () => unwrap(await api.lagerorte.$get({ query: { archiv: '1' } })),
  });
  const warengruppen = useQuery({
    queryKey: warengruppeKeys.liste,
    queryFn: async () => unwrap(await api.warengruppen.$get({ query: { archiv: '1' } })),
  });
  const gebinde = useQuery({
    queryKey: gebindeKeys.liste,
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
