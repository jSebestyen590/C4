import { z } from 'zod';
import type { Anrede } from './anrede';
import { beschreibung, eindeutig, idSchema, name, zeitpunktSchema } from './bausteine';
import { datumAnzeigen } from './datum';
import { datumSchema } from './schemas';
import type { MitgliedStatus } from './status';

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

const zeitSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Bitte gib eine Uhrzeit an (HH:MM).');
const versatzSchema = z
  .number('Bitte gib eine Zahl an.')
  .int('Bitte gib eine ganze Zahl an.')
  .min(0, 'Der Versatz darf nicht negativ sein.');
const hinweisStundenSchema = z
  .number()
  .int('Bitte gib ganze Stunden an.')
  .min(0, 'Die Stunden dürfen nicht negativ sein.')
  .nullish()
  .transform((v) => v ?? null);
const minimumSchema = z
  .number('Bitte gib eine Anzahl an.')
  .int('Die Anzahl muss eine ganze Zahl sein.')
  .min(0, 'Die Anzahl darf nicht negativ sein.');

export const dienstformEingabeSchema = z.object({
  name: name(),
  reihenfolge: z.number().int().min(0).optional(),
  archiviert: z.boolean().optional(),
});
export type DienstformEingabe = z.infer<typeof dienstformEingabeSchema>;

export const eventKategorieEingabeSchema = z.object({
  name: name(),
  /** Mantine color name, e.g. `grape`. */
  farbe: z.string().trim().min(1, 'Bitte wähle eine Farbe.').max(30),
  archiviert: z.boolean().optional(),
});
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
    minimum: minimumSchema,
    wunsch: minimumSchema,
  })
  .refine((v) => v.wunsch >= v.minimum, {
    message: 'Der Wunsch darf nicht unter dem Minimum liegen.',
    path: ['wunsch'],
  });
export type BedarfEingabe = z.infer<typeof bedarfEingabeSchema>;

const bedarfeSchema = z
  .array(bedarfEingabeSchema)
  .refine((b) => eindeutig(b.map((x) => x.dienstformId)), {
    message: 'Jede Dienstform darf nur einmal vorkommen.',
  });

export const schichtEingabeSchema = z
  .object({
    /** Set when an existing Schicht is updated; new Schichten have none. */
    id: idSchema('Ungültige Schicht.').optional(),
    art: schichtArtSchema,
    beginn: zeitpunktSchema,
    ende: zeitpunktSchema,
    bedarfe: bedarfeSchema,
  })
  .refine((v) => new Date(v.ende) > new Date(v.beginn), {
    message: 'Das Ende muss nach dem Beginn liegen.',
    path: ['ende'],
  });
export type SchichtEingabe = z.infer<typeof schichtEingabeSchema>;

export const eventEingabeSchema = z
  .object({
    titel: name('einen Titel'),
    beschreibung,
    kategorieId: z
      .string()
      .min(1)
      .nullish()
      .transform((v) => v ?? null),
    beginn: zeitpunktSchema,
    ende: zeitpunktSchema,
    /** Hours before the start at which a "Dienste fehlen" notice goes out; null = off. */
    fehltHinweisStunden: hinweisStundenSchema,
    schichten: z.array(schichtEingabeSchema),
    /** Confirms that Schichten or Bedarfe with Dienste may be removed. */
    bestaetigt: z.boolean().optional(),
  })
  .refine((v) => new Date(v.ende) > new Date(v.beginn), {
    message: 'Das Ende muss nach dem Beginn liegen.',
    path: ['ende'],
  });
export type EventEingabe = z.infer<typeof eventEingabeSchema>;

export const vorlageSchichtSchema = z
  .object({
    art: schichtArtSchema,
    tagVersatz: versatzSchema,
    beginnZeit: zeitSchema,
    endeTagVersatz: versatzSchema,
    endeZeit: zeitSchema,
    bedarfe: bedarfeSchema,
  })
  .refine(
    (v) =>
      v.endeTagVersatz > v.tagVersatz ||
      (v.endeTagVersatz === v.tagVersatz && v.endeZeit > v.beginnZeit),
    { message: 'Das Ende muss nach dem Beginn liegen.', path: ['endeZeit'] },
  );
export type VorlageSchicht = z.infer<typeof vorlageSchichtSchema>;

export const vorlageEingabeSchema = z
  .object({
    titel: name('einen Titel'),
    beschreibung,
    kategorieId: z
      .string()
      .min(1)
      .nullish()
      .transform((v) => v ?? null),
    beginnZeit: zeitSchema,
    endeTagVersatz: versatzSchema,
    endeZeit: zeitSchema,
    fehltHinweisStunden: hinweisStundenSchema,
    schichten: z.array(vorlageSchichtSchema),
    archiviert: z.boolean().optional(),
  })
  .refine((v) => v.endeTagVersatz > 0 || v.endeZeit > v.beginnZeit, {
    message: 'Das Ende muss nach dem Beginn liegen.',
    path: ['endeZeit'],
  });
export type VorlageEingabe = z.infer<typeof vorlageEingabeSchema>;

/** Enter a Dienst: oneself (neither field), another member (`mitgliedSub`) or an Externe (`externId`). */
export const dienstEintragenSchema = z
  .object({
    dienstformId: idSchema('Bitte wähle eine Dienstform.'),
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
  dienstformId: string;
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
  bedarfe: BedarfDto[];
  dienste: DienstDto[];
}

export interface EventDto {
  id: string;
  titel: string;
  beschreibung: string | null;
  kategorie: Pick<EventKategorieDto, 'id' | 'name' | 'farbe'> | null;
  beginn: string;
  ende: string;
  abgesagt: boolean;
  fehltHinweisStunden: number | null;
  schichten: SchichtDto[];
  bewertung: EventBewertung;
}

export interface VorlageDto extends VorlageEingabe {
  id: string;
  archiviert: boolean;
}

export interface StatistikZeileDto {
  person: DienstPerson;
  gesamt: number;
  /** Number of Dienste per `dienstformId`. */
  nachDienstform: Record<string, number>;
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
  dienste: readonly { dienstformId: string; person: DienstPerson }[];
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
  const personen = schicht.dienste.map((d) => d.person);
  const hatAnwaerter = personen.some((p) => p.art === 'mitglied' && p.status === 'anwaerter');
  const hatBegleitung = personen.some(
    (p) => p.art === 'mitglied' && (p.status === 'mitglied' || p.status === 'em'),
  );
  const begleitungFehlt = hatAnwaerter && !hatBegleitung;
  let bewertung: SchichtBewertung = 'gruen';
  if (begleitungFehlt || dienstformen.some((d) => d.bisMinimum > 0)) bewertung = 'rot';
  else if (dienstformen.some((d) => d.bisWunsch > 0)) bewertung = 'gelb';
  return { bewertung, dienstformen, begleitungFehlt };
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

/** Builds an Event input from a Vorlage for a start date; times are Berlin wall times incl. DST. */
export function ausVorlage(vorlage: VorlageEingabe, datum: string): EventEingabe {
  const zeitpunkt = (versatz: number, zeit: string) => berlinZuUtc(tageDazu(datum, versatz), zeit);
  return {
    titel: vorlage.titel,
    beschreibung: vorlage.beschreibung,
    kategorieId: vorlage.kategorieId,
    beginn: zeitpunkt(0, vorlage.beginnZeit),
    ende: zeitpunkt(vorlage.endeTagVersatz, vorlage.endeZeit),
    fehltHinweisStunden: vorlage.fehltHinweisStunden,
    schichten: vorlage.schichten.map((s) => ({
      art: s.art,
      beginn: zeitpunkt(s.tagVersatz, s.beginnZeit),
      ende: zeitpunkt(s.endeTagVersatz, s.endeZeit),
      bedarfe: s.bedarfe.map((b) => ({ ...b })),
    })),
  };
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

/**
 * Dienste per person for one calendar year (Berlin, by Schicht start). Dienste of cancelled events
 * do not count. Rows are sorted by total (descending), then by name.
 */
export function statistikZeilen(
  dienste: readonly {
    person: DienstPerson;
    dienstformId: string;
    schichtBeginn: string;
    abgesagt: boolean;
  }[],
  jahr: number,
): StatistikZeileDto[] {
  const zeilen = new Map<string, StatistikZeileDto>();
  for (const d of dienste) {
    if (d.abgesagt || statistikJahr(d.schichtBeginn) !== jahr) continue;
    const key = personSchluessel(d.person);
    const zeile = zeilen.get(key) ?? { person: d.person, gesamt: 0, nachDienstform: {} };
    zeile.gesamt += 1;
    zeile.nachDienstform[d.dienstformId] = (zeile.nachDienstform[d.dienstformId] ?? 0) + 1;
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
  /** Dienst id; the UID becomes `dienst-<id>@c4-leipzig.de`. */
  id: string;
  titel: string;
  beschreibung?: string | null;
  /** ISO instants. */
  beginn: string;
  ende: string;
  url?: string | null;
  abgesagt?: boolean;
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
      `UID:dienst-${t.id}@c4-leipzig.de`,
      `DTSTAMP:${stempel}`,
      `DTSTART:${icsZeit(new Date(t.beginn))}`,
      `DTEND:${icsZeit(new Date(t.ende))}`,
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
// Own Dienste as calendar entries (feed and downloads)
// ---------------------------------------------------------------------------------------------

/** One of the caller's own Dienste with what the calendar entry needs. */
export interface MeinDienstDto {
  id: string;
  eventId: string;
  eventTitel: string;
  schichtArt: SchichtArt;
  dienstformName: string;
  /** ISO instants of the Schicht. */
  beginn: string;
  ende: string;
  abgesagt: boolean;
}

/** Turns own Dienste into ICS entries; `ursprung` (e.g. `https://c4.example`) enables the event link. */
export function dienstTermine(
  dienste: readonly MeinDienstDto[],
  ursprung?: string | null,
): IcsTermin[] {
  return dienste.map((d) => {
    const url = ursprung ? `${ursprung}/app/kalender/events/${d.eventId}` : null;
    return {
      id: d.id,
      titel: `${d.dienstformName} · ${d.eventTitel}`,
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
