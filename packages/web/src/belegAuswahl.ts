import type { ComboboxItem, ComboboxItemGroup, OptionsFilter } from '@mantine/core';
import {
  STEUERSAETZE,
  wareSuchen,
  type ArtikelKategorieVorschlaege,
  type BelegWareDto,
  type KontoDto,
} from '@c4/shared';
import { anzahlLesen, steuersatzVorschlag, type PostenZeile } from './belegFormular';

/** Value of the last option of a Ware select: "Neue Ware anlegen" (never a Ware id). */
export const NEUE_WARE = '__neue-ware__';

/** Label of the "new Ware" option: with the search text it names the Ware to create. */
export function neueWareLabel(suche: string): string {
  const s = suche.trim();
  return s ? `„${s}“ als neue Ware anlegen` : 'Neue Ware anlegen';
}

/** Whether a text is the label of the "new Ware" option (Mantine writes the label into the search field). */
export const istNeueWareText = (text: string): boolean =>
  text === 'Neue Ware anlegen' || /^„.*“ als neue Ware anlegen$/.test(text);

/**
 * What a change of a Ware select means. "Neue Ware anlegen" opens the dialog only when picked
 * deliberately (the input still has the focus), never when the field is just left (autoSelectOnBlur);
 * afterwards every change is ignored until the field gets the focus back (the dialog's focus move
 * blurs the field, which would otherwise pick the highlighted Ware). Likewise a change without focus
 * after a Ware was picked (`schonGewaehlt`, reset when the field gets the focus back) is ignored.
 */
export function wareWahl(
  wert: string | null,
  neueWareGewaehlt: boolean,
  hatFokus: boolean,
  schonGewaehlt = false,
): 'neue-oeffnen' | 'neue-merken' | 'ignorieren' | 'waehlen' {
  if (wert === NEUE_WARE) return hatFokus ? 'neue-oeffnen' : 'neue-merken';
  if (neueWareGewaehlt) return 'ignorieren';
  // After a Ware was picked the search reset makes Mantine highlight the first (unfiltered) option;
  // the blur caused by moving on to Anzahl (autoSelectOnBlur) would click it and replace the pick.
  return schonGewaehlt && !hatFokus ? 'ignorieren' : 'waehlen';
}

/**
 * Options of a Ware select (value = Ware id, label = name). With `mitNeuer` the option
 * "Neue Ware anlegen" (`NEUE_WARE`) is the last one.
 */
export const wareOptionen = (
  waren: readonly { id: string; name: string }[],
  mitNeuer = false,
): ComboboxItem[] => [
  ...waren.map((w) => ({ value: w.id, label: w.name })),
  ...(mitNeuer ? [{ value: NEUE_WARE, label: neueWareLabel('') }] : []),
];

/**
 * `filter` for a searchable Mantine `Select` of Waren: finds by name and by alias (via `wareSuchen`).
 * An alias match shows the alias in the option, e.g. "Sternburg Export (Sterni)". The option
 * "Neue Ware anlegen" stays last whatever is typed and carries the search text in its label.
 */
export const wareFilter =
  (waren: readonly { id: string; name: string; aliase?: readonly string[] }[]): OptionsFilter =>
  ({ options, search }) => {
    const treffer = wareSuchen(waren, search);
    const nachId = new Map(treffer.map((t) => [t.ware.id, t.alias]));
    return (options as ComboboxItem[]).flatMap((o) => {
      if (o.value === NEUE_WARE) return [{ ...o, label: neueWareLabel(search) }];
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

// ----- Field logic shared by the card mask and the tables

/** A Kategorie as the forms offer it; members get no standard tax rate. */
export type KategorieAuswahl = Pick<KontoDto, 'id'> & Partial<Pick<KontoDto, 'steuersatzStandard'>>;

/** Patch for choosing a Kategorie: the id plus the Kategorie's standard tax rate. */
export function kategoriePatch(
  aufwand: readonly KategorieAuswahl[],
  id: string | null,
): Partial<PostenZeile> {
  const satz = steuersatzVorschlag(aufwand.find((k) => k.id === id));
  return { kategorieId: id, ...(satz !== null && { steuersatz: satz }) };
}

/** Patch for choosing a Ware: standard Gebinde with deposit and the Warengruppe's Kategorie. */
export function warePatch(
  waren: readonly BelegWareDto[],
  aufwand: readonly KategorieAuswahl[],
  id: string | null,
): Partial<PostenZeile> {
  const neu = waren.find((w) => w.id === id);
  return {
    wareId: id,
    ...standardGebindeWaehlen(neu),
    ...(neu?.kategorieId && kategoriePatch(aufwand, neu.kategorieId)),
  };
}

/** Default tax rate of a known Artikel (one the form offers), or null. */
export function artikelSteuersatz(
  vorschlaege: ArtikelKategorieVorschlaege,
  artikel: string,
): number | null {
  const q = norm(artikel);
  if (!q) return null;
  const satz = vorschlaege.find((v) => norm(v.artikel) === q)?.steuersatz ?? null;
  return satz !== null && (STEUERSAETZE as readonly number[]).includes(satz) ? satz : null;
}

/**
 * Patch for typing the Artikel of a Kategorie item: preselects the most frequent Kategorie while it
 * is empty, and the Artikel's own tax rate (it wins over the Kategorie's standard).
 */
export function artikelPatch(
  p: Pick<PostenZeile, 'kategorieId'>,
  aufwand: readonly KategorieAuswahl[],
  vorschlaege: ArtikelKategorieVorschlaege,
  artikel: string,
): Partial<PostenZeile> {
  const vorschlag = p.kategorieId ? null : vorgeschlageneKategorie(aufwand, vorschlaege, artikel);
  const satz = artikelSteuersatz(vorschlaege, artikel);
  return {
    text: artikel,
    ...(vorschlag !== null && kategoriePatch(aufwand, vorschlag)),
    ...(satz !== null && { steuersatz: satz }),
  };
}

/**
 * Focuses the Anzahl input of a row (`data-zeile` = item key, input carries `data-anzahl`) after the
 * current event, e.g. after a Ware was chosen (skips Gebinde; Shift-Tab reaches it).
 */
export function fokusAnzahl(key: string): void {
  setTimeout(() => {
    document.querySelector<HTMLElement>(`[data-zeile="${key}"] [data-anzahl]`)?.focus();
  }, 0);
}

/** Patch for changing the kind of an item (clears the fields of the other kinds). */
export function artWechselPatch(art: PostenZeile['art']): Partial<PostenZeile> {
  if (art === 'leergut')
    return { art, kategorieId: null, wareId: null, gebindeId: null, pfandCent: null };
  if (art === 'kategorie') return { art, wareId: null, gebindeId: null, pfandCent: null };
  return { art };
}

export interface PostenFeldFehler {
  ware?: string;
  gebinde?: string;
  kategorie?: string;
  text?: string;
  anzahl?: string;
  preis?: string;
}

/** Messages per field of an item; the missing-value ones only after the first book attempt. */
export function postenFeldFehler(p: PostenZeile, versucht: boolean): PostenFeldFehler {
  const f: PostenFeldFehler = {};
  if (p.anzahl.trim() !== '' && anzahlLesen(p.anzahl) === null) f.anzahl = 'Ungültig, z. B. 1,5';
  if (p.art === 'leergut') {
    const anzahl = anzahlLesen(p.anzahl);
    if (anzahl !== null && anzahl <= 0) f.anzahl = 'Muss größer als 0 sein.';
  }
  if (!versucht) return f;
  if (p.art === 'ware') {
    if (!p.wareId) f.ware = 'Bitte wähle eine Ware.';
    else if (!p.gebindeId) f.gebinde = 'Bitte wähle ein Gebinde.';
  }
  if (p.art !== 'leergut' && !p.kategorieId) f.kategorie = 'Bitte wähle eine Kategorie.';
  if (p.art === 'kategorie' && p.text.trim() === '') f.text = 'Bitte gib den Artikel an.';
  if (p.art === 'leergut' && p.text.trim() === '') f.text = 'Bitte beschreibe das Leergut.';
  if (p.einzelpreisCent === null) f.preis = 'Bitte angeben.';
  return f;
}

const OPTION = '[data-combobox-option]:not([data-combobox-disabled])';

/** The open option list of a searchable select input (null while closed). */
function offeneListe(input: HTMLElement): HTMLElement | null {
  const id = input.getAttribute?.('aria-controls');
  return id ? input.ownerDocument.getElementById(id) : null;
}

/** Moves the keyboard highlight to an option (DOM only: Mantine's own index can be out of sync). */
function markieren(input: HTMLElement, liste: HTMLElement, option: HTMLElement): void {
  liste
    .querySelectorAll('[data-combobox-selected]')
    .forEach((o) => o.removeAttribute('data-combobox-selected'));
  option.setAttribute('data-combobox-selected', 'true');
  if (option.id) input.setAttribute('aria-activedescendant', option.id);
  option.scrollIntoView?.({ block: 'nearest' });
}

type TastenEreignis = {
  key: string;
  nativeEvent: { isComposing: boolean };
  target: EventTarget;
  preventDefault(): void;
  stopPropagation(): void;
};

/**
 * Keyboard handling of a searchable select with an open list, owned by us because Mantine's internal
 * option index is -1 although an option is shown highlighted (its "active option" timer on open
 * overwrites the index set by selectFirstOptionOnChange). Use as `onKeyDownCapture`:
 * - ArrowDown/ArrowUp move the highlight (wrapping) and are swallowed;
 * - Enter picks the highlighted option, else the first one, by clicking it as Mantine would.
 */
export function enterWaehltErsteOption(e: TastenEreignis): void {
  if (e.nativeEvent.isComposing) return;
  const input = e.target as HTMLElement;
  const liste = offeneListe(input);
  if (!liste) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const optionen = Array.from(liste.querySelectorAll<HTMLElement>(OPTION));
    if (optionen.length === 0) return;
    const aktuell = optionen.findIndex((o) => o.hasAttribute('data-combobox-selected'));
    const schritt = e.key === 'ArrowDown' ? 1 : -1;
    const ziel =
      aktuell === -1
        ? e.key === 'ArrowDown'
          ? 0
          : optionen.length - 1
        : (aktuell + schritt + optionen.length) % optionen.length;
    markieren(input, liste, optionen[ziel]!);
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  if (e.key !== 'Enter') return;
  const option =
    liste.querySelector<HTMLElement>('[data-combobox-option][data-combobox-selected]') ??
    liste.querySelector<HTMLElement>(OPTION);
  if (!option) return;
  e.preventDefault();
  e.stopPropagation();
  option.click();
}

/**
 * Replaces `autoSelectOnBlur` (which relies on Mantine's unreliable index): leaving a select whose
 * list is open picks the highlighted option (typed + Tab), but never "Neue Ware anlegen". Use as
 * `onBlurCapture`; it runs before Mantine resets the search text.
 */
export function blurWaehltMarkierte(e: { target: EventTarget }): void {
  const input = e.target as HTMLElement;
  if (input.getAttribute?.('aria-expanded') !== 'true') return;
  const liste = offeneListe(input);
  const option = liste?.querySelector<HTMLElement>(
    '[data-combobox-option][data-combobox-selected]',
  );
  if (!option || istNeueWareText(option.textContent?.trim() ?? '')) return;
  option.click();
}
