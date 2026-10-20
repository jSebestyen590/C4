import {
  abweichungText,
  inventarAbweichung,
  pfad,
  platzText,
  type BaumKnoten,
  type PlatzZiel,
} from '@c4/shared';
import type { GegenstandEintrag, IfcoEintrag, KategorieEintrag } from './inventarDaten';

/** Select options for one place: `l:<id>` = Lagerort, `i:<id>` = Ifco. */
export const zielWert = (z: PlatzZiel): string =>
  z.lagerortId !== null ? `l:${z.lagerortId}` : `i:${z.ifcoId}`;

export function zielAusWert(wert: string): PlatzZiel {
  return wert.startsWith('l:')
    ? { lagerortId: wert.slice(2), ifcoId: null }
    : { lagerortId: null, ifcoId: wert.slice(2) };
}

const nachLabel = (a: { label: string }, b: { label: string }) =>
  a.label.localeCompare(b.label, 'de');

/** Lagerort options (path as label); archived ones only when they are `behalten`. */
export function lagerortOptionen(
  lagerorte: (BaumKnoten & { archiviert: boolean })[],
  behalten?: string | null,
) {
  return lagerorte
    .filter((l) => !l.archiviert || l.id === behalten)
    .map((l) => ({ value: l.id, label: pfad(lagerorte, l.id) }))
    .sort(nachLabel);
}

/** Category options (path as label); archived ones only when they are `behalten`. */
export function kategorieOptionen(kategorien: KategorieEintrag[], behalten?: string | null) {
  return kategorien
    .filter((k) => !k.archiviert || k.id === behalten)
    .map((k) => ({ value: k.id, label: pfad(kategorien, k.id) }))
    .sort(nachLabel);
}

/**
 * Grouped, searchable targets "Plätze" (Lagerorte) and "Ifcos". Archived targets only when they
 * are in `behalten`; targets in `gesperrt` are shown disabled (already used in another row).
 */
export function zielOptionen(
  lagerorte: (BaumKnoten & { archiviert: boolean })[],
  ifcos: IfcoEintrag[],
  behalten: Set<string>,
  gesperrt: Set<string>,
  ohneIfcoId?: string,
) {
  const plaetze = lagerorte
    .filter((l) => !l.archiviert || behalten.has(`l:${l.id}`))
    .map((l) => ({
      value: `l:${l.id}`,
      label: pfad(lagerorte, l.id),
      disabled: gesperrt.has(`l:${l.id}`),
    }))
    .sort(nachLabel);
  const kisten = ifcos
    .filter((i) => i.id !== ohneIfcoId && (!i.archiviert || behalten.has(`i:${i.id}`)))
    .map((i) => ({
      value: `i:${i.id}`,
      label: platzText(lagerorte, ifcos, { lagerortId: null, ifcoId: i.id }),
      disabled: gesperrt.has(`i:${i.id}`),
    }))
    .sort(nachLabel);
  return [
    { group: 'Plätze', items: plaetze },
    { group: 'Ifcos', items: kisten },
  ].filter((g) => g.items.length > 0);
}

/** `6× · 3 verliehen` */
export function mengeText(anzahl: number, verliehen = 0): string {
  return verliehen > 0 ? `${anzahl}× · ${verliehen} verliehen` : `${anzahl}×`;
}

/** Deviation of a Gegenstand's Plätze from its target, e.g. `2 ohne Platz`; null when it matches. */
export function gegenstandAbweichung(
  g: Pick<GegenstandEintrag, 'anzahl' | 'plaetze'>,
): string | null {
  return abweichungText(inventarAbweichung(g.anzahl, g.plaetze).differenz);
}

/** Places of a Gegenstand as display lines, sorted. */
export function platzZeilen(
  g: GegenstandEintrag,
  lagerorte: BaumKnoten[],
  ifcos: IfcoEintrag[],
): { id: string; text: string; anzahl: number; verliehen: number }[] {
  return g.plaetze
    .map((p) => ({
      id: p.id,
      text: platzText(lagerorte, ifcos, p),
      anzahl: p.anzahl,
      verliehen: p.verliehen,
    }))
    .sort((a, b) => a.text.localeCompare(b.text, 'de'));
}
