import {
  saetzeVerfuegbar,
  teileVon,
  type IfcoPositionsInfo,
  type PositionsEintrag,
  type TeilQuelle,
} from '@c4/shared';
import { mengeName } from './inventarAnzeige';

/**
 * Spreads `menge` pieces over places, the place with the most available first, each capped at its
 * `verfuegbar`. Every key is in the result (0 when nothing goes there); what does not fit is dropped.
 */
export function mengeVerteilen(
  plaetze: { key: string; verfuegbar: number }[],
  menge: number,
): Record<string, number> {
  const ergebnis: Record<string, number> = {};
  for (const p of plaetze) ergebnis[p.key] = 0;
  let rest = Math.max(0, Math.floor(menge));
  const sortiert = plaetze
    .map((p, i) => ({ ...p, i }))
    .sort((a, b) => b.verfuegbar - a.verfuegbar || a.i - b.i);
  for (const p of sortiert) {
    if (rest <= 0) break;
    const nimm = Math.min(rest, Math.max(0, p.verfuegbar));
    ergebnis[p.key] = nimm;
    rest -= nimm;
  }
  return ergebnis;
}

/** Complete sets (parent + parts in their `anzahlJe`) covered by the amounts `menge` per Gegenstand id. */
export function teileSaetze<T extends TeilQuelle>(
  eltern: T,
  alle: T[],
  menge: (gegenstandId: string) => number,
): number {
  return saetzeVerfuegbar(eltern, teileVon(alle, eltern.id), (g) => menge(g.id));
}

/**
 * `Pavillon (komplett)`, `2× Pavillon (komplett)` or `Pavillon (teilweise)`. Complete when at least
 * `soll` (default 1) sets are covered.
 */
export function teileGruppeTitel(name: string, saetze: number, soll = 1): string {
  return saetze >= Math.max(1, soll)
    ? `${mengeName(saetze, name)} (komplett)`
    : `${name} (teilweise)`;
}

/** An entry of a position list that may also be a group of parts of one parent. */
export type TeileEintrag<T> =
  PositionsEintrag<T> | { art: 'teile'; elternId: string; positionen: T[]; saetze: number };

/**
 * Groups single positions whose Gegenstand is a part (or the non-virtual parent of parts) under
 * their parent, at the place of the first one. The sets are counted over all given positions,
 * returned or not. Whole-IFCO entries stay as they are (they win over parts).
 */
export function teileGruppieren<
  T extends IfcoPositionsInfo & { gegenstandId: string; anzahl: number },
  G extends TeilQuelle,
>(eintraege: PositionsEintrag<T>[], gegenstaende: G[]): TeileEintrag<T>[] {
  const elternVon = (gegenstandId: string): G | null => {
    const g = gegenstaende.find((x) => x.id === gegenstandId);
    if (!g) return null;
    if (g.teilVon !== null) return gegenstaende.find((x) => x.id === g.teilVon) ?? null;
    return gegenstaende.some((x) => x.teilVon === g.id) ? g : null;
  };
  const ergebnis: TeileEintrag<T>[] = [];
  const gruppen = new Map<string, T[]>();
  for (const e of eintraege) {
    const eltern = e.art === 'einzeln' ? elternVon(e.position.gegenstandId) : null;
    if (e.art !== 'einzeln' || !eltern) {
      ergebnis.push(e);
      continue;
    }
    const bisher = gruppen.get(eltern.id);
    if (bisher) bisher.push(e.position);
    else {
      const liste = [e.position];
      gruppen.set(eltern.id, liste);
      ergebnis.push({ art: 'teile', elternId: eltern.id, positionen: liste, saetze: 0 });
    }
  }
  for (const e of ergebnis) {
    if (e.art !== 'teile') continue;
    const eltern = gegenstaende.find((g) => g.id === e.elternId)!;
    const summe = (id: string) =>
      e.positionen.filter((p) => p.gegenstandId === id).reduce((s, p) => s + p.anzahl, 0);
    e.saetze = teileSaetze(eltern, gegenstaende, summe);
  }
  return ergebnis;
}
