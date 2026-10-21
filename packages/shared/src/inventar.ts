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
import { datumSchema } from './schemas';
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
});
export type IfcoEingabe = z.input<typeof ifcoSchema>;

const ZIEL_MELDUNG = 'Bitte wähle genau einen Lagerort oder eine Ifco.';
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

/** Replaces all Plätze of a Gegenstand; each Lagerort/Ifco may appear only once. */
export const gegenstandPlaetzeSchema = z.object({
  plaetze: z
    .array(gegenstandPlatzSchema)
    .refine(
      (liste) => eindeutig(liste.map(zielKey)),
      'Jeder Platz darf nur einmal vorkommen. Fasse die Anzahlen zusammen.',
    ),
});
export type GegenstandPlaetzeEingabe = z.input<typeof gegenstandPlaetzeSchema>;

/** Replaces the content of an Ifco; each Gegenstand may appear only once. */
export const ifcoInhaltSchema = z.object({
  positionen: z
    .array(
      z.object({
        gegenstandId: idSchema('Bitte wähle einen Gegenstand.'),
        anzahl: anzahlSchema,
      }),
    )
    .refine(
      (liste) => eindeutig(liste.map((p) => p.gegenstandId)),
      'Jeder Gegenstand darf nur einmal vorkommen. Fasse die Anzahlen zusammen.',
    ),
});
export type IfcoInhaltEingabe = z.input<typeof ifcoInhaltSchema>;

export const ifcoPlatzSchema = z.object({ lagerortId: parentIdSchema });

const anSchema = z
  .string('Bitte gib an, an wen verliehen wird.')
  .trim()
  .min(1, 'Bitte gib an, an wen verliehen wird.')
  .max(200, 'Höchstens 200 Zeichen erlaubt.');

const ausleiheKopf = {
  an: anSchema,
  ausgeliehenAm: zeitpunktSchema,
  rueckgabeGeplant: datumSchema.nullish().transform((v) => v ?? null),
  kommentar: kommentarSchema,
};

export const ausleihePositionSchema = z
  .object({
    gegenstandId: idSchema('Bitte wähle einen Gegenstand.'),
    lagerortId: parentIdSchema,
    ifcoId: parentIdSchema,
    anzahl: anzahlSchema,
  })
  .refine(genauEinZiel, ZIEL_MELDUNG);

export const ausleiheSchema = z.object({
  ...ausleiheKopf,
  positionen: z
    .array(ausleihePositionSchema)
    .min(1, 'Bitte gib mindestens eine Position an.')
    .refine(
      (liste) => eindeutig(liste.map((p) => `${p.gegenstandId}\u0000${zielKey(p)}`)),
      'Jeder Gegenstand darf je Platz nur einmal vorkommen. Fasse die Anzahlen zusammen.',
    ),
});
export type AusleiheEingabe = z.input<typeof ausleiheSchema>;

/** Edits the header of an Ausleihe; the Positionen stay as they are. */
export const ausleiheAendernSchema = z.object(ausleiheKopf);
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

/** `2 ohne Platz` / `1 mehr als Soll`, null when the Plätze match the target. */
export function abweichungText(differenz: number): string | null {
  if (differenz < 0) return `${-differenz} ohne Platz`;
  if (differenz > 0) return `${differenz} mehr als Soll`;
  return null;
}

/** Display text of a place: `Lager › Regal`, or `Spanngurtkiste · Lager › Regal` for an Ifco. */
export function platzText(
  lagerorte: BaumKnoten[],
  ifcos: { id: string; name: string; lagerortId: string | null }[],
  ziel: PlatzZiel,
): string {
  if (ziel.lagerortId !== null) return pfad(lagerorte, ziel.lagerortId);
  const ifco = ifcos.find((i) => i.id === ziel.ifcoId);
  if (!ifco) return 'Unbekannte Ifco';
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

/** One borrower who holds (or has reserved) pieces from a place. */
export interface Blockierung {
  ausleiheId?: string;
  an: string;
  anzahl: number;
  vorgemerkt: boolean;
  /** `20.10.2026` */
  datum: string;
}

/** Open positions with a known borrower at the given place of a Gegenstand (`null` = anywhere), as blocking entries (same borrower summed). */
export function blockierungen(
  offen: OffenePosition[],
  ziel: (PlatzZiel & { gegenstandId: string }) | null,
  jetzt: Date | string,
): Blockierung[] {
  const key = ziel && platzKey(ziel);
  const liste: Blockierung[] = [];
  for (const p of offen) {
    if (p.an === undefined || (key !== null && platzKey(p) !== key)) continue;
    const vorgemerkt = istVorgemerkt(p.ausgeliehenAm, jetzt);
    const bestehend = liste.find(
      (b) => b.ausleiheId === p.ausleiheId && b.an === p.an && b.vorgemerkt === vorgemerkt,
    );
    if (bestehend) bestehend.anzahl += p.anzahl;
    else
      liste.push({
        ausleiheId: p.ausleiheId,
        an: p.an,
        anzahl: p.anzahl,
        vorgemerkt,
        datum: datumDe(p.ausgeliehenAm),
      });
  }
  return liste.sort((a, b) => Number(a.vorgemerkt) - Number(b.vorgemerkt));
}

/** `3 an Feuerwehr verliehen (seit 20.10.2026), 2 an Jugend vorgemerkt (ab 25.10.2026)`; empty without borrowers. */
export const blockierungText = (liste: Blockierung[]): string =>
  liste
    .map((b) =>
      b.vorgemerkt
        ? `${b.anzahl} an ${b.an} vorgemerkt (ab ${b.datum})`
        : `${b.anzahl} an ${b.an} verliehen (seit ${b.datum})`,
    )
    .join(', ');

const zeit = (z: Date | string): number => (z instanceof Date ? z : new Date(z)).getTime();

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

const hatBeginn = (p: PlatzMenge | OffenePosition): p is OffenePosition => 'ausgeliehenAm' in p;

/** Names used in the error messages; defaults to the ids. */
export interface Beschriftung {
  gegenstand: (id: string) => string;
  platz: (ziel: PlatzZiel) => string;
}

const OHNE_NAMEN: Beschriftung = {
  gegenstand: (id) => id,
  platz: (z) => z.lagerortId ?? z.ifcoId ?? '',
};

/**
 * German error unless each new position takes at most what is assigned at its place minus what is
 * already lent from there (`plaetze` and `offen` may contain other Gegenstände), otherwise null.
 */
export function ausleihFehler(
  plaetze: PlatzMenge[],
  offen: (PlatzMenge | OffenePosition)[],
  neu: PlatzMenge[],
  beschriftung: Beschriftung = OHNE_NAMEN,
  jetzt: Date | string = new Date(),
): string | null {
  const wer = (p: PlatzMenge) => {
    const text = blockierungText(blockierungen(offen.filter(hatBeginn), p, jetzt));
    return text ? `: ${text}.` : '.';
  };
  const zugeordnet = verliehenJePlatz(plaetze);
  const verliehen = verliehenJePlatz(offen);
  for (const [key, anzahl] of verliehenJePlatz(neu)) {
    const p = neu.find((n) => platzKey(n) === key)!;
    const g = `„${beschriftung.gegenstand(p.gegenstandId)}“`;
    const ort = `„${beschriftung.platz(p)}“`;
    const platz = zugeordnet.get(key) ?? 0;
    if (platz === 0) return `${g} ist nicht bei ${ort} eingelagert.`;
    const frei = platz - (verliehen.get(key) ?? 0);
    if (frei <= 0) return `Von ${g} ist bei ${ort} nichts mehr verfügbar${wer(p)}`;
    if (anzahl > frei) return `Von ${g} sind bei ${ort} nur noch ${frei} verfügbar${wer(p)}`;
  }
  return null;
}

/**
 * German error if the new assignment `neu` of one Gegenstand (or of one Ifco) would drop a place
 * below the amount that is still lent from there, otherwise null. `offen` may contain other Gegenstände.
 */
export function verliehenFehler(
  neu: PlatzMenge[],
  offen: (PlatzMenge | OffenePosition)[],
  beschriftung: Beschriftung = OHNE_NAMEN,
  jetzt: Date | string = new Date(),
): string | null {
  const zugeordnet = verliehenJePlatz(neu);
  for (const [key, verliehen] of verliehenJePlatz(offen)) {
    if ((zugeordnet.get(key) ?? 0) >= verliehen) continue;
    const p = offen.find((o) => platzKey(o) === key)!;
    const wer = blockierungText(blockierungen(offen.filter(hatBeginn), p, jetzt));
    return `„${beschriftung.gegenstand(p.gegenstandId)}“ bei „${beschriftung.platz(p)}“: Davon sind noch ${verliehen} verliehen oder vorgemerkt${wer ? `: ${wer}` : ''}.`;
  }
  return null;
}
