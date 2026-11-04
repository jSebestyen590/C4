import { z } from 'zod';
import type { Anrede } from './anrede';
import {
  PROTOKOLL_ARTEN,
  datumBerlin,
  vorlageSchichtSchema,
  zeitBerlin,
  type ProtokollArt,
} from './kalender';
import { datumSchema } from './schemas';
import { MITGLIED_STATI, type MitgliedStatus } from './status';

// Meeting minutes (see docs/protokolle.md). The document is TipTap JSON; shared does not depend on
// TipTap, it only knows the node shapes it has to validate.

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

/** The three fixed sections of every document, in this order. */
export const PROTOKOLL_ABSCHNITTE = ['vergangenes', 'gegenwaertiges', 'zukuenftiges'] as const;
export type ProtokollAbschnitt = (typeof PROTOKOLL_ABSCHNITTE)[number];

/** Attendance of a member (anwesend, verspätet, entschuldigt, unentschuldigt). */
export const PROTOKOLL_TEILNAHME = [
  'anwesend',
  'verspaetet',
  'entschuldigt',
  'unentschuldigt',
] as const;
export type ProtokollTeilnahmeWert = (typeof PROTOKOLL_TEILNAHME)[number];

export const PROTOKOLL_STATI = ['entwurf', 'abgeschlossen'] as const;
export type ProtokollStatus = (typeof PROTOKOLL_STATI)[number];

/** TipTap node type names of the Bausteine (the web editor registers nodes with exactly these names). */
export const BAUSTEIN_TYPEN = [
  'bausteinEvent',
  'bausteinVergangenesEvent',
  'bausteinAnwaerter',
  'bausteinBeschluss',
  'bausteinAnwesenheit',
] as const;
export type BausteinTyp = (typeof BAUSTEIN_TYPEN)[number];

export const PROTOKOLL_MAX_TIEFE = 30;
export const PROTOKOLL_MAX_BYTES = 500 * 1024;

// ---------------------------------------------------------------------------------------------
// Baustein fields. Drafts: fields may be empty while editing, so only the types are checked.
// ---------------------------------------------------------------------------------------------

const zeitSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Bitte gib eine Uhrzeit an (HH:MM).')
  .nullable();
/** Clock time `HH:MM`, or '' while nothing is entered. */
export const uhrzeitOderLeerSchema = z
  .string()
  .regex(/^(([01]\d|2[0-3]):[0-5]\d)?$/, 'Bitte gib eine Uhrzeit an (HH:MM).');
const idOderNull = z.string().max(100).nullable();
const stimmen = z
  .number('Bitte gib eine Zahl an.')
  .int('Bitte gib eine ganze Zahl an.')
  .min(0, 'Die Stimmen dürfen nicht negativ sein.')
  .max(10_000, 'Die Stimmen sind zu hoch.');

export const BESCHLUSS_ERGEBNISSE = ['angenommen', 'abgelehnt'] as const;
export type BeschlussErgebnis = (typeof BESCHLUSS_ERGEBNISSE)[number];

export const bausteinEventDatenSchema = z.strictObject({
  /** Vorlage the block was started from; null = none. */
  vorlageId: idOderNull,
  name: z.string().max(200),
  datum: datumSchema.nullable(),
  /** Last day of a multi-day event; null = one day. */
  bisDatum: datumSchema.nullable(),
  beginnZeit: zeitSchema,
  endeZeit: zeitSchema,
  schichten: z.array(vorlageSchichtSchema).max(20),
  verantwortlichSub: idOderNull,
  /** Set once the event exists in the calendar. */
  eventId: idOderNull,
});
export type BausteinEventDaten = z.infer<typeof bausteinEventDatenSchema>;

export const bausteinVergangenesEventDatenSchema = z.strictObject({
  eventId: idOderNull,
  name: z.string().max(200),
  datum: datumSchema.nullable(),
});
export type BausteinVergangenesEventDaten = z.infer<typeof bausteinVergangenesEventDatenSchema>;

export const bausteinAnwaerterDatenSchema = z.strictObject({
  vorname: z.string().max(100),
  nachname: z.string().max(100),
  email: z.string().max(200).nullable(),
});
export type BausteinAnwaerterDaten = z.infer<typeof bausteinAnwaerterDatenSchema>;

export const bausteinBeschlussDatenSchema = z.strictObject({
  antrag: z.string().max(2000),
  ja: stimmen,
  nein: stimmen,
  enthaltung: stimmen,
  ergebnis: z.enum(BESCHLUSS_ERGEBNISSE).nullable(),
});
export type BausteinBeschlussDaten = z.infer<typeof bausteinBeschlussDatenSchema>;

export const ANWESENHEIT_ARTEN = ['erscheint', 'geht'] as const;
export type AnwesenheitArt = (typeof ANWESENHEIT_ARTEN)[number];

/** A member arrives (`erscheint`) or leaves (`geht`) during the Sitzung; in a draft `sub` may still be null. */
export const bausteinAnwesenheitDatenSchema = z.strictObject({
  art: z.enum(ANWESENHEIT_ARTEN),
  sub: idOderNull,
  uhrzeit: uhrzeitOderLeerSchema,
});
export type BausteinAnwesenheitDaten = z.infer<typeof bausteinAnwesenheitDatenSchema>;

export interface BausteinDatenVon {
  bausteinEvent: BausteinEventDaten;
  bausteinVergangenesEvent: BausteinVergangenesEventDaten;
  bausteinAnwaerter: BausteinAnwaerterDaten;
  bausteinBeschluss: BausteinBeschlussDaten;
  bausteinAnwesenheit: BausteinAnwesenheitDaten;
}

export const BAUSTEIN_DATEN_SCHEMAS = {
  bausteinEvent: bausteinEventDatenSchema,
  bausteinVergangenesEvent: bausteinVergangenesEventDatenSchema,
  bausteinAnwaerter: bausteinAnwaerterDatenSchema,
  bausteinBeschluss: bausteinBeschlussDatenSchema,
  bausteinAnwesenheit: bausteinAnwesenheitDatenSchema,
} as const satisfies Record<BausteinTyp, z.ZodType>;

/** Empty fields of a new Baustein. */
export function bausteinLeer<T extends BausteinTyp>(typ: T): BausteinDatenVon[T];
export function bausteinLeer(typ: BausteinTyp): BausteinDatenVon[BausteinTyp] {
  switch (typ) {
    case 'bausteinEvent':
      return {
        vorlageId: null,
        name: '',
        datum: null,
        bisDatum: null,
        beginnZeit: null,
        endeZeit: null,
        schichten: [],
        verantwortlichSub: null,
        eventId: null,
      };
    case 'bausteinVergangenesEvent':
      return { eventId: null, name: '', datum: null };
    case 'bausteinAnwaerter':
      return { vorname: '', nachname: '', email: null };
    case 'bausteinBeschluss':
      return { antrag: '', ja: 0, nein: 0, enthaltung: 0, ergebnis: null };
    case 'bausteinAnwesenheit':
      return { art: 'erscheint', sub: null, uhrzeit: '' };
  }
}

/** Suggested result of a vote; null while nobody voted yes or no. A tie is not a majority: abgelehnt. */
export function beschlussErgebnisVorschlag(ja: number, nein: number): BeschlussErgebnis | null {
  if (ja === 0 && nein === 0) return null;
  return ja > nein ? 'angenommen' : 'abgelehnt';
}

// ---------------------------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------------------------

export interface ProtokollKnoten {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ProtokollKnoten[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export interface ProtokollDokument extends ProtokollKnoten {
  type: 'doc';
  /** Exactly three `abschnitt` nodes, in the order of `PROTOKOLL_ABSCHNITTE`. */
  content: ProtokollKnoten[];
}

/** A Baustein node: `attrs.id` is a stable UUID, `attrs.daten` the fields, `content` the free text. */
export interface BausteinKnoten<T extends BausteinTyp = BausteinTyp> extends ProtokollKnoten {
  type: T;
  attrs: { id: string; daten: BausteinDatenVon[T] };
}

const neueId = (): string => globalThis.crypto.randomUUID();

const leererAbsatz = (): ProtokollKnoten => ({ type: 'paragraph' });

/** A new Baustein node with a fresh id; `content` is the free text (default: one empty paragraph). */
export function bausteinErzeugen<T extends BausteinTyp>(
  typ: T,
  daten: BausteinDatenVon[T] = bausteinLeer(typ),
  content: ProtokollKnoten[] = [leererAbsatz()],
): BausteinKnoten<T> {
  return { type: typ, attrs: { id: neueId(), daten }, content };
}

const istBausteinTyp = (typ: string): typ is BausteinTyp =>
  (BAUSTEIN_TYPEN as readonly string[]).includes(typ);

const istObjekt = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A document with the three empty sections. */
export function protokollLeer(): ProtokollDokument {
  return {
    type: 'doc',
    content: PROTOKOLL_ABSCHNITTE.map((art) => ({
      type: 'abschnitt',
      attrs: { art },
      content: [leererAbsatz()],
    })),
  };
}

const MAX_KNOTEN_KINDER = 5000;
const bausteinIdSchema = z.guid();

/** Error message for a Baustein node, or null. */
function bausteinFehler(knoten: Record<string, unknown>, typ: BausteinTyp): string | null {
  const attrs = knoten.attrs;
  if (!istObjekt(attrs)) return 'Ein Baustein ist ungültig.';
  const unbekannt = Object.keys(attrs).filter((k) => k !== 'id' && k !== 'daten');
  if (unbekannt.length > 0) return 'Ein Baustein hat unbekannte Felder.';
  if (!bausteinIdSchema.safeParse(attrs.id).success) return 'Ein Baustein hat keine gültige Id.';
  const ergebnis = BAUSTEIN_DATEN_SCHEMAS[typ].safeParse(attrs.daten);
  if (!ergebnis.success) {
    return ergebnis.error.issues[0]?.message ?? 'Ein Baustein ist ungültig.';
  }
  return null;
}

/** Structure of one node and its descendants: types, depth, Baustein fields; returns an error message or null. */
function knotenFehler(knoten: unknown, tiefe: number): string | null {
  if (tiefe > PROTOKOLL_MAX_TIEFE) return 'Das Protokoll ist zu tief verschachtelt.';
  if (!istObjekt(knoten)) return 'Das Protokoll ist ungültig.';
  const { type, attrs, content, text, marks } = knoten;
  if (typeof type !== 'string' || type.length === 0 || type.length > 64) {
    return 'Das Protokoll ist ungültig.';
  }
  if (type === 'doc' || (type === 'abschnitt' && tiefe !== 1)) {
    return 'Das Protokoll ist ungültig.';
  }
  if (attrs !== undefined && !istObjekt(attrs)) return 'Das Protokoll ist ungültig.';
  if (text !== undefined && typeof text !== 'string') return 'Das Protokoll ist ungültig.';
  if (marks !== undefined) {
    if (!Array.isArray(marks)) return 'Das Protokoll ist ungültig.';
    for (const m of marks) {
      if (
        !istObjekt(m) ||
        typeof m.type !== 'string' ||
        (m.attrs !== undefined && !istObjekt(m.attrs))
      ) {
        return 'Das Protokoll ist ungültig.';
      }
    }
  }
  if (istBausteinTyp(type)) {
    const fehler = bausteinFehler(knoten, type);
    if (fehler) return fehler;
  }
  if (content !== undefined) {
    if (!Array.isArray(content) || content.length > MAX_KNOTEN_KINDER) {
      return 'Das Protokoll ist ungültig.';
    }
    for (const kind of content) {
      const fehler = knotenFehler(kind, tiefe + 1);
      if (fehler) return fehler;
    }
  }
  return null;
}

/**
 * Checks a document: exactly three `abschnitt` nodes in the fixed order, depth at most
 * `PROTOKOLL_MAX_TIEFE`, Baustein nodes strictly (id and fields), all other node types as generic
 * nodes, serialized size at most `PROTOKOLL_MAX_BYTES`. Returns an error message, null when valid.
 */
export function protokollDokumentPruefen(dokument: unknown): string | null {
  if (!istObjekt(dokument) || dokument.type !== 'doc' || !Array.isArray(dokument.content)) {
    return 'Das Protokoll ist ungültig.';
  }
  if (dokument.content.length !== PROTOKOLL_ABSCHNITTE.length) {
    return 'Das Protokoll braucht genau die Abschnitte Vergangenes, Gegenwärtiges und Zukünftiges.';
  }
  for (const [i, abschnitt] of dokument.content.entries()) {
    const art =
      istObjekt(abschnitt) && istObjekt(abschnitt.attrs) ? abschnitt.attrs.art : undefined;
    if (
      !istObjekt(abschnitt) ||
      abschnitt.type !== 'abschnitt' ||
      art !== PROTOKOLL_ABSCHNITTE[i]
    ) {
      return 'Die Abschnitte des Protokolls sind in der falschen Reihenfolge.';
    }
  }
  if (Object.keys(dokument).some((k) => k !== 'type' && k !== 'content')) {
    return 'Das Protokoll ist ungültig.';
  }
  for (const abschnitt of dokument.content) {
    const fehler = knotenFehler(abschnitt, 1);
    if (fehler) return fehler;
  }
  if (new TextEncoder().encode(JSON.stringify(dokument)).length > PROTOKOLL_MAX_BYTES) {
    return 'Das Protokoll ist zu groß.';
  }
  return null;
}

export const protokollDokumentSchema = z
  .unknown()
  .superRefine((wert, ctx) => {
    const fehler = protokollDokumentPruefen(wert);
    if (fehler) ctx.addIssue({ code: 'custom', message: fehler });
  })
  .transform((wert) => wert as ProtokollDokument);

// ---------------------------------------------------------------------------------------------
// Kopf (header): attendance overrides, EMs, guests
// ---------------------------------------------------------------------------------------------

const subSchluessel = z.string().min(1).max(100);
const teilnahmeWertSchema = z.enum(PROTOKOLL_TEILNAHME);

export const protokollKopfSchema = z.strictObject({
  /** Overrides only; everybody else follows the answers to the Sitzung event. */
  teilnahme: z.record(subSchluessel, teilnahmeWertSchema).default({}),
  /** Chosen EMs; null = derived from the EMs who said yes. */
  ems: z.array(subSchluessel).max(500).nullable().default(null),
  emsFreitext: z.string().max(2000).default(''),
  gaeste: z.string().max(2000).default(''),
  /** Attendance as frozen when the protocol was closed (set by the API); null while it is a draft. */
  schnappschuss: z.record(subSchluessel, teilnahmeWertSchema).nullable().default(null),
  /** The chosen EMs as frozen when the protocol was closed (set by the API). */
  emsSchnappschuss: z.array(subSchluessel).max(500).nullable().default(null),
  /** Member status of everybody in the attendance as frozen when closed (set by the API). */
  statusSchnappschuss: z.record(subSchluessel, z.enum(MITGLIED_STATI)).nullable().default(null),
  /** Art of the Sitzung as frozen when closed (set by the API). */
  artSchnappschuss: z.enum(PROTOKOLL_ARTEN).nullable().default(null),
  /** Who chaired the Sitzung. */
  sitzungsleitung: subSchluessel.nullable().default(null),
  /** Who took the minutes; the API sets the creator when a new protocol has none. */
  protokollfuehrung: subSchluessel.nullable().default(null),
  /** Time the Sitzung was opened ('' = not entered). */
  eroeffnung: uhrzeitOderLeerSchema.default(''),
  /** Time a late member (attendance `verspaetet`) arrived. */
  verspaetung: z.record(subSchluessel, uhrzeitOderLeerSchema).default({}),
});
export type ProtokollKopf = z.infer<typeof protokollKopfSchema>;

export const protokollKopfLeer = (): ProtokollKopf => ({
  teilnahme: {},
  ems: null,
  emsFreitext: '',
  gaeste: '',
  schnappschuss: null,
  emsSchnappschuss: null,
  statusSchnappschuss: null,
  artSchnappschuss: null,
  sitzungsleitung: null,
  protokollfuehrung: null,
  eroeffnung: '',
  verspaetung: {},
});

/** Attendance derived from the member's own answer to the Sitzung event: yes = anwesend, no = entschuldigt, none = unentschuldigt. */
export function teilnahmeAbleiten(
  antwort: 'teilnahme' | 'absage' | null | undefined,
): ProtokollTeilnahmeWert {
  if (antwort === 'teilnahme') return 'anwesend';
  if (antwort === 'absage') return 'entschuldigt';
  return 'unentschuldigt';
}

// ---------------------------------------------------------------------------------------------
// Suggestion for a new protocol
// ---------------------------------------------------------------------------------------------

/** The calendar event behind a Baustein, as `protokollVorschlag` needs it (ISO instants). */
export interface ProtokollEventInfo {
  titel: string;
  beginn: string;
  ende: string;
  abgesagt: boolean;
}

export interface ProtokollVorschlagEingabe {
  /** Berlin date (`YYYY-MM-DD`) of the new Sitzung. */
  sitzungDatum: string;
  /** Document of the previous protocol; null = there is none. */
  letztes: ProtokollDokument | null;
  /** Current calendar data by event id. */
  events: ReadonlyMap<string, ProtokollEventInfo> | Readonly<Record<string, ProtokollEventInfo>>;
}

/** All `bausteinEvent` nodes anywhere in the node (not looking inside Bausteine). */
function eventBausteine(
  knoten: ProtokollKnoten,
  gefunden: ProtokollKnoten[] = [],
): ProtokollKnoten[] {
  if (knoten.type === 'bausteinEvent') {
    gefunden.push(knoten);
    return gefunden;
  }
  for (const kind of knoten.content ?? []) eventBausteine(kind, gefunden);
  return gefunden;
}

const kopie = <T>(wert: T): T => JSON.parse(JSON.stringify(wert)) as T;

/**
 * Pre-filled document for the next Sitzung from the previous protocol. Every Event block of the
 * previous protocol (any section) is looked at after refreshing it from the calendar (name, dates,
 * times of events that still exist): cancelled events are dropped, events that ended before the
 * Sitzung become "Vergangenes Event" blocks (sorted by date, empty text), all others stay in
 * "Zukünftiges" with their text. Events that no longer exist in the calendar are kept as written.
 * Blocks with the same `eventId` appear once; all copies get new ids. "Gegenwärtiges" stays empty.
 */
export function protokollVorschlag(eingabe: ProtokollVorschlagEingabe): ProtokollDokument {
  if (!eingabe.letztes) return protokollLeer();
  const info = (id: string): ProtokollEventInfo | undefined =>
    eingabe.events instanceof Map
      ? eingabe.events.get(id)
      : (eingabe.events as Record<string, ProtokollEventInfo>)[id];

  const gesehen = new Set<string>();
  const vergangen: { daten: BausteinVergangenesEventDaten }[] = [];
  const zukuenftig: BausteinKnoten<'bausteinEvent'>[] = [];

  for (const knoten of eventBausteine(eingabe.letztes)) {
    const geparst = bausteinEventDatenSchema.safeParse(knoten.attrs?.daten);
    if (!geparst.success) continue;
    const daten = geparst.data;
    const kalender = daten.eventId ? info(daten.eventId) : undefined;
    if (kalender?.abgesagt) continue;
    if (daten.eventId) {
      if (gesehen.has(daten.eventId)) continue;
      gesehen.add(daten.eventId);
    }
    if (kalender) {
      const von = datumBerlin(kalender.beginn);
      const bis = datumBerlin(kalender.ende);
      daten.name = kalender.titel || daten.name;
      daten.datum = von;
      daten.bisDatum = bis !== von ? bis : null;
      if (daten.beginnZeit !== null) daten.beginnZeit = zeitBerlin(kalender.beginn);
      if (daten.endeZeit !== null) daten.endeZeit = zeitBerlin(kalender.ende);
    }
    const ende = daten.bisDatum ?? daten.datum;
    if (ende !== null && ende < eingabe.sitzungDatum) {
      vergangen.push({
        daten: { eventId: daten.eventId, name: daten.name, datum: daten.datum },
      });
    } else {
      zukuenftig.push(
        bausteinErzeugen('bausteinEvent', daten, kopie(knoten.content ?? [leererAbsatz()])),
      );
    }
  }

  vergangen.sort((a, b) => {
    if (a.daten.datum === b.daten.datum) return 0;
    if (a.daten.datum === null) return 1;
    if (b.daten.datum === null) return -1;
    return a.daten.datum < b.daten.datum ? -1 : 1;
  });
  const abschnitt = (art: ProtokollAbschnitt, inhalt: ProtokollKnoten[]): ProtokollKnoten => ({
    type: 'abschnitt',
    attrs: { art },
    content: inhalt.length > 0 ? inhalt : [leererAbsatz()],
  });
  return {
    type: 'doc',
    content: [
      abschnitt(
        'vergangenes',
        vergangen.map((v) => bausteinErzeugen('bausteinVergangenesEvent', v.daten)),
      ),
      abschnitt('gegenwaertiges', []),
      abschnitt('zukuenftiges', zukuenftig),
    ],
  };
}

/** Ids of the calendar events the Event blocks of a document point to (each once). */
export function protokollEventIds(dokument: ProtokollDokument): string[] {
  const ids = new Set<string>();
  for (const knoten of eventBausteine(dokument)) {
    const geparst = bausteinEventDatenSchema.safeParse(knoten.attrs?.daten);
    if (geparst.success && geparst.data.eventId) ids.add(geparst.data.eventId);
  }
  return [...ids];
}

// ---------------------------------------------------------------------------------------------
// DTOs and inputs of the API
// ---------------------------------------------------------------------------------------------

/** A member as shown in the minutes (`username` and `status` for `StatusName`). */
export interface ProtokollMitgliedDto {
  sub: string;
  username: string | null;
  vorname: string;
  nachname: string;
  status: MitgliedStatus;
  anrede: Anrede;
}

export interface ProtokollListeEintragDto {
  id: string;
  eventId: string;
  /** Title of the Sitzung event. */
  titel: string;
  /** ISO instant of the Sitzung. */
  beginn: string;
  status: ProtokollStatus;
  /** ISO instant. */
  geaendertAm: string;
  geaendertVon: ProtokollMitgliedDto | null;
}

export interface ProtokollTeilnahmeDto extends ProtokollMitgliedDto {
  /** What the answers to the Sitzung event say (live in a draft). */
  abgeleitet: ProtokollTeilnahmeWert;
  /** The attendance that counts: the override if any, else `abgeleitet`; frozen once closed. */
  wert: ProtokollTeilnahmeWert;
  /** `wert` comes from an override in the Kopf. */
  ueberschrieben: boolean;
}

export interface ProtokollEmDto extends ProtokollMitgliedDto {
  /** The EM said yes to the Sitzung event. */
  abgeleitet: boolean;
  /** Counts as present: chosen in the Kopf, or derived while `kopf.ems` is null; frozen once closed. */
  ausgewaehlt: boolean;
}

export interface ProtokollDto {
  id: string;
  eventId: string;
  sitzung: {
    id: string;
    titel: string;
    /** ISO instant. */
    beginn: string;
    kategorie: { id: string; name: string; farbe: string } | null;
    /** Art of the Sitzung (frozen once closed). */
    art: ProtokollArt;
  };
  inhalt: ProtokollDokument;
  kopf: ProtokollKopf;
  status: ProtokollStatus;
  version: number;
  /** Active Anwärter:innen and Mitglieder (everybody who was there once closed). */
  teilnahme: ProtokollTeilnahmeDto[];
  /** Active EMs. */
  ems: ProtokollEmDto[];
  geaendertAm: string;
  geaendertVon: ProtokollMitgliedDto | null;
}

/** A Sitzung (event of a Kategorie with `protokoll`) a protocol can be created for. */
export interface ProtokollSitzungDto {
  id: string;
  titel: string;
  beginn: string;
  kategorie: { id: string; name: string; farbe: string } | null;
  art: ProtokollArt;
}

export interface ProtokollVorschlagDto {
  inhalt: ProtokollDokument;
  kopf: ProtokollKopf;
}

/** `inhalt` and `kopf` left out = the suggestion of the server (`protokollVorschlag`). */
export const protokollAnlegenSchema = z.object({
  eventId: z.string().min(1, 'Bitte wähle eine Sitzung.').max(100),
  inhalt: protokollDokumentSchema.optional(),
  kopf: protokollKopfSchema.optional(),
});
export type ProtokollAnlegen = z.infer<typeof protokollAnlegenSchema>;

export const protokollSpeichernSchema = z.object({
  inhalt: protokollDokumentSchema,
  kopf: protokollKopfSchema,
  /** The version the editor loaded; a newer one in the database means somebody else saved. */
  version: z.number().int().min(1),
});
export type ProtokollSpeichern = z.infer<typeof protokollSpeichernSchema>;

export const protokollStatusSchema = z.object({ status: z.enum(PROTOKOLL_STATI) });
export type ProtokollStatusEingabe = z.infer<typeof protokollStatusSchema>;
