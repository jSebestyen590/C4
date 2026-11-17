import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Anrede, IfcoGrundflaeche, MitgliedStatus } from '@c4/shared';
import { unwrap, useApi } from './api';
import type { LagerKnoten } from './LagerBaum';
import { lagerortKeys } from './warenDaten';

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
  /** Pieces built in for good at a free-text Ort; they are on no Platz and cannot be lent. */
  verbaut: { id: string; ort: string; anzahl: number }[];
  /** Total open amount that is away now. */
  verliehen: number;
  /** Total open amount of Ausleihen starting in the future. */
  vorgemerkt: number;
  /** Id of the parent when this Gegenstand is a part ("Teil"), else null. */
  teilVon: string | null;
  /** Virtual: has an amount but no Plätze; it exists only through its parts. */
  virtuell: boolean;
  /** Pieces of this part per piece of its parent (parts only). */
  anzahlJe: number | null;
}

/** An IFCO type as returned by `GET /inventar/ifco-typen`. */
export interface IfcoTypEintrag {
  id: string;
  name: string;
  grundflaeche: IfcoGrundflaeche;
  hoeheCm: number;
  archiviert: boolean;
}

/** The open Ausleihe that lends a whole IFCO. */
export interface IfcoAusleiheEintrag {
  id: string;
  an: string;
  /** `geplant` = starts in the future (vorgemerkt), `verliehen` = away now. */
  status: 'geplant' | 'verliehen';
  /** ISO timestamp. */
  ausgeliehenAm: string;
}

/** An IFCO as returned by `GET /inventar/ifcos`: master data plus its content. */
export interface IfcoEintrag {
  id: string;
  name: string;
  beschreibung: string | null;
  lagerortId: string | null;
  archiviert: boolean;
  /** IFCO type; null = none (not allowed on an IFCO-Lagerplatz). */
  typId: string | null;
  inhalt: { gegenstandId: string; anzahl: number }[];
  /** Open whole-IFCO Ausleihe, or null. */
  ausleihe: IfcoAusleiheEintrag | null;
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
  /** True when the position belongs to lending a whole IFCO. */
  ganzeIfco: boolean | null;
}

/** The Mitglied who organised an Ausleihe. */
export interface OrganisatorEintrag {
  sub: string;
  /** Cognito username; null while the member has none. */
  username: string | null;
  vorname: string;
  nachname: string;
  status: MitgliedStatus;
  anrede: Anrede;
}

/** An Ausleihe as returned by `GET /inventar/ausleihen`. */
export interface AusleiheEintrag {
  id: string;
  an: string;
  /** ISO timestamp. */
  ausgeliehenAm: string;
  /** `YYYY-MM-DD`; required for new Ausleihen, null on older ones (then open-ended). */
  rueckgabeGeplant: string | null;
  kommentar: string | null;
  /** Cognito sub of the organising Mitglied (null on older Ausleihen). */
  organisiertVon: string | null;
  /** Organising Mitglied; null if unknown. */
  organisator: OrganisatorEintrag | null;
  /** True when every Position was returned. */
  erledigt: boolean;
  /** `geplant` = starts in the future (vorgemerkt), `verliehen` = away now, `erledigt` = all back. */
  status: 'geplant' | 'verliehen' | 'erledigt';
  positionen: AusleihePositionEintrag[];
  /** Overdue Ausleihen that endanger this not yet started one ("gefährdet"); usually empty. */
  gefaehrdetDurch: { id: string; an: string }[];
}

/** An IFCO marked as done in the running Aufräumaktion. */
export interface AufraeumFertigEintrag {
  ifcoId: string;
  /** ISO timestamp. */
  fertigAm: string;
  von: OrganisatorEintrag | null;
}

/** The running Aufräumaktion as returned by `GET /inventar/aufraeumen`. */
export interface AufraeumEintrag {
  id: string;
  /** ISO timestamp. */
  gestartetAm: string;
  gestartetVon: OrganisatorEintrag | null;
  fertig: AufraeumFertigEintrag[];
}

/** Query key prefix of everything below Inventar; invalidate it after a mutation. */
export const inventarKeys = {
  alle: ['inventar'] as const,
  ifcoTypen: ['inventar', 'ifco-typen'] as const,
  gegenstaende: ['inventar', 'gegenstaende'] as const,
  ifcos: ['inventar', 'ifcos'] as const,
  ifcosAktiv: ['inventar', 'ifcos', 'aktiv'] as const,
  ausleihen: (nurOffen: boolean) => ['inventar', 'ausleihen', nurOffen ? 'offen' : 'alle'] as const,
  ausleihe: (id: string | undefined) => ['inventar', 'ausleihen', 'eine', id] as const,
  kategorien: ['inventar', 'kategorien'] as const,
  /** The running Aufräumaktion (below `alle`). */
  aufraeumen: ['inventar', 'aufraeumen'] as const,
  bewegungen: (gegenstandId: string) => ['inventar', 'bewegungen', gegenstandId] as const,
};

/** IFCO types including archived ones; only fetched when `enabled`. */
export function useIfcoTypen(enabled = true) {
  const api = useApi();
  const q = useQuery({
    queryKey: inventarKeys.ifcoTypen,
    queryFn: async () => unwrap(await api.inventar['ifco-typen'].$get({ query: { archiv: '1' } })),
    enabled,
  });
  return {
    typen: useMemo<IfcoTypEintrag[]>(() => q.data ?? [], [q.data]),
    laedt: q.isPending,
    fehler: q.isError,
    geladen: q.isSuccess,
  };
}

/** Gegenstände and IFCOs incl. archived ones, e.g. for the Lager page; only fetched when `enabled`. */
export function useGegenstaendeUndIfcos(enabled = true) {
  const api = useApi();
  const gegenstaende = useQuery({
    queryKey: inventarKeys.gegenstaende,
    queryFn: async () => unwrap(await api.inventar.gegenstaende.$get({ query: { archiv: '1' } })),
    enabled,
  });
  const ifcos = useQuery({
    queryKey: inventarKeys.ifcos,
    queryFn: async () => unwrap(await api.inventar.ifcos.$get({ query: { archiv: '1' } })),
    enabled,
  });
  const typen = useIfcoTypen(enabled);
  return {
    gegenstaende: useMemo<GegenstandEintrag[]>(() => gegenstaende.data ?? [], [gegenstaende.data]),
    ifcos: useMemo<IfcoEintrag[]>(() => ifcos.data ?? [], [ifcos.data]),
    typen: typen.typen,
    geladen: gegenstaende.isSuccess && ifcos.isSuccess && typen.geladen,
  };
}

/**
 * Ids of the places where (non-archived) IFCOs stand: no Waren can be booked there. Empty while
 * loading or when the IFCOs cannot be read (the API still rejects such bookings).
 */
export function useOrteMitIfcos() {
  const api = useApi();
  const q = useQuery({
    queryKey: inventarKeys.ifcosAktiv,
    queryFn: async () => unwrap(await api.inventar.ifcos.$get({ query: {} })),
    retry: false,
  });
  return {
    orte: useMemo(
      () => new Set((q.data ?? []).flatMap((i) => (i.lagerortId ? [i.lagerortId] : []))),
      [q.data],
    ),
    laedt: q.isPending,
  };
}

/** All Ausleihen (newest first), or only the open ones. */
export function useAusleihen(nurOffen: boolean) {
  const api = useApi();
  const q = useQuery({
    queryKey: inventarKeys.ausleihen(nurOffen),
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
export function useAusleihe(id: string, aktiv = true) {
  const api = useApi();
  const q = useQuery({
    queryKey: inventarKeys.ausleihe(id),
    enabled: aktiv,
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

/** Lagerorte, Kategorien, Gegenstände and IFCOs including archived ones (filter client side). */
export function useInventar() {
  const api = useApi();
  const lagerorte = useQuery({
    queryKey: lagerortKeys.liste,
    queryFn: async () => unwrap(await api.lagerorte.$get({ query: { archiv: '1' } })),
  });
  const kategorien = useQuery({
    queryKey: inventarKeys.kategorien,
    queryFn: async () => unwrap(await api.inventar.kategorien.$get({ query: { archiv: '1' } })),
  });
  const gegenstaende = useQuery({
    queryKey: inventarKeys.gegenstaende,
    queryFn: async () => unwrap(await api.inventar.gegenstaende.$get({ query: { archiv: '1' } })),
  });
  const ifcos = useQuery({
    queryKey: inventarKeys.ifcos,
    queryFn: async () => unwrap(await api.inventar.ifcos.$get({ query: { archiv: '1' } })),
  });
  const typen = useIfcoTypen();
  return {
    lagerorte: useMemo<LagerKnoten[]>(() => lagerorte.data ?? [], [lagerorte.data]),
    ifcoTypen: typen.typen,
    kategorien: useMemo<KategorieEintrag[]>(() => kategorien.data ?? [], [kategorien.data]),
    gegenstaende: useMemo<GegenstandEintrag[]>(() => gegenstaende.data ?? [], [gegenstaende.data]),
    ifcos: useMemo<IfcoEintrag[]>(() => ifcos.data ?? [], [ifcos.data]),
    laedt:
      lagerorte.isPending ||
      kategorien.isPending ||
      gegenstaende.isPending ||
      ifcos.isPending ||
      typen.laedt,
    fehler:
      lagerorte.isError ||
      kategorien.isError ||
      gegenstaende.isError ||
      ifcos.isError ||
      typen.fehler,
  };
}

/**
 * The running Aufräumaktion (null if none) and the done IFCOs by id. While one runs it is refetched
 * every 15 s, so everybody clearing up at the same time sees the others' progress.
 */
export function useAufraeumen() {
  const api = useApi();
  const q = useQuery({
    queryKey: inventarKeys.aufraeumen,
    queryFn: async (): Promise<AufraeumEintrag | null> =>
      (await unwrap(await api.inventar.aufraeumen.$get())).aktion,
    refetchInterval: (query) => (query.state.data ? 15_000 : false),
  });
  const aktion = q.data ?? null;
  return {
    aktion,
    fertig: useMemo(() => new Map((aktion?.fertig ?? []).map((f) => [f.ifcoId, f])), [aktion]),
    laedt: q.isPending,
  };
}

/** One Zugang or Abgang of a Gegenstand as returned by `GET /inventar/gegenstaende/:id/bewegungen`. */
export interface BewegungEintrag {
  id: string;
  art: 'zugang' | 'abgang';
  grund: string;
  anzahl: number;
  /** `YYYY-MM-DD`. */
  datum: string;
  kommentar: string | null;
  /** Display snapshot of the Platz the pieces went to or came from. */
  ort: string | null;
  ersteller: OrganisatorEintrag | null;
}

/** History of a Gegenstand, newest first. */
export function useBewegungen(gegenstandId: string) {
  const api = useApi();
  const q = useQuery({
    queryKey: inventarKeys.bewegungen(gegenstandId),
    queryFn: async (): Promise<BewegungEintrag[]> =>
      unwrap(
        await api.inventar.gegenstaende[':id'].bewegungen.$get({ param: { id: gegenstandId } }),
      ),
  });
  return { bewegungen: q.data ?? [], laedt: q.isPending, fehler: q.isError };
}
