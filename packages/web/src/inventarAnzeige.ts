import {
  abweichungText,
  beginnText,
  freiImZeitraum,
  inventarAbweichung,
  zeitraumText,
  type OffenePosition,
  type Tage,
  pfad,
  platzText,
  type BaumKnoten,
  type PlatzZiel,
} from '@c4/shared';
import { ifcoPlatzMasse, platzPasst } from './ifcoPlatz';
import { zeitAnzeigen } from './warenAnzeige';
import type { LagerKnoten } from './LagerBaum';
import type {
  AusleiheEintrag,
  AusleihePositionEintrag,
  GegenstandEintrag,
  IfcoAusleiheEintrag,
  IfcoEintrag,
  IfcoTypEintrag,
  KategorieEintrag,
} from './inventarDaten';

/** Select options for one place: `l:<id>` = Lagerort, `i:<id>` = IFCO. */
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
 * Place options for an IFCO: like `lagerortOptionen`, but an IFCO-Lagerplatz says `passt` or why
 * the IFCO (with the type `typId`) cannot stand there (`passt nicht` / `Typ nötig`, disabled).
 * `ifco` is the IFCO being edited (its own place does not count against it), undefined for a new one.
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
        label: `${label} · IFCO-Lagerplatz, ${r.passt ? 'passt' : r.grund}`,
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
 * Grouped, searchable targets "Plätze" (Lagerorte) and "IFCOs". Archived targets only when they
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
    { group: 'IFCOs', items: kisten },
  ].filter((g) => g.items.length > 0);
}

/** `6×` for a count of 2 or more; empty for 1 (most Gegenstände exist exactly once). */
export const anzahlText = (anzahl: number): string => (anzahl === 1 ? '' : `${anzahl}×`);

/** `6× Spanngurt`, or just `Spanngurt` for a single piece. */
export const mengeName = (anzahl: number, name: string): string =>
  anzahl === 1 ? name : `${anzahl}× ${name}`;

/**
 * `6× · 3 verliehen · 2 vorgemerkt`; the count is left out when it is 1 (`3 verliehen`), so the
 * text is empty for a single piece that is neither lent nor reserved.
 */
export function mengeText(anzahl: number, verliehen = 0, vorgemerkt = 0): string {
  return [
    anzahlText(anzahl),
    ...(verliehen > 0 ? [`${verliehen} verliehen`] : []),
    ...(vorgemerkt > 0 ? [`${vorgemerkt} vorgemerkt`] : []),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Deviation of a Gegenstand's Plätze from its target, e.g. `2 ohne Platz`; null when it matches. */
export function gegenstandAbweichung(
  g: Pick<GegenstandEintrag, 'anzahl' | 'plaetze' | 'verbaut'>,
): string | null {
  return abweichungText(inventarAbweichung(g.anzahl, [...g.plaetze, ...g.verbaut]).differenz);
}

/** Fixed installations as display lines: `fest verbaut: unter der Bar`, with the amount if > 1. */
export const verbautZeilen = (g: Pick<GegenstandEintrag, 'verbaut'>) =>
  g.verbaut.map((v) => ({ id: v.id, text: `fest verbaut: ${v.ort}`, anzahl: v.anzahl }));

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

/** `3× Kabeltrommel aus Lager › Regal` (`Kabeltrommel aus …` for a single piece, `… (mit ganzer IFCO)` for a whole IFCO). */
export function positionText(
  p: Pick<AusleihePositionEintrag, 'gegenstandId' | 'anzahl' | 'lagerortId' | 'ifcoId'> &
    Partial<Pick<AusleihePositionEintrag, 'ganzeIfco'>>,
  gegenstaende: Pick<GegenstandEintrag, 'id' | 'name'>[],
  lagerorte: BaumKnoten[],
  ifcos: IfcoEintrag[],
): string {
  const name = gegenstaende.find((g) => g.id === p.gegenstandId)?.name ?? 'Unbekannt';
  return `${mengeName(p.anzahl, name)} aus ${platzText(lagerorte, ifcos, p)}${p.ganzeIfco ? ' (mit ganzer IFCO)' : ''}`;
}

/** `Spanngurtkiste (ganze IFCO)` */
export function ifcoGruppeTitel(ifcoId: string, ifcos: Pick<IfcoEintrag, 'id' | 'name'>[]): string {
  return `${ifcos.find((i) => i.id === ifcoId)?.name ?? 'Unbekannte IFCO'} (ganze IFCO)`;
}

/** Contents of a whole-IFCO lending as one compact line: `6× Spanngurt 6m, Ratsche`, sorted by name. */
export function ifcoInhaltText(
  positionen: Pick<AusleihePositionEintrag, 'gegenstandId' | 'anzahl'>[],
  gegenstaende: Pick<GegenstandEintrag, 'id' | 'name'>[],
): string {
  return positionen
    .map((p) => ({
      anzahl: p.anzahl,
      name: gegenstaende.find((g) => g.id === p.gegenstandId)?.name ?? 'Unbekannt',
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
    .map((p) => mengeName(p.anzahl, p.name))
    .join(', ');
}

/** `seit 20.10.2026 10:00` for a started Ausleihe, `ab 25.10.2026 10:00` for one that has not started (the one place for these texts). */
export const seitAbText = (ausgeliehenAm: string, jetzt: Date = new Date()): string =>
  beginnText(ausgeliehenAm, jetzt, (z) => zeitAnzeigen(z instanceof Date ? z.toISOString() : z));

const grossAnfang = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** `Seit 20.10.2026 10:00` / `Ab 25.10.2026 10:00`. */
export const startText = (ausgeliehenAm: string, jetzt: Date = new Date()): string =>
  grossAnfang(seitAbText(ausgeliehenAm, jetzt));

/** `Verliehen an Feuerwehr seit 20.10.2026 10:00` / `Vorgemerkt für Feuerwehr ab 25.10.2026 10:00`. */
export function ifcoAusleiheText(a: IfcoAusleiheEintrag, jetzt: Date = new Date()): string {
  return `${a.status === 'geplant' ? `Vorgemerkt für ${a.an}` : `Verliehen an ${a.an}`} ${seitAbText(a.ausgeliehenAm, jetzt)}`;
}

/** `20.10.–27.10.2026` of an Ausleihe, or null without a planned return. */
export const ausleiheZeitraumText = (
  a: Pick<AusleiheEintrag, 'ausgeliehenAm' | 'rueckgabeGeplant'>,
): string | null => (a.rueckgabeGeplant ? zeitraumText(a.ausgeliehenAm, a.rueckgabeGeplant) : null);

/** Line for the confirmation: `Vom 25.10.2026 10:00 bis 27.10.2026` (not started) / `Seit 20.10.2026 10:00 bis 27.10.2026`. */
export function zeitraumZeile(
  ausgeliehenAm: string,
  rueckgabe: string,
  jetzt: Date = new Date(),
): string {
  const start = zeitAnzeigen(ausgeliehenAm);
  const ende = datumText(rueckgabe);
  return new Date(ausgeliehenAm) > jetzt ? `Vom ${start} bis ${ende}` : `Seit ${start} bis ${ende}`;
}

/** Open positions of all given Ausleihen as `OffenePosition`s (with borrower, start and planned return). */
export function offenePositionenAus(ausleihen: AusleiheEintrag[]): OffenePosition[] {
  return ausleihen.flatMap((a) =>
    a.positionen
      .filter((p) => p.zurueckAm === null)
      .map((p) => ({
        ...p,
        ausleiheId: a.id,
        an: a.an,
        ausgeliehenAm: a.ausgeliehenAm,
        rueckgabeGeplant: a.rueckgabeGeplant,
      })),
  );
}

/** Pieces of a place that are free on every day of `zeitraum` (never negative). */
export function verfuegbarImZeitraum(
  platz: PlatzZiel & { anzahl: number },
  gegenstandId: string,
  offen: OffenePosition[],
  zeitraum: Tage,
  jetzt: Date = new Date(),
): number {
  return Math.max(
    0,
    freiImZeitraum(platz.anzahl, offen, { ...platz, gegenstandId }, zeitraum, jetzt),
  );
}

/**
 * Default amount for a place on the Verleihen page: the whole available content of an IFCO lent as a
 * whole, or the single piece of a Gegenstand that exists once and is available; otherwise nothing.
 */
export function standardMenge(
  platz: PlatzZiel & { anzahl: number; verfuegbar: number },
  anzahlPlaetze: number,
  ganzeIfco: boolean,
): number | undefined {
  if (platz.verfuegbar <= 0) return undefined;
  if (ganzeIfco) return platz.verfuegbar;
  return anzahlPlaetze === 1 && platz.anzahl === 1 ? 1 : undefined;
}

/** `verliehen an Feuerwehr` / `vorgemerkt für Feuerwehr` (without the date, for use inside a line). */
export const ifcoAusleiheZeile = (a: Pick<IfcoAusleiheEintrag, 'an' | 'status'>): string =>
  a.status === 'geplant' ? `vorgemerkt für ${a.an}` : `verliehen an ${a.an}`;

/** `Verliehen an Feuerwehr` / `Vorgemerkt für Feuerwehr` (without the date, for badges). */
export const ifcoAusleiheKurz = (a: Pick<IfcoAusleiheEintrag, 'an' | 'status'>): string => {
  const zeile = ifcoAusleiheZeile(a);
  return zeile.charAt(0).toUpperCase() + zeile.slice(1);
};

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

export type GegenstandSortierung = 'name' | 'kategorie' | 'anzahl' | 'platz';

export const GEGENSTAND_SORTIERUNGEN: { value: GegenstandSortierung; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'kategorie', label: 'Kategorie' },
  { value: 'anzahl', label: 'Anzahl' },
  { value: 'platz', label: 'Platz' },
];

const deutsch = (a: string, b: string): number => a.localeCompare(b, 'de', { sensitivity: 'base' });

/** German compare where an empty text sorts last. */
const leerZuletzt = (a: string, b: string): number =>
  a === b ? 0 : a === '' ? 1 : b === '' ? -1 : deutsch(a, b);

/**
 * Sorted copy of the Gegenstände. Name: A–Z; Kategorie: by path, then name; Anzahl: most pieces first;
 * Platz: by the first place path, Gegenstände without a place last. Ties fall back to the name. `umgekehrt` flips the order, but items without a place
 * stay last.
 */
export function gegenstaendeSortieren(
  liste: GegenstandEintrag[],
  sortierung: GegenstandSortierung,
  kontext: { kategorien: BaumKnoten[]; lagerorte: BaumKnoten[]; ifcos: IfcoEintrag[] },
  umgekehrt = false,
): GegenstandEintrag[] {
  const richtung = umgekehrt ? -1 : 1;
  const erstesZiel = (g: GegenstandEintrag) =>
    g.plaetze.length === 0 ? '' : (platzZeilen(g, kontext.lagerorte, kontext.ifcos)[0]?.text ?? '');
  const nachName = (a: GegenstandEintrag, b: GegenstandEintrag) => deutsch(a.name, b.name);

  return [...liste].sort((a, b) => {
    switch (sortierung) {
      case 'name':
        return richtung * nachName(a, b);
      case 'kategorie':
        return (
          richtung *
          (deutsch(
            pfad(kontext.kategorien, a.kategorieId),
            pfad(kontext.kategorien, b.kategorieId),
          ) || nachName(a, b))
        );
      case 'anzahl':
        // Default is descending, so the normal direction puts the largest first.
        return richtung * (b.anzahl - a.anzahl || nachName(a, b));
      case 'platz': {
        const [x, y] = [erstesZiel(a), erstesZiel(b)];
        if (x === '' || y === '') return leerZuletzt(x, y) || nachName(a, b);
        return richtung * (deutsch(x, y) || nachName(a, b));
      }
    }
  });
}

export type IfcoSortierung = 'name' | 'platz';

export const IFCO_SORTIERUNGEN: { value: IfcoSortierung; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'platz', label: 'Standort' },
];

/**
 * Sorted copy of the IFCOs. Name: A–Z with numbers in order ("Kiste 2" before "Kiste 10");
 * Standort: by the path of the Lagerort, IFCOs without a place last. Ties fall back to the name.
 * `umgekehrt` flips the order, but IFCOs without a place stay last.
 */
export function ifcosSortieren(
  liste: IfcoEintrag[],
  sortierung: IfcoSortierung,
  lagerorte: BaumKnoten[],
  umgekehrt = false,
): IfcoEintrag[] {
  const richtung = umgekehrt ? -1 : 1;
  const name = (a: IfcoEintrag, b: IfcoEintrag) =>
    a.name.localeCompare(b.name, 'de', { sensitivity: 'base', numeric: true });
  const ort = (i: IfcoEintrag) => (i.lagerortId ? pfad(lagerorte, i.lagerortId) : '');
  return [...liste].sort((a, b) => {
    if (sortierung === 'name') return richtung * name(a, b);
    const [x, y] = [ort(a), ort(b)];
    if (x === '' || y === '') return leerZuletzt(x, y) || name(a, b);
    return richtung * (deutsch(x, y) || name(a, b));
  });
}
