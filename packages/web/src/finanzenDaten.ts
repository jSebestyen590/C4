import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  centAnzeigen,
  type AuswertungIntervall,
  type KontoDto,
  type SteuersatzArt,
  type SteuersatzZeitraumEingabe,
} from '@c4/shared';
import { unwrap, useApi } from './api';
import { pruefen } from './warenApi';

/** Prefix of all Finanzen queries; invalidate it after any change. */
export const finanzenKeys = {
  alle: ['finanzen'] as const,
  festschreibungen: ['finanzen', 'festschreibungen'] as const,
  datenexporte: ['finanzen', 'datenexporte'] as const,
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
  rechnungssteller: (filter: { archiviert: boolean }) =>
    ['finanzen', 'rechnungssteller', filter] as const,
  belege: (filter: Record<string, unknown>) => ['finanzen', 'belege', filter] as const,
  beleg: (id: string | undefined) => ['finanzen', 'beleg', id] as const,
  belegEntwurf: (id: string | undefined) => ['finanzen', 'belegEntwurf', id] as const,
  auslagen: ['finanzen', 'auslagen'] as const,
  einreichungen: ['finanzen', 'einreichungen'] as const,
  einreichungAuswahl: ['finanzen', 'einreichungAuswahl'] as const,
  einreichung: (id: string | undefined) => ['finanzen', 'einreichung', id] as const,
  belegWaren: ['finanzen', 'belegWaren'] as const,
  artikelVorschlaege: ['finanzen', 'artikelVorschlaege'] as const,
  artikel: ['finanzen', 'artikel'] as const,
  steuersatzZeitraeume: ['finanzen', 'steuersatzZeitraeume'] as const,
  warengruppenKategorien: ['finanzen', 'warengruppenKategorien'] as const,
  rechnungEinstellungen: ['finanzen', 'rechnungEinstellungen'] as const,
  rechnungsempfaenger: (filter: { archiviert: boolean }) =>
    ['finanzen', 'rechnungsempfaenger', filter] as const,
  rechnungen: (filter: Record<string, unknown>) => ['finanzen', 'rechnungen', filter] as const,
  rechnung: (id: string | undefined) => ['finanzen', 'rechnung', id] as const,
  rechnungEntwurf: (id: string | undefined) => ['finanzen', 'rechnungEntwurf', id] as const,
  sumup: ['finanzen', 'sumup'] as const,
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

/** SumUp overview: open payment groups, events for the picker, payouts, last fetch and balance. */
export function useSumup() {
  const api = useApi();
  return useQuery({
    queryKey: finanzenKeys.sumup,
    queryFn: async () => unwrap(await api.finanzen.sumup.$get()),
  });
}

/** Festschreibungen (closed months) with the next month to close; shared by all pages with booking dates. */
export function useFestschreibungen(enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: finanzenKeys.festschreibungen,
    enabled,
    queryFn: async () => unwrap(await api.finanzen.festschreibungen.$get()),
  });
}

/** Rechnungssteller; with `archiviert` also the archived ones. */
export function useRechnungssteller(archiviert: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: finanzenKeys.rechnungssteller({ archiviert }),
    queryFn: async () =>
      unwrap(
        await api.finanzen.rechnungssteller.$get({ query: archiviert ? { archiviert: '1' } : {} }),
      ),
  });
}

/** Waren a Ware item can pick (with Gebinde, Pfand and the suggested Kategorie). */
export function useBelegWaren(enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: finanzenKeys.belegWaren,
    enabled,
    queryFn: async () => unwrap(await api.finanzen['beleg-waren'].$get()),
  });
}

/** Artikel names booked on Kategorie items with the Kategorien used (for the Artikel -> Kategorie suggestion). */
export function useArtikelVorschlaege(enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: finanzenKeys.artikelVorschlaege,
    enabled,
    queryFn: async () => unwrap(await api.finanzen['artikel-vorschlaege'].$get()),
  });
}

/** Warengruppen with their own and their effective Kategorie. */
export function useWarengruppenKategorien() {
  const api = useApi();
  return useQuery({
    queryKey: finanzenKeys.warengruppenKategorien,
    queryFn: async () => unwrap(await api.finanzen['warengruppen-kategorien'].$get()),
  });
}

/** Belege (drafts first) matching the filter; empty values are left out of the query. */
export function useBelege(filter: Record<string, string | null>) {
  const api = useApi();
  const query = Object.fromEntries(Object.entries(filter).filter(([, v]) => v)) as Record<
    string,
    string
  >;
  return useQuery({
    queryKey: finanzenKeys.belege(query),
    queryFn: async () => unwrap(await api.finanzen.belege.$get({ query })),
  });
}

export function useBeleg(id: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: finanzenKeys.beleg(id),
    enabled: !!id,
    queryFn: async () => unwrap(await api.finanzen.belege[':id'].$get({ param: { id: id! } })),
  });
}

/** Open Auslagen per member. */
export function useAuslagen() {
  const api = useApi();
  return useQuery({
    queryKey: finanzenKeys.auslagen,
    queryFn: async () => unwrap(await api.finanzen.auslagen.$get()),
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

export const belegPfad = (id: string) => `/finanzen/belege/${encodeURIComponent(id)}`;
export const belegEntwurfPfad = (id: string) =>
  `/finanzen/belege/entwurf/${encodeURIComponent(id)}`;

export const kassenabrechnungPfad = (id: string) =>
  `/finanzen/kassen/abrechnungen/${encodeURIComponent(id)}`;

export const rechnungenPfad = '/finanzen/rechnungen';
export const rechnungPfad = (id: string) => `/finanzen/rechnungen/${encodeURIComponent(id)}`;
export const rechnungEntwurfPfad = (id: string) =>
  `/finanzen/rechnungen/entwurf/${encodeURIComponent(id)}`;

/** The newest club data of the invoices (null while none were entered). */
export function useRechnungEinstellungen() {
  const api = useApi();
  return useQuery({
    queryKey: finanzenKeys.rechnungEinstellungen,
    queryFn: async () => unwrap(await api.finanzen['rechnung-einstellungen'].$get()),
  });
}

/** External Rechnungsempfänger; with `archiviert` also the archived ones. */
export function useRechnungsempfaenger(archiviert: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: finanzenKeys.rechnungsempfaenger({ archiviert }),
    queryFn: async () =>
      unwrap(
        await api.finanzen.rechnungsempfaenger.$get({
          query: archiviert ? { archiviert: '1' } : {},
        }),
      ),
  });
}

/** Rechnungen (drafts first) matching the filter; empty values are left out of the query. */
export function useRechnungen(filter: Record<string, string | null>) {
  const api = useApi();
  const query = Object.fromEntries(Object.entries(filter).filter(([, v]) => v)) as Record<
    string,
    string
  >;
  return useQuery({
    queryKey: finanzenKeys.rechnungen(query),
    queryFn: async () => unwrap(await api.finanzen.rechnungen.$get({ query })),
  });
}

export function useRechnung(id: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: finanzenKeys.rechnung(id),
    enabled: !!id,
    queryFn: async () => unwrap(await api.finanzen.rechnungen[':id'].$get({ param: { id: id! } })),
  });
}

/** Own submissions of the member, newest first. */
export function useEinreichungen() {
  const api = useApi();
  return useQuery({
    queryKey: finanzenKeys.einreichungen,
    queryFn: async () => unwrap(await api.finanzen.einreichungen.$get()),
  });
}

/** One own submission with its file. */
export function useEinreichung(id: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: finanzenKeys.einreichung(id),
    enabled: !!id,
    queryFn: async () =>
      unwrap(await api.finanzen.einreichungen[':id'].$get({ param: { id: id as string } })),
  });
}

export const einreichungPfad = (id: string) => `/belege/${encodeURIComponent(id)}`;

/** "2026-11-19" -> "19.11.2026". */
export const datumDe = (iso: string | null) =>
  iso ? iso.slice(0, 10).split('-').reverse().join('.') : '–';

/** Rechnungssteller and Kategorien a member may pick when submitting a Beleg. */
export function useEinreichungAuswahl() {
  const api = useApi();
  return useQuery({
    queryKey: finanzenKeys.einreichungAuswahl,
    queryFn: async () => unwrap(await api.finanzen.einreichungen.auswahl.$get()),
  });
}

/** Tax rate periods (oldest first, with whether each may be deleted); needs the right to read Finanzen. */
export function useSteuersatzZeitraeume(enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: finanzenKeys.steuersatzZeitraeume,
    enabled,
    queryFn: async () => unwrap(await api.finanzen['steuersatz-zeitraeume'].$get()),
  });
}

/** Adds a tax rate period. */
export function useSteuersatzZeitraumAnlegen() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (eingabe: SteuersatzZeitraumEingabe) =>
      jsonOderFehler(await api.finanzen['steuersatz-zeitraeume'].$post({ json: eingabe })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: finanzenKeys.steuersatzZeitraeume });
      void qc.invalidateQueries({ queryKey: finanzenKeys.einreichungAuswahl });
    },
  });
}

/** Deletes a tax rate period (only while nothing is booked in it). */
export function useSteuersatzZeitraumLoeschen() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (id: string) =>
      jsonOderFehler(await api.finanzen['steuersatz-zeitraeume'][':id'].$delete({ param: { id } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: finanzenKeys.steuersatzZeitraeume });
      void qc.invalidateQueries({ queryKey: finanzenKeys.einreichungAuswahl });
    },
  });
}

/** Artikel (names of Posten) with their default tax rate and booking statistics. */
export function useArtikel() {
  const api = useApi();
  return useQuery({
    queryKey: finanzenKeys.artikel,
    queryFn: async () => unwrap(await api.finanzen.artikel.$get()),
  });
}

/** Sets the default tax rate (Art) of an Artikel. */
export function useArtikelSteuersatzArt() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    meta: { eigeneFehlermeldung: true },
    mutationFn: async (a: { id: string; steuersatzArt: SteuersatzArt }) =>
      jsonOderFehler(
        await api.finanzen.artikel[':id'].$patch({
          param: { id: a.id },
          json: { steuersatzArt: a.steuersatzArt },
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: finanzenKeys.artikel });
      void qc.invalidateQueries({ queryKey: finanzenKeys.artikelVorschlaege });
      void qc.invalidateQueries({ queryKey: finanzenKeys.belegWaren });
    },
  });
}

export interface AuswertungZeitraumFilter {
  von: string;
  bis: string;
  intervall: AuswertungIntervall;
}

export function useAuswertungEvents(filter: AuswertungZeitraumFilter | null) {
  const api = useApi();
  return useQuery({
    queryKey: ['finanzen', 'auswertung', 'events', filter] as const,
    enabled: filter !== null,
    queryFn: async () => unwrap(await api.finanzen.auswertungen.events.$get({ query: filter! })),
  });
}

export function useAuswertungUst(filter: AuswertungZeitraumFilter | null) {
  const api = useApi();
  return useQuery({
    queryKey: ['finanzen', 'auswertung', 'ust', filter] as const,
    enabled: filter !== null,
    queryFn: async () => unwrap(await api.finanzen.auswertungen.ust.$get({ query: filter! })),
  });
}

export function useAuswertungGuv(filter: AuswertungZeitraumFilter | null) {
  const api = useApi();
  return useQuery({
    queryKey: ['finanzen', 'auswertung', 'guv', filter] as const,
    enabled: filter !== null,
    queryFn: async () => unwrap(await api.finanzen.auswertungen.guv.$get({ query: filter! })),
  });
}

export function useAuswertungEuer(jahr: number | null) {
  const api = useApi();
  return useQuery({
    queryKey: ['finanzen', 'auswertung', 'euer', jahr] as const,
    enabled: jahr !== null,
    queryFn: async () =>
      unwrap(await api.finanzen.auswertungen.euer.$get({ query: { jahr: String(jahr) } })),
  });
}

export function useAuswertungEinkauf(jahr: number | null) {
  const api = useApi();
  return useQuery({
    queryKey: ['finanzen', 'auswertung', 'einkauf', jahr] as const,
    enabled: jahr !== null,
    queryFn: async () =>
      unwrap(await api.finanzen.auswertungen.einkauf.$get({ query: { jahr: String(jahr) } })),
  });
}
