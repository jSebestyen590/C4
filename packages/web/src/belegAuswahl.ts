import type { ComboboxItem, ComboboxItemGroup, OptionsFilter } from '@mantine/core';
import { wareSuchen, type ArtikelKategorieVorschlaege } from '@c4/shared';

/** Options of a Ware select (value = Ware id, label = name). */
export const wareOptionen = (waren: readonly { id: string; name: string }[]): ComboboxItem[] =>
  waren.map((w) => ({ value: w.id, label: w.name }));

/**
 * `filter` for a searchable Mantine `Select` of Waren: finds by name and by alias (via `wareSuchen`).
 * An alias match shows the alias in the option, e.g. "Sternburg Export (Sterni)".
 */
export const wareFilter =
  (waren: readonly { id: string; name: string; aliase?: readonly string[] }[]): OptionsFilter =>
  ({ options, search }) => {
    const treffer = wareSuchen(waren, search);
    const nachId = new Map(treffer.map((t) => [t.ware.id, t.alias]));
    return (options as ComboboxItem[]).flatMap((o) => {
      if (!nachId.has(o.value)) return [];
      const alias = nachId.get(o.value);
      return [alias ? { ...o, label: `${o.label} (${alias})` } : o];
    });
  };

/** Gebinde and deposit to preselect when a Ware is chosen: its standard Gebinde, else its only one, else none. */
export function standardGebindeWaehlen(
  ware:
    | {
        gebinde: readonly { id: string; pfandGesamtCent: number | null }[];
        standardGebindeId: string | null;
      }
    | undefined,
): { gebindeId: string | null; pfandCent: number | null } {
  const g =
    ware?.gebinde.find((x) => x.id === ware.standardGebindeId) ??
    (ware?.gebinde.length === 1 ? ware.gebinde[0] : undefined);
  return { gebindeId: g?.id ?? null, pfandCent: g?.pfandGesamtCent ?? null };
}

const norm = (s: string) => s.trim().toLowerCase();

/** Kategorien the Artikel was booked in before (most often first); matches case-insensitively, trimmed. */
export function kategorienFuerArtikel(
  vorschlaege: ArtikelKategorieVorschlaege,
  artikel: string,
): { kategorieId: string; anzahl: number }[] {
  const q = norm(artikel);
  if (!q) return [];
  return vorschlaege.find((v) => norm(v.artikel) === q)?.kategorien ?? [];
}

/**
 * Kategorie select data for a Kategorie item: group "Vorschläge" (Kategorien used for this Artikel,
 * by frequency) above "Alle Kategorien" (the rest). Without suggestions a flat list.
 */
export function kategorieOptionenMitVorschlaegen(
  konten: readonly { id: string; name: string }[],
  vorschlaege: ArtikelKategorieVorschlaege,
  artikel: string,
): (ComboboxItem | ComboboxItemGroup<ComboboxItem>)[] {
  const optionen = (k: { id: string; name: string }): ComboboxItem => ({
    value: k.id,
    label: k.name,
  });
  const vorgeschlagen = kategorienFuerArtikel(vorschlaege, artikel)
    .map((v) => konten.find((k) => k.id === v.kategorieId))
    .filter((k): k is { id: string; name: string } => k !== undefined);
  if (vorgeschlagen.length === 0) return konten.map(optionen);
  const ids = new Set(vorgeschlagen.map((k) => k.id));
  return [
    { group: 'Vorschläge', items: vorgeschlagen.map(optionen) },
    { group: 'Alle Kategorien', items: konten.filter((k) => !ids.has(k.id)).map(optionen) },
  ];
}

/** The most frequent Kategorie for the Artikel (that is one of `konten`), or null. */
export function vorgeschlageneKategorie(
  konten: readonly { id: string }[],
  vorschlaege: ArtikelKategorieVorschlaege,
  artikel: string,
): string | null {
  const v = kategorienFuerArtikel(vorschlaege, artikel).find((x) =>
    konten.some((k) => k.id === x.kategorieId),
  );
  return v?.kategorieId ?? null;
}

/** Artikel names for an Autocomplete. */
export const artikelNamen = (vorschlaege: ArtikelKategorieVorschlaege): string[] =>
  vorschlaege.map((v) => v.artikel);
