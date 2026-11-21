import { z } from 'zod';
import type { Anrede } from './anrede';
import {
  PROTOKOLL_ARTEN,
  datumPlusTage,
  eventZeitenAus,
  schichtenAusEvent,
  vorlageSchichtSchema,
  type EventDauer,
  type ProtokollArt,
  type SchichtQuelle,
} from './kalender';
import { datumSchema } from './schemas';
import { MITGLIED_STATI, type MitgliedStatus } from './status';

// Meeting minutes (see docs/protokolle.md). The document is TipTap JSON; shared does not depend on
// TipTap, it only knows the node shapes it has to validate.

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

/**
 * The fixed sections of every document, in this order. "Sonstiges" is optional: documents stored
 * before it existed have only the first three (`PROTOKOLL_ABSCHNITTE_ALT`).
 */
export const PROTOKOLL_ABSCHNITTE = [
  'vergangenes',
  'gegenwaertiges',
  'zukuenftiges',
  'sonstiges',
] as const;
/** Number of sections of old documents (without "Sonstiges"). */
export const PROTOKOLL_ABSCHNITTE_ALT = 3;
export type ProtokollAbschnitt = (typeof PROTOKOLL_ABSCHNITTE)[number];

/** Attendance of a member (anwesend, verspätet, entschuldigt, unentschuldigt). */
export const PROTOKOLL_TEILNAHME = [
  'anwesend',
  'verspaetet',
  'entschuldigt',
  'unentschuldigt',
] as const;
export type ProtokollTeilnahmeWert = (typeof PROTOKOLL_TEILNAHME)[number];

/** The three values shown and chosen in the UI; `verspaetet` is only kept in old data. */
export const PROTOKOLL_TEILNAHME_WAHL = ['anwesend', 'entschuldigt', 'unentschuldigt'] as const;

/** Old data: `verspaetet` counts as `anwesend` everywhere. */
export const teilnahmeNormalisiert = (wert: ProtokollTeilnahmeWert): ProtokollTeilnahmeWert =>
  wert === 'verspaetet' ? 'anwesend' : wert;

export const PROTOKOLL_STATI = ['entwurf', 'abgeschlossen'] as const;
export type ProtokollStatus = (typeof PROTOKOLL_STATI)[number];

/** TipTap node type names of the Bausteine (the web editor registers nodes with exactly these names). */
export const BAUSTEIN_TYPEN = [
  'bausteinEvent',
  'bausteinThema',
  'bausteinVergangenesEvent',
  'bausteinAnwaerter',
  'bausteinBeschluss',
  'bausteinEm',
  'bausteinAnwesenheit',
  'bausteinMeinungsbild',
  'bausteinAufnahme',
  'bausteinWahl',
  'bausteinAuswahl',
  'bausteinTodo',
] as const;
export type BausteinTyp = (typeof BAUSTEIN_TYPEN)[number];

/**
 * Bausteine that may also stand inside the free text ("Notizen") of another Baustein (at the cursor),
 * but never inside each other. All other Bausteine are top-level only. They hold plain text only
 * (`kannBausteineEnthalten`): votes and Todo, so a Todo cannot stand in a vote or in another Todo.
 */
export const BAUSTEINE_IN_NOTIZEN = [
  'bausteinBeschluss',
  'bausteinMeinungsbild',
  'bausteinWahl',
  'bausteinAuswahl',
  'bausteinTodo',
] as const;
export const istBausteinInNotizen = (typ: string): boolean =>
  (BAUSTEINE_IN_NOTIZEN as readonly string[]).includes(typ);

/**
 * Bausteine that may stand only inside the notes of another Baustein, never at the top level of a section
 * (the Todo). `protokollDokumentPruefen` rejects them as a direct child of a section.
 */
export const istNurInNotizen = (typ: string): boolean => typ === 'bausteinTodo';

/** The Baustein "Thema": top level, or in the notes of any Baustein that can hold others (any depth). */
export const istThema = (typ: string): boolean => typ === 'bausteinThema';

/**
 * Whether a Baustein of this type may stand in the notes of another Baustein: Abstimmung, Meinungsbild,
 * Wahl, Todo, Thema and Anwesenheit (erscheint / geht). All others are top-level only. Nested ones may
 * also stand inside a list item of those notes (as a child after the item's text).
 */
export const istVerschachtelbar = (typ: string): boolean =>
  istBausteinInNotizen(typ) || istThema(typ) || typ === 'bausteinAnwesenheit';

/**
 * Whether the notes of a Baustein of this type may hold other Bausteine (Abstimmung, Meinungsbild, Wahl
 * and Thema): every Baustein with notes except the votes (which hold text only) and Anwesenheit (no notes).
 * A Thema may therefore hold Themen (any depth).
 */
export const kannBausteineEnthalten = (typ: string): boolean =>
  (BAUSTEIN_TYPEN as readonly string[]).includes(typ) &&
  typ !== 'bausteinAnwesenheit' &&
  !istBausteinInNotizen(typ);

/** Whether a Baustein of type `typ` may stand in the notes of a Baustein of type `elternTyp`. */
export const darfInNotizen = (elternTyp: string, typ: string): boolean =>
  kannBausteineEnthalten(elternTyp) && istVerschachtelbar(typ);

export const PROTOKOLL_MAX_TIEFE = 30;
export const PROTOKOLL_MAX_BYTES = 500 * 1024;

/** Node type of an @mention in the free text (inline, atomic). */
export const ERWAEHNUNG_TYP = 'erwaehnung';

/** Groups that can be mentioned (`@Mitglieder`, ...). */
export const ERWAEHNUNG_GRUPPEN = ['anwaerter', 'mitglieder', 'ems', 'aktive', 'alle'] as const;
export type ErwaehnungGruppe = (typeof ERWAEHNUNG_GRUPPEN)[number];

/** Statuses a group covers. `alle` has no Externe; `aktive` = Anwärter:innen and Mitglieder. */
export const ERWAEHNUNG_GRUPPE_STATI: Record<ErwaehnungGruppe, readonly MitgliedStatus[]> = {
  anwaerter: ['anwaerter'],
  mitglieder: ['mitglied'],
  ems: ['em'],
  aktive: ['anwaerter', 'mitglied'],
  alle: ['anwaerter', 'mitglied', 'em'],
};

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

/**
 * Set on a vote that is the repetition of one from the previous Sitzung, where the session was not
 * beschlussfähig (`protokollVorschlag`): date (`YYYY-MM-DD`) and title of that Sitzung. Null = an
 * ordinary vote (and in old data).
 */
export const wiederholungSchema = z
  .strictObject({ datum: datumSchema, sitzung: z.string().max(200) })
  .nullable()
  .default(null);
export type Wiederholung = z.infer<typeof wiederholungSchema>;

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
  /** Kategorie of the event (needed to create it); null = not chosen (and in old data). */
  kategorieId: idOderNull.default(null),
});
export type BausteinEventDaten = z.infer<typeof bausteinEventDatenSchema>;

export const bausteinThemaDatenSchema = z.strictObject({
  titel: z.string().max(200).default(''),
});
export type BausteinThemaDaten = z.infer<typeof bausteinThemaDatenSchema>;

/** Who is zuständig for a Todo: a person, or a group (resolved by `todoZustaendigeAufloesen` when the protocol is closed). Same shape as the attrs of an `erwaehnung` node. */
export const todoZustaendigSchema = z.discriminatedUnion('art', [
  z.strictObject({ art: z.literal('person'), sub: z.string().min(1).max(128) }),
  z.strictObject({ art: z.literal('gruppe'), gruppe: z.enum(ERWAEHNUNG_GRUPPEN) }),
]);
export type TodoZustaendig = z.infer<typeof todoZustaendigSchema>;

export const BAUSTEIN_TODO_MAX_ZUSTAENDIG = 50;
export const bausteinTodoDatenSchema = z.strictObject({
  titel: z.string().max(200),
  zustaendig: z.array(todoZustaendigSchema).max(BAUSTEIN_TODO_MAX_ZUSTAENDIG),
  /** Deadline; null only while it is a draft. */
  faelligAm: datumSchema.nullable(),
  modus: z.enum(['gemeinsam', 'einzeln']).default('einzeln'),
  /** Set once the Todo exists (written back when the protocol is closed). */
  todoId: idOderNull.default(null),
});
export type BausteinTodoDaten = z.infer<typeof bausteinTodoDatenSchema>;

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
  /** The account created by the invitation (set when the Aktion ran); null = not invited yet. */
  sub: idOderNull.default(null),
});
export type BausteinAnwaerterDaten = z.infer<typeof bausteinAnwaerterDatenSchema>;

export const bausteinBeschlussDatenSchema = z.strictObject({
  antrag: z.string().max(2000),
  ja: stimmen,
  nein: stimmen,
  enthaltung: stimmen,
  ergebnis: z.enum(BESCHLUSS_ERGEBNISSE).nullable(),
  wiederholung: wiederholungSchema,
});
export type BausteinBeschlussDaten = z.infer<typeof bausteinBeschlussDatenSchema>;

/** The vote of a "Neues EM" block (same counts and result as a Beschluss, optional as a whole). */
export const bausteinEmAbstimmungSchema = z.strictObject({
  ja: stimmen,
  nein: stimmen,
  enthaltung: stimmen,
  ergebnis: z.enum(BESCHLUSS_ERGEBNISSE).nullable(),
});
export type BausteinEmAbstimmung = z.infer<typeof bausteinEmAbstimmungSchema>;

/** A new Ehrenmitglied: a person of the app (`sub`) or a free-text `name` (used only without `sub`). */
export const bausteinEmDatenSchema = z.strictObject({
  sub: idOderNull,
  name: z.string().max(200),
  abstimmung: bausteinEmAbstimmungSchema.nullable(),
  wiederholung: wiederholungSchema,
});
export type BausteinEmDaten = z.infer<typeof bausteinEmDatenSchema>;

export const ANWESENHEIT_ARTEN = ['erscheint', 'geht'] as const;
export type AnwesenheitArt = (typeof ANWESENHEIT_ARTEN)[number];

/** A member arrives (`erscheint`) or leaves (`geht`) during the Sitzung; in a draft `sub` may still be null. */
export const bausteinAnwesenheitDatenSchema = z.strictObject({
  art: z.enum(ANWESENHEIT_ARTEN),
  sub: idOderNull,
  uhrzeit: uhrzeitOderLeerSchema,
});
export type BausteinAnwesenheitDaten = z.infer<typeof bausteinAnwesenheitDatenSchema>;

/**
 * A Meinungsbild (non-binding opinion poll, everybody present may vote, no quorum): a question and
 * options with their vote counts.
 */
export const MEINUNGSBILD_MAX_OPTIONEN = 12;
export const bausteinMeinungsbildDatenSchema = z.strictObject({
  frage: z.string().max(500),
  optionen: z
    .array(z.strictObject({ text: z.string().max(100), stimmen }))
    .max(MEINUNGSBILD_MAX_OPTIONEN),
});
export type BausteinMeinungsbildDaten = z.infer<typeof bausteinMeinungsbildDatenSchema>;

/** The admission of an Anwärter:in as Mitglied: a person (`sub`) or a free-text `name`, always with a vote. */
export const bausteinAufnahmeDatenSchema = z.strictObject({
  sub: idOderNull,
  name: z.string().max(200),
  abstimmung: bausteinEmAbstimmungSchema,
  wiederholung: wiederholungSchema,
});
export type BausteinAufnahmeDaten = z.infer<typeof bausteinAufnahmeDatenSchema>;

/**
 * A Wahl (election): persons are proposed, `anzahl` of them are elected for a position by the voting
 * members. `stichwahlen` are runoff rounds, one per tie (see `wahlErgebnis`).
 */
export const WAHL_MAX_KANDIDATEN = 30;
export const WAHL_MAX_STICHWAHLEN = 10;
export const WAHL_MAX_ANZAHL = 20;
export const bausteinWahlKandidatSchema = z.strictObject({
  id: z.string().min(1).max(100),
  /** A person of the app; null only in old data (free-text `name`), new candidates always have one. */
  sub: idOderNull,
  name: z.string().max(200),
  stimmen,
});
export type BausteinWahlKandidat = z.infer<typeof bausteinWahlKandidatSchema>;
export const bausteinWahlStichwahlSchema = z.strictObject({
  /** Votes by candidate id (missing = 0). */
  stimmen: z.record(z.string().max(100), stimmen),
  enthaltung: stimmen,
});
export type BausteinWahlStichwahl = z.infer<typeof bausteinWahlStichwahlSchema>;
export const bausteinWahlDatenSchema = z.strictObject({
  /** Name of the position: free text, or the name of a Posten of the app (then `postenId` is set). */
  posten: z.string().max(200),
  /** The Posten of the app picked by name; null = free text (and in old data). */
  postenId: z.string().max(100).nullable().default(null),
  /** Date from which the result applies (`YYYY-MM-DD`), '' = not entered (and in old data). */
  gueltigAb: z
    .string()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Bitte gib ein Datum an.')
    .default(''),
  anzahl: z.number().int().min(1).max(WAHL_MAX_ANZAHL),
  /** Votes each present member has; null = same as `anzahl` (and in old data). */
  stimmenProPerson: z.number().int().min(1).max(WAHL_MAX_ANZAHL).nullable().default(null),
  kandidaten: z.array(bausteinWahlKandidatSchema).max(WAHL_MAX_KANDIDATEN),
  enthaltung: stimmen,
  stichwahlen: z.array(bausteinWahlStichwahlSchema).max(WAHL_MAX_STICHWAHLEN),
  /** Persons of the app (subs) proposed who do not want to run; shown only, no votes. */
  nichtAngetreten: z.array(z.string().min(1).max(100)).max(WAHL_MAX_KANDIDATEN).default([]),
  /** Whether an elected candidate accepts, by candidate id; missing = accepted. */
  annahme: z.record(z.string().max(100), z.boolean()).default({}),
  wiederholung: wiederholungSchema,
});
export type BausteinWahlDaten = z.infer<typeof bausteinWahlDatenSchema>;

/**
 * An Auswahl: a vote among several free-text options, `anzahl` of them win. Like a Wahl, but without
 * proposals, acceptance or Posten. `stichwahlen` are runoff rounds, one per tie (see `auswahlErgebnis`).
 */
export const AUSWAHL_MAX_OPTIONEN = 30;
export const bausteinAuswahlOptionSchema = z.strictObject({
  id: z.string().min(1).max(100),
  text: z.string().max(200),
  stimmen,
});
export type BausteinAuswahlOption = z.infer<typeof bausteinAuswahlOptionSchema>;
export const bausteinAuswahlDatenSchema = z.strictObject({
  frage: z.string().max(2000),
  anzahl: z.number().int().min(1).max(WAHL_MAX_ANZAHL),
  /** Votes each present member has; null = same as `anzahl`. */
  stimmenProPerson: z.number().int().min(1).max(WAHL_MAX_ANZAHL).nullable().default(null),
  optionen: z.array(bausteinAuswahlOptionSchema).max(AUSWAHL_MAX_OPTIONEN),
  enthaltung: stimmen,
  stichwahlen: z.array(bausteinWahlStichwahlSchema).max(WAHL_MAX_STICHWAHLEN),
  wiederholung: wiederholungSchema,
});
export type BausteinAuswahlDaten = z.infer<typeof bausteinAuswahlDatenSchema>;

/** Votes each present member has in the main round of a Wahl / Auswahl: `stimmenProPerson`, else `anzahl`. */
export const wahlStimmenProPerson = (
  daten: Pick<BausteinWahlDaten, 'anzahl' | 'stimmenProPerson'>,
): number => daten.stimmenProPerson ?? daten.anzahl;
export const auswahlStimmenProPerson = wahlStimmenProPerson;

export interface WahlRunde {
  /** The candidates the round is about (the ones the previous round left tied). */
  kandidaten: string[];
  /** Seats still to fill in this round. */
  plaetze: number;
}

export interface WahlErgebnis {
  /** Elected candidate ids: clear winners of a round first, best first. */
  gewaehlt: string[];
  /** The tie that is still open (null = the election is decided, or has no votes yet). */
  offen: (WahlRunde & { rundeVorhanden: boolean }) | null;
  /** Elected candidates that declined (`annahme` false), in the order they were skipped. */
  abgelehnt: string[];
  /** The stored runoff rounds that apply, in order (stored rounds beyond these are superfluous). */
  runden: WahlRunde[];
}

/**
 * Default "Gilt ab" of a new Wahl: after 1 November the 1 January of the next year (elections for the
 * coming year), otherwise the given day itself. `heute` is a Berlin date `YYYY-MM-DD`.
 */
export function wahlGueltigAbVorschlag(heute: string): string {
  const jahr = Number(heute.slice(0, 4));
  return heute.slice(5) > '11-01' ? `${jahr + 1}-01-01` : heute;
}

/**
 * Result of a vote among ids (Wahl, Auswahl). Rank the candidates by the votes of the main round (Enthaltungen do not count).
 * If the votes of place `anzahl` and place `anzahl + 1` differ, the top `anzahl` are elected. Otherwise
 * the candidates tied with place `anzahl` go into a Stichwahl for the seats left after the candidates
 * clearly above them are elected. `stichwahlen[i]` is the i-th runoff among exactly the candidates the
 * previous round left tied, with the same rule; a tie again needs the next round. A round without any
 * vote counts as not held yet. With at most `anzahl` candidates, all that got at least one vote are
 * elected. Without any vote in the main round there is no result.
 */
export function rangErgebnis(daten: {
  ids: string[];
  /** Main-round votes by id (missing = 0). */
  stimmen: Record<string, number>;
  anzahl: number;
  stichwahlen: BausteinWahlStichwahl[];
}): WahlErgebnis {
  const leer: WahlErgebnis = { gewaehlt: [], abgelehnt: [], offen: null, runden: [] };
  const ids = daten.ids;
  const haupt = daten.stimmen;
  if (ids.length === 0 || ids.every((id) => (haupt[id] ?? 0) === 0)) return leer;
  const rang = (gruppe: string[], stimmenVon: Record<string, number>) =>
    [...gruppe].sort((a, b) => (stimmenVon[b] ?? 0) - (stimmenVon[a] ?? 0));

  if (ids.length <= daten.anzahl) {
    return { ...leer, gewaehlt: rang(ids, haupt).filter((id) => (haupt[id] ?? 0) > 0) };
  }

  const gewaehlt: string[] = [];
  const runden: WahlRunde[] = [];
  let gruppe = ids;
  let plaetze = daten.anzahl;
  let stimmenVon = haupt;
  for (let i = 0; ; i++) {
    const sortiert = rang(gruppe, stimmenVon);
    const grenze = stimmenVon[sortiert[plaetze - 1]!] ?? 0;
    const danach = stimmenVon[sortiert[plaetze]!] ?? 0;
    if (grenze > danach) {
      return {
        ...leer,
        gewaehlt: [...gewaehlt, ...sortiert.slice(0, plaetze)],
        runden,
      };
    }
    const klar = sortiert.filter((id) => (stimmenVon[id] ?? 0) > grenze);
    gewaehlt.push(...klar);
    gruppe = sortiert.filter((id) => (stimmenVon[id] ?? 0) === grenze);
    plaetze -= klar.length;
    const runde = daten.stichwahlen[i];
    if (!runde)
      return {
        ...leer,
        gewaehlt,
        offen: { kandidaten: gruppe, plaetze, rundeVorhanden: false },
        runden,
      };
    runden.push({ kandidaten: gruppe, plaetze });
    stimmenVon = runde.stimmen;
    if (gruppe.every((id) => (stimmenVon[id] ?? 0) === 0)) {
      return {
        ...leer,
        gewaehlt,
        offen: { kandidaten: gruppe, plaetze, rundeVorhanden: true },
        runden,
      };
    }
  }
}

function wahlErgebnisRoh(daten: BausteinWahlDaten): WahlErgebnis {
  return rangErgebnis({
    ids: daten.kandidaten.map((k) => k.id),
    stimmen: Object.fromEntries(daten.kandidaten.map((k) => [k.id, k.stimmen])),
    anzahl: daten.anzahl,
    stichwahlen: daten.stichwahlen,
  });
}

/** Result of an Auswahl: the rules of `wahlErgebnis` without declines (`abgelehnt` is always empty). */
export function auswahlErgebnis(daten: BausteinAuswahlDaten): WahlErgebnis {
  return rangErgebnis({
    ids: daten.optionen.map((o) => o.id),
    stimmen: Object.fromEntries(daten.optionen.map((o) => [o.id, o.stimmen])),
    anzahl: daten.anzahl,
    stichwahlen: daten.stichwahlen,
  });
}

/** The runoff rounds of an Auswahl to show and check. */
export function auswahlRunden(daten: BausteinAuswahlDaten): WahlRunde[] {
  return auswahlErgebnis(daten).runden;
}

/**
 * Effective result of a Wahl: like the raw result, but candidates that declined (`annahme[id] ===
 * false`) after being elected are skipped. Repeat: compute the result for the remaining candidates
 * (same main-round votes, same Stichwahl rules, stored `stichwahlen[i]` still used for round i by
 * candidate id), take the elected ones that declined out of the list and compute again, until nobody
 * elected has declined. So the next one by votes moves up, and a tie at the new boundary needs a
 * Stichwahl as usual. `gewaehlt` holds only accepting persons; `abgelehnt` the skipped ones in
 * order (they keep their switch). Declines of candidates that would not be elected are ignored.
 */
export function wahlErgebnis(daten: BausteinWahlDaten): WahlErgebnis {
  let aktuell = daten;
  const abgelehnt: string[] = [];
  for (;;) {
    const ergebnis = wahlErgebnisRoh(aktuell);
    // `?.`: raw editor data of an older Wahl may lack the field (the schema default applies only on parse).
    const neu = ergebnis.gewaehlt.filter((id) => daten.annahme?.[id] === false);
    if (neu.length === 0) return { ...ergebnis, abgelehnt };
    abgelehnt.push(...neu);
    aktuell = {
      ...aktuell,
      kandidaten: aktuell.kandidaten.filter((k) => !neu.includes(k.id)),
    };
  }
}

/**
 * The runoff rounds to show and check: the ones held for the ties as voted (ignoring declines),
 * then the ones only a decline makes necessary.
 */
export function wahlRunden(daten: BausteinWahlDaten): WahlRunde[] {
  const gehalten = wahlErgebnis({ ...daten, annahme: {} }).runden;
  return [...gehalten, ...wahlErgebnis(daten).runden.slice(gehalten.length)];
}

export interface BausteinDatenVon {
  bausteinEvent: BausteinEventDaten;
  bausteinThema: BausteinThemaDaten;
  bausteinVergangenesEvent: BausteinVergangenesEventDaten;
  bausteinAnwaerter: BausteinAnwaerterDaten;
  bausteinBeschluss: BausteinBeschlussDaten;
  bausteinEm: BausteinEmDaten;
  bausteinAnwesenheit: BausteinAnwesenheitDaten;
  bausteinMeinungsbild: BausteinMeinungsbildDaten;
  bausteinAufnahme: BausteinAufnahmeDaten;
  bausteinWahl: BausteinWahlDaten;
  bausteinAuswahl: BausteinAuswahlDaten;
  bausteinTodo: BausteinTodoDaten;
}

export const BAUSTEIN_DATEN_SCHEMAS = {
  bausteinEvent: bausteinEventDatenSchema,
  bausteinThema: bausteinThemaDatenSchema,
  bausteinVergangenesEvent: bausteinVergangenesEventDatenSchema,
  bausteinAnwaerter: bausteinAnwaerterDatenSchema,
  bausteinBeschluss: bausteinBeschlussDatenSchema,
  bausteinEm: bausteinEmDatenSchema,
  bausteinAnwesenheit: bausteinAnwesenheitDatenSchema,
  bausteinMeinungsbild: bausteinMeinungsbildDatenSchema,
  bausteinAufnahme: bausteinAufnahmeDatenSchema,
  bausteinWahl: bausteinWahlDatenSchema,
  bausteinAuswahl: bausteinAuswahlDatenSchema,
  bausteinTodo: bausteinTodoDatenSchema,
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
        kategorieId: null,
      };
    case 'bausteinThema':
      return { titel: '' };
    case 'bausteinTodo':
      return { titel: '', zustaendig: [], faelligAm: null, modus: 'einzeln', todoId: null };
    case 'bausteinVergangenesEvent':
      return { eventId: null, name: '', datum: null };
    case 'bausteinAnwaerter':
      return { vorname: '', nachname: '', email: null, sub: null };
    case 'bausteinBeschluss':
      return { antrag: '', ja: 0, nein: 0, enthaltung: 0, ergebnis: null, wiederholung: null };
    case 'bausteinEm':
      return { sub: null, name: '', abstimmung: null, wiederholung: null };
    case 'bausteinAnwesenheit':
      return { art: 'erscheint', sub: null, uhrzeit: '' };
    case 'bausteinMeinungsbild':
      return {
        frage: '',
        optionen: ['Ja', 'Nein', 'Enthaltung'].map((text) => ({ text, stimmen: 0 })),
      };
    case 'bausteinWahl':
      return {
        posten: '',
        postenId: null,
        gueltigAb: '',
        anzahl: 1,
        stimmenProPerson: null,
        kandidaten: [],
        enthaltung: 0,
        stichwahlen: [],
        nichtAngetreten: [],
        annahme: {},
        wiederholung: null,
      };
    case 'bausteinAuswahl':
      return {
        frage: '',
        anzahl: 1,
        stimmenProPerson: null,
        optionen: [],
        enthaltung: 0,
        stichwahlen: [],
        wiederholung: null,
      };
    case 'bausteinAufnahme':
      return {
        sub: null,
        name: '',
        abstimmung: { ja: 0, nein: 0, enthaltung: 0, ergebnis: null },
        wiederholung: null,
      };
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
  /** The `abschnitt` nodes in the order of `PROTOKOLL_ABSCHNITTE` (old documents lack the last one). */
  content: ProtokollKnoten[];
}

/** A Baustein node: `attrs.id` is a stable UUID, `attrs.daten` the fields, `content` the free text. */
export interface BausteinKnoten<T extends BausteinTyp = BausteinTyp> extends ProtokollKnoten {
  type: T;
  attrs: { id: string; daten: BausteinDatenVon[T] };
}

const neueId = (): string => globalThis.crypto.randomUUID();

const leererAbsatz = (): ProtokollKnoten => ({ type: 'paragraph' });

/**
 * A new Baustein node with a fresh id; `content` is the free text (default: one empty paragraph).
 * `bausteinAnwesenheit` has no free text and never gets content.
 */
export function bausteinErzeugen<T extends BausteinTyp>(
  typ: T,
  daten: BausteinDatenVon[T] = bausteinLeer(typ),
  content: ProtokollKnoten[] = [leererAbsatz()],
): BausteinKnoten<T> {
  if (typ === 'bausteinAnwesenheit') return { type: typ, attrs: { id: neueId(), daten } } as never;
  return { type: typ, attrs: { id: neueId(), daten }, content };
}

const istBausteinTyp = (typ: string): typ is BausteinTyp =>
  (BAUSTEIN_TYPEN as readonly string[]).includes(typ);

const istObjekt = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A document with the four empty sections. */
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

/** The document with all four sections: an old one (three sections) gets an empty "Sonstiges". */
export function protokollDokumentNormalisieren(dokument: ProtokollDokument): ProtokollDokument {
  if (dokument.content.length !== PROTOKOLL_ABSCHNITTE_ALT) return dokument;
  return {
    ...dokument,
    content: [
      ...dokument.content,
      { type: 'abschnitt', attrs: { art: 'sonstiges' }, content: [leererAbsatz()] },
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// @Erwähnungen
// ---------------------------------------------------------------------------------------------

/** Attributes of an `erwaehnung` node. */
export interface ErwaehnungAttrs {
  art: 'person' | 'gruppe';
  sub?: string | null;
  gruppe?: ErwaehnungGruppe | null;
}

const istErwaehnungGruppe = (v: unknown): v is ErwaehnungGruppe =>
  (ERWAEHNUNG_GRUPPEN as readonly unknown[]).includes(v);

/** The attributes of an `erwaehnung` node if they are valid, else null. */
export function erwaehnungAttrs(attrs: unknown): ErwaehnungAttrs | null {
  if (!istObjekt(attrs)) return null;
  if (attrs.art === 'person') {
    const sub = attrs.sub;
    if (typeof sub !== 'string' || sub.length === 0 || sub.length > 128) return null;
    return { art: 'person', sub };
  }
  if (attrs.art === 'gruppe' && istErwaehnungGruppe(attrs.gruppe)) {
    return { art: 'gruppe', gruppe: attrs.gruppe };
  }
  return null;
}

/**
 * Whether a mention concerns the viewer: the person themself, or a group their CURRENT status belongs
 * to (not the status at the time of the Sitzung).
 */
export function erwaehnungBetrifft(
  erwaehnung: ErwaehnungAttrs,
  betrachter: { sub: string; status: MitgliedStatus },
): boolean {
  if (erwaehnung.art === 'person') return erwaehnung.sub === betrachter.sub;
  if (!erwaehnung.gruppe) return false;
  return ERWAEHNUNG_GRUPPE_STATI[erwaehnung.gruppe].includes(betrachter.status);
}

/**
 * The people a Todo is for: persons directly, groups by their CURRENT status (when the protocol is
 * closed). Without duplicates, in the order of `zustaendig`; deactivated members and subs not in
 * `mitglieder` are dropped (a person that is named directly but unknown is dropped as well).
 */
export function todoZustaendigeAufloesen(
  zustaendig: readonly TodoZustaendig[],
  mitglieder: readonly { sub: string; status: MitgliedStatus; deaktiviert?: boolean }[],
): string[] {
  const aktiv = mitglieder.filter((m) => !m.deaktiviert);
  const ergebnis = new Set<string>();
  for (const z of zustaendig) {
    if (z.art === 'person') {
      if (aktiv.some((m) => m.sub === z.sub)) ergebnis.add(z.sub);
      continue;
    }
    const stati = ERWAEHNUNG_GRUPPE_STATI[z.gruppe];
    for (const m of aktiv) if (stati.includes(m.status)) ergebnis.add(m.sub);
  }
  return [...ergebnis];
}

/**
 * Plain text of free-text nodes: one line per paragraph / list item (nested lists flattened),
 * mentions as written (`@sub` is not resolved here, they are left out). Empty lines are dropped.
 */
export function protokollNotizenText(content: readonly ProtokollKnoten[] | undefined): string {
  const zeilen: string[] = [];
  const inline = (k: ProtokollKnoten): string =>
    k.text ?? (k.type === 'hardBreak' ? ' ' : (k.content ?? []).map(inline).join(''));
  const gehe = (k: ProtokollKnoten) => {
    if (k.type === 'paragraph' || k.type === 'heading') {
      const z = inline(k).trim();
      if (z !== '') zeilen.push(z);
      return;
    }
    if (istBausteinTyp(k.type) || k.type === BILD_TYP) return;
    for (const kind of k.content ?? []) gehe(kind);
  };
  for (const k of content ?? []) gehe(k);
  return zeilen.join('\n');
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

// ---------------------------------------------------------------------------------------------
// Bilder
// ---------------------------------------------------------------------------------------------

/** TipTap node type of an image in a protocol (block, atom). */
export const BILD_TYP = 'protokollBild';
export const BILD_BREITEN = ['voll', 'halb'] as const;
export type BildBreite = (typeof BILD_BREITEN)[number];
export const BILD_AUSRICHTUNGEN = ['links', 'mitte', 'rechts'] as const;
export type BildAusrichtung = (typeof BILD_AUSRICHTUNGEN)[number];
export const BILD_BESCHREIBUNG_MAX = 300;
/** Largest upload of one protocol image (the browser scales to 2000 px, so this is generous). */
export const PROTOKOLL_BILD_MAX_BYTES = 5 * 1024 * 1024;

export interface ProtokollBildAttrs {
  schluessel: string;
  breite: BildBreite;
  ausrichtung: BildAusrichtung;
  beschreibung: string;
}

/** S3 key prefix of all images of one protocol. */
export const protokollBildPrefix = (protokollId: string): string =>
  `protokollbilder/${protokollId}/`;

const BILD_SCHLUESSEL_FORM = /^protokollbilder\/([A-Za-z0-9-]{1,64})\/[0-9a-f-]{36}\.jpg$/;

/** Whether `schluessel` has the shape `protokollbilder/<protocol id>/<uuid>.jpg`. */
export const istProtokollBildSchluessel = (schluessel: unknown): schluessel is string =>
  typeof schluessel === 'string' && BILD_SCHLUESSEL_FORM.test(schluessel);

/** Error message for the attrs of an image node, null when valid. */
function bildAttrsFehler(attrs: unknown): string | null {
  if (!istObjekt(attrs)) return 'Ein Bild ist ungültig.';
  if (
    Object.keys(attrs).some(
      (k) => !['schluessel', 'breite', 'ausrichtung', 'beschreibung'].includes(k),
    )
  ) {
    return 'Ein Bild hat unbekannte Felder.';
  }
  if (!istProtokollBildSchluessel(attrs.schluessel)) return 'Ein Bild ist ungültig.';
  if (!(BILD_BREITEN as readonly unknown[]).includes(attrs.breite)) return 'Ein Bild ist ungültig.';
  if (!(BILD_AUSRICHTUNGEN as readonly unknown[]).includes(attrs.ausrichtung)) {
    return 'Ein Bild ist ungültig.';
  }
  if (typeof attrs.beschreibung !== 'string' || attrs.beschreibung.length > BILD_BESCHREIBUNG_MAX) {
    return `Die Bildbeschreibung darf höchstens ${BILD_BESCHREIBUNG_MAX} Zeichen haben.`;
  }
  return null;
}

/** Image nodes of a document, in order (inside Bausteine too). */
function bildKnoten(knoten: ProtokollKnoten, gefunden: ProtokollKnoten[] = []): ProtokollKnoten[] {
  if (knoten.type === BILD_TYP) gefunden.push(knoten);
  for (const kind of knoten.content ?? []) bildKnoten(kind, gefunden);
  return gefunden;
}

/** Keys of all images in a document (each once). */
export function protokollBildSchluessel(dokument: ProtokollKnoten): string[] {
  const keys = new Set<string>();
  for (const k of bildKnoten(dokument)) {
    if (typeof k.attrs?.schluessel === 'string') keys.add(k.attrs.schluessel);
  }
  return [...keys];
}

/** Request for an upload URL of a protocol image. */
export const protokollBildAnfrageSchema = z.object({
  groesse: z.number().int().min(1).max(PROTOKOLL_BILD_MAX_BYTES),
});
export type ProtokollBildAnfrage = z.infer<typeof protokollBildAnfrageSchema>;

export interface ProtokollBildUploadDto {
  uploadUrl: string;
  schluessel: string;
}

/** Structure of one node and its descendants: types, depth, Baustein fields; returns an error message or null. */
function knotenFehler(knoten: unknown, tiefe: number, imBaustein = false): string | null {
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
  // Lists add depth, so "in a Baustein" is tracked instead of the depth: a Todo in a list of a section is
  // as wrong as one directly in the section.
  if (!imBaustein && istNurInNotizen(type)) {
    return 'Ein Todo gehört in die Notizen eines anderen Bausteins, nicht auf die oberste Ebene.';
  }
  if (istBausteinTyp(type)) {
    const fehler = bausteinFehler(knoten, type);
    if (fehler) return fehler;
  }
  if (type === ERWAEHNUNG_TYP && erwaehnungAttrs(attrs) === null) {
    return 'Eine Erwähnung ist ungültig.';
  }
  if (type === BILD_TYP) {
    const bildFehler = bildAttrsFehler(attrs);
    if (bildFehler) return bildFehler;
  }
  if (content !== undefined) {
    if (!Array.isArray(content) || content.length > MAX_KNOTEN_KINDER) {
      return 'Das Protokoll ist ungültig.';
    }
    const innen = imBaustein || istBausteinTyp(type);
    for (const kind of content) {
      const fehler = knotenFehler(kind, tiefe + 1, innen);
      if (fehler) return fehler;
    }
  }
  return null;
}

/**
 * Checks a document: three (old) or four `abschnitt` nodes in the fixed order, depth at most
 * `PROTOKOLL_MAX_TIEFE`, Baustein nodes strictly (id and fields), all other node types as generic
 * nodes, serialized size at most `PROTOKOLL_MAX_BYTES`. Returns an error message, null when valid.
 */
export function protokollDokumentPruefen(dokument: unknown): string | null {
  if (!istObjekt(dokument) || dokument.type !== 'doc' || !Array.isArray(dokument.content)) {
    return 'Das Protokoll ist ungültig.';
  }
  if (
    dokument.content.length !== PROTOKOLL_ABSCHNITTE.length &&
    dokument.content.length !== PROTOKOLL_ABSCHNITTE_ALT
  ) {
    return 'Das Protokoll braucht die Abschnitte Vergangenes, Gegenwärtiges, Zukünftiges und Sonstiges.';
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

/** The next Sitzung as the calendar suggests it (the first Sitzung after this one). */
export const protokollNaechsteSitzungVorschlagSchema = z.strictObject({
  eventId: z.string().min(1).max(100),
  titel: z.string().max(500),
  /** ISO instant. */
  beginn: z.string().max(40),
});
export type ProtokollNaechsteSitzungVorschlag = z.infer<
  typeof protokollNaechsteSitzungVorschlagSchema
>;

/** The next Sitzung entered by hand (instead of the calendar's suggestion). */
export const protokollNaechsteSitzungSchema = z.strictObject({
  /** A calendar event picked from the upcoming Sitzungen; null = just a date. */
  eventId: z.string().min(1).max(100).nullable(),
  /** Berlin date `YYYY-MM-DD`, '' = not entered. */
  datum: z
    .string()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Bitte gib ein Datum an.')
    .default(''),
  uhrzeit: uhrzeitOderLeerSchema.default(''),
});
export type ProtokollNaechsteSitzung = z.infer<typeof protokollNaechsteSitzungSchema>;

/** The result of an Aktion run when closing (see `protokollAktionen`), kept in the Kopf by Aktion id. */
export const AKTION_ERGEBNIS_STATI = ['erledigt', 'fehler'] as const;
export const protokollAktionErgebnisSchema = z.strictObject({
  status: z.enum(AKTION_ERGEBNIS_STATI),
  /** What was done, or why it failed. */
  text: z.string().max(2000),
  /** ISO instant. */
  am: z.string().max(40),
  /** Sub of the member who ran it. */
  von: z.string().max(100),
  /** The Aktion's own text when it ran (it is not computed any more once its effect is in the document). */
  aktionText: z.string().max(2000).default(''),
  bausteinId: z.string().max(200).default(''),
  art: z.string().max(100).default(''),
  /** The calendar event concerned. */
  eventId: z.string().max(200).nullable().default(null),
  /** The members concerned. */
  subs: z.array(z.string().max(100)).max(500).default([]),
});
export type ProtokollAktionErgebnis = z.infer<typeof protokollAktionErgebnisSchema>;

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
  /** The next Sitzung entered by hand; null = automatic (the first Sitzung after this one in the calendar). */
  naechsteSitzung: protokollNaechsteSitzungSchema.nullable().default(null),
  /**
   * The automatic next Sitzung as frozen when closed (set by the API): `{ vorschlag }` with the
   * suggestion (null = there was none); null = nothing frozen (a draft, or closed before this existed).
   */
  naechsteSitzungSchnappschuss: z
    .strictObject({ vorschlag: protokollNaechsteSitzungVorschlagSchema.nullable() })
    .nullable()
    .default(null),
  /** Who chaired the Sitzung. */
  sitzungsleitung: subSchluessel.nullable().default(null),
  /** Who took the minutes; the API sets the creator when a new protocol has none. */
  protokollfuehrung: subSchluessel.nullable().default(null),
  /** Time the Sitzung was opened ('' = not entered). */
  eroeffnung: uhrzeitOderLeerSchema.default(''),
  /** Legacy (no longer written or shown): time a late member arrived. */
  verspaetung: z.record(subSchluessel, uhrzeitOderLeerSchema).default({}),
  /** Results of the Aktionen run when closing, by Aktion id; written by the API only. */
  aktionen: z.record(z.string().max(200), protokollAktionErgebnisSchema).default({}),
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
  naechsteSitzung: null,
  naechsteSitzungSchnappschuss: null,
  sitzungsleitung: null,
  protokollfuehrung: null,
  eroeffnung: '',
  verspaetung: {},
  aktionen: {},
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

/** A calendar event as `protokollVorschlag` needs it (ISO instants; `titel` is what the calendar shows). */
export interface ProtokollKalenderEvent {
  id: string;
  titel: string;
  beginn: string;
  ende: string;
  abgesagt: boolean;
  kategorieId: string | null;
  dauer: EventDauer;
  /** Series the event was generated for; null = ordinary event. */
  serie: string | null;
  /** The event is a Sitzung (its Kategorie has minutes). */
  sitzung: boolean;
  verantwortlichSub: string | null;
  schichten: readonly SchichtQuelle[];
}

/** Without a previous protocol the past events of this many days before the Sitzung are offered. */
export const VORSCHLAG_FENSTER_TAGE = 92;

export interface ProtokollVorschlagEingabe {
  /** Berlin date (`YYYY-MM-DD`) of the new Sitzung. */
  sitzungDatum: string;
  /** ISO begin of the Sitzung of the previous protocol; null = none (a window of 92 days counts). */
  letzteSitzungBeginn?: string | null;
  /** Document of the previous protocol; null = there is none. */
  letztes: ProtokollDokument | null;
  /** Events of the calendar from the previous Sitzung on (and the ones the previous protocol points to). */
  kalender?: readonly ProtokollKalenderEvent[];
  /** Kategorie of the Vorlagen by id: fills `kategorieId` of copied Event blocks that have none (old data). */
  vorlageKategorien?: Readonly<Record<string, string>>;
  /**
   * Votes of the previous protocol to repeat because the session was not beschlussfähig there (ids
   * from `nichtBeschlussfaehigeAbstimmungen`), with date and title of that Sitzung. Needs `letztes`.
   */
  wiederholen?: { bausteinIds: readonly string[]; datum: string; sitzung: string } | null;
}

/**
 * The fields of an Event block as the calendar has them: name, dates, times, Kategorie, responsible
 * member and Schichten (in the Vorlage format). `basis` supplies what the calendar does not know
 * (`vorlageId`).
 */
export function eventDatenAusKalender(
  e: ProtokollKalenderEvent,
  basis?: BausteinEventDaten,
): BausteinEventDaten {
  const zeiten = eventZeitenAus(e.dauer, e.beginn, e.ende);
  const ganztaegig = e.dauer === 'ganztaegig';
  return {
    vorlageId: basis?.vorlageId ?? null,
    name: e.titel,
    datum: zeiten.datum,
    bisDatum: zeiten.bis !== zeiten.datum ? zeiten.bis : null,
    beginnZeit: ganztaegig ? null : zeiten.beginnZeit,
    endeZeit: ganztaegig ? null : zeiten.endeZeit,
    schichten: schichtenAusEvent(e.beginn, e.schichten),
    verantwortlichSub: e.verantwortlichSub,
    eventId: e.id,
    kategorieId: e.kategorieId,
  };
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
 * The free text without Abstimmung / Meinungsbild / Wahl blocks (their votes belong to one Sitzung) and
 * without nested Themen (a Thema belongs to one Sitzung, with everything in it).
 */
function ohneAbstimmungen(content: ProtokollKnoten[] | undefined): ProtokollKnoten[] {
  const rest = (content ?? []).filter((k) => !istVerschachtelbar(k.type) && k.type !== BILD_TYP);
  return rest.length > 0 ? rest : [leererAbsatz()];
}

const emptyBulletList = (): ProtokollKnoten => ({
  type: 'bulletList',
  content: [{ type: 'listItem', content: [leererAbsatz()] }],
});

/** Sort key of an Event block: date, then begin time; blocks without a date last. */
const eventSortierung = (a: BausteinEventDaten, b: BausteinEventDaten): number => {
  if (a.datum !== b.datum) {
    if (a.datum === null) return 1;
    if (b.datum === null) return -1;
    return a.datum < b.datum ? -1 : 1;
  }
  return (a.beginnZeit ?? '').localeCompare(b.beginnZeit ?? '');
};

const NULL_STIMMEN = { ja: 0, nein: 0, enthaltung: 0, ergebnis: null } as const;

/**
 * The same vote again for the next Sitzung: subject, persons, Posten, "Gilt ab" and the number of
 * votes stay; all counts and the result are reset, runoffs and notes are gone. Null for blocks that
 * are no vote, that do not parse, or a "Neues EM" without a vote.
 */
function abstimmungWiederholen(
  knoten: ProtokollKnoten,
  wiederholung: NonNullable<Wiederholung>,
): ProtokollKnoten | null {
  const daten: unknown = knoten.attrs?.daten;
  switch (knoten.type) {
    case 'bausteinBeschluss': {
      const d = bausteinBeschlussDatenSchema.safeParse(daten);
      return d.success
        ? bausteinErzeugen('bausteinBeschluss', { ...d.data, ...NULL_STIMMEN, wiederholung })
        : null;
    }
    case 'bausteinEm': {
      const d = bausteinEmDatenSchema.safeParse(daten);
      return d.success && d.data.abstimmung !== null
        ? bausteinErzeugen('bausteinEm', {
            ...d.data,
            abstimmung: { ...NULL_STIMMEN },
            wiederholung,
          })
        : null;
    }
    case 'bausteinAufnahme': {
      const d = bausteinAufnahmeDatenSchema.safeParse(daten);
      return d.success
        ? bausteinErzeugen('bausteinAufnahme', {
            ...d.data,
            abstimmung: { ...NULL_STIMMEN },
            wiederholung,
          })
        : null;
    }
    case 'bausteinWahl': {
      const d = bausteinWahlDatenSchema.safeParse(daten);
      return d.success
        ? bausteinErzeugen('bausteinWahl', {
            ...d.data,
            kandidaten: d.data.kandidaten.map((k) => ({ ...k, stimmen: 0 })),
            enthaltung: 0,
            stichwahlen: [],
            annahme: {},
            wiederholung,
          })
        : null;
    }
    case 'bausteinAuswahl': {
      const d = bausteinAuswahlDatenSchema.safeParse(daten);
      return d.success
        ? bausteinErzeugen('bausteinAuswahl', {
            ...d.data,
            optionen: d.data.optionen.map((o) => ({ ...o, stimmen: 0 })),
            enthaltung: 0,
            stichwahlen: [],
            wiederholung,
          })
        : null;
    }
    default:
      return null;
  }
}

/** The nodes with one of the ids, in document order, also inside other Bausteine. */
function knotenMitIds(
  knoten: ProtokollKnoten,
  ids: ReadonlySet<string>,
  gefunden: ProtokollKnoten[] = [],
): ProtokollKnoten[] {
  if (typeof knoten.attrs?.id === 'string' && ids.has(knoten.attrs.id)) gefunden.push(knoten);
  for (const kind of knoten.content ?? []) knotenMitIds(kind, ids, gefunden);
  return gefunden;
}

/**
 * Pre-filled document for a new protocol, from the calendar and the previous protocol.
 *
 * - "Vergangenes": a "Vergangenes Event" block for every calendar event that began after the previous
 *   Sitzung (without one: within the last 92 days) and ended before the day of the Sitzung, plus the
 *   past Event blocks of the previous protocol, sorted by date.
 * - "Zukünftiges": an Event block for every calendar event that ends on or after the day of the
 *   Sitzung (no upper limit), plus the upcoming Event blocks of the previous protocol, sorted by date.
 *   Event blocks of the previous protocol without an `eventId` stay as written at the end.
 * - Left out of the calendar: cancelled events, series events and Sitzungen; an event the previous
 *   protocol already mentions is kept anyway. Every `eventId` appears once.
 * - The calendar wins: name, dates, times, Kategorie, responsible member and Schichten come from the
 *   calendar. The notes (free text of the block, without votes) come from the previous protocol; new
 *   events get an empty list. Events gone from the calendar are kept as written.
 * - "Gegenwärtiges" holds the votes of the previous protocol listed in `wiederholen` (not beschlussfähig
 *   there; also those from notes of other blocks) as top-level blocks in document order: same subject
 *   and persons, counts and result reset, `wiederholung` pointing to that Sitzung.
 * "Sonstiges" stays empty; all blocks get new ids.
 */
export function protokollVorschlag(eingabe: ProtokollVorschlagEingabe): ProtokollDokument {
  const kalender = new Map((eingabe.kalender ?? []).map((e) => [e.id, e]));
  const gesehen = new Set<string>();
  const vergangen: BausteinVergangenesEventDaten[] = [];
  const mitId: { daten: BausteinEventDaten; content: ProtokollKnoten[] }[] = [];
  const ohneId: BausteinKnoten<'bausteinEvent'>[] = [];

  if (eingabe.letztes) {
    for (const knoten of eventBausteine(eingabe.letztes)) {
      const geparst = bausteinEventDatenSchema.safeParse(knoten.attrs?.daten);
      if (!geparst.success) continue;
      let daten = geparst.data;
      const aktuell = daten.eventId ? kalender.get(daten.eventId) : undefined;
      if (aktuell?.abgesagt) {
        gesehen.add(aktuell.id);
        continue;
      }
      if (daten.eventId) {
        if (gesehen.has(daten.eventId)) continue;
        gesehen.add(daten.eventId);
      }
      if (aktuell) daten = eventDatenAusKalender(aktuell, daten);
      const ende = daten.bisDatum ?? daten.datum;
      if (ende !== null && ende < eingabe.sitzungDatum) {
        vergangen.push({ eventId: daten.eventId, name: daten.name, datum: daten.datum });
      } else if (daten.eventId) {
        mitId.push({ daten, content: kopie(ohneAbstimmungen(knoten.content)) });
      } else {
        if (!daten.kategorieId && daten.vorlageId) {
          const kategorieId = eingabe.vorlageKategorien?.[daten.vorlageId];
          if (kategorieId) daten = { ...daten, kategorieId };
        }
        ohneId.push(
          bausteinErzeugen('bausteinEvent', daten, kopie(ohneAbstimmungen(knoten.content))),
        );
      }
    }
  }

  const fensterBeginn = eingabe.letzteSitzungBeginn
    ? Date.parse(eingabe.letzteSitzungBeginn)
    : null;
  const fensterTag = datumPlusTage(eingabe.sitzungDatum, -VORSCHLAG_FENSTER_TAGE);
  for (const e of eingabe.kalender ?? []) {
    if (gesehen.has(e.id)) continue;
    if (e.abgesagt || e.serie !== null || e.sitzung) continue;
    const daten = eventDatenAusKalender(e);
    const ende = daten.bisDatum ?? daten.datum!;
    if (ende >= eingabe.sitzungDatum) {
      gesehen.add(e.id);
      mitId.push({ daten, content: [emptyBulletList()] });
      continue;
    }
    const imFenster =
      fensterBeginn !== null ? Date.parse(e.beginn) > fensterBeginn : daten.datum! >= fensterTag;
    if (!imFenster) continue;
    gesehen.add(e.id);
    vergangen.push({ eventId: e.id, name: e.titel, datum: daten.datum });
  }

  const wiederholen = eingabe.wiederholen;
  const wiederholungen: ProtokollKnoten[] =
    eingabe.letztes && wiederholen && wiederholen.bausteinIds.length > 0
      ? knotenMitIds(eingabe.letztes, new Set(wiederholen.bausteinIds)).flatMap((k) => {
          const neu = abstimmungWiederholen(k, {
            datum: wiederholen.datum,
            sitzung: wiederholen.sitzung,
          });
          return neu ? [neu] : [];
        })
      : [];

  vergangen.sort((a, b) => {
    if (a.datum === b.datum) return 0;
    if (a.datum === null) return 1;
    if (b.datum === null) return -1;
    return a.datum < b.datum ? -1 : 1;
  });
  mitId.sort((a, b) => eventSortierung(a.daten, b.daten));
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
        vergangen.map((v) => bausteinErzeugen('bausteinVergangenesEvent', v)),
      ),
      abschnitt('gegenwaertiges', wiederholungen),
      abschnitt('zukuenftiges', [
        ...mitId.map((m) => bausteinErzeugen('bausteinEvent', m.daten, m.content)),
        ...ohneId,
      ]),
      abschnitt('sonstiges', []),
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
  /** Presigned GET URLs (1 h) of the images in `inhalt`, by key. */
  bilder: Record<string, string>;
  kopf: ProtokollKopf;
  status: ProtokollStatus;
  version: number;
  /**
   * The first not-cancelled Sitzung (any art) after this one (live in a draft, frozen once closed);
   * null = none known. It counts while `kopf.naechsteSitzung` is null.
   */
  naechsteSitzungVorschlag: ProtokollNaechsteSitzungVorschlag | null;
  /** Upcoming Sitzungen after this one to pick from, earliest first (drafts only, else empty). */
  naechsteSitzungen: ProtokollNaechsteSitzungVorschlag[];
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

const aktionIdsSchema = z.array(z.string().min(1).max(200)).max(200);

export const protokollStatusSchema = z.object({
  status: z.enum(PROTOKOLL_STATI),
  /** Ids of the Aktionen (see `protokollAktionen`) to run when closing; left out = none. */
  aktionen: aktionIdsSchema.optional(),
});
export type ProtokollStatusEingabe = z.infer<typeof protokollStatusSchema>;

/** Ids of the Aktionen to run (again) for a protocol, open or closed. */
export const protokollAktionenAusfuehrenSchema = z.object({ aktionen: aktionIdsSchema.min(1) });
export type ProtokollAktionenAusfuehren = z.infer<typeof protokollAktionenAusfuehrenSchema>;

/** Largest PDF of a closed protocol the API takes (Graph's simple upload and Lambda's payload limit). */
export const PROTOKOLL_PDF_MAX_BYTES = 4 * 1024 * 1024;

/**
 * The PDF of a closed protocol for OneDrive. JSON with base64 instead of raw bytes: API Gateway and the
 * Lambda adapter pass binary request bodies only with extra configuration, JSON always arrives intact.
 */
export const protokollPdfSchema = z.object({
  /** File name, e.g. `2026-11-04_Sitzung.pdf`; the API cleans it again. */
  dateiname: z.string().trim().min(1).max(200),
  /** The PDF bytes, base64 (standard alphabet). */
  base64: z
    .string()
    .min(1)
    .max(Math.ceil((PROTOKOLL_PDF_MAX_BYTES * 4) / 3) + 1024),
});
export type ProtokollPdfEingabe = z.infer<typeof protokollPdfSchema>;

export interface ProtokollPdfAntwort {
  gespeichert: true;
  /** Path in OneDrive, e.g. `Cloud4/Sitzungen/C4/Protokolle/2026/2026-11-04_Sitzung.pdf`. */
  pfad: string;
}

/** File name safe for OneDrive and ending in `.pdf`; null if nothing usable is left. */
export function protokollPdfDateiname(roh: string): string | null {
  const name = roh
    .replace(/[\\/:*?"<>|]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.pdf$/i, '')
    .replace(/[.\s]+$/, '')
    .slice(0, 150)
    .trim();
  return name ? `${name}.pdf` : null;
}
