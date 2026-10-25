import { z } from 'zod';
import {
  anzahlSchema,
  beschreibung,
  eindeutig,
  idSchema,
  kommentarSchema,
  name,
  parentIdSchema,
  zeitpunktSchema,
} from './bausteine';
import { datumAnzeigen, heuteBerlin } from './datum';
import {
  ausleiheTage,
  belegteTage,
  berlinTag,
  beginnText,
  maximaleBelegung,
  rueckgabeUeberfaellig,
  ueberschneiden,
  zeitraumText,
  type Belegung,
  type Tage,
} from './inventarZeitraum';
import { pfad, type BaumKnoten } from './waren';

// ---------------------------------------------------------------------------
// Schemas

export const kategorieSchema = z.object({
  name: name(),
  parentId: parentIdSchema,
});
export type KategorieEingabe = z.input<typeof kategorieSchema>;

export const gegenstandSchema = z.object({
  name: name(),
  beschreibung,
  kategorieId: idSchema('Bitte wähle eine Kategorie.'),
  anzahl: anzahlSchema.default(1),
});
export type GegenstandEingabe = z.input<typeof gegenstandSchema>;

export const ifcoSchema = z.object({
  name: name(),
  beschreibung,
  lagerortId: parentIdSchema,
  /** Optional IFCO type; required for an IFCO on an IFCO-Lagerplatz. */
  typId: parentIdSchema,
});
export type IfcoEingabe = z.input<typeof ifcoSchema>;

const ZIEL_MELDUNG = 'Bitte wähle genau einen Lagerort oder eine IFCO.';
const genauEinZiel = (p: { lagerortId: string | null; ifcoId: string | null }) =>
  (p.lagerortId === null) !== (p.ifcoId === null);

export const zielKey = (z: PlatzZiel) =>
  z.lagerortId !== null ? `l:${z.lagerortId}` : `i:${z.ifcoId}`;

export const gegenstandPlatzSchema = z
  .object({
    lagerortId: parentIdSchema,
    ifcoId: parentIdSchema,
    anzahl: anzahlSchema,
  })
  .refine(genauEinZiel, ZIEL_MELDUNG);

/** Marks (or unmarks) an IFCO as done in the running Aufräumaktion. */
export const aufraeumFertigSchema = z.object({ fertig: z.boolean() });

/** Creating a Gegenstand may put it straight onto one place. */
export const gegenstandAnlegenSchema = gegenstandSchema.extend({
  platz: gegenstandPlatzSchema.nullable().default(null),
});
export type GegenstandAnlegenEingabe = z.input<typeof gegenstandAnlegenSchema>;

/** Pieces built in for good at a place given as free text ("unter der Bar"); not on any Platz. */
export const verbautSchema = z.object({
  ort: name('einen Ort'),
  anzahl: anzahlSchema,
});

/**
 * Replaces all Plätze of a Gegenstand (each Lagerort/IFCO only once) and, when given, all its
 * fixed installations (each Ort only once); `verbaut` missing = unchanged.
 */
export const gegenstandPlaetzeSchema = z.object({
  plaetze: z
    .array(gegenstandPlatzSchema)
    .refine(
      (liste) => eindeutig(liste.map(zielKey)),
      'Jeder Platz darf nur einmal vorkommen. Fasse die Anzahlen zusammen.',
    ),
  verbaut: z
    .array(verbautSchema)
    .refine(
      (liste) => eindeutig(liste.map((v) => v.ort.toLowerCase())),
      'Jeder Ort darf nur einmal vorkommen. Fasse die Anzahlen zusammen.',
    )
    .optional(),
});
export type GegenstandPlaetzeEingabe = z.input<typeof gegenstandPlaetzeSchema>;

/** A new amount for another Platz of the Gegenstand; 0 removes the Gegenstand from there. */
const andererPlatzSchema = z
  .object({
    lagerortId: parentIdSchema,
    ifcoId: parentIdSchema,
    anzahl: z
      .number('Bitte gib eine Anzahl an.')
      .int('Die Anzahl muss eine ganze Zahl sein.')
      .min(0, 'Die Anzahl darf nicht negativ sein.'),
  })
  .refine(genauEinZiel, ZIEL_MELDUNG);

/** Content of an IFCO; each Gegenstand may appear only once. */
export const ifcoInhaltPositionenSchema = z
  .array(
    z.object({
      gegenstandId: idSchema('Bitte wähle einen Gegenstand.'),
      anzahl: anzahlSchema,
      /** New amounts at other Plätze of the Gegenstand (moving pieces here); unlisted ones stay. */
      andere: z
        .array(andererPlatzSchema)
        .refine((l) => eindeutig(l.map(zielKey)), 'Jeder Platz darf nur einmal vorkommen.')
        .default([]),
    }),
  )
  .refine(
    (liste) => eindeutig(liste.map((p) => p.gegenstandId)),
    'Jeder Gegenstand darf nur einmal vorkommen. Fasse die Anzahlen zusammen.',
  );

/** Replaces the content of an IFCO. */
export const ifcoInhaltSchema = z.object({ positionen: ifcoInhaltPositionenSchema });
export type IfcoInhaltEingabe = z.input<typeof ifcoInhaltSchema>;

/** Creating an IFCO may fill it right away. */
export const ifcoAnlegenSchema = ifcoSchema.extend({
  inhalt: ifcoInhaltPositionenSchema.default([]),
});
export type IfcoAnlegenEingabe = z.input<typeof ifcoAnlegenSchema>;

export const ifcoPlatzSchema = z.object({ lagerortId: parentIdSchema });

const anSchema = z
  .string('Bitte gib an, an wen verliehen wird.')
  .trim()
  .min(1, 'Bitte gib an, an wen verliehen wird.')
  .max(200, 'Höchstens 200 Zeichen erlaubt.');

const ausleiheKopf = {
  an: anSchema,
  /** Cognito sub of the Mitglied who organised the Ausleihe; the API checks that it is a Mitglied. */
  organisiertVon: z
    .string('Bitte wähle, wer die Ausleihe organisiert.')
    .min(1, 'Bitte wähle, wer die Ausleihe organisiert.'),
  ausgeliehenAm: zeitpunktSchema,
  /** Required: the day the pieces come back (`YYYY-MM-DD`); that day itself is free again. */
  rueckgabeGeplant: z.iso.date({ error: 'Bitte gib an, wann es zurückkommt.' }),
  kommentar: kommentarSchema,
};

/** The planned return day must not lie before the start day (Europe/Berlin). */
const rueckgabeNachBeginn = (k: { ausgeliehenAm: string; rueckgabeGeplant: string }) =>
  Number.isNaN(new Date(k.ausgeliehenAm).getTime()) ||
  k.rueckgabeGeplant >= berlinTag(k.ausgeliehenAm);
const RUECKGABE_VOR_BEGINN = {
  message: 'Die Rückgabe kann nicht vor dem Beginn liegen.',
  path: ['rueckgabeGeplant'],
};

export const ausleihePositionSchema = z
  .object({
    gegenstandId: idSchema('Bitte wähle einen Gegenstand.'),
    lagerortId: parentIdSchema,
    ifcoId: parentIdSchema,
    anzahl: anzahlSchema,
    /** Part of lending a whole IFCO; only valid together with `ifcoId`. */
    ganzeIfco: z.literal(true).optional(),
  })
  .refine(genauEinZiel, ZIEL_MELDUNG)
  .refine(
    (p) => !p.ganzeIfco || p.ifcoId !== null,
    'Eine ganze IFCO braucht eine IFCO als Herkunft.',
  );

export const ausleiheSchema = z
  .object({
    ...ausleiheKopf,
    positionen: z
      .array(ausleihePositionSchema)
      .min(1, 'Bitte gib mindestens eine Position an.')
      .refine(
        (liste) => eindeutig(liste.map((p) => `${p.gegenstandId}\u0000${zielKey(p)}`)),
        'Jeder Gegenstand darf je Platz nur einmal vorkommen. Fasse die Anzahlen zusammen.',
      ),
  })
  .refine(rueckgabeNachBeginn, RUECKGABE_VOR_BEGINN);
export type AusleiheEingabe = z.input<typeof ausleiheSchema>;

/** Edits the header of an Ausleihe; the Positionen stay as they are. */
export const ausleiheAendernSchema = z
  .object(ausleiheKopf)
  .refine(rueckgabeNachBeginn, RUECKGABE_VOR_BEGINN);
export type AusleiheAendernEingabe = z.input<typeof ausleiheAendernSchema>;

export const rueckgabeSchema = z.object({
  positionIds: z
    .array(idSchema('Ungültige Id.'))
    .min(1, 'Bitte wähle mindestens eine Position.')
    .refine(eindeutig, 'Jede Position darf nur einmal vorkommen.'),
  zurueckAm: zeitpunktSchema,
});
export type RueckgabeEingabe = z.input<typeof rueckgabeSchema>;

// ---------------------------------------------------------------------------
// Pure functions

/** A place: exactly one of the two is set. */
export interface PlatzZiel {
  lagerortId: string | null;
  ifcoId: string | null;
}

/** An assignment or a lent position: `anzahl` pieces of a Gegenstand at a place. */
export interface PlatzMenge extends PlatzZiel {
  gegenstandId: string;
  anzahl: number;
}

/** One content row of an IFCO, with new amounts for other Plätze of the Gegenstand (`andere`). */
export interface IfcoInhaltPosition {
  gegenstandId: string;
  anzahl: number;
  andere: (PlatzZiel & { anzahl: number })[];
}

/**
 * New Plätze of all Gegenstände in `plaetze` when the IFCO `ifcoId` gets the content `positionen`:
 * its own rows are replaced, each listed other Platz gets its new amount (0 removes it), all other
 * Plätze stay. `ungueltig` names a Gegenstand whose `andere` lists a Platz it does not lie at.
 */
export function ifcoInhaltAnwenden(
  plaetze: PlatzMenge[],
  ifcoId: string,
  positionen: IfcoInhaltPosition[],
): { plaetze: PlatzMenge[]; ungueltig: string | null } {
  const neueMenge = new Map<string, number>();
  for (const p of positionen) {
    for (const a of p.andere) {
      const key = platzKey({ gegenstandId: p.gegenstandId, ...a });
      const da = plaetze.some((x) => x.ifcoId !== ifcoId && platzKey(x) === key);
      if (!da || a.ifcoId === ifcoId) return { plaetze, ungueltig: p.gegenstandId };
      neueMenge.set(key, a.anzahl);
    }
  }
  const neu = plaetze
    .filter((x) => x.ifcoId !== ifcoId)
    .map((x) => ({ ...x, anzahl: neueMenge.get(platzKey(x)) ?? x.anzahl }))
    .filter((x) => x.anzahl > 0);
  for (const p of positionen) {
    neu.push({ gegenstandId: p.gegenstandId, lagerortId: null, ifcoId, anzahl: p.anzahl });
  }
  return { plaetze: neu, ungueltig: null };
}

/** Key of a (Gegenstand, place) combination, as used by `verliehenJePlatz`. */
export const platzKey = (p: PlatzZiel & { gegenstandId: string }): string =>
  `${p.gegenstandId}\u0000${zielKey(p)}`;

/** Sum of the Plätze and its difference to the target: negative = pieces without a place. */
export function inventarAbweichung(
  soll: number,
  plaetze: { anzahl: number }[],
): { summe: number; differenz: number } {
  const summe = plaetze.reduce((s, p) => s + p.anzahl, 0);
  return { summe, differenz: summe - soll };
}

const ZU_VIEL_HINWEIS =
  'Nimm zuerst an einem anderen Platz etwas weg oder erhöhe die Anzahl (Soll).';

/**
 * Error when a change would put more pieces of a Gegenstand onto its Plätze than exist: at most
 * `soll` minus the `verbaut` (fixed) ones; null otherwise. `bisher`/`neu` are the sums on the
 * Plätze before and after, `verbautBisher` the fixed ones before. An already over-assigned
 * Gegenstand may still change as long as Plätze plus fixed ones do not grow.
 */
export function zuVielVerteiltFehler(
  name: string,
  soll: number,
  verbaut: number,
  bisher: number,
  neu: number,
  verbautBisher = verbaut,
): string | null {
  if (neu + verbaut <= soll || neu + verbaut <= bisher + verbautBisher) return null;
  if (verbaut === 0) {
    return `„${name}“ gibt es nur ${soll}-mal, zugeordnet wären ${neu}. ${ZU_VIEL_HINWEIS}`;
  }
  const frei = Math.max(0, soll - verbaut);
  return `„${name}“ gibt es nur ${soll}-mal, ${verbaut} davon fest verbaut: an Plätzen gehen höchstens ${frei}, zugeordnet wären ${neu}. ${ZU_VIEL_HINWEIS}`;
}

/**
 * Error when assigning to an IFCO would take pieces of a Gegenstand off its Plätze without putting
 * them elsewhere (`neu` < `bisher`, the sums on all its Plätze); assigning only redistributes, or
 * places pieces that had no Platz yet. Null otherwise.
 */
export function platzVerlustFehler(name: string, bisher: number, neu: number): string | null {
  if (neu >= bisher) return null;
  const n = bisher - neu;
  return `„${name}“: ${n === 1 ? '1 Stück hätte' : `${n} Stück hätten`} danach keinen Platz mehr. Trage ${n === 1 ? 'es' : 'sie'} an einem anderen Platz ein oder räume über „Plätze ändern“ beim Gegenstand um.`;
}

/** Pieces of a Gegenstand that can go onto Plätze: the Soll minus the fixed ones. */
export const verteilbar = (g: { anzahl: number; verbaut: { anzahl: number }[] }): number =>
  Math.max(0, g.anzahl - g.verbaut.reduce((s, v) => s + v.anzahl, 0));

/**
 * Error when the Soll-Anzahl of a Gegenstand is lowered below the pieces already on its Plätze or
 * built in (`summe`); raising it, even if still too low, is always allowed.
 */
export function sollZuKleinFehler(soll: number, bisherSoll: number, summe: number): string | null {
  if (soll >= summe || soll >= bisherSoll) return null;
  return `Es sind schon ${summe} Stück an Plätzen oder fest verbaut. Nimm zuerst dort etwas weg.`;
}

/** `2 ohne Platz` / `1 mehr als Soll`, null when the Plätze match the target. */
export function abweichungText(differenz: number): string | null {
  if (differenz < 0) return `${-differenz} ohne Platz`;
  if (differenz > 0) return `${differenz} mehr als Soll`;
  return null;
}

/** Display text of a place: `Lager › Regal`, or `Spanngurtkiste · Lager › Regal` for an IFCO. */
export function platzText(
  lagerorte: BaumKnoten[],
  ifcos: { id: string; name: string; lagerortId: string | null }[],
  ziel: PlatzZiel,
): string {
  if (ziel.lagerortId !== null) return pfad(lagerorte, ziel.lagerortId);
  const ifco = ifcos.find((i) => i.id === ziel.ifcoId);
  if (!ifco) return 'Unbekannte IFCO';
  return `${ifco.name} · ${ifco.lagerortId === null ? 'ohne Platz' : pfad(lagerorte, ifco.lagerortId)}`;
}

/** Lent amount per (Gegenstand, place) for the given open Ausleihe-Positionen. */
export function verliehenJePlatz(offen: PlatzMenge[]): Map<string, number> {
  const summen = new Map<string, number>();
  for (const p of offen) summen.set(platzKey(p), (summen.get(platzKey(p)) ?? 0) + p.anzahl);
  return summen;
}

/** An open Ausleihe-Position together with the start of its Ausleihe. */
export interface OffenePosition extends PlatzMenge {
  /** Start of the Ausleihe (ISO string or Date). */
  ausgeliehenAm: Date | string;
  /** Planned return day (`YYYY-MM-DD`); missing or null = open-ended. */
  rueckgabeGeplant?: string | null;
  /** Borrower of the Ausleihe; used to say who blocks a place. */
  an?: string;
  ausleiheId?: string;
}

/** Date as `20.10.2026` in the club's time zone. */
export const datumDe = (z: Date | string): string =>
  (z instanceof Date ? z : new Date(z)).toLocaleDateString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

const zeit = (z: Date | string): number => (z instanceof Date ? z : new Date(z)).getTime();

const hatBeginn = (p: PlatzMenge | OffenePosition): p is OffenePosition => 'ausgeliehenAm' in p;

/** The days a position occupies its pieces; positions without a known start occupy them forever. */
export function belegungVon(p: PlatzMenge | OffenePosition, heute: string): Belegung {
  const tage = hatBeginn(p)
    ? belegteTage(p.ausgeliehenAm, p.rueckgabeGeplant, heute)
    : belegteTage(undefined, null, heute);
  return { ...tage, anzahl: p.anzahl };
}

const heuteVon = (jetzt: Date | string): string => heuteBerlin(new Date(jetzt));

/** Occupancy of the open positions at one place of one Gegenstand. */
function belegungenAmPlatz(
  offen: (PlatzMenge | OffenePosition)[],
  ziel: PlatzZiel & { gegenstandId: string },
  heute: string,
  ohneAusleiheId?: string,
): Belegung[] {
  const key = platzKey(ziel);
  return offen
    .filter(
      (o) =>
        platzKey(o) === key &&
        (ohneAusleiheId === undefined || !hatBeginn(o) || o.ausleiheId !== ohneAusleiheId),
    )
    .map((o) => belegungVon(o, heute));
}

/**
 * Pieces of a place that are free on every day of `zeitraum`: assigned minus the highest number of
 * pieces occupied at the same time by the other open positions there. `ohneAusleiheId` leaves out
 * the Ausleihe being edited.
 */
export function freiImZeitraum(
  zugeordnet: number,
  offen: (PlatzMenge | OffenePosition)[],
  ziel: PlatzZiel & { gegenstandId: string },
  zeitraum: Tage,
  jetzt: Date | string = new Date(),
  ohneAusleiheId?: string,
): number {
  const belegt = maximaleBelegung(
    belegungenAmPlatz(offen, ziel, heuteVon(jetzt), ohneAusleiheId),
    zeitraum,
  );
  return zugeordnet - belegt;
}

/** One borrower who holds (or has reserved) pieces from a place. */
export interface Blockierung {
  ausleiheId?: string;
  an: string;
  anzahl: number;
  vorgemerkt: boolean;
  /** Start day, `20.10.2026` */
  datum: string;
  /** Text of the start for open-ended holds: `seit 20.10.2026` / `ab 25.10.2026`. */
  beginn: string;
  /** `20.10.–27.10.2026` or null when there is no planned return. */
  zeitraum: string | null;
  /** Planned return day is over: `27.10.2026`, else null. */
  ueberfaelligSeit: string | null;
}

/**
 * Open positions with a known borrower at the given place of a Gegenstand (`null` = anywhere), as
 * blocking entries (same Ausleihe summed). With `zeitraum` only those that occupy a day of it.
 */
export function blockierungen(
  offen: OffenePosition[],
  ziel: (PlatzZiel & { gegenstandId: string }) | null,
  jetzt: Date | string,
  zeitraum?: Tage,
  ohneAusleiheId?: string,
): Blockierung[] {
  const key = ziel && platzKey(ziel);
  const heute = heuteVon(jetzt);
  const liste: Blockierung[] = [];
  for (const p of offen) {
    if (p.an === undefined || (key !== null && platzKey(p) !== key)) continue;
    if (ohneAusleiheId !== undefined && p.ausleiheId === ohneAusleiheId) continue;
    if (zeitraum && !ueberschneiden(belegungVon(p, heute), zeitraum)) continue;
    const vorgemerkt = istVorgemerkt(p.ausgeliehenAm, jetzt);
    const bestehend = liste.find(
      (b) => b.ausleiheId === p.ausleiheId && b.an === p.an && b.vorgemerkt === vorgemerkt,
    );
    if (bestehend) bestehend.anzahl += p.anzahl;
    else {
      const rueckgabe = p.rueckgabeGeplant ?? null;
      liste.push({
        ausleiheId: p.ausleiheId,
        an: p.an,
        anzahl: p.anzahl,
        vorgemerkt,
        datum: datumDe(p.ausgeliehenAm),
        beginn: beginnTextVon(p.ausgeliehenAm, jetzt),
        zeitraum: rueckgabe ? zeitraumText(p.ausgeliehenAm, rueckgabe) : null,
        ueberfaelligSeit:
          rueckgabe && rueckgabeUeberfaellig(rueckgabe, heute) ? datumAnzeigen(rueckgabe) : null,
      });
    }
  }
  return liste.sort((a, b) => Number(a.vorgemerkt) - Number(b.vorgemerkt));
}

/** `seit 20.10.2026` for a start in the past, `ab 25.10.2026` for one in the future (one place for all texts). */
export const beginnTextVon = (ausgeliehenAm: Date | string, jetzt: Date | string): string =>
  beginnText(ausgeliehenAm, jetzt, datumDe);

/**
 * `3 an Feuerwehr verliehen (20.10.–27.10.2026), 2 an Jugend vorgemerkt (25.10.–26.10.2026)`;
 * overdue: `… verliehen (überfällig seit 27.10.2026)`; without a return day `(seit 20.10.2026)` /
 * `(ab 25.10.2026)`. Empty without borrowers.
 */
export const blockierungText = (liste: Blockierung[]): string =>
  liste.map((b) => `${b.anzahl} an ${b.an} ${blockierungWann(b)}`).join(', ');

/** `verliehen (20.10.–27.10.2026)` / `vorgemerkt (überfällig seit …)`: the part of a Blockierung after the borrower. */
export const blockierungWann = (b: Blockierung): string =>
  `${b.vorgemerkt ? 'vorgemerkt' : 'verliehen'} (${b.ueberfaelligSeit ? `überfällig seit ${b.ueberfaelligSeit}` : (b.zeitraum ?? b.beginn)})`;

/** True while the Ausleihe starts in the future: its pieces are reserved ("vorgemerkt"), not away yet. */
export const istVorgemerkt = (ausgeliehenAm: Date | string, jetzt: Date | string): boolean =>
  zeit(ausgeliehenAm) > zeit(jetzt);

/** Splits open positions into those that are away now (`verliehen`) and those starting later (`vorgemerkt`). */
export function offenAufteilen<T extends { ausgeliehenAm: Date | string }>(
  offen: T[],
  jetzt: Date | string,
): { verliehen: T[]; vorgemerkt: T[] } {
  const verliehen: T[] = [];
  const vorgemerkt: T[] = [];
  for (const p of offen) (istVorgemerkt(p.ausgeliehenAm, jetzt) ? vorgemerkt : verliehen).push(p);
  return { verliehen, vorgemerkt };
}

export type AusleiheStatus = 'geplant' | 'verliehen' | 'erledigt';

/** `erledigt` when every position is back, `geplant` when it starts in the future, else `verliehen`. */
export function ausleiheStatus(
  ausgeliehenAm: Date | string,
  positionen: { zurueckAm: Date | string | null }[],
  jetzt: Date | string,
): AusleiheStatus {
  if (positionen.every((p) => p.zurueckAm !== null)) return 'erledigt';
  return istVorgemerkt(ausgeliehenAm, jetzt) ? 'geplant' : 'verliehen';
}

/** Names used in the error messages; defaults to the ids. */
export interface Beschriftung {
  gegenstand: (id: string) => string;
  platz: (ziel: PlatzZiel) => string;
}

const OHNE_NAMEN: Beschriftung = {
  gegenstand: (id) => id,
  platz: (z) => z.lagerortId ?? z.ifcoId ?? '',
};

export interface AusleihPruefung {
  beschriftung?: Beschriftung;
  jetzt?: Date | string;
  /** The Ausleihe being edited: its own open positions do not count against the new period. */
  ohneAusleiheId?: string;
}

/**
 * German error unless each new position takes at most what is assigned at its place minus the
 * highest number of pieces the other open positions occupy there at the same time on any day of
 * `zeitraum` (`plaetze` and `offen` may contain other Gegenstände), otherwise null. Only the
 * Ausleihen that overlap `zeitraum` are named.
 */
export function ausleihFehler(
  plaetze: PlatzMenge[],
  offen: (PlatzMenge | OffenePosition)[],
  neu: PlatzMenge[],
  zeitraum: Tage,
  { beschriftung = OHNE_NAMEN, jetzt = new Date(), ohneAusleiheId }: AusleihPruefung = {},
): string | null {
  const wer = (p: PlatzMenge) => {
    const text = blockierungText(
      blockierungen(offen.filter(hatBeginn), p, jetzt, zeitraum, ohneAusleiheId),
    );
    return text ? `: ${text}.` : '.';
  };
  const zugeordnet = verliehenJePlatz(plaetze);
  for (const [key, anzahl] of verliehenJePlatz(neu)) {
    const p = neu.find((n) => platzKey(n) === key)!;
    const g = `„${beschriftung.gegenstand(p.gegenstandId)}“`;
    const ort = `„${beschriftung.platz(p)}“`;
    const platz = zugeordnet.get(key) ?? 0;
    if (platz === 0) return `${g} ist nicht bei ${ort} eingelagert.`;
    const frei = freiImZeitraum(platz, offen, p, zeitraum, jetzt, ohneAusleiheId);
    if (frei <= 0) return `Von ${g} ist bei ${ort} nichts mehr verfügbar${wer(p)}`;
    if (anzahl > frei) return `Von ${g} sind bei ${ort} nur noch ${frei} verfügbar${wer(p)}`;
  }
  return null;
}

/**
 * German error if the new assignment `neu` of one Gegenstand (or of one IFCO) would drop a place
 * below the highest number of pieces occupied at the same time from today on (all open positions;
 * open-ended ones count forever), otherwise null. `offen` may contain other Gegenstände.
 */
export function verliehenFehler(
  neu: PlatzMenge[],
  offen: (PlatzMenge | OffenePosition)[],
  beschriftung: Beschriftung = OHNE_NAMEN,
  jetzt: Date | string = new Date(),
): string | null {
  const heute = heuteVon(jetzt);
  const abHeute: Tage = { von: heute, bis: null };
  const zugeordnet = verliehenJePlatz(neu);
  for (const key of verliehenJePlatz(offen).keys()) {
    const p = offen.find((o) => platzKey(o) === key)!;
    const belegt = maximaleBelegung(belegungenAmPlatz(offen, p, heute), abHeute);
    if ((zugeordnet.get(key) ?? 0) >= belegt) continue;
    const wer = blockierungText(blockierungen(offen.filter(hatBeginn), p, jetzt, abHeute));
    return `„${beschriftung.gegenstand(p.gegenstandId)}“ bei „${beschriftung.platz(p)}“: Davon sind noch ${belegt} verliehen oder vorgemerkt${wer ? `: ${wer}` : ''}.`;
  }
  return null;
}

/** An Ausleihe that is overdue and thereby endangers a later one. */
export interface Gefaehrdung {
  id: string;
  an: string;
}

/**
 * Per not yet started Ausleihe the overdue open Ausleihen that endanger it ("gefährdet"): at the
 * same Gegenstand and place, the later one would not fit any more if the overdue pieces (return
 * day over, still open) never came back, i.e. when they count as occupied for its whole period.
 * `plaetze` are the assignments, `offen` all open positions (with `ausleiheId` and `an`).
 */
export function gefaehrdungen(
  plaetze: PlatzMenge[],
  offen: OffenePosition[],
  jetzt: Date | string = new Date(),
): Map<string, Gefaehrdung[]> {
  const heute = heuteVon(jetzt);
  const zugeordnet = verliehenJePlatz(plaetze);
  const ueberfaellige = offen.filter(
    (o) => o.ausleiheId !== undefined && rueckgabeUeberfaellig(o.rueckgabeGeplant, heute),
  );
  const ergebnis = new Map<string, Gefaehrdung[]>();
  if (ueberfaellige.length === 0) return ergebnis;
  for (const f of offen) {
    if (f.ausleiheId === undefined || !istVorgemerkt(f.ausgeliehenAm, jetzt)) continue;
    const key = platzKey(f);
    const verursacher = ueberfaellige.filter((u) => platzKey(u) === key);
    if (verursacher.length === 0) continue;
    const zeitraum = ausleiheTage(f.ausgeliehenAm, f.rueckgabeGeplant);
    const pessimistisch = offen
      .filter((o) => platzKey(o) === key && o.ausleiheId !== f.ausleiheId)
      .map((o) => ({
        ...belegungVon(o, heute),
        ...(ueberfaellige.includes(o) ? { bis: null } : {}),
      }));
    if ((zugeordnet.get(key) ?? 0) - maximaleBelegung(pessimistisch, zeitraum) >= f.anzahl)
      continue;
    const bisher = ergebnis.get(f.ausleiheId) ?? [];
    for (const u of verursacher) {
      if (!bisher.some((b) => b.id === u.ausleiheId))
        bisher.push({ id: u.ausleiheId!, an: u.an ?? '' });
    }
    ergebnis.set(f.ausleiheId, bisher);
  }
  return ergebnis;
}

// ---------------------------------------------------------------------------
// Whole IFCO

/** A position of an Ausleihe that may belong to a whole-IFCO lending. */
export interface IfcoPositionsInfo {
  ifcoId: string | null;
  ganzeIfco?: boolean | null;
}

/** One entry of a position list: a single position or all positions of one whole-IFCO lending. */
export type PositionsEintrag<T> =
  { art: 'einzeln'; position: T } | { art: 'ifco'; ifcoId: string; positionen: T[] };

/**
 * Groups the positions flagged `ganzeIfco` by their IFCO (one entry per IFCO, at the place of its
 * first position); all other positions stay single entries. The order is otherwise kept.
 */
export function positionenGruppieren<T extends IfcoPositionsInfo>(
  positionen: T[],
): PositionsEintrag<T>[] {
  const eintraege: PositionsEintrag<T>[] = [];
  const gruppen = new Map<string, T[]>();
  for (const position of positionen) {
    if (!position.ganzeIfco || position.ifcoId === null) {
      eintraege.push({ art: 'einzeln', position });
      continue;
    }
    const bisher = gruppen.get(position.ifcoId);
    if (bisher) bisher.push(position);
    else {
      const liste = [position];
      gruppen.set(position.ifcoId, liste);
      eintraege.push({ art: 'ifco', ifcoId: position.ifcoId, positionen: liste });
    }
  }
  return eintraege;
}

/**
 * German error unless every whole-IFCO lending in `neu` covers the complete available content of its
 * IFCO: all positions of that IFCO are flagged, and each Gegenstand is taken with exactly
 * (assigned in the IFCO minus what is occupied there at the same time during `zeitraum`). `inhalt` holds the
 * assignments of these IFCOs (other Gegenstände included), `offen` the open positions. Otherwise null.
 */
export function ganzeIfcoFehler(
  inhalt: PlatzMenge[],
  offen: (PlatzMenge | OffenePosition)[],
  neu: (PlatzMenge & IfcoPositionsInfo)[],
  zeitraum: Tage,
  { beschriftung = OHNE_NAMEN, jetzt = new Date() }: AusleihPruefung = {},
): string | null {
  const ifcoIds = [...new Set(neu.filter((p) => p.ganzeIfco && p.ifcoId).map((p) => p.ifcoId!))];
  for (const ifcoId of ifcoIds) {
    const ifco = `„${beschriftung.platz({ lagerortId: null, ifcoId })}“`;
    const eigene = neu.filter((p) => p.ifcoId === ifcoId);
    if (eigene.some((p) => !p.ganzeIfco)) {
      return `Die IFCO ${ifco} wird ganz verliehen. Alle ihre Positionen müssen zur ganzen IFCO gehören.`;
    }
    const frei = new Map<string, number>();
    for (const p of inhalt.filter((x) => x.ifcoId === ifcoId)) {
      const rest = freiImZeitraum(p.anzahl, offen, p, zeitraum, jetzt);
      if (rest > 0) frei.set(p.gegenstandId, rest);
    }
    if (frei.size === 0) return `In der IFCO ${ifco} ist nichts verfügbar.`;
    const genommen = new Map(eigene.map((p) => [p.gegenstandId, p.anzahl]));
    for (const gegenstandId of new Set([...frei.keys(), ...genommen.keys()])) {
      if ((frei.get(gegenstandId) ?? 0) === (genommen.get(gegenstandId) ?? 0)) continue;
      return `Die IFCO ${ifco} lässt sich nur komplett als ganze IFCO verleihen: von „${beschriftung.gegenstand(gegenstandId)}“ sind ${frei.get(gegenstandId) ?? 0} verfügbar, angegeben sind ${genommen.get(gegenstandId) ?? 0}.`;
    }
  }
  return null;
}
