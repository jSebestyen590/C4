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

/** An assignment of a Gegenstand to a place; `verliehen` is the open amount away now, `vorgemerkt` the reserved one (Ausleihe starts later). */
export interface PlatzEintrag {
  id: string;
  lagerortId: string | null;
  ifcoId: string | null;
  anzahl: number;
  verliehen: number;
  vorgemerkt: number;
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
  /** Total open amount that is away now. */
  verliehen: number;
  /** Total open amount of Ausleihen starting in the future. */
  vorgemerkt: number;
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

/** One Position of an Ausleihe: `anzahl` pieces of a Gegenstand taken from a place. */
export interface AusleihePositionEintrag {
  id: string;
  ausleiheId: string;
  gegenstandId: string;
  lagerortId: string | null;
  ifcoId: string | null;
  anzahl: number;
  /** ISO timestamp; null while the position is still lent out. */
  zurueckAm: string | null;
}

/** An Ausleihe as returned by `GET /inventar/ausleihen`. */
export interface AusleiheEintrag {
  id: string;
  an: string;
  /** ISO timestamp. */
  ausgeliehenAm: string;
  /** `YYYY-MM-DD` */
  rueckgabeGeplant: string | null;
  kommentar: string | null;
  /** True when every Position was returned. */
  erledigt: boolean;
  /** `geplant` = starts in the future (vorgemerkt), `verliehen` = away now, `erledigt` = all back. */
  status: 'geplant' | 'verliehen' | 'erledigt';
  positionen: AusleihePositionEintrag[];
}

/** Query key prefix of everything below Inventar; invalidate it after a mutation. */
export const INVENTAR_KEY = ['inventar'] as const;

/** Gegenstände and Ifcos incl. archived ones, e.g. for the Lager page; only fetched when `enabled`. */
export function useGegenstaendeUndIfcos(enabled = true) {
  const api = useApi();
  const gegenstaende = useQuery({
    queryKey: ['inventar', 'gegenstaende'],
    queryFn: async () => unwrap(await api.inventar.gegenstaende.$get({ query: { archiv: '1' } })),
    enabled,
  });
  const ifcos = useQuery({
    queryKey: ['inventar', 'ifcos'],
    queryFn: async () => unwrap(await api.inventar.ifcos.$get({ query: { archiv: '1' } })),
    enabled,
  });
  return {
    gegenstaende: useMemo<GegenstandEintrag[]>(() => gegenstaende.data ?? [], [gegenstaende.data]),
    ifcos: useMemo<IfcoEintrag[]>(() => ifcos.data ?? [], [ifcos.data]),
    geladen: gegenstaende.isSuccess && ifcos.isSuccess,
  };
}

/** All Ausleihen (newest first), or only the open ones. */
export function useAusleihen(nurOffen: boolean) {
  const api = useApi();
  const q = useQuery({
    queryKey: ['inventar', 'ausleihen', nurOffen ? 'offen' : 'alle'],
    queryFn: async () =>
      unwrap(await api.inventar.ausleihen.$get({ query: nurOffen ? { status: 'offen' } : {} })),
  });
  return {
    ausleihen: useMemo<AusleiheEintrag[]>(() => q.data ?? [], [q.data]),
    laedt: q.isPending,
    fehler: q.isError,
  };
}

/** One Ausleihe; `nichtGefunden` when the API answered 404. */
export function useAusleihe(id: string) {
  const api = useApi();
  const q = useQuery({
    queryKey: ['inventar', 'ausleihen', 'eine', id],
    queryFn: async () => {
      const res = await api.inventar.ausleihen[':id'].$get({ param: { id } });
      if (res.status === 404) return null;
      return unwrap(res);
    },
  });
  return {
    ausleihe: (q.data ?? null) as AusleiheEintrag | null,
    laedt: q.isPending,
    fehler: q.isError,
  };
}

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
