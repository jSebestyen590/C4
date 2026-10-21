import type { BaumEintrag, BaumKnoten } from '@c4/shared';
import type { BestandsAnzeige } from './lagerBestand';
import type { LagerInventar } from './lagerInventar';

/** What lies on the nodes of the tree; a null map means that part is hidden or not loaded yet. */
export interface Belegung {
  bestand: Map<string, BestandsAnzeige[]> | null;
  inventar: Map<string, LagerInventar> | null;
}

/**
 * Splits the children of a node: those with children of their own stay cards (recursively), the
 * leaves become tiles. Both keep their order.
 */
export function kinderTeilen<T extends BaumKnoten>(
  kinder: BaumEintrag<T>[],
): { karten: BaumEintrag<T>[]; kacheln: BaumEintrag<T>[] } {
  return {
    karten: kinder.filter((k) => k.kinder.length > 0),
    kacheln: kinder.filter((k) => k.kinder.length === 0),
  };
}

/** Distinct Waren with stock and Inventar entries (Ifcos + directly assigned Gegenstände) of a node. */
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
export function istAufgeklappt(id: string, tiefe: number, gewaehlt: Aufgeklappt): boolean {
  return gewaehlt[id] ?? tiefe === 0;
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
