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
  offen: PlatzMenge[],
  neu: PlatzMenge[],
  beschriftung: Beschriftung = OHNE_NAMEN,
): string | null {
  const zugeordnet = verliehenJePlatz(plaetze);
  const verliehen = verliehenJePlatz(offen);
  for (const [key, anzahl] of verliehenJePlatz(neu)) {
    const p = neu.find((n) => platzKey(n) === key)!;
    const g = `„${beschriftung.gegenstand(p.gegenstandId)}“`;
    const ort = `„${beschriftung.platz(p)}“`;
    const platz = zugeordnet.get(key) ?? 0;
    if (platz === 0) return `${g} ist nicht bei ${ort} eingelagert.`;
    const frei = platz - (verliehen.get(key) ?? 0);
    if (frei <= 0) return `Von ${g} ist bei ${ort} nichts mehr verfügbar.`;
    if (anzahl > frei) return `Von ${g} sind bei ${ort} nur noch ${frei} verfügbar.`;
  }
  return null;
}

/**
 * German error if the new assignment `neu` of one Gegenstand (or of one Ifco) would drop a place
 * below the amount that is still lent from there, otherwise null. `offen` may contain other Gegenstände.
 */
export function verliehenFehler(
  neu: PlatzMenge[],
  offen: PlatzMenge[],
  beschriftung: Beschriftung = OHNE_NAMEN,
): string | null {
  const zugeordnet = verliehenJePlatz(neu);
  for (const [key, verliehen] of verliehenJePlatz(offen)) {
    if ((zugeordnet.get(key) ?? 0) >= verliehen) continue;
    const p = offen.find((o) => platzKey(o) === key)!;
    return `„${beschriftung.gegenstand(p.gegenstandId)}“ bei „${beschriftung.platz(p)}“: Davon sind noch ${verliehen} verliehen.`;
  }
  return null;
}
