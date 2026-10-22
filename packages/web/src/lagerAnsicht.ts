import type { BaumEintrag, BaumKnoten, LagerortArt } from '@c4/shared';
import type { BestandsAnzeige } from './lagerBestand';
import type { LagerInventar } from './lagerInventar';

/** What lies on the nodes of the tree; a null map means that part is hidden or not loaded yet. */
export interface Belegung {
  bestand: Map<string, BestandsAnzeige[]> | null;
  inventar: Map<string, LagerInventar> | null;
}

/**
 * Splits the children of a node: Regalböden (the children of a Regal) become tiles, every other
 * node stays a card (recursively), leaf or not. Both keep their order.
 */
export function kinderTeilen<T extends BaumKnoten & { art: LagerortArt | null }>(
  kinder: BaumEintrag<T>[],
): { karten: BaumEintrag<T>[]; kacheln: BaumEintrag<T>[] } {
  return {
    karten: kinder.filter((k) => k.node.art !== 'regalboden'),
    kacheln: kinder.filter((k) => k.node.art === 'regalboden'),
  };
}

/** Distinct Waren with stock and Inventar entries (IFCOs + directly assigned Gegenstände) of a node. */
export function zaehler(id: string, b: Belegung): { waren: number; inventar: number } {
  const inv = b.inventar?.get(id);
  return {
    waren: b.bestand?.get(id)?.length ?? 0,
    inventar: inv ? inv.ifcos.length + inv.gegenstaende.length : 0,
  };
}

/** Number shown on a tile, "–" for an empty node. */
export function kachelZaehlerText(id: string, b: Belegung): string {
  const z = zaehler(id, b);
  const summe = z.waren + z.inventar;
  return summe === 0 ? '–' : String(summe);
}

/**
 * What a tile shows below its name: either `zeilen` (one truncated line each) or `text` (truncated by
 * the tile) plus a fixed `zusatz` like `+2`; full names in `titel`.
 */
export interface KachelInhalt {
  text: string;
  zusatz: string | null;
  zeilen: string[] | null;
  titel: string | null;
}

/** Most IFCO names a tile lists; with more, the last line becomes `+N`. */
const MAX_IFCO_ZEILEN = 3;

/**
 * Tile content. An IFCO-Lagerplatz holding only IFCOs lists all of them (alphabetical, usually at
 * most two; beyond three the last line is `+N`). Any other node, also an IFCO-Lagerplatz with loose
 * Gegenstände or Ware, names its only entry (one Ware with stock, one IFCO or one directly assigned
 * Gegenstand, among the parts shown) and otherwise shows the counter ("–" when empty).
 */
export function kachelInhalt(id: string, b: Belegung, istIfcoPlatz: boolean): KachelInhalt {
  const nachName = (a: string, c: string) => a.localeCompare(c, 'de');
  const ifcos = (b.inventar?.get(id)?.ifcos ?? []).map((i) => i.name).sort(nachName);
  const lose = [
    ...(b.bestand?.get(id) ?? []).map((w) => w.name),
    ...(b.inventar?.get(id)?.gegenstaende ?? []).map((g) => g.name),
  ];
  if (istIfcoPlatz && ifcos.length > 0 && lose.length === 0) {
    const zeilen =
      ifcos.length > MAX_IFCO_ZEILEN
        ? [...ifcos.slice(0, MAX_IFCO_ZEILEN - 1), `+${ifcos.length - MAX_IFCO_ZEILEN + 1}`]
        : ifcos;
    return { text: '', zusatz: null, zeilen, titel: ifcos.join(', ') };
  }
  const namen = [...lose, ...ifcos];
  if (namen.length === 1) return { text: namen[0]!, zusatz: null, zeilen: null, titel: namen[0]! };
  return {
    text: kachelZaehlerText(id, b),
    zusatz: null,
    zeilen: null,
    titel: namen.length > 0 ? [...namen].sort(nachName).join(', ') : null,
  };
}

/** Whether something lies on the node itself (among the parts that are currently shown). */
export function istBelegt(id: string, b: Belegung): boolean {
  const z = zaehler(id, b);
  return z.waren + z.inventar > 0;
}

/**
 * "Nur belegte Plätze": keeps nodes that are occupied themselves or have an occupied descendant.
 * Without any loaded data nothing is known to be occupied, so the tree stays unchanged then.
 */
export function nurBelegte<T extends BaumKnoten>(
  eintraege: BaumEintrag<T>[],
  b: Belegung,
): BaumEintrag<T>[] {
  if (!b.bestand && !b.inventar) return eintraege;
  const filtern = (liste: BaumEintrag<T>[]): BaumEintrag<T>[] =>
    liste.flatMap((e) => {
      const kinder = filtern(e.kinder);
      return kinder.length > 0 || istBelegt(e.node.id, b) ? [{ ...e, kinder }] : [];
    });
  return filtern(eintraege);
}

/** Explicit expand/collapse choices of the user, node id -> expanded. */
export type Aufgeklappt = Record<string, boolean>;

/** Default: top-level nodes expanded, everything deeper collapsed; an explicit choice wins. */
export function istAufgeklappt(
  id: string,
  tiefe: number,
  gewaehlt: Aufgeklappt,
  istRegal = false,
): boolean {
  return gewaehlt[id] ?? (tiefe === 0 && !istRegal);
}

/** The choices worth remembering: Regale always start collapsed, so their state is not stored. */
export function zuMerken(gewaehlt: Aufgeklappt, regalIds: Set<string>): Aufgeklappt {
  return Object.fromEntries(Object.entries(gewaehlt).filter(([id]) => !regalIds.has(id)));
}

/** Ids of all nodes that have children. */
export function knotenMitKindern<T extends BaumKnoten>(eintraege: BaumEintrag<T>[]): string[] {
  return eintraege.flatMap((e) =>
    e.kinder.length > 0 ? [e.node.id, ...knotenMitKindern(e.kinder)] : [],
  );
}

/** Explicit choice for all given ids (expand or collapse all), keeping choices for other ids. */
export function alleSetzen(gewaehlt: Aufgeklappt, ids: string[], auf: boolean): Aufgeklappt {
  const neu = { ...gewaehlt };
  for (const id of ids) neu[id] = auf;
  return neu;
}

/** Parses the stored map; anything unexpected gives an empty map. */
export function aufgeklapptLesen(roh: string | null): Aufgeklappt {
  if (!roh) return {};
  try {
    const wert: unknown = JSON.parse(roh);
    if (typeof wert !== 'object' || wert === null || Array.isArray(wert)) return {};
    return Object.fromEntries(Object.entries(wert).filter(([, v]) => typeof v === 'boolean'));
  } catch {
    return {};
  }
}

/**
 * Tile labels of one grid: when every name starts with the same word(s) followed by a space
 * ("Stellplatz 1" … "Stellplatz 16"), that prefix becomes the grid heading and the tiles only
 * show the rest ("1" … "16"), so short tiles don't break names mid-word. Needs at least two tiles.
 */
export function kachelBeschriftung(namen: string[]): { praefix: string | null; kurz: string[] } {
  if (namen.length < 2) return { praefix: null, kurz: namen };
  let praefix = namen[0] ?? '';
  for (const n of namen.slice(1)) {
    while (praefix && !n.startsWith(praefix)) praefix = praefix.slice(0, -1);
  }
  const ende = praefix.lastIndexOf(' ');
  if (ende <= 0) return { praefix: null, kurz: namen };
  praefix = praefix.slice(0, ende + 1);
  const kurz = namen.map((n) => n.slice(praefix.length).trim());
  if (kurz.some((k) => k === '')) return { praefix: null, kurz: namen };
  return { praefix: praefix.trim(), kurz };
}

/**
 * Ids of the nodes whose subtree holds Waren stock (any positive amount on the node itself or
 * below it). Entnehmen and Umlagern only make sense there.
 */
export function knotenMitBestand(
  bestand: { lagerortId: string; menge: number }[],
  knoten: { id: string; parentId: string | null }[],
): Set<string> {
  const eltern = new Map(knoten.map((k) => [k.id, k.parentId]));
  const ergebnis = new Set<string>();
  for (const b of bestand) {
    if (b.menge <= 0) continue;
    let id: string | null | undefined = b.lagerortId;
    while (id && !ergebnis.has(id)) {
      ergebnis.add(id);
      id = eltern.get(id);
    }
  }
  return ergebnis;
}
