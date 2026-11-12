import { z } from 'zod';
import type { Anrede } from './anrede';
import { heuteBerlin } from './datum';
import { name, zeitpunktSchema } from './bausteine';
import type { MitgliedStatus } from './status';

// Funnel sessions and the Trichterkönig:in ranking (see docs/trichter.md). Volumes are whole
// millilitres everywhere except in the input, which is in litres with at most 2 decimals.

/** Largest number of outlets (and so of participants) per funnel. */
export const TRICHTER_AUSLAESSE_MAX = 20;
/** Durchgänge per page of `GET /api/trichter/durchgaenge`. */
export const TRICHTER_DURCHGAENGE_SEITE = 20;

export const literZuMl = (liter: number): number => Math.round(liter * 1000);
export const mlZuLiter = (ml: number): number => ml / 1000;

const hatHoechstensZweiNachkommastellen = (liter: number) =>
  Math.abs(liter * 100 - Math.round(liter * 100)) < 1e-6;

const volumenL = z
  .number('Bitte gib ein Volumen an.')
  .positive('Das Volumen muss größer als 0 sein.')
  .max(1000, 'Das Volumen darf höchstens 1000 l betragen.')
  .refine(hatHoechstensZweiNachkommastellen, 'Höchstens 2 Nachkommastellen erlaubt.');

export const trichterEingabeSchema = z.object({
  name: name(),
  volumenL,
  auslaesse: z
    .number('Bitte gib die Anzahl der Auslässe an.')
    .int('Die Anzahl der Auslässe muss eine ganze Zahl sein.')
    .min(1, 'Es braucht mindestens 1 Auslass.')
    .max(TRICHTER_AUSLAESSE_MAX, `Höchstens ${TRICHTER_AUSLAESSE_MAX} Auslässe erlaubt.`),
});
export type TrichterEingabe = z.input<typeof trichterEingabeSchema>;

/** Body of `PUT /api/trichter/:id`: any of the fields; `archiviert` archives or reactivates. */
export const trichterAendernSchema = trichterEingabeSchema
  .partial()
  .extend({ archiviert: z.boolean().optional() });
export type TrichterAendern = z.input<typeof trichterAendernSchema>;

/** Tolerance for a slightly fast phone clock. */
const UHR_TOLERANZ_MS = 60_000;

export const durchgangEingabeSchema = z.object({
  trichterId: z.string().min(1, 'Bitte wähle einen Trichter.'),
  /** Total volume of the Durchgang; the API checks it against the funnel. */
  volumenL,
  teilnehmende: z
    .array(z.string().min(1))
    .min(1, 'Bitte wähle mindestens eine Person aus.')
    .max(TRICHTER_AUSLAESSE_MAX, `Höchstens ${TRICHTER_AUSLAESSE_MAX} Personen erlaubt.`)
    .refine((subs) => new Set(subs).size === subs.length, 'Jede Person nur einmal.'),
  /** Defaults to now. */
  zeitpunkt: zeitpunktSchema
    .refine((wert) => new Date(wert).getTime() <= Date.now() + UHR_TOLERANZ_MS, {
      message: 'Der Zeitpunkt darf nicht in der Zukunft liegen.',
    })
    .optional(),
});
export type DurchgangEingabe = z.input<typeof durchgangEingabeSchema>;

// ----- Ranking

/** What the ranking needs of a Durchgang. */
export interface RanglisteDurchgang {
  zeitpunkt: string | Date;
  /** Total volume; each participant is credited `volumenMl / teilnehmende.length`. */
  volumenMl: number;
  teilnehmende: readonly string[];
}

export interface RanglisteZeile {
  sub: string;
  anzahl: number;
  /** Credited volume; may be fractional because the volume is shared. */
  ml: number;
}

/** Calendar year of a point in time in the club's time zone. */
export const jahrBerlin = (zeitpunkt: string | Date): number =>
  Number(heuteBerlin(new Date(zeitpunkt)).slice(0, 4));

/** Years that have at least one Durchgang, newest first. */
export function jahreMitEintraegen(durchgaenge: readonly RanglisteDurchgang[]): number[] {
  return [...new Set(durchgaenge.map((d) => jahrBerlin(d.zeitpunkt)))].sort((a, b) => b - a);
}

/** Credited volumes are sums of fractions; round so equal totals summed in any order tie. */
const mlGerundet = (ml: number) => Math.round(ml * 1e6) / 1e6;

/**
 * Per member the number of Durchgänge and the credited volume, optionally only for one calendar
 * year (Berlin; `null` = all). Most Durchgänge first, then most volume, then by sub.
 */
export function rangliste(
  durchgaenge: readonly RanglisteDurchgang[],
  jahr: number | null,
): RanglisteZeile[] {
  const zeilen = new Map<string, RanglisteZeile>();
  for (const d of durchgaenge) {
    if (jahr !== null && jahrBerlin(d.zeitpunkt) !== jahr) continue;
    if (d.teilnehmende.length === 0) continue;
    const anteil = d.volumenMl / d.teilnehmende.length;
    for (const sub of d.teilnehmende) {
      const z = zeilen.get(sub) ?? { sub, anzahl: 0, ml: 0 };
      z.anzahl += 1;
      z.ml += anteil;
      zeilen.set(sub, z);
    }
  }
  return [...zeilen.values()].sort(
    (a, b) =>
      b.anzahl - a.anzahl || mlGerundet(b.ml) - mlGerundet(a.ml) || a.sub.localeCompare(b.sub),
  );
}

/** The Trichterkönig:in: most Durchgänge, then most volume; all who tie on both are returned. */
export function koenige(zeilen: readonly { sub: string; anzahl: number; ml: number }[]): string[] {
  let beste: { anzahl: number; ml: number } | undefined;
  for (const z of zeilen) {
    if (
      !beste ||
      z.anzahl > beste.anzahl ||
      (z.anzahl === beste.anzahl && mlGerundet(z.ml) > mlGerundet(beste.ml))
    ) {
      beste = z;
    }
  }
  if (!beste) return [];
  const b = beste;
  return zeilen
    .filter((z) => z.anzahl === b.anzahl && mlGerundet(z.ml) === mlGerundet(b.ml))
    .map((z) => z.sub);
}

export type RanglisteSpalte = 'anzahl' | 'liter' | 'name';
export type Sortierrichtung = 'auf' | 'ab';

/**
 * Sorts ranking rows (a copy). 'anzahl' ties are broken by volume, 'liter' ties by count (same
 * direction); every remaining tie falls back to the name. `anzeigename` is needed for `name`
 * (and as the final tie-break), e.g. the username of the member.
 */
export function sortiereRangliste<T extends { anzahl: number; ml: number }>(
  zeilen: readonly T[],
  spalte: RanglisteSpalte,
  richtung: Sortierrichtung,
  anzeigename: (zeile: T) => string = () => '',
): T[] {
  const vorzeichen = richtung === 'auf' ? 1 : -1;
  const text = (a: T, b: T) => anzeigename(a).localeCompare(anzeigename(b), 'de');
  return [...zeilen].sort((a, b) => {
    const primaer =
      spalte === 'name'
        ? text(a, b)
        : spalte === 'anzahl'
          ? a.anzahl - b.anzahl || mlGerundet(a.ml) - mlGerundet(b.ml)
          : mlGerundet(a.ml) - mlGerundet(b.ml) || a.anzahl - b.anzahl;
    return vorzeichen * primaer || text(a, b);
  });
}

// ----- DTOs

/** A member with the display data of `StatusName` (username, else Vorname Nachname). */
export interface TrichterMitgliedDto {
  sub: string;
  username: string | null;
  vorname: string;
  nachname: string;
  status: MitgliedStatus;
  anrede: Anrede;
}

export interface TrichterDto {
  id: string;
  name: string;
  volumenMl: number;
  auslaesse: number;
  archiviert: boolean;
}

export interface DurchgangDto {
  id: string;
  trichter: { id: string; name: string };
  /** Total volume of the Durchgang. */
  volumenMl: number;
  zeitpunkt: string;
  teilnehmende: TrichterMitgliedDto[];
  eingetragenVon: TrichterMitgliedDto;
  eingetragenAm: string;
  /** The caller entered it or may manage Trichter. */
  darfLoeschen: boolean;
}

/** `GET /api/trichter/durchgaenge`: `weiter` is the `vor` cursor of the next page (null: no more). */
export interface DurchgaengeSeiteDto {
  durchgaenge: DurchgangDto[];
  weiter: string | null;
}

export interface RanglisteZeileDto {
  mitglied: TrichterMitgliedDto;
  anzahl: number;
  ml: number;
}

export interface TrichterUebersichtDto {
  /** The calendar year the Könige of `jahreskoenige` refer to (Berlin). */
  aktuellesJahr: number;
  /** Echo of the filter: a year or null for all entries. */
  jahr: number | null;
  /** Könige of the current year and of all time; several on a full tie, empty without entries. */
  jahreskoenige: TrichterMitgliedDto[];
  ewigeKoenige: TrichterMitgliedDto[];
  /** For the filter, most Durchgänge first. */
  rangliste: RanglisteZeileDto[];
  /** Years with entries, newest first. */
  jahre: number[];
}
