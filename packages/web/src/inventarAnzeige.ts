import {
  abweichungText,
  inventarAbweichung,
  pfad,
  platzText,
  type BaumKnoten,
  type PlatzZiel,
} from '@c4/shared';
import { ifcoPlatzMasse, platzPasst } from './ifcoPlatz';
import type { LagerKnoten } from './LagerBaum';
import type {
  AusleiheEintrag,
  AusleihePositionEintrag,
  GegenstandEintrag,
  IfcoEintrag,
  IfcoTypEintrag,
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

/**
 * Place options for an Ifco: like `lagerortOptionen`, but an Ifco-Lagerplatz says `passt` or why
 * the Ifco (with the type `typId`) cannot stand there (`passt nicht` / `Typ nötig`, disabled).
 * `ifco` is the Ifco being edited (its own place does not count against it), undefined for a new one.
 */
export function ifcoPlatzOptionen(
  lagerorte: LagerKnoten[],
  ifco: { id: string; lagerortId: string | null } | undefined,
  typId: string | null,
  ifcos: IfcoEintrag[],
  typen: IfcoTypEintrag[],
) {
  return lagerorte
    .filter((l) => !l.archiviert || l.id === ifco?.lagerortId)
    .map((l) => {
      const label = pfad(lagerorte, l.id);
      const masse = ifcoPlatzMasse(l);
      if (!masse) return { value: l.id, label };
      const r = platzPasst(masse, l.id, { id: ifco?.id ?? '' }, typId, ifcos, typen);
      return {
        value: l.id,
        label: `${label} · Ifco-Lagerplatz, ${r.passt ? 'passt' : r.grund}`,
        disabled: !r.passt,
      };
    })
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

/** `6× · 3 verliehen · 2 vorgemerkt` */
export function mengeText(anzahl: number, verliehen = 0, vorgemerkt = 0): string {
  return [
    `${anzahl}×`,
    ...(verliehen > 0 ? [`${verliehen} verliehen`] : []),
    ...(vorgemerkt > 0 ? [`${vorgemerkt} vorgemerkt`] : []),
  ].join(' · ');
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
): { id: string; text: string; anzahl: number; verliehen: number; vorgemerkt: number }[] {
  return g.plaetze
    .map((p) => ({
      id: p.id,
      text: platzText(lagerorte, ifcos, p),
      anzahl: p.anzahl,
      verliehen: p.verliehen,
      vorgemerkt: p.vorgemerkt,
    }))
    .sort((a, b) => a.text.localeCompare(b.text, 'de'));
}

/** A place of a Gegenstand with the amount that can still be lent from there. */
export interface VerfuegbarerPlatz extends PlatzZiel {
  anzahl: number;
  verliehen: number;
  vorgemerkt: number;
  verfuegbar: number;
}

/**
 * Places of a Gegenstand with something left to lend (assigned minus lent and reserved), sorted by
 * display text; with `auchVolle` the completely taken places are listed too (`verfuegbar` 0).
 */
export function verfuegbarePlaetze(
  g: Pick<GegenstandEintrag, 'plaetze'>,
  lagerorte: BaumKnoten[],
  ifcos: IfcoEintrag[],
  auchVolle = false,
): (VerfuegbarerPlatz & { text: string })[] {
  return g.plaetze
    .map((p) => ({
      lagerortId: p.lagerortId,
      ifcoId: p.ifcoId,
      anzahl: p.anzahl,
      verliehen: p.verliehen,
      vorgemerkt: p.vorgemerkt,
      verfuegbar: p.anzahl - p.verliehen - p.vorgemerkt,
      text: platzText(lagerorte, ifcos, p),
    }))
    .filter((p) => auchVolle || p.verfuegbar > 0)
    .sort((a, b) => a.text.localeCompare(b.text, 'de'));
}

/** Amount of a Gegenstand that can still be lent over all its places. */
export const gesamtVerfuegbar = (g: Pick<GegenstandEintrag, 'plaetze'>): number =>
  g.plaetze.reduce((s, p) => s + Math.max(0, p.anzahl - p.verliehen - p.vorgemerkt), 0);

/** Verliehen first, then vorgemerkt by start, then finished ones; the API order (newest first) otherwise. */
export function ausleihenSortiert<T extends Pick<AusleiheEintrag, 'status' | 'ausgeliehenAm'>>(
  liste: T[],
): T[] {
  const rang = { verliehen: 0, geplant: 1, erledigt: 2 } as const;
  return [...liste].sort(
    (a, b) =>
      rang[a.status] - rang[b.status] ||
      (a.status === 'geplant' ? a.ausgeliehenAm.localeCompare(b.ausgeliehenAm) : 0),
  );
}

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
