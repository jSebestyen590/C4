import { z } from 'zod';
import type { Anrede } from './anrede';
import { beschreibung, eindeutig, idSchema, name, zeitpunktSchema } from './bausteine';
import { datumAnzeigen } from './datum';
import { datumSchema } from './schemas';
import { MITGLIED_STATI, type MitgliedStatus } from './status';

// ---------------------------------------------------------------------------------------------
// Europe/Berlin date-time helpers (Intl based, no dependencies)
// ---------------------------------------------------------------------------------------------

const BERLIN = 'Europe/Berlin';

const berlinFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: BERLIN,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

interface Wandzeit {
  jahr: number;
  monat: number;
  tag: number;
  stunde: number;
  minute: number;
  sekunde: number;
}

/** Wall clock time in Europe/Berlin at the given instant. */
function berlinWandzeit(ms: number): Wandzeit {
  const teile = Object.fromEntries(
    berlinFormat.formatToParts(new Date(ms)).map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  return {
    jahr: teile.year!,
    monat: teile.month!,
    tag: teile.day!,
    stunde: teile.hour!,
    minute: teile.minute!,
    sekunde: teile.second!,
  };
}

/** Offset of Europe/Berlin to UTC in milliseconds at the given instant (+1h winter, +2h summer). */
function berlinOffsetMs(ms: number): number {
  const w = berlinWandzeit(ms);
  const alsUtc = Date.UTC(w.jahr, w.monat - 1, w.tag, w.stunde, w.minute, w.sekunde);
  return alsUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * Berlin wall time (`YYYY-MM-DD` + `HH:MM`) -> UTC ISO string (`...Z`). Non-existing times in the
 * spring gap are moved forward by the gap; ambiguous times in autumn resolve to the first (summer) one.
 */
export function berlinZuUtc(datum: string, zeit: string): string {
  const [j, m, t] = datum.split('-').map(Number) as [number, number, number];
  const [h, min] = zeit.split(':').map(Number) as [number, number];
  const wand = Date.UTC(j, m - 1, t, h, min);
  const ersterVersuch = wand - berlinOffsetMs(wand - 2 * 3600_000);
  const zweiterVersuch = wand - berlinOffsetMs(ersterVersuch);
  const ms =
    berlinOffsetMs(ersterVersuch) === berlinOffsetMs(zweiterVersuch)
      ? zweiterVersuch
      : ersterVersuch;
  return new Date(ms).toISOString();
}

const zweistellig = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM-DD` of an instant in Europe/Berlin. */
export function datumBerlin(iso: string): string {
  const w = berlinWandzeit(new Date(iso).getTime());
  return `${w.jahr}-${zweistellig(w.monat)}-${zweistellig(w.tag)}`;
}

/** `HH:MM` of an instant in Europe/Berlin. */
export function zeitBerlin(iso: string): string {
  const w = berlinWandzeit(new Date(iso).getTime());
  return `${zweistellig(w.stunde)}:${zweistellig(w.minute)}`;
}

/** German label of a Schicht art; the web UI keeps `SCHICHT_ART_LABELS` in sync. */
export const SCHICHT_ART_BEZEICHNUNG: Record<SchichtArt, string> = {
  aufbau: 'Aufbau',
  betrieb: 'Betrieb',
  putzen: 'Putzen',
};

const wochentagFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  weekday: 'short',
});

/** Short German weekday ("Sa") and date ("11.10.") of an instant in Europe/Berlin. */
function wochentagDatum(iso: string): string {
  const tag = wochentagFormat.format(new Date(iso)).replace('.', '');
  const [, monat, t] = datumBerlin(iso).split('-');
  return `${tag} ${t}.${monat}.`;
}

/**
 * Schichten have no name of their own: "Betrieb 20:00–04:00". When `eventBeginn` is given and the
 * Schicht starts on another Berlin calendar day, the weekday and date lead the time:
 * "Putzen Sa 11.10. 11:00–13:00".
 */
export function schichtBezeichnung(
  schicht: { art: SchichtArt; beginn: string; ende: string },
  eventBeginn?: string,
): string {
  const tag =
    eventBeginn && datumBerlin(schicht.beginn) !== datumBerlin(eventBeginn)
      ? `${wochentagDatum(schicht.beginn)} `
      : '';
  return `${SCHICHT_ART_BEZEICHNUNG[schicht.art]} ${tag}${zeitBerlin(schicht.beginn)}–${zeitBerlin(schicht.ende)}`;
}

/** Display format `dd.MM.yyyy HH:mm` in Europe/Berlin. */
export function zeitpunktAnzeigen(iso: string): string {
  return `${datumAnzeigen(datumBerlin(iso))} ${zeitBerlin(iso)}`;
}

/** Calendar year (Europe/Berlin) of an instant; the Statistik assigns a Schicht to this year. */
export function statistikJahr(iso: string): number {
  return berlinWandzeit(new Date(iso).getTime()).jahr;
}

function tageDazu(datum: string, tage: number): string {
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------------------------
// Constants and schemas
// ---------------------------------------------------------------------------------------------

export const SCHICHT_ARTEN = ['aufbau', 'betrieb', 'putzen'] as const;
export type SchichtArt = (typeof SCHICHT_ARTEN)[number];
export const schichtArtSchema = z.enum(SCHICHT_ARTEN);

export const KOMMENTAR_MAX = 200;

// ---------------------------------------------------------------------------------------------
// Teilnahme (participation in an event, not a Dienst)
// ---------------------------------------------------------------------------------------------

export const TEILNAHME_ANTWORTEN = ['teilnahme', 'absage'] as const;
export type TeilnahmeAntwort = (typeof TEILNAHME_ANTWORTEN)[number];

/** Participation circle of an event: null = no participation at all, [] = only invited / self-signed people. */
export type TeilnahmeKreis = MitgliedStatus[] | null;

/** Stored form of a circle (`events.teilnahme_status`): comma-separated statuses, '' for the empty circle. */
export function teilnahmeKreisKodieren(kreis: readonly MitgliedStatus[] | null): string | null {
  return kreis === null ? null : MITGLIED_STATI.filter((s) => kreis.includes(s)).join(',');
}

/** Inverse of `teilnahmeKreisKodieren`; unknown statuses are ignored. */
export function teilnahmeKreisLesen(gespeichert: string | null | undefined): TeilnahmeKreis {
  if (gespeichert === null || gespeichert === undefined) return null;
  return MITGLIED_STATI.filter((s) => gespeichert.split(',').includes(s));
}

/**
 * State of a member for an event: `teilnahme` / `absage`, or null when the event has no relation to
 * them (no circle, or neither in the circle nor invited nor own answer). In the circle, invited or
 * having signed up means taking part, unless the member declined (`absage`). The circle is evaluated
 * dynamically, so members who join later with a matching status are included automatically.
 */
export function teilnahmeZustand(p: {
  kreis: readonly MitgliedStatus[] | null;
  status: MitgliedStatus;
  eingeladen: boolean;
  antwort: TeilnahmeAntwort | null;
}): TeilnahmeAntwort | null {
  if (p.kreis === null) return null;
  const bezug = p.kreis.includes(p.status) || p.eingeladen || p.antwort === 'teilnahme';
  if (!bezug && p.antwort === null) return null;
  return p.antwort === 'absage' ? 'absage' : 'teilnahme';
}

/** Whether the member takes part in the event (see `teilnahmeZustand`). */
export const teilnehmend = (p: Parameters<typeof teilnahmeZustand>[0]): boolean =>
  teilnahmeZustand(p) === 'teilnahme';

const teilnahmeStatusSchema = z
  .array(z.enum(MITGLIED_STATI))
  .refine((a) => eindeutig(a), { message: 'Doppelte Einträge.' })
  .nullish()
  .transform((v) => v ?? null);

/** An event has either Dienste (Schichten) or participants, decided by its Kategorie. */
export const EVENT_ARTEN = ['dienste', 'teilnahme'] as const;
export type EventArt = (typeof EVENT_ARTEN)[number];
export const eventArtSchema = z.enum(EVENT_ARTEN, 'Bitte wähle die Art der Kategorie.');

/**
 * How long the events of a Kategorie last: one day (begin and end time, at most 24 hours), several
 * days (start and end date with times) or whole days (start and end date, no times).
 */
export const EVENT_DAUERN = ['eintaegig', 'mehrtaegig', 'ganztaegig'] as const;
export type EventDauer = (typeof EVENT_DAUERN)[number];
/** A multi-day event lasts at most this many days. */
export const MAX_EVENT_TAGE = 31;

const kategoriePflicht = z
  .string('Bitte wähle eine Kategorie.')
  .min(1, 'Bitte wähle eine Kategorie.');

const zeitSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Bitte gib eine Uhrzeit an (HH:MM).');
/** Days relative to the event date (Aufbau/Putzen in a Vorlage); may be negative. */
const versatzSchema = z
  .number('Bitte gib eine Zahl an.')
  .int('Bitte gib eine ganze Zahl an.')
  .min(-365, 'Der Versatz ist zu groß.')
  .max(365, 'Der Versatz ist zu groß.');

export const dienstformEingabeSchema = z.object({
  name: name(),
  reihenfolge: z.number().int().min(0).optional(),
  archiviert: z.boolean().optional(),
});
export type DienstformEingabe = z.infer<typeof dienstformEingabeSchema>;

export const eventKategorieEingabeSchema = z
  .object({
    name: name(),
    /** Mantine color name, e.g. `grape`. */
    farbe: z.string().trim().min(1, 'Bitte wähle eine Farbe.').max(30),
    art: eventArtSchema,
    /** Default participation circle; required for `teilnahme`, ignored (null) for `dienste`. */
    teilnahmeStatus: teilnahmeStatusSchema,
    /** Left out = `eintaegig`. */
    dauer: z
      .enum(EVENT_DAUERN, 'Bitte wähle die Dauer.')
      .optional()
      .transform((v) => v ?? 'eintaegig'),
    /** Meetings of this Kategorie get minutes ("Sitzung mit Protokoll"); `teilnahme` only. Left out = false. */
    protokoll: z
      .boolean()
      .optional()
      .transform((v) => v ?? false),
    archiviert: z.boolean().optional(),
  })
  .refine((v) => v.art !== 'teilnahme' || v.teilnahmeStatus !== null, {
    message: 'Bitte lege den Standard-Kreis fest.',
    path: ['teilnahmeStatus'],
  })
  .refine((v) => v.art === 'teilnahme' || !v.protokoll, {
    message: 'Nur Kategorien mit Teilnahme können eine Sitzung mit Protokoll sein.',
    path: ['protokoll'],
  })
  .transform((v) => (v.art === 'dienste' ? { ...v, teilnahmeStatus: null } : v));
export type EventKategorieEingabe = z.infer<typeof eventKategorieEingabeSchema>;

export const externeEingabeSchema = z.object({
  name: name(),
  /** Where the person comes from, e.g. "Freund:in von X" or "StuK". */
  quelle: z
    .string()
    .trim()
    .max(100, 'Höchstens 100 Zeichen erlaubt.')
    .transform((v) => (v === '' ? null : v))
    .nullish()
    .transform((v) => v ?? null),
  kontakt: z
    .string()
    .trim()
    .max(200, 'Höchstens 200 Zeichen erlaubt.')
    .transform((v) => (v === '' ? null : v))
    .nullish()
    .transform((v) => v ?? null),
  archiviert: z.boolean().optional(),
});
export type ExterneEingabe = z.infer<typeof externeEingabeSchema>;

/** Merges the Externe `quelleIds` into `zielId` (all their Dienste move to the target). */
export const externeZusammenfuehrenSchema = z
  .object({
    zielId: idSchema('Bitte wähle das Ziel.'),
    quelleIds: z
      .array(idSchema('Ungültige Auswahl.'))
      .min(1, 'Bitte wähle mindestens einen Eintrag.'),
  })
  .refine((v) => !v.quelleIds.includes(v.zielId), {
    message: 'Das Ziel darf nicht zusammengeführt werden.',
    path: ['quelleIds'],
  })
  .refine((v) => eindeutig(v.quelleIds), { message: 'Doppelte Einträge.', path: ['quelleIds'] });
export type ExterneZusammenfuehren = z.infer<typeof externeZusammenfuehrenSchema>;

export const bedarfEingabeSchema = z
  .object({
    dienstformId: idSchema('Bitte wähle eine Dienstform.'),
    minimum: z
      .number('Bitte gib eine Anzahl an.')
      .int('Die Anzahl muss eine ganze Zahl sein.')
      .min(1, 'Das Minimum muss mindestens 1 sein.'),
    wunsch: z
      .number('Bitte gib eine Anzahl an.')
      .int('Die Anzahl muss eine ganze Zahl sein.')
      .min(1, 'Der Wunsch muss mindestens 1 sein.'),
  })
  .refine((v) => v.wunsch >= v.minimum, {
    message: 'Der Wunsch darf nicht unter dem Minimum liegen.',
    path: ['wunsch'],
  });
export type BedarfEingabe = z.infer<typeof bedarfEingabeSchema>;

const bedarfeSchema = z
  .array(bedarfEingabeSchema)
  .min(1, 'Eine Betriebs-Schicht braucht mindestens eine Dienstform.')
  .refine((b) => eindeutig(b.map((x) => x.dienstformId)), {
    message: 'Jede Dienstform darf nur einmal vorkommen.',
  });

/** Aufbau/Putzen: no Dienstform, just a head count directly on the Schicht. */
const anzahlFelder = {
  art: z.enum(['aufbau', 'putzen']),
  minimum: z
    .number('Bitte gib eine Anzahl an.')
    .int('Die Anzahl muss eine ganze Zahl sein.')
    .min(0, 'Das Minimum darf nicht negativ sein.'),
  wunsch: z
    .number('Bitte gib eine Anzahl an.')
    .int('Die Anzahl muss eine ganze Zahl sein.')
    .min(1, 'Der Wunsch muss mindestens 1 sein.'),
};
const wunschNichtUnterMinimum = {
  message: 'Der Wunsch darf nicht unter dem Minimum liegen.',
  path: ['wunsch'],
};

/** A Schicht or Event never lasts longer than 24 hours. */
export const MAX_DAUER_MS = 24 * 3600_000;
const dauerOk = (v: { beginn: string; ende: string }) => {
  const dauer = new Date(v.ende).getTime() - new Date(v.beginn).getTime();
  return dauer > 0 && dauer <= MAX_DAUER_MS;
};
const dauerFehler = {
  message: 'Das Ende muss nach dem Beginn liegen und darf höchstens 24 Stunden danach sein.',
  path: ['ende'],
};
const schichtEnde = dauerOk;
const schichtEndeFehler = dauerFehler;

/** The schema allows every Kategorie's longest events; `eventDauerFehler` checks the Kategorie. */
const eventDauerOk = (v: { beginn: string; ende: string }) => {
  const dauer = new Date(v.ende).getTime() - new Date(v.beginn).getTime();
  return dauer > 0 && dauer <= MAX_EVENT_TAGE * 24 * 3600_000;
};
const eventDauerFehlerMeldung = {
  message: `Das Ende muss nach dem Beginn liegen und darf höchstens ${MAX_EVENT_TAGE} Tage danach sein.`,
  path: ['ende'],
};

/** German error when the event's times do not fit the Kategorie's `dauer`, else null. */
export function eventDauerFehler(dauer: EventDauer, beginn: string, ende: string): string | null {
  const ms = new Date(ende).getTime() - new Date(beginn).getTime();
  if (dauer === 'eintaegig' && ms > MAX_DAUER_MS) {
    return 'Events dieser Kategorie dauern höchstens 24 Stunden.';
  }
  if (dauer === 'ganztaegig' && (zeitBerlin(beginn) !== '00:00' || zeitBerlin(ende) !== '00:00')) {
    return 'Ganztägige Events beginnen und enden um Mitternacht.';
  }
  return null;
}

/**
 * Begin and end of an event from what the form shows for the Kategorie's `dauer`: one day with
 * times (end at or before begin = next day), start and end date with times, or whole days from
 * `datum` to `bis` (both included).
 */
export function eventSpanne(
  dauer: EventDauer,
  t: { datum: string; bis: string; beginnZeit: string; endeZeit: string },
): { beginn: string; ende: string } {
  if (dauer === 'ganztaegig') {
    return {
      beginn: berlinZuUtc(t.datum, '00:00'),
      ende: berlinZuUtc(tageDazu(t.bis, 1), '00:00'),
    };
  }
  if (dauer === 'mehrtaegig') {
    return { beginn: berlinZuUtc(t.datum, t.beginnZeit), ende: berlinZuUtc(t.bis, t.endeZeit) };
  }
  return zeitspanne(t.datum, t.beginnZeit, t.endeZeit);
}

/** Inverse of `eventSpanne`; `bis` is the last day (for whole days the day before the end). */
export function eventZeitenAus(
  dauer: EventDauer,
  beginn: string,
  ende: string,
): { datum: string; bis: string; beginnZeit: string; endeZeit: string } {
  const datum = datumBerlin(beginn);
  const bis =
    dauer === 'ganztaegig' && zeitBerlin(ende) === '00:00'
      ? tageDazu(datumBerlin(ende), -1)
      : datumBerlin(ende);
  return {
    datum,
    bis: bis < datum ? datum : bis,
    beginnZeit: zeitBerlin(beginn),
    endeZeit: zeitBerlin(ende),
  };
}

export const schichtEingabeSchema = z.discriminatedUnion('art', [
  z
    .object({
      /** Set when an existing Schicht is updated; new Schichten have none. */
      id: idSchema('Ungültige Schicht.').optional(),
      art: z.literal('betrieb'),
      beginn: zeitpunktSchema,
      ende: zeitpunktSchema,
      bedarfe: bedarfeSchema,
    })
    .refine(schichtEnde, schichtEndeFehler),
  z
    .object({
      id: idSchema('Ungültige Schicht.').optional(),
      ...anzahlFelder,
      beginn: zeitpunktSchema,
      ende: zeitpunktSchema,
    })
    .refine(schichtEnde, schichtEndeFehler)
    .refine((v) => v.wunsch >= v.minimum, wunschNichtUnterMinimum),
]);
export type SchichtEingabe = z.infer<typeof schichtEingabeSchema>;

/** Optional title (empty = the Kategorie's name is shown instead, see `eventTitel`); stored as NULL. */
const titelOptional = z
  .string()
  .trim()
  .max(100, 'Höchstens 100 Zeichen erlaubt.')
  .nullish()
  .transform((v) => v ?? '');

export const eventEingabeSchema = z
  .object({
    titel: titelOptional,
    beschreibung,
    kategorieId: kategoriePflicht,
    beginn: zeitpunktSchema,
    ende: zeitpunktSchema,
    schichten: z.array(schichtEingabeSchema),
    /** Participation circle; null = the Kategorie's default (`teilnahme`) or none (`dienste`). */
    teilnahmeStatus: teilnahmeStatusSchema,
    /** Subs of members invited individually. */
    eingeladen: z
      .array(idSchema('Ungültiges Mitglied.'))
      .max(500, 'Zu viele Personen.')
      .refine((a) => eindeutig(a), { message: 'Doppelte Einträge.' })
      .optional()
      .transform((v) => v ?? []),
    /** Sub of the responsible member; null = nobody. Left out = unchanged on update (series updates). */
    verantwortlichSub: idSchema('Ungültiges Mitglied.').nullable().optional(),
    /** Confirms that Schichten or Bedarfe with Dienste may be removed. */
    bestaetigt: z.boolean().optional(),
    /** Detaches the event from its series (a Barabend replaced by another event); only on update. */
    ersetzeSerie: z.boolean().optional(),
    /** Creates the OneDrive photo folder of the event when it has none yet (see bilder.ts). */
    bilderOrdner: z.boolean().optional(),
  })
  .refine(eventDauerOk, eventDauerFehlerMeldung);
export type EventEingabe = z.infer<typeof eventEingabeSchema>;

/** Global "Dienste fehlen" reminders: how many minutes before the event begin a notice goes out. */
export const ERINNERUNG_MIN_MINUTEN = 15;
export const ERINNERUNG_MAX_MINUTEN = 30 * 24 * 60;
export const ERINNERUNG_MAX_ANZAHL = 20;
export const erinnerungenEingabeSchema = z.object({
  minutenVorher: z
    .array(
      z
        .number('Bitte gib eine Zahl an.')
        .int('Bitte gib eine ganze Zahl an.')
        .min(ERINNERUNG_MIN_MINUTEN, 'Ein Zeitpunkt muss mindestens 15 Minuten vorher liegen.')
        .max(ERINNERUNG_MAX_MINUTEN, 'Ein Zeitpunkt darf höchstens 30 Tage vorher liegen.'),
    )
    .min(1, 'Mindestens ein Zeitpunkt ist nötig.')
    .max(ERINNERUNG_MAX_ANZAHL, 'Es sind höchstens 20 Zeitpunkte möglich.')
    .refine((a) => new Set(a).size === a.length, {
      message: 'Jeder Zeitpunkt darf nur einmal vorkommen.',
    }),
});
export type ErinnerungenEingabe = z.infer<typeof erinnerungenEingabeSchema>;
export interface ErinnerungenDto {
  /** Sorted descending (earliest reminder first). */
  minutenVorher: number[];
}

/** Aufbau/Putzen in a Vorlage: day relative to the event date plus times (end <= begin = next day). */
export const vorlageSchichtSchema = z.discriminatedUnion('art', [
  z.object({
    art: z.literal('betrieb'),
    beginnZeit: zeitSchema,
    endeZeit: zeitSchema,
    bedarfe: bedarfeSchema,
  }),
  z
    .object({
      ...anzahlFelder,
      tagVersatz: versatzSchema,
      beginnZeit: zeitSchema,
      endeZeit: zeitSchema,
    })
    .refine((v) => v.wunsch >= v.minimum, wunschNichtUnterMinimum),
]);
export type VorlageSchicht = z.infer<typeof vorlageSchichtSchema>;

export const vorlageEingabeSchema = z.object({
  titel: titelOptional,
  beschreibung,
  kategorieId: kategoriePflicht,
  beginnZeit: zeitSchema,
  endeZeit: zeitSchema,
  schichten: z.array(vorlageSchichtSchema),
  teilnahmeStatus: teilnahmeStatusSchema,
  /** Number of days for multi-day and whole-day Kategorien (the end lies on the last one); default 1. */
  tage: z
    .number('Bitte gib eine Zahl an.')
    .int('Bitte gib eine ganze Zahl an.')
    .min(1, 'Mindestens 1 Tag.')
    .max(MAX_EVENT_TAGE, `Höchstens ${MAX_EVENT_TAGE} Tage.`)
    .optional()
    .transform((v) => v ?? 1),
  /** Events from this Vorlage get a OneDrive photo folder by default (the form's checkbox is preset). */
  bilderOrdner: z
    .boolean()
    .optional()
    .transform((v) => v ?? false),
  archiviert: z.boolean().optional(),
});
export type VorlageEingabe = z.infer<typeof vorlageEingabeSchema>;
/** A Vorlage as `ausVorlage` needs it; `tage` defaults to 1, `bilderOrdner` is not used. */
export type VorlageDaten = Omit<VorlageEingabe, 'tage' | 'bilderOrdner'> & {
  tage?: number;
  bilderOrdner?: boolean;
};

/** Enter a Dienst: oneself (neither field), another member (`mitgliedSub`) or an Externe (`externId`). */
export const dienstEintragenSchema = z
  .object({
    /** Required for Betrieb Schichten, forbidden for Aufbau/Putzen (checked by the API). */
    dienstformId: idSchema('Bitte wähle eine Dienstform.').optional(),
    kommentar: z
      .string()
      .trim()
      .max(KOMMENTAR_MAX, `Höchstens ${KOMMENTAR_MAX} Zeichen erlaubt.`)
      .transform((v) => (v === '' ? null : v))
      .nullish()
      .transform((v) => v ?? null),
    mitgliedSub: idSchema('Ungültiges Mitglied.').optional(),
    externId: idSchema('Ungültige Auswahl.').optional(),
  })
  .refine((v) => v.mitgliedSub === undefined || v.externId === undefined, {
    message: 'Es kann nur eine Person eingetragen werden.',
    path: ['externId'],
  });
export type DienstEintragen = z.infer<typeof dienstEintragenSchema>;

export const kalenderZeitraumSchema = z.object({ von: datumSchema, bis: datumSchema });
export const statistikJahrSchema = z.object({
  jahr: z.coerce.number().int().min(2000).max(2100),
});

// ---------------------------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------------------------

export interface DienstformDto {
  id: string;
  name: string;
  reihenfolge: number;
  archiviert: boolean;
}

export interface EventKategorieDto {
  id: string;
  name: string;
  /** Mantine color name. */
  farbe: string;
  art: EventArt;
  /** Default participation circle (`teilnahme` only, else null). */
  teilnahmeStatus: TeilnahmeKreis;
  dauer: EventDauer;
  /** Meetings of this Kategorie get minutes (`teilnahme` only, else false). */
  protokoll: boolean;
  /** At least one event uses the Kategorie, so its `art` cannot change. */
  benutzt: boolean;
  archiviert: boolean;
}

export interface ExterneDto {
  id: string;
  name: string;
  quelle: string | null;
  kontakt: string | null;
  archiviert: boolean;
}

export type DienstPerson =
  | {
      art: 'mitglied';
      sub: string;
      username: string | null;
      vorname: string;
      nachname: string;
      status: MitgliedStatus;
      anrede: Anrede;
    }
  | { art: 'extern'; id: string; name: string; quelle: string | null };

export interface DienstDto {
  id: string;
  /** Null for Aufbau/Putzen. */
  dienstformId: string | null;
  kommentar: string | null;
  /** Sub of the member who entered this Dienst. */
  eingetragenVon: string;
  person: DienstPerson;
}

export interface BedarfDto {
  dienstformId: string;
  minimum: number;
  wunsch: number;
}

export interface SchichtDto {
  id: string;
  art: SchichtArt;
  beginn: string;
  ende: string;
  /** Betrieb only; empty for Aufbau/Putzen. */
  bedarfe: BedarfDto[];
  /** Aufbau/Putzen only (head count of all Dienste); null for Betrieb. */
  minimum: number | null;
  wunsch: number | null;
  dienste: DienstDto[];
}

/** A member with a relation to an event's participation (in the circle, invited or answered). */
export interface TeilnahmeDto {
  person: Extract<DienstPerson, { art: 'mitglied' }>;
  zustand: TeilnahmeAntwort;
  /** Invited individually by a manager. */
  eingeladen: boolean;
}

/** Own availability for a `dienste` event: `verfuegbar: false` stores an absage (and removes own Dienste once confirmed). */
export const verfuegbarkeitSchema = z.object({
  verfuegbar: z.boolean(),
  bestaetigt: z.boolean().optional(),
});
export type VerfuegbarkeitEingabe = z.infer<typeof verfuegbarkeitSchema>;

export interface EventDto {
  id: string;
  /** As entered; may be empty. Show `anzeigeTitel` instead. */
  titel: string;
  /** What to show: the title, else the Kategorie's name (`eventTitel`). */
  anzeigeTitel: string;
  beschreibung: string | null;
  kategorie: Pick<EventKategorieDto, 'id' | 'name' | 'farbe'> | null;
  /** From the Kategorie; events without one (legacy) count as `dienste`. */
  art: EventArt;
  /** From the Kategorie; `ganztaegig` events are shown and exported without times. */
  dauer: EventDauer;
  beginn: string;
  ende: string;
  abgesagt: boolean;
  /** Series the event was generated for (e.g. `barabend`), null for ordinary events. */
  serie: string | null;
  schichten: SchichtDto[];
  bewertung: EventBewertung;
  /** Participation circle; null = the event has no participation. */
  teilnahmeStatus: TeilnahmeKreis;
  /** The member responsible for the event (optional); `username` is added by the app. */
  verantwortlich: Extract<DienstPerson, { art: 'mitglied' }> | null;
  /** Everybody with a relation to the participation, taking part or declined. */
  teilnahmen: TeilnahmeDto[];
  /** Whether the caller takes part; null without participation (or when the caller is unknown). Derived from `meineTeilnahme`. */
  ichNehmeTeil: boolean | null;
  /**
   * The caller's state for a `teilnahme` event; null = no answer and not in the circle, or not a
   * `teilnahme` event / unknown caller.
   */
  meineTeilnahme: TeilnahmeAntwort | null;
  /** `dienste` events only: members who declared themselves unavailable for the whole event. */
  nichtVerfuegbar: Extract<DienstPerson, { art: 'mitglied' }>[];
  /** The caller is in `nichtVerfuegbar`. */
  ichBinNichtVerfuegbar: boolean;
  /** The caller added the event to their calendar feed. */
  imAbo: boolean;
  /** Link to the event's OneDrive photo folder (the read-only sharing link when there is one); null = none. */
  bilderOrdnerUrl: string | null;
  /** OneDrive id of the photo folder; null = none. */
  bilderOrdnerId: string | null;
}

/** Title to display: the entered title, else the Kategorie's name, else "Event". */
export function eventTitel(
  event: { titel?: string | null },
  kategorie?: { name: string } | null,
): string {
  return event.titel?.trim() || kategorie?.name || 'Event';
}

export interface VorlageDto extends VorlageEingabe {
  id: string;
  archiviert: boolean;
}

export interface StatistikZeileDto {
  person: DienstPerson;
  gesamt: number;
  /** Number of Dienste per column key: a `dienstformId`, `art:aufbau` or `art:putzen`. */
  nachSpalte: Record<string, number>;
}

export interface StatistikDto {
  jahr: number;
  zeilen: StatistikZeileDto[];
}

// Re-exported for convenience of consumers building option lists.

// ---------------------------------------------------------------------------------------------
// Ampel (traffic light)
// ---------------------------------------------------------------------------------------------

export type SchichtBewertung = 'rot' | 'gelb' | 'gruen';
export type EventBewertung = SchichtBewertung | 'abgesagt';

/** What the Ampel needs to know about a Schicht; satisfied by `SchichtDto`. */
export interface BewertbareSchicht {
  bedarfe: readonly BedarfDto[];
  /** Aufbau/Putzen: head count over all Dienste; both null/undefined for Betrieb. */
  minimum?: number | null;
  wunsch?: number | null;
  dienste: readonly { dienstformId: string | null; person: DienstPerson }[];
}

export interface DienstformFehlt {
  dienstformId: string;
  minimum: number;
  wunsch: number;
  vorhanden: number;
  /** Still missing to reach the minimum (0 if reached). */
  bisMinimum: number;
  /** Still missing to reach the wish (0 if reached). */
  bisWunsch: number;
}

export interface SchichtDetails {
  bewertung: SchichtBewertung;
  /** Aufbau/Putzen: the head count against minimum and wish; null for Betrieb. */
  anzahl: Omit<DienstformFehlt, 'dienstformId'> | null;
  /** One row per Dienstform with a Bedarf, in the order of `bedarfe`. */
  dienstformen: DienstformFehlt[];
  /** An Anwärter:in is entered but no Mitglied/EM (externals do not count) is in the Schicht. */
  begleitungFehlt: boolean;
}

/**
 * Details behind the Ampel of a Schicht. Anwärter:innen count towards the Bedarf, but whenever one
 * is entered a Mitglied or EM (any Dienstform) must be entered as well; Externe never count as that.
 */
export function schichtDetails(schicht: BewertbareSchicht): SchichtDetails {
  const dienstformen = schicht.bedarfe.map((b) => {
    const vorhanden = schicht.dienste.filter((d) => d.dienstformId === b.dienstformId).length;
    return {
      dienstformId: b.dienstformId,
      minimum: b.minimum,
      wunsch: b.wunsch,
      vorhanden,
      bisMinimum: Math.max(0, b.minimum - vorhanden),
      bisWunsch: Math.max(0, b.wunsch - vorhanden),
    };
  });
  const anzahl =
    schicht.minimum != null && schicht.wunsch != null
      ? (() => {
          const vorhanden = schicht.dienste.length;
          return {
            minimum: schicht.minimum,
            wunsch: schicht.wunsch,
            vorhanden,
            bisMinimum: Math.max(0, schicht.minimum - vorhanden),
            bisWunsch: Math.max(0, schicht.wunsch - vorhanden),
          };
        })()
      : null;
  const personen = schicht.dienste.map((d) => d.person);
  const hatAnwaerter = personen.some((p) => p.art === 'mitglied' && p.status === 'anwaerter');
  const hatBegleitung = personen.some(
    (p) => p.art === 'mitglied' && (p.status === 'mitglied' || p.status === 'em'),
  );
  const begleitungFehlt = hatAnwaerter && !hatBegleitung;
  let bewertung: SchichtBewertung = 'gruen';
  const fehlen = [...dienstformen, ...(anzahl ? [anzahl] : [])];
  if (begleitungFehlt || fehlen.some((d) => d.bisMinimum > 0)) bewertung = 'rot';
  else if (fehlen.some((d) => d.bisWunsch > 0)) bewertung = 'gelb';
  return { bewertung, anzahl, dienstformen, begleitungFehlt };
}

export const schichtBewertung = (schicht: BewertbareSchicht): SchichtBewertung =>
  schichtDetails(schicht).bewertung;

const SCHLECHTESTE: SchichtBewertung[] = ['rot', 'gelb', 'gruen'];

/** Worst Ampel of the Schichten (green without Schichten); `abgesagt` for a cancelled event. */
export function eventBewertung(event: {
  abgesagt?: boolean;
  schichten: readonly BewertbareSchicht[];
}): EventBewertung {
  if (event.abgesagt) return 'abgesagt';
  const alle = event.schichten.map(schichtBewertung);
  return SCHLECHTESTE.find((b) => alle.includes(b)) ?? 'gruen';
}

// ---------------------------------------------------------------------------------------------
// Vorlage -> Event, overlap, Statistik
// ---------------------------------------------------------------------------------------------

/**
 * Berlin wall times -> instants. `ende <= beginn` means the next day, so 20:00-20:00 lasts 24 hours.
 * Works on wall clock days, so daylight saving time is handled by `berlinZuUtc`.
 */
export function zeitspanne(
  datum: string,
  beginnZeit: string,
  endeZeit: string,
): { beginn: string; ende: string } {
  return {
    beginn: berlinZuUtc(datum, beginnZeit),
    ende: berlinZuUtc(endeZeit > beginnZeit ? datum : tageDazu(datum, 1), endeZeit),
  };
}

/** Inverse of `zeitspanne`: date and wall times of the begin and end instants. */
export function zeitenAus(
  beginn: string,
  ende: string,
): { datum: string; beginnZeit: string; endeZeit: string } {
  return { datum: datumBerlin(beginn), beginnZeit: zeitBerlin(beginn), endeZeit: zeitBerlin(ende) };
}

/** Date after `datum` (`YYYY-MM-DD`) by `tage` days (may be negative). */
export const datumPlusTage = (datum: string, tage: number): string => tageDazu(datum, tage);

/**
 * Date of a Betrieb Schicht: the event date, or the next day when it starts earlier than the event
 * (event 20:00, Schicht 00:00-02:00 lies after midnight).
 */
export function betriebDatum(
  eventDatum: string,
  eventBeginnZeit: string,
  schichtBeginnZeit: string,
): string {
  return schichtBeginnZeit < eventBeginnZeit ? tageDazu(eventDatum, 1) : eventDatum;
}

/**
 * Builds an Event input from a Vorlage for a start date; times are Berlin wall times incl. DST.
 * With the Vorlage's Kategorie, a `teilnahme` event gets no Schichten and the Vorlage's circle (else the
 * Kategorie's), a `dienste` event gets no circle.
 */
export function ausVorlage(
  vorlage: VorlageDaten,
  datum: string,
  kategorie?: Pick<EventKategorieDto, 'art' | 'teilnahmeStatus'> &
    Partial<Pick<EventKategorieDto, 'dauer'>>,
): EventEingabe {
  const teilnahme = kategorie?.art === 'teilnahme';
  const dienste = kategorie?.art === 'dienste';
  return {
    titel: vorlage.titel,
    beschreibung: vorlage.beschreibung,
    kategorieId: vorlage.kategorieId,
    teilnahmeStatus: teilnahme
      ? (vorlage.teilnahmeStatus ?? kategorie.teilnahmeStatus ?? [])
      : dienste
        ? null
        : vorlage.teilnahmeStatus,
    eingeladen: [],
    ...eventSpanne(kategorie?.dauer ?? 'eintaegig', {
      datum,
      bis: tageDazu(datum, Math.max(1, vorlage.tage ?? 1) - 1),
      beginnZeit: vorlage.beginnZeit,
      endeZeit: vorlage.endeZeit,
    }),
    schichten: (teilnahme ? [] : vorlage.schichten).map((s): SchichtEingabe => {
      if (s.art === 'betrieb') {
        const tag = betriebDatum(datum, vorlage.beginnZeit, s.beginnZeit);
        return {
          art: s.art,
          ...zeitspanne(tag, s.beginnZeit, s.endeZeit),
          bedarfe: s.bedarfe.map((b) => ({ ...b })),
        };
      }
      return {
        art: s.art,
        ...zeitspanne(tageDazu(datum, s.tagVersatz), s.beginnZeit, s.endeZeit),
        minimum: s.minimum,
        wunsch: s.wunsch,
      };
    }),
  };
}

/** Schicht of an existing event as input (keeps its id, so entered Dienste stay). */
const schichtAlsEingabe = (s: SchichtDto): SchichtEingabe =>
  s.art === 'betrieb'
    ? {
        id: s.id,
        art: 'betrieb',
        beginn: s.beginn,
        ende: s.ende,
        bedarfe: s.bedarfe.map((b) => ({ ...b })),
      }
    : {
        id: s.id,
        art: s.art,
        beginn: s.beginn,
        ende: s.ende,
        minimum: s.minimum ?? 0,
        wunsch: s.wunsch ?? 1,
      };

/**
 * Neutral draft for replacing a series event without a Vorlage: no title and no Kategorie yet, the times
 * of the series event, and all its Schichten with their ids so that nothing (entered Dienste) is lost.
 */
export function serieEventNeutral(
  event: Pick<EventDto, 'beginn' | 'ende' | 'schichten'>,
): Omit<EventEingabe, 'kategorieId'> & { kategorieId: null } {
  const alte = [...event.schichten].sort(
    (a, b) => new Date(a.beginn).getTime() - new Date(b.beginn).getTime(),
  );
  return {
    titel: '',
    beschreibung: null,
    kategorieId: null,
    beginn: event.beginn,
    ende: event.ende,
    teilnahmeStatus: null,
    eingeladen: [],
    schichten: alte.map(schichtAlsEingabe),
  };
}

/**
 * Event input for replacing an existing (generated) Barabend by a Vorlage while keeping its Dienste:
 * the first Betrieb Schicht of the Vorlage takes over the id of the Barabend's Betrieb Schicht, Dienstformen
 * with Dienste that the Vorlage lacks are added to its Bedarfe (old minimum/wunsch), and Schichten that
 * cannot be matched but still have Dienste stay as extra Schichten. Without a Betrieb Schicht in the
 * Vorlage the old Betrieb Schicht stays as an extra Schicht. The date is the Barabend's.
 */
export function serieEventErsetzen(
  barabend: Pick<EventDto, 'beginn' | 'schichten'>,
  vorlage: VorlageDaten,
  kategorie?: Pick<EventKategorieDto, 'art' | 'teilnahmeStatus'> &
    Partial<Pick<EventKategorieDto, 'dauer'>>,
): EventEingabe {
  const neu = ausVorlage(vorlage, datumBerlin(barabend.beginn), kategorie);
  const alte = [...barabend.schichten].sort(
    (a, b) => new Date(a.beginn).getTime() - new Date(b.beginn).getTime(),
  );
  const altBetrieb = alte.find((s) => s.art === 'betrieb');
  const ziel = neu.schichten.findIndex((s) => s.art === 'betrieb');
  const behalten: SchichtEingabe[] = [];
  let schichten = neu.schichten;
  if (altBetrieb && ziel >= 0) {
    schichten = neu.schichten.map((s, i) => {
      if (i !== ziel || s.art !== 'betrieb') return s;
      const vorhanden = new Set(s.bedarfe.map((b) => b.dienstformId));
      const mitDiensten = new Set(altBetrieb.dienste.map((d) => d.dienstformId));
      const ergaenzt = altBetrieb.bedarfe.filter(
        (b) => mitDiensten.has(b.dienstformId) && !vorhanden.has(b.dienstformId),
      );
      return {
        ...s,
        id: altBetrieb.id,
        bedarfe: [...s.bedarfe, ...ergaenzt.map((b) => ({ ...b }))],
      };
    });
  }
  for (const s of alte) {
    const verwendet = s === altBetrieb && ziel >= 0;
    if (verwendet) continue;
    if (s === altBetrieb || s.dienste.length > 0) behalten.push(schichtAlsEingabe(s));
  }
  return { ...neu, schichten: [...schichten, ...behalten] };
}

/** Pairs of Schichten that overlap in time (touching ends do not overlap), by input index. */
export function ueberlappendeSchichten<T extends { beginn: string; ende: string }>(
  schichten: readonly T[],
): [T, T][] {
  const paare: [T, T][] = [];
  for (let i = 0; i < schichten.length; i++) {
    for (let j = i + 1; j < schichten.length; j++) {
      const a = schichten[i]!;
      const b = schichten[j]!;
      if (new Date(a.beginn) < new Date(b.ende) && new Date(b.beginn) < new Date(a.ende)) {
        paare.push([a, b]);
      }
    }
  }
  return paare;
}

/** Stable key of a person, to count their Dienste. */
export const personSchluessel = (p: DienstPerson): string =>
  p.art === 'mitglied' ? `mitglied:${p.sub}` : `extern:${p.id}`;

/** Statistik column of a Dienst: its Dienstform (Betrieb) or `art:aufbau` / `art:putzen`. */
export const statistikSpalte = (art: SchichtArt, dienstformId: string | null): string =>
  art === 'betrieb' ? (dienstformId ?? 'art:betrieb') : `art:${art}`;

/**
 * Dienste per person for one calendar year (Berlin, by Schicht start). Dienste of cancelled events
 * do not count. Rows are sorted by total (descending), then by name.
 */
export function statistikZeilen(
  dienste: readonly {
    person: DienstPerson;
    dienstformId: string | null;
    schichtArt: SchichtArt;
    schichtBeginn: string;
    abgesagt: boolean;
  }[],
  jahr: number,
): StatistikZeileDto[] {
  const zeilen = new Map<string, StatistikZeileDto>();
  for (const d of dienste) {
    if (d.abgesagt || statistikJahr(d.schichtBeginn) !== jahr) continue;
    const key = personSchluessel(d.person);
    const zeile = zeilen.get(key) ?? { person: d.person, gesamt: 0, nachSpalte: {} };
    zeile.gesamt += 1;
    const spalte = statistikSpalte(d.schichtArt, d.dienstformId);
    zeile.nachSpalte[spalte] = (zeile.nachSpalte[spalte] ?? 0) + 1;
    zeilen.set(key, zeile);
  }
  const anzeigeName = (p: DienstPerson) =>
    p.art === 'extern' ? p.name : (p.username ?? `${p.vorname} ${p.nachname}`);
  return [...zeilen.values()].sort(
    (a, b) =>
      b.gesamt - a.gesamt || anzeigeName(a.person).localeCompare(anzeigeName(b.person), 'de'),
  );
}

// ---------------------------------------------------------------------------------------------
// ICS (RFC 5545)
// ---------------------------------------------------------------------------------------------

export interface IcsTermin {
  /** Dienst or event id; the UID becomes `<art>-<id>@c4-leipzig.de`. */
  id: string;
  /** Kind of entry; defaults to `dienst`. */
  art?: 'dienst' | 'event';
  titel: string;
  beschreibung?: string | null;
  /** ISO instants. */
  beginn: string;
  ende: string;
  url?: string | null;
  abgesagt?: boolean;
  /** Whole days: DTSTART/DTEND as dates (Berlin), DTEND the day after the last one. */
  ganztaegig?: boolean;
}

export interface IcsOptionen {
  kalenderName?: string;
  /** DTSTAMP; defaults to now. */
  jetzt?: Date;
}

const icsText = (text: string): string =>
  text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');

const icsZeit = (d: Date): string =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

const kodierer = new TextEncoder();

/** Folds a content line to at most 75 octets per line (continuations start with a space), never splitting a UTF-8 character. */
export function icsFalten(zeile: string): string {
  if (kodierer.encode(zeile).length <= 75) return zeile;
  const teile: string[] = [];
  let aktuell = '';
  let bytes = 0;
  let limit = 75;
  for (const zeichen of zeile) {
    const n = kodierer.encode(zeichen).length;
    if (bytes + n > limit) {
      teile.push(aktuell);
      aktuell = '';
      bytes = 0;
      limit = 74; // the leading space of continuation lines counts
    }
    aktuell += zeichen;
    bytes += n;
  }
  teile.push(aktuell);
  return teile.join('\r\n ');
}

/** Builds an iCalendar feed (METHOD:PUBLISH) with one VEVENT per Termin; lines end with CRLF. */
export function icsErzeugen(termine: readonly IcsTermin[], optionen: IcsOptionen = {}): string {
  const stempel = icsZeit(optionen.jetzt ?? new Date());
  const zeilen = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//C4 Leipzig//Kalender//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(optionen.kalenderName ?? 'C4 Dienste')}`,
  ];
  for (const t of termine) {
    zeilen.push(
      'BEGIN:VEVENT',
      `UID:${t.art ?? 'dienst'}-${t.id}@c4-leipzig.de`,
      `DTSTAMP:${stempel}`,
      ...(t.ganztaegig
        ? [
            `DTSTART;VALUE=DATE:${datumBerlin(t.beginn).replace(/-/g, '')}`,
            `DTEND;VALUE=DATE:${datumBerlin(t.ende).replace(/-/g, '')}`,
          ]
        : [`DTSTART:${icsZeit(new Date(t.beginn))}`, `DTEND:${icsZeit(new Date(t.ende))}`]),
      `SUMMARY:${icsText(t.titel)}`,
    );
    if (t.beschreibung) zeilen.push(`DESCRIPTION:${icsText(t.beschreibung)}`);
    if (t.url) zeilen.push(`URL:${t.url}`);
    if (t.abgesagt) zeilen.push('STATUS:CANCELLED');
    zeilen.push('END:VEVENT');
  }
  zeilen.push('END:VCALENDAR');
  return zeilen.map(icsFalten).join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------------------------
// Own Dienste and events as calendar entries (feed)
// ---------------------------------------------------------------------------------------------

/** One of the caller's own Dienste with what the calendar entry needs. */
export interface MeinDienstDto {
  id: string;
  eventId: string;
  eventTitel: string;
  schichtArt: SchichtArt;
  /** Null for Aufbau/Putzen. */
  dienstformName: string | null;
  /** ISO instants of the Schicht. */
  beginn: string;
  ende: string;
  abgesagt: boolean;
}

/** What a Dienst is called: the Dienstform (Betrieb) or the Art (Aufbau/Putzen). */
export const dienstBezeichnung = (art: SchichtArt, dienstformName: string | null): string =>
  art === 'betrieb' && dienstformName ? dienstformName : SCHICHT_ART_BEZEICHNUNG[art];

/** Turns own Dienste into ICS entries; `ursprung` (e.g. `https://c4.example`) enables the event link. */
export function dienstTermine(
  dienste: readonly MeinDienstDto[],
  ursprung?: string | null,
): IcsTermin[] {
  return dienste.map((d) => {
    const url = ursprung ? `${ursprung}/app/kalender/events/${d.eventId}` : null;
    return {
      id: d.id,
      titel: `${dienstBezeichnung(d.schichtArt, d.dienstformName)} · ${d.eventTitel}`,
      beschreibung: [
        `Schicht: ${schichtBezeichnung({ art: d.schichtArt, beginn: d.beginn, ende: d.ende })}`,
        url,
      ]
        .filter(Boolean)
        .join('\n'),
      beginn: d.beginn,
      ende: d.ende,
      url,
      abgesagt: d.abgesagt,
    };
  });
}

/** An event in the caller's feed: they take part in it or added it to their calendar. */
export interface MeinEventDto {
  id: string;
  titel: string;
  beschreibung: string | null;
  /** ISO instants of the whole event. */
  beginn: string;
  ende: string;
  abgesagt: boolean;
  /** Whole days (Kategorie `ganztaegig`): exported as dates without times. */
  ganztaegig?: boolean;
}

/** Turns events into ICS entries (whole event time); `ursprung` enables the event link. */
export function eventTermine(
  eventListe: readonly MeinEventDto[],
  ursprung?: string | null,
): IcsTermin[] {
  return eventListe.map((e) => {
    const url = ursprung ? `${ursprung}/app/kalender/events/${e.id}` : null;
    return {
      id: e.id,
      art: 'event',
      titel: e.titel,
      beschreibung: [e.beschreibung, url].filter(Boolean).join('\n'),
      beginn: e.beginn,
      ende: e.ende,
      url,
      abgesagt: e.abgesagt,
      ganztaegig: e.ganztaegig ?? false,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Series (recurring events generated from a Vorlage)
// ---------------------------------------------------------------------------------------------

export const SERIEN_REGELN = ['woechentlich', 'monatlich'] as const;
export type SerienRegel = (typeof SERIEN_REGELN)[number];

/** Weekdays in display order (Monday first); values are `Date#getUTCDay` numbers (0 = Sunday). */
export const WOCHENTAGE_REIHENFOLGE = [1, 2, 3, 4, 5, 6, 0] as const;
export const WOCHENTAG_KURZ: Record<number, string> = {
  0: 'So',
  1: 'Mo',
  2: 'Di',
  3: 'Mi',
  4: 'Do',
  5: 'Fr',
  6: 'Sa',
};
/** Week numbers of a monthly series; -1 = the last such weekday of the month. */
export const SERIEN_WOCHEN = [1, 2, 3, 4, -1] as const;

const serieBasis = z.object({
  name: name(),
  vorlageId: idSchema('Bitte wähle eine Vorlage.'),
  regel: z.enum(SERIEN_REGELN, 'Bitte wähle eine Regel.'),
  wochentage: z
    .array(z.number().int().min(0).max(6))
    .min(1, 'Bitte wähle mindestens einen Wochentag.'),
  /** Only used by `monatlich`; ignored (emptied) for `woechentlich`. */
  wochen: z.array(z.number().int().min(-1).max(4)).default([]),
  startDatum: datumSchema,
  endDatum: datumSchema.nullish().transform((v) => v ?? null),
});

type SerieRoh = z.infer<typeof serieBasis>;

const serieNormalisieren = <T extends SerieRoh>(v: T, ctx: z.RefinementCtx): T => {
  if (v.regel === 'monatlich' && (v.wochen.length === 0 || v.wochen.includes(0))) {
    ctx.addIssue({
      code: 'custom',
      message: 'Bitte wähle mindestens eine Woche im Monat.',
      path: ['wochen'],
    });
  }
  if (v.endDatum !== null && v.endDatum < v.startDatum) {
    ctx.addIssue({
      code: 'custom',
      message: 'Das Ende darf nicht vor dem Start liegen.',
      path: ['endDatum'],
    });
  }
  const sortiert = (liste: number[]) => [...new Set(liste)].sort((a, b) => a - b);
  return {
    ...v,
    wochentage: sortiert(v.wochentage),
    wochen: v.regel === 'monatlich' ? sortiert(v.wochen) : [],
  };
};

export const serieEingabeSchema = serieBasis.transform(serieNormalisieren);
export type SerieEingabe = z.output<typeof serieEingabeSchema>;

/** What to do with the future events of a series that were generated before a change. */
export const SERIEN_BESTEHENDE = ['anpassen', 'behalten'] as const;
export type SerienBestehende = (typeof SERIEN_BESTEHENDE)[number];
export const serienBestehendeSchema = z.enum(SERIEN_BESTEHENDE);

export const serieAendernSchema = serieBasis
  .extend({ bestehende: serienBestehendeSchema.optional() })
  .transform(serieNormalisieren);

export const serieAktivSchema = z.object({
  aktiv: z.boolean(),
  bestehende: serienBestehendeSchema.optional(),
});

export interface SerieDto {
  /** Slug of the first name, fixed when the series is renamed; stored in `events.serie`. */
  id: string;
  name: string;
  vorlageId: string;
  regel: SerienRegel;
  wochentage: number[];
  wochen: number[];
  startDatum: string;
  endDatum: string | null;
  aktiv: boolean;
}

export interface SerieListeDto extends SerieDto {
  /** Events of the series that begin in the future. */
  kuenftig: number;
  /** Of those: still as generated (not edited, cancelled, no Dienste or answers). */
  unveraendert: number;
}

/** Body of the 409 answer when a series change affects future events and `bestehende` is missing. */
export interface SerieBetroffenDto {
  error: string;
  unveraendert: number;
  angepasst: number;
}

const WOCHE_TEXT: Record<number, string> = { 1: '1.', 2: '2.', 3: '3.', 4: '4.', [-1]: 'letzten' };

/** Short German description of the rule, e.g. "Mo, Mi, So" or "1. und 3. Di im Monat". */
export function serieRegelText(serie: Pick<SerieDto, 'regel' | 'wochentage' | 'wochen'>): string {
  const tage = WOCHENTAGE_REIHENFOLGE.filter((t) => serie.wochentage.includes(t)).map(
    (t) => WOCHENTAG_KURZ[t]!,
  );
  if (serie.regel === 'woechentlich') return tage.join(', ');
  const wochen = [...serie.wochen].sort((a, b) => (a === -1 ? 1 : b === -1 ? -1 : a - b));
  const w = wochen.map((n) => WOCHE_TEXT[n] ?? `${n}.`);
  const woche = w.length > 1 ? `${w.slice(0, -1).join(', ')} und ${w.at(-1)}` : (w[0] ?? '');
  return `${woche} ${tage.join('/')} im Monat`;
}

/** Slug of a name for a series id: lowercase, umlauts transliterated, other characters become `-`. */
export function serieSlug(text: string): string {
  const slug = text
    .toLowerCase()
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'serie' : slug;
}

/** Unique series id for `text`: the slug, or the slug with `-2`, `-3`, ... when it is taken. */
export function serieIdAus(text: string, vergeben: ReadonlySet<string>): string {
  const basis = serieSlug(text);
  if (!vergeben.has(basis)) return basis;
  for (let n = 2; ; n++) if (!vergeben.has(`${basis}-${n}`)) return `${basis}-${n}`;
}

/**
 * Calendar dates `YYYY-MM-DD` from `von` to `bis` (inclusive) on which the series has an event, ascending.
 * Works on calendar dates, so daylight saving time does not matter. Honors the series' own start and end.
 */
export function serienTage(
  serie: Pick<SerieDto, 'regel' | 'wochentage' | 'wochen' | 'startDatum' | 'endDatum'>,
  von: string,
  bis: string,
): string[] {
  const start = von > serie.startDatum ? von : serie.startDatum;
  const ende = serie.endDatum !== null && serie.endDatum < bis ? serie.endDatum : bis;
  const tage: string[] = [];
  for (let tag = start; tag <= ende; tag = tageDazu(tag, 1)) {
    const [j, m, t] = tag.split('-').map(Number) as [number, number, number];
    if (!serie.wochentage.includes(new Date(Date.UTC(j, m - 1, t)).getUTCDay())) continue;
    if (serie.regel === 'monatlich') {
      const imMonat = new Date(Date.UTC(j, m, 0)).getUTCDate();
      const nummer = Math.ceil(t / 7);
      const letzter = t + 7 > imMonat;
      if (!serie.wochen.includes(nummer) && !(letzter && serie.wochen.includes(-1))) continue;
    }
    tage.push(tag);
  }
  return tage;
}
