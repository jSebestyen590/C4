import { z } from 'zod';
import { datumAnzeigen, monateVerschieben, tagNachher } from './datum';
import { finanzDatumSchema, idempotenzSchluessel, type FinanzMitgliedDto } from './finanzen';

// Festschreibung (GoBD): months are closed one after the other; afterwards nothing is booked with a
// date in them (see docs/finanzen.md). A month is the ISO date of its first day (`YYYY-MM-01`).

/** The last day (`YYYY-MM-DD`) of the latest closed month, null without any. */
export function festgeschriebenBis(monate: readonly string[]): string | null {
  const letzter = [...monate].sort().at(-1);
  if (!letzter) return null;
  return monatsEnde(letzter);
}

/** The first day on which bookings are still possible, null when nothing is closed yet. */
export const ersterOffenerTag = (festBis: string | null): string | null =>
  festBis ? tagNachher(festBis, 1) : null;

/**
 * The month that has to be closed next (`YYYY-MM-01`): the one after the last closed month, or the
 * month of the earliest booking. Only whole past months count (before the month of `heuteBerlin`);
 * null when there is nothing to close yet.
 */
export function naechsterFestschreibbarerMonat(p: {
  letzterFest: string | null;
  fruehesteBuchung: string | null;
  heuteBerlin: string;
}): string | null {
  const start = p.letzterFest
    ? monateVerschieben(`${p.letzterFest.slice(0, 7)}-01`, 1)
    : p.fruehesteBuchung
      ? `${p.fruehesteBuchung.slice(0, 7)}-01`
      : null;
  if (!start) return null;
  return start < `${p.heuteBerlin.slice(0, 7)}-01` ? start : null;
}

/** `YYYY-MM-DD` -> `MM/YYYY`. */
export const monatAnzeigen = (iso: string): string => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Last day of the month of `monat` (`YYYY-MM-DD`). */
export const monatsEnde = (monat: string): string =>
  tagNachher(monateVerschieben(`${monat.slice(0, 7)}-01`, 1), -1);

export type BuchungsdatumErgebnis =
  { datum: string; verschoben: boolean; fehler?: undefined } | { fehler: string };

/**
 * The booking date for a wished date. Inside a closed month a booking with a fixed date is refused;
 * a `verschiebbar` one (Beleg, Erstattung, Zählung, Kassenabrechnung: the business date is stored
 * separately) is booked on the first open day instead.
 */
export function buchungsdatumFuer(
  gewuenscht: string,
  festBis: string | null,
  verschiebbar: boolean,
): BuchungsdatumErgebnis {
  if (!festBis || gewuenscht > festBis) return { datum: gewuenscht, verschoben: false };
  const offen = tagNachher(festBis, 1);
  if (verschiebbar) return { datum: offen, verschoben: true };
  return {
    fehler: `Der Monat ${monatAnzeigen(gewuenscht)} ist festgeschrieben. Buche mit einem Datum ab ${datumAnzeigen(offen)}.`,
  };
}

/** Body of `POST /api/finanzen/festschreibungen`. */
export const festschreibungEingabeSchema = z.object({
  monat: finanzDatumSchema.refine((d) => d.endsWith('-01'), 'Bitte gib den Ersten des Monats an.'),
  idempotenzSchluessel,
});
export type FestschreibungEingabe = z.output<typeof festschreibungEingabeSchema>;

export interface FestschreibungDto {
  id: string;
  /** First day of the month. */
  monat: string;
  bisSeq: number;
  kopfHash: string;
  anzahl: number;
  exportSchluessel: string;
  festgeschriebenVon: FinanzMitgliedDto | null;
  festgeschriebenAm: string;
}

export const FESTSCHREIBUNG_HINWEIS_ARTEN = ['beleg_entwurf', 'kassenzaehlung'] as const;
export type FestschreibungHinweisArt = (typeof FESTSCHREIBUNG_HINWEIS_ARTEN)[number];

/** Something that is still open in the next month to close; does not block, needs a confirmation. */
export interface FestschreibungHinweisDto {
  art: FestschreibungHinweisArt;
  anzahl: number;
  text: string;
}

export interface FestschreibungsUebersichtDto {
  /** Last day of the latest closed month. */
  festgeschriebenBis: string | null;
  ersterOffenerTag: string | null;
  /** First day of the month to close next, null when nothing can be closed. */
  naechsterMonat: string | null;
  hinweise: FestschreibungHinweisDto[];
  /** Newest month first. */
  liste: FestschreibungDto[];
}

export interface FestschreibungErgebnisDto {
  id: string;
  monat: string;
  bisSeq: number;
  kopfHash: string;
  anzahl: number;
  /** True when the month was closed before: nothing changed. */
  wiederholt?: boolean;
}
