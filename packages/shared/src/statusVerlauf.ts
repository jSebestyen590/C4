import { z } from 'zod';
import { heuteBerlin, tagNachher, tagVorher } from './datum';
import { MITGLIED_STATI, type MitgliedStatus } from './status';

/** Start date of a status: a valid date that is not in the future. */
export const statusAbSchema = z.iso
  .date({ error: 'Bitte gib ein gültiges Datum an.' })
  .refine((d) => d <= heuteBerlin(), 'Das Datum darf nicht in der Zukunft liegen.');

/** One entry of the status history; `ab` is null when the start is unknown. */
export const statusEintragSchema = z.object({
  id: z.string(),
  status: z.enum(MITGLIED_STATI),
  ab: z.iso.date().nullable(),
});
export type StatusEintrag = z.infer<typeof statusEintragSchema>;

export const statusEintragEingabeSchema = z.object({
  status: z.enum(MITGLIED_STATI),
  ab: statusAbSchema,
});
export type StatusEintragEingabe = z.infer<typeof statusEintragEingabeSchema>;

/** Everything the member page needs to show the history of a person. */
export const mitgliedHistorieSchema = z.object({
  /** Sorted by `ab` ascending, entries without a date first. */
  statusVerlauf: z.array(statusEintragSchema),
  besetzungen: z.array(
    z.object({
      postenId: z.string(),
      postenName: z.string(),
      start: z.iso.date(),
      ende: z.iso.date().nullable(),
    }),
  ),
  /** Berlin date the account was deactivated; null while active. */
  deaktiviertAm: z.iso.date().nullable(),
});
export type MitgliedHistorie = z.infer<typeof mitgliedHistorieSchema>;

type MitStatus = { status: MitgliedStatus; ab: string | null };

/** Entries sorted by `ab` ascending; undated ones first. Stable, so list order breaks ties. */
export function statusVerlaufSortieren<T extends MitStatus>(eintraege: readonly T[]): T[] {
  return [...eintraege].sort((a, b) => {
    if (a.ab === b.ab) return 0;
    if (a.ab === null) return -1;
    if (b.ab === null) return 1;
    return a.ab < b.ab ? -1 : 1;
  });
}

/** The newest entry (latest `ab`; undated count as oldest, later list entries win ties). */
export function aktuellerStatus<T extends MitStatus>(eintraege: readonly T[]): T | null {
  const sortiert = statusVerlaufSortieren(eintraege);
  return sortiert[sortiert.length - 1] ?? null;
}

export interface StatusZeitraum {
  status: MitgliedStatus;
  von: string;
  bis: string;
}

/**
 * Periods of each status up to `ende` (inclusive, e.g. the deactivation date or today). A period
 * lasts until the day before the next dated entry. Undated entries and entries after `ende` are
 * skipped.
 */
export function statusZeitraeume(eintraege: readonly MitStatus[], ende: string): StatusZeitraum[] {
  const datiert = statusVerlaufSortieren(eintraege).filter(
    (e): e is { status: MitgliedStatus; ab: string } => e.ab !== null && e.ab <= ende,
  );
  const zeitraeume: StatusZeitraum[] = [];
  datiert.forEach((e, i) => {
    const naechste = datiert[i + 1];
    const bis = naechste ? tagVorher(naechste.ab) : ende;
    if (bis >= e.ab) zeitraeume.push({ status: e.status, von: e.ab, bis });
  });
  return zeitraeume;
}

/** Total days (inclusive) with status "mitglied" up to `ende`; undated stretches are not counted. */
export function mitgliedschaftTage(eintraege: readonly MitStatus[], ende: string): number {
  return statusZeitraeume(eintraege, ende)
    .filter((z) => z.status === 'mitglied')
    .reduce((summe, z) => summe + tageZwischen(z.von, z.bis), 0);
}

/** Days from `von` to `bis`, both inclusive. */
const tageZwischen = (von: string, bis: string): number => {
  let tage = 0;
  // Dates are short ranges in practice; walking via tagNachher avoids time zone arithmetic.
  for (let d = von; d <= bis; d = tagNachher(d, 1)) tage++;
  return tage;
};
