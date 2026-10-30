import { z } from 'zod';
import type { Anrede } from './anrede';
import { beschreibung, name } from './bausteine';
import type { MitgliedStatus } from './status';

// Club keys that are handed from person to person (see docs/schluessel.md).

/** Per key only the newest Übergaben are kept. */
export const SCHLUESSEL_VERLAUF_MAX = 10;

/**
 * Who holds a key: a member, a person without the app (free-text name) or nobody (`null`, e.g. a
 * new key or one deposited somewhere).
 */
export const halterSchema = z
  .discriminatedUnion('art', [
    z.object({ art: z.literal('mitglied'), sub: z.string().min(1, 'Bitte wähle ein Mitglied.') }),
    z.object({ art: z.literal('person'), name: name() }),
  ])
  .nullable();
export type Halter = z.infer<typeof halterSchema>;

/** Same holder; names of persons without the app compare trimmed and case-insensitively. */
export function halterGleich(a: Halter, b: Halter): boolean {
  if (a === null || b === null) return a === b;
  if (a.art === 'mitglied') return b.art === 'mitglied' && a.sub === b.sub;
  return b.art === 'person' && a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
}

export const schluesselEingabeSchema = z.object({
  name: name(),
  beschreibung,
});
export type SchluesselEingabe = z.input<typeof schluesselEingabeSchema>;

/** A new key, optionally with its first holder. */
export const schluesselAnlegenSchema = schluesselEingabeSchema.extend({
  halter: halterSchema.default(null),
});
export type SchluesselAnlegen = z.input<typeof schluesselAnlegenSchema>;

/**
 * Body of `POST /api/schluessel/:id/uebergaben`. `von` is the holder the client saw; the API refuses
 * the Übergabe when the key has moved on in the meantime.
 */
export const uebergabeSchema = z
  .object({ von: halterSchema, an: halterSchema })
  .refine((u) => !halterGleich(u.von, u.an), {
    message: 'Der Schlüssel ist schon dort.',
    path: ['an'],
  });
export type UebergabeEingabe = z.input<typeof uebergabeSchema>;

/** A holder with the display data of a member. */
export type HalterDto =
  | {
      art: 'mitglied';
      sub: string;
      username: string | null;
      vorname: string;
      nachname: string;
      status: MitgliedStatus;
      anrede: Anrede;
    }
  | { art: 'person'; name: string }
  | null;

export interface SchluesselDto {
  id: string;
  name: string;
  beschreibung: string | null;
  archiviert: boolean;
  halter: HalterDto;
  /** When the current holder got the key; null without any recorded Übergabe. */
  halterSeit: string | null;
}

export interface UebergabeDto {
  id: string;
  von: HalterDto;
  an: HalterDto;
  /** The member who recorded it. */
  eingetragenVon: HalterDto;
  zeitpunkt: string;
}

export interface SchluesselDetailDto extends SchluesselDto {
  /** Newest first, at most SCHLUESSEL_VERLAUF_MAX. */
  uebergaben: UebergabeDto[];
}
