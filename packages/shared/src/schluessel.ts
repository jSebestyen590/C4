import { z } from 'zod';
import type { Anrede } from './anrede';
import { beschreibung, kommentarSchema, name } from './bausteine';
import { heuteBerlin, tagNachher } from './datum';
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
  /** Planned handovers in time order (the designated next holders). */
  planungen: PlanungDto[];
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

// ---------------------------------------------------------------------------
// Anfragen (Bedarf / Abgabe) and geplante Übergaben

const uhrzeit = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Bitte gib eine gültige Uhrzeit an.');
const uhrzeitOptional = uhrzeit.nullish().transform((v) => v ?? null);

/** Fields of a time window; combine with `pruefeZeitfenster` in a `superRefine`. */
const zeitfensterFelder = {
  datum: z.iso.date({ error: 'Bitte wähle einen Tag.' }),
  /** `HH:MM` Berlin time; both ab and bis empty = all day. */
  ab: uhrzeitOptional,
  bis: uhrzeitOptional,
  notiz: kommentarSchema,
};

function pruefeZeitfenster(
  f: { datum?: string | null | undefined; ab?: string | null; bis?: string | null },
  ctx: z.RefinementCtx,
  { vergangenheit = false } = {},
) {
  if (f.ab && f.bis && f.ab > f.bis) {
    ctx.addIssue({ code: 'custom', path: ['bis'], message: 'Bis muss nach „ab“ liegen.' });
  }
  if (!vergangenheit && f.datum && f.datum < heuteBerlin()) {
    ctx.addIssue({
      code: 'custom',
      path: ['datum'],
      message: 'Der Tag liegt in der Vergangenheit.',
    });
  }
}

export const zeitfensterSchema = z
  .object(zeitfensterFelder)
  .superRefine((f, ctx) => pruefeZeitfenster(f, ctx));
export type ZeitfensterEingabe = z.input<typeof zeitfensterSchema>;

export const ANFRAGE_ARTEN = ['bedarf', 'abgabe'] as const;
export type AnfrageArt = (typeof ANFRAGE_ARTEN)[number];
export const ANTWORT_ARTEN = ['zusage', 'ablehnung', 'gegenvorschlag'] as const;
export type AntwortArt = (typeof ANTWORT_ARTEN)[number];
export type AnfrageStatus = 'offen' | 'vergeben' | 'zurueckgezogen';

const schluesselIdOptional = z
  .string()
  .min(1)
  .nullish()
  .transform((v) => v ?? null);

/**
 * Body of `POST /api/schluessel/anfragen`. A Bedarf may name a key (`schluesselId`) or leave it
 * empty ("irgendeiner"); an Abgabe always names the key to hand over.
 */
export const anfrageAnlegenSchema = z
  .object({ art: z.enum(ANFRAGE_ARTEN), schluesselId: schluesselIdOptional, ...zeitfensterFelder })
  .superRefine((a, ctx) => {
    pruefeZeitfenster(a, ctx);
    if (a.art === 'abgabe' && !a.schluesselId) {
      ctx.addIssue({
        code: 'custom',
        path: ['schluesselId'],
        message: 'Bitte wähle den Schlüssel, den du abgeben willst.',
      });
    }
  });
export type AnfrageAnlegen = z.input<typeof anfrageAnlegenSchema>;

/**
 * Body of `PUT /api/schluessel/anfragen/:id/antwort`. A Gegenvorschlag carries its own time window;
 * `schluesselId` is the key a responder offers for a Bedarf without a named key.
 */
export const antwortSchema = z
  .object({
    art: z.enum(ANTWORT_ARTEN),
    schluesselId: schluesselIdOptional,
    datum: zeitfensterFelder.datum.nullish().transform((v) => v ?? null),
    ab: zeitfensterFelder.ab,
    bis: zeitfensterFelder.bis,
    notiz: zeitfensterFelder.notiz,
  })
  .superRefine((a, ctx) => {
    if (a.art !== 'gegenvorschlag') return;
    if (!a.datum) {
      ctx.addIssue({ code: 'custom', path: ['datum'], message: 'Bitte wähle einen Tag.' });
      return;
    }
    pruefeZeitfenster(a, ctx);
  });
export type AntwortEingabe = z.input<typeof antwortSchema>;

/** Body of `POST /api/schluessel/:id/planungen` and `PUT /api/schluessel/planungen/:id`. */
export const planungSchema = z
  .object({ anSub: z.string().min(1, 'Bitte wähle ein Mitglied.'), ...zeitfensterFelder })
  .superRefine((p, ctx) => pruefeZeitfenster(p, ctx));
export type PlanungEingabe = z.input<typeof planungSchema>;

export interface ZeitfensterDto {
  datum: string;
  ab: string | null;
  bis: string | null;
  notiz: string | null;
}

const wochentagFormat = new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', weekday: 'short' });

/**
 * "heute ab 18:00", "morgen im Laufe des Tages", "Fr, 13.11. 16:00–18:00" (the note is not part
 * of it). `heute` is injectable for tests.
 */
export function zeitfensterAnzeigen(
  f: Pick<ZeitfensterDto, 'datum' | 'ab' | 'bis'>,
  heute: string = heuteBerlin(),
): string {
  let tag: string;
  if (f.datum === heute) tag = 'heute';
  else if (f.datum === tagNachher(heute, 1)) tag = 'morgen';
  else {
    const [, monat, t] = f.datum.split('-');
    const wochentag = wochentagFormat.format(new Date(`${f.datum}T12:00:00Z`)).replace('.', '');
    tag = `${wochentag}, ${t}.${monat}.`;
  }
  const zeit =
    f.ab && f.bis
      ? `${f.ab}–${f.bis}`
      : f.ab
        ? `ab ${f.ab}`
        : f.bis
          ? `bis ${f.bis}`
          : 'im Laufe des Tages';
  return `${tag} ${zeit}`;
}

/** A member with the display data used by `StatusName`. */
export type MitgliedRefDto = Extract<NonNullable<HalterDto>, { art: 'mitglied' }>;

export interface AntwortDto {
  id: string;
  mitglied: MitgliedRefDto;
  art: AntwortArt;
  /** Only for a Gegenvorschlag (time window), or the note of a Zusage. */
  zeitfenster: ZeitfensterDto | null;
  /** The key offered for a Bedarf without a named key. */
  schluessel: { id: string; name: string } | null;
  notiz: string | null;
  erstellt: string;
}

export interface AnfrageDto {
  id: string;
  art: AnfrageArt;
  ersteller: MitgliedRefDto;
  /** Null for a Bedarf of "irgendeiner". */
  schluessel: { id: string; name: string } | null;
  zeitfenster: ZeitfensterDto;
  /** `abgelaufen` is computed: still open, but the day has passed. */
  status: AnfrageStatus | 'abgelaufen';
  erstellt: string;
  antworten: AntwortDto[];
  /** Whether the viewer is asked and the request is still open. */
  darfAntworten: boolean;
}

export interface PlanungDto {
  id: string;
  schluesselId: string;
  an: MitgliedRefDto;
  zeitfenster: ZeitfensterDto;
  /** The request this plan came from, if any. */
  anfrageId: string | null;
  erstelltVon: MitgliedRefDto;
}

/**
 * Who is expected to hold a key during a time window (the people to ask for a Bedarf). Walks the
 * planned handovers in time order: the expected holder is the recipient of the last plan strictly
 * before the window, else the current holder. A plan on the same day is strictly before only if
 * both sides have an `ab` and the plan's is not later; if either has none the order is unclear and
 * both the holder before that plan and its recipient are returned. Plans after the window are
 * ignored.
 */
export function erwarteteHalter(
  schluessel: { halterSub: string | null },
  planungen: readonly { anSub: string; datum: string; ab: string | null }[],
  fenster: { datum: string; ab: string | null },
): string[] {
  const subs = new Set<string>();
  let halter = schluessel.halterSub;
  const sortiert = [...planungen].sort(
    (a, b) => a.datum.localeCompare(b.datum) || (a.ab ?? '').localeCompare(b.ab ?? ''),
  );
  for (const p of sortiert) {
    if (p.datum > fenster.datum) break;
    if (p.datum < fenster.datum) {
      halter = p.anSub;
    } else if (p.ab && fenster.ab) {
      if (p.ab > fenster.ab) break;
      halter = p.anSub;
    } else {
      if (halter) subs.add(halter);
      subs.add(p.anSub);
      halter = p.anSub;
    }
  }
  if (halter) subs.add(halter);
  return [...subs];
}
