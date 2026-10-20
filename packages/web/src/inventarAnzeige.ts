import {
  abweichungText,
  inventarAbweichung,
  pfad,
  platzText,
  type BaumKnoten,
  type PlatzZiel,
} from '@c4/shared';
import type {
  AusleiheEintrag,
  AusleihePositionEintrag,
  GegenstandEintrag,
  IfcoEintrag,
  KategorieEintrag,
} from './inventarDaten';

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

/** A place of a Gegenstand with the amount that can still be lent from there. */
export interface VerfuegbarerPlatz extends PlatzZiel {
  anzahl: number;
  verliehen: number;
  verfuegbar: number;
}

/** Places of a Gegenstand with something left to lend (assigned minus lent), sorted by display text. */
export function verfuegbarePlaetze(
  g: Pick<GegenstandEintrag, 'plaetze'>,
  lagerorte: BaumKnoten[],
  ifcos: IfcoEintrag[],
): (VerfuegbarerPlatz & { text: string })[] {
  return g.plaetze
    .map((p) => ({
      lagerortId: p.lagerortId,
      ifcoId: p.ifcoId,
      anzahl: p.anzahl,
      verliehen: p.verliehen,
      verfuegbar: p.anzahl - p.verliehen,
      text: platzText(lagerorte, ifcos, p),
    }))
    .filter((p) => p.verfuegbar > 0)
    .sort((a, b) => a.text.localeCompare(b.text, 'de'));
}

/** Amount of a Gegenstand that can still be lent over all its places. */
export const gesamtVerfuegbar = (g: Pick<GegenstandEintrag, 'plaetze'>): number =>
  g.plaetze.reduce((s, p) => s + Math.max(0, p.anzahl - p.verliehen), 0);

/** Open Positionen of an Ausleihe. */
export const offenePositionen = (a: Pick<AusleiheEintrag, 'positionen'>) =>
  a.positionen.filter((p) => p.zurueckAm === null);

/** `3× Kabeltrommel aus Lager › Regal` */
export function positionText(
  p: Pick<AusleihePositionEintrag, 'gegenstandId' | 'anzahl' | 'lagerortId' | 'ifcoId'>,
  gegenstaende: Pick<GegenstandEintrag, 'id' | 'name'>[],
  lagerorte: BaumKnoten[],
  ifcos: IfcoEintrag[],
): string {
  const name = gegenstaende.find((g) => g.id === p.gegenstandId)?.name ?? 'Unbekannt';
  return `${p.anzahl}× ${name} aus ${platzText(lagerorte, ifcos, p)}`;
}

/** True when the Ausleihe is still open and its planned return date (`YYYY-MM-DD`) is before `heute`. */
export function ueberfaellig(
  a: Pick<AusleiheEintrag, 'erledigt' | 'rueckgabeGeplant'>,
  heute: string,
): boolean {
  return !a.erledigt && a.rueckgabeGeplant !== null && a.rueckgabeGeplant < heute;
}

/** Today as `YYYY-MM-DD` in local time. */
export function heuteLokal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/** `20.10.2026` for a `YYYY-MM-DD` date. */
export function datumText(datum: string): string {
  const [j, m, t] = datum.split('-');
  return `${t}.${m}.${j}`;
}

/** `datetime-local` value (local time, minutes) of an ISO timestamp. */
export function isoZuLokal(iso: string): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
