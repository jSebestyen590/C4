import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, ne, or } from 'drizzle-orm';
import {
  ausVorlage,
  berlinZuUtc,
  datumBerlin,
  serieIdAus,
  serienTage as regelTage,
  eventBewertung,
  SCHICHT_ART_BEZEICHNUNG,
  statistikZeilen,
  teilnahmeKreisKodieren,
  teilnahmeKreisLesen,
  teilnahmeZustand,
  type BedarfDto,
  type BedarfEingabe,
  type DienstDto,
  type DienstEintragen,
  type DienstformDto,
  type DienstformEingabe,
  type DienstPerson,
  eventTitel,
  type EventDto,
  type EventEingabe,
  EVENT_DAUERN,
  eventDauerFehler,
  type EventArt,
  type EventDauer,
  type EventKategorieDto,
  type EventKategorieEingabe,
  type ExterneDto,
  type ExterneEingabe,
  type MeinDienstDto,
  type MeinEventDto,
  type SchichtArt,
  type SerieDto,
  type SerieEingabe,
  type SerieListeDto,
  type SerienBestehende,
  type SchichtDto,
  type SchichtEingabe,
  type StatistikZeileDto,
  type TeilnahmeAntwort,
  type TeilnahmeDto,
  type TeilnahmeKreis,
  type VorlageDto,
  type VorlageEingabe,
  type VorlageSchicht,
} from '@c4/shared';
import type { Db } from './db/client';
import {
  dienste,
  dienstformen,
  eventKategorien,
  events,
  eventTeilnahmen,
  eventVorlagen,
  kalenderEventAbos,
  kalenderFehltErinnerungen,
  kalenderSerien,
  type KalenderSerieRow,
  externe,
  kalenderTokens,
  mitglieder,
  type MitgliedRow,
  schichtBedarfe,
  schichten,
  serienTermine,
  vorlageBedarfe,
  vorlageSchichten,
} from './db/schema';

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------

/** The request is invalid in light of the stored data (HTTP 400). The message is user-facing. */
export class KalenderUngueltig extends Error {}

/** The request conflicts with the current state (HTTP 409). The message is user-facing. */
export class KalenderKonflikt extends Error {}

/** A series change affects future events; the caller has to say what happens to them (HTTP 409). */
export class SerieBetroffen extends Error {
  constructor(
    /** Future events still as generated. */
    readonly unveraendert: number,
    /** Future events that were adjusted or have Dienste/answers and stay in any case. */
    readonly angepasst: number,
  ) {
    super('Die Serie hat künftige Events.');
  }
}

/** A Dienst that an event update would delete. */
export interface BetroffenerDienst {
  dienstId: string;
  schichtId: string;
  schichtArt: SchichtArt;
  schichtBeginn: string;
  schichtEnde: string;
  dienstformId: string | null;
  person: DienstPerson;
  /** `schicht`: the whole Schicht is removed, `bedarf`: its Bedarf for the Dienstform is removed. */
  grund: 'schicht' | 'bedarf';
}

/** An event update would delete Dienste or participations and was not confirmed (HTTP 409 with the lists). */
export class EntfernungBestaetigen extends Error {
  constructor(
    readonly betroffene: BetroffenerDienst[],
    /** Members with an answer or invitation that the update would delete. */
    readonly teilnahmen: TeilnahmeDto[] = [],
  ) {
    super('Dabei werden Dienste oder Teilnahmen entfernt. Bitte bestätige das.');
  }
}

/**
 * Whether a stored answer counts as an entry that makes a series event "changed": every answer of
 * a `teilnahme` event, but not the absage ("nicht verfügbar") of a Dienste event.
 */
export const zaehltAlsEintrag = (antwort: TeilnahmeAntwort | null, teilnahmeEvent: boolean) =>
  teilnahmeEvent || antwort !== 'absage';

/** Declaring oneself unavailable would delete the member's own Dienste and was not confirmed (HTTP 409). */
export class VerfuegbarkeitBestaetigen extends Error {
  constructor(readonly dienste: number) {
    super(
      dienste === 1
        ? 'Du bist für einen Dienst eingetragen. Wenn du dich als nicht verfügbar meldest, wirst du ausgetragen.'
        : `Du bist für ${dienste} Dienste eingetragen. Wenn du dich als nicht verfügbar meldest, wirst du ausgetragen.`,
    );
  }
}

// ---------------------------------------------------------------------------------------------
// Pure logic (unit tested)
// ---------------------------------------------------------------------------------------------

/** What the reconciliation needs to know about a stored Schicht. */
export interface BestehendeSchicht {
  id: string;
  art: SchichtArt;
  dienste: { id: string; dienstformId: string | null }[];
}

export interface EntferntesDienst {
  dienstId: string;
  schichtId: string;
  dienstformId: string | null;
  grund: 'schicht' | 'bedarf';
}

export interface SchichtAbgleich {
  /** Input Schichten without an id: to insert, in input order. */
  neu: { index: number; eingabe: SchichtEingabe }[];
  /** Input Schichten with the id of a stored one: to update (including their Bedarfe). */
  behalten: { index: number; id: string; eingabe: SchichtEingabe }[];
  /** Stored Schichten that are not in the input: to delete with their Bedarfe and Dienste. */
  entfernt: string[];
  /**
   * Dienste that vanish: all of a removed Schicht, and those whose Dienstform lost its Bedarf (also
   * those of an Aufbau/Putzen Schicht that became Betrieb: they have no Dienstform to match).
   */
  entfernteDienste: EntferntesDienst[];
  /** Dienste of a Schicht that became Aufbau/Putzen: they stay, their Dienstform is cleared. */
  dienstformLeeren: string[];
}

/**
 * Reconciles the Schicht tree of an event update by Schicht id. Throws KalenderUngueltig for ids
 * that are not part of the event or are used twice.
 */
export function schichtAbgleich(
  bestehend: readonly BestehendeSchicht[],
  eingabe: readonly SchichtEingabe[],
): SchichtAbgleich {
  const nachId = new Map(bestehend.map((s) => [s.id, s]));
  const gesehen = new Set<string>();
  const ergebnis: SchichtAbgleich = {
    neu: [],
    behalten: [],
    entfernt: [],
    entfernteDienste: [],
    dienstformLeeren: [],
  };
  eingabe.forEach((s, index) => {
    if (s.id === undefined) {
      ergebnis.neu.push({ index, eingabe: s });
      return;
    }
    const alt = nachId.get(s.id);
    if (!alt) throw new KalenderUngueltig('Die Schicht gehört nicht zu diesem Event.');
    if (gesehen.has(s.id)) throw new KalenderUngueltig('Eine Schicht kommt doppelt vor.');
    gesehen.add(s.id);
    ergebnis.behalten.push({ index, id: s.id, eingabe: s });
    if (s.art !== 'betrieb') {
      ergebnis.dienstformLeeren.push(
        ...alt.dienste.filter((d) => d.dienstformId !== null).map((d) => d.id),
      );
      return;
    }
    const formen = new Set(s.bedarfe.map((b) => b.dienstformId));
    for (const d of alt.dienste) {
      if (d.dienstformId === null || !formen.has(d.dienstformId)) {
        ergebnis.entfernteDienste.push({
          dienstId: d.id,
          schichtId: alt.id,
          dienstformId: d.dienstformId,
          grund: 'bedarf',
        });
      }
    }
  });
  for (const alt of bestehend) {
    if (gesehen.has(alt.id)) continue;
    ergebnis.entfernt.push(alt.id);
    for (const d of alt.dienste) {
      ergebnis.entfernteDienste.push({
        dienstId: d.id,
        schichtId: alt.id,
        dienstformId: d.dienstformId,
        grund: 'schicht',
      });
    }
  }
  return ergebnis;
}

/**
 * Plans merging Externe: Dienste of the sources move to the target, except where the target (or an
 * earlier source Dienst) is already entered in the same Schicht; those are dropped, because a person
 * has only one Dienst per Schicht. Source Dienste are processed in the given order.
 */
export function zusammenfuehrenPlan(
  ziel: readonly { schichtId: string }[],
  quellen: readonly { id: string; schichtId: string }[],
): { verschieben: string[]; verwerfen: string[] } {
  const belegt = new Set(ziel.map((d) => d.schichtId));
  const verschieben: string[] = [];
  const verwerfen: string[] = [];
  for (const d of quellen) {
    if (belegt.has(d.schichtId)) verwerfen.push(d.id);
    else {
      belegt.add(d.schichtId);
      verschieben.push(d.id);
    }
  }
  return { verschieben, verwerfen };
}

const MS_PRO_TAG = 86_400_000;

/** `[von, bis]` (inclusive Berlin dates) as a half-open UTC range `[start, ende)`. */
export function zeitraumGrenzen(von: string, bis: string): { start: Date; ende: Date } {
  const folgetag = new Date(Date.parse(`${bis}T00:00:00Z`) + MS_PRO_TAG).toISOString().slice(0, 10);
  return {
    start: new Date(berlinZuUtc(von, '00:00')),
    ende: new Date(berlinZuUtc(folgetag, '00:00')),
  };
}

/** The calendar year (Berlin) as a half-open UTC range. */
export function jahrGrenzen(jahr: number): { start: Date; ende: Date } {
  return {
    start: new Date(berlinZuUtc(`${jahr}-01-01`, '00:00')),
    ende: new Date(berlinZuUtc(`${jahr + 1}-01-01`, '00:00')),
  };
}

/** Whether a unique constraint was violated (drizzle wraps the driver error as `cause`). */
export function istEindeutigVerletzt(err: unknown): boolean {
  const code = (e: unknown) => (e as { code?: unknown } | null | undefined)?.code;
  return code(err) === '23505' || code((err as { cause?: unknown } | null)?.cause) === '23505';
}

// ---------------------------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------------------------

/**
 * Persons in DTOs carry `username: null`; the app adds the Cognito usernames (the store only knows
 * the profile row).
 */
export interface DienstInfo {
  id: string;
  schichtId: string;
  schichtArt: SchichtArt;
  schichtBeginn: string;
  schichtEnde: string;
  eventId: string;
  eventTitel: string;
  /** ISO instant of the event start. */
  eventBeginn: string;
  abgesagt: boolean;
  dienstformId: string | null;
  mitgliedSub: string | null;
  externId: string | null;
  eingetragenVon: string;
}

/**
 * Result of an event update, for notifications: who is affected by what. All lists only name
 * members (Externe get no notifications).
 */
export interface EventAenderung {
  /** The start or end of the event itself changed. */
  zeitGeaendert: boolean;
  /** Schichten that kept their Dienste but changed start or end, with the entered members. */
  geaenderteSchichten: {
    schichtId: string;
    art: SchichtArt;
    beginn: string;
    ende: string;
    mitgliedSubs: string[];
  }[];
  /** Dienste that were deleted by the update (confirmed by the caller). */
  entfernteDienste: BetroffenerDienst[];
  /** Everybody with a remaining Dienst in the event. */
  mitgliedSubs: string[];
  /** Everybody who takes part in the event after the update. */
  teilnehmerSubs: string[];
  /** The responsible member if the update newly set them (not the same person as before), else null. */
  verantwortlichNeu: string | null;
}

export interface AbsageErgebnis {
  /** False when the event already had the requested state. */
  geaendert: boolean;
  /** Members with a Dienst in the event. */
  mitgliedSubs: string[];
  /** Members who take part in the event. */
  teilnehmerSubs: string[];
}

export interface KalenderStore {
  // ----- Events
  /**
   * Events overlapping the Berlin dates `von`..`bis` (inclusive), ordered by start. `sub` is the
   * caller, for `ichNehmeTeil` and `imAbo`.
   */
  events(von: string, bis: string, sub?: string): Promise<EventDto[]>;
  event(id: string, sub?: string): Promise<EventDto | undefined>;
  eventAnlegen(daten: EventEingabe, von: string): Promise<string>;
  /**
   * Reconciles the Schicht tree. Throws EntfernungBestaetigen when Dienste would be deleted and
   * `daten.bestaetigt` is not true. Returns undefined when the event does not exist.
   */
  eventAktualisieren(id: string, daten: EventEingabe): Promise<EventAenderung | undefined>;
  /** False when missing; throws KalenderKonflikt while Dienste exist. */
  eventLoeschen(id: string): Promise<boolean>;
  /** Undefined when the event does not exist. */
  absageSetzen(id: string, abgesagt: boolean): Promise<AbsageErgebnis | undefined>;

  // ----- Participation and event subscription
  /**
   * Sets the member's own answer. Undefined when the event does not exist; throws KalenderKonflikt
   * for cancelled events and events without participation.
   */
  teilnahmeSetzen(eventId: string, sub: string, teilnahme: boolean): Promise<true | undefined>;
  /**
   * Own availability for a `dienste` event: `verfuegbar: false` stores an absage ("nicht verfügbar"),
   * `true` removes it. Undefined when the event does not exist; throws KalenderKonflikt for cancelled
   * events and `teilnahme` events, and `VerfuegbarkeitBestaetigen` while the member has Dienste in the
   * event and `bestaetigt` is not true (they are then deleted together with the absage).
   */
  verfuegbarkeitSetzen(
    eventId: string,
    sub: string,
    verfuegbar: boolean,
    bestaetigt: boolean,
  ): Promise<true | undefined>;
  /** Adds the event to / removes it from the member's feed. False when the event does not exist. */
  eventAboSetzen(eventId: string, sub: string, abonniert: boolean): Promise<boolean>;

  // ----- Series (see kalenderSerien.ts)
  /** Dates (`YYYY-MM-DD`) the series already created an event for. */
  serienTage(serie: string): Promise<string[]>;
  /**
   * Records the day for the series and creates the event in one transaction. False (and no event) when
   * the day was already recorded, so parallel runs never duplicate and deleted days stay deleted.
   */
  serienTerminAnlegen(serie: string, datum: string, daten: EventEingabe): Promise<boolean>;

  /** All series, ordered by name. */
  serien(): Promise<SerieDto[]>;
  /** All series with the number of their future events. */
  serienMitAnzahl(): Promise<SerieListeDto[]>;
  /** Creates the series; its id is a unique slug of the name. Throws KalenderUngueltig. */
  serieAnlegen(daten: SerieEingabe): Promise<string>;
  /**
   * Changes the series. When the rule changes and future events exist, throws SerieBetroffen unless
   * `bestehende` is given: `anpassen` deletes the unchanged future events that no longer fit and updates the
   * others from the Vorlage, `behalten` leaves all events. False when missing.
   */
  serieAktualisieren(
    id: string,
    daten: SerieEingabe,
    bestehende?: SerienBestehende,
  ): Promise<boolean>;
  /** Turning a series off with future events works like `serieAktualisieren` (`anpassen` deletes the unchanged ones). */
  serieAktivSetzen(id: string, aktiv: boolean, bestehende?: SerienBestehende): Promise<boolean>;
  /** Deleting works like turning off, and removes the series' `serien_termine`. */
  serieLoeschen(id: string, bestehende?: SerienBestehende): Promise<boolean>;

  // ----- Dienste
  /** Undefined when the Schicht does not exist. Throws KalenderUngueltig / KalenderKonflikt. */
  dienstEintragen(
    schichtId: string,
    daten: DienstEintragen,
    eingetragenVon: string,
  ): Promise<{ id: string; absageAufgehoben: boolean } | undefined>;
  dienstHolen(id: string): Promise<DienstInfo | undefined>;
  dienstEntfernen(id: string): Promise<boolean>;

  // ----- Externe
  externe(mitArchiv: boolean): Promise<ExterneDto[]>;
  externAnlegen(daten: ExterneEingabe, von: string): Promise<string>;
  externAktualisieren(id: string, daten: ExterneEingabe): Promise<boolean>;
  /** Undefined when the target is missing. Throws KalenderUngueltig for unknown sources. */
  externeZusammenfuehren(
    zielId: string,
    quelleIds: readonly string[],
  ): Promise<{ verschoben: number; verworfen: number } | undefined>;

  // ----- Stammdaten
  dienstformen(mitArchiv: boolean): Promise<DienstformDto[]>;
  dienstformAnlegen(daten: DienstformEingabe): Promise<string>;
  dienstformAktualisieren(id: string, daten: DienstformEingabe): Promise<boolean>;
  kategorien(mitArchiv: boolean): Promise<EventKategorieDto[]>;
  kategorieAnlegen(daten: EventKategorieEingabe): Promise<string>;
  kategorieAktualisieren(id: string, daten: EventKategorieEingabe): Promise<boolean>;
  vorlagen(mitArchiv: boolean): Promise<VorlageDto[]>;
  vorlageAnlegen(daten: VorlageEingabe): Promise<string>;
  vorlageAktualisieren(id: string, daten: VorlageEingabe): Promise<boolean>;
  vorlageLoeschen(id: string): Promise<boolean>;

  // ----- Global "Dienste fehlen" reminders
  /** Minutes before the event begin, sorted descending. */
  erinnerungen(): Promise<number[]>;
  erinnerungenSetzen(minutenVorher: readonly number[]): Promise<void>;

  // ----- Statistik
  statistik(jahr: number): Promise<StatistikZeileDto[]>;

  // ----- Calendar feed
  /** Creates a new feed token for the member (replacing the old one) and returns it in plain text. */
  tokenErzeugen(sub: string): Promise<string>;
  tokenVorhanden(sub: string): Promise<boolean>;
  /** The member the feed token hash (see `tokenHash`) belongs to. */
  subPerTokenHash(hash: string): Promise<string | undefined>;
  /** The member's own Dienste whose Schicht begins at or after `ab`, ordered by start. */
  meineDienste(sub: string, ab: Date): Promise<MeinDienstDto[]>;
  /** Events ending at or after `ab` that the member takes part in or added to their feed, by start. */
  meineEvents(sub: string, ab: Date): Promise<MeinEventDto[]>;

  // ----- Notifications
  /** Dienste of members in non-cancelled events whose Schicht begins in `von` (incl.) .. `bis` (excl.). */
  erinnerungsDienste(von: Date, bis: Date): Promise<ErinnerungsDienst[]>;
  /** Members taking part in non-cancelled events beginning in `von` (incl.) .. `bis` (excl.). */
  erinnerungsTeilnahmen(von: Date, bis: Date): Promise<ErinnerungsTeilnahme[]>;
}

/** A member's participation that may need a reminder. */
export interface ErinnerungsTeilnahme {
  eventId: string;
  eventTitel: string;
  mitgliedSub: string;
  /** ISO instant of the event start. */
  beginn: string;
}

/** A member's Dienst that may need a reminder. */
export interface ErinnerungsDienst {
  dienstId: string;
  mitgliedSub: string;
  eventId: string;
  eventTitel: string;
  schichtArt: SchichtArt;
  /** Null for Aufbau/Putzen. */
  dienstformName: string | null;
  /** ISO instant of the Schicht start. */
  beginn: string;
}

/** sha256 hex of a feed token; only this hash is stored. */
export const tokenHash = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

// ---------------------------------------------------------------------------------------------
// Drizzle implementation
// ---------------------------------------------------------------------------------------------

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** What the loaders need; satisfied by the database and by a transaction. */
type Q = Pick<Db, 'select'>;

const iso = (d: Date) => d.toISOString();
const einzigartig = <T>(werte: readonly T[]) => [...new Set(werte)];

const mitgliedPerson = (m: MitgliedRow) => ({
  art: 'mitglied' as const,
  sub: m.sub,
  username: null,
  vorname: m.vorname,
  nachname: m.nachname,
  status: m.status,
  anrede: m.anrede ?? ('neutral' as const),
});

/** A member with a relation to an event's participation. */
interface TeilnahmeZeile {
  mitglied: MitgliedRow;
  zustand: TeilnahmeAntwort;
  eingeladen: boolean;
}

/**
 * Participation of the given events (only those with a circle): everybody in the circle, invited or
 * with an own answer, with the computed state. The circle is evaluated against the current members.
 */
async function teilnahmenLaden(
  q: Q,
  eventRows: readonly { id: string; teilnahmeStatus: string | null }[],
): Promise<Map<string, TeilnahmeZeile[]>> {
  const ergebnis = new Map<string, TeilnahmeZeile[]>();
  const aktive = eventRows.flatMap((e) => {
    const kreis = teilnahmeKreisLesen(e.teilnahmeStatus);
    return kreis ? [{ id: e.id, kreis }] : [];
  });
  if (aktive.length === 0) return ergebnis;
  const rows = await q
    .select()
    .from(eventTeilnahmen)
    .where(
      inArray(
        eventTeilnahmen.eventId,
        aktive.map((a) => a.id),
      ),
    );
  const stati = einzigartig(aktive.flatMap((a) => a.kreis));
  const subs = einzigartig(rows.map((r) => r.mitgliedSub));
  const bedingung = or(
    stati.length > 0 ? inArray(mitglieder.status, stati) : undefined,
    subs.length > 0 ? inArray(mitglieder.sub, subs) : undefined,
  );
  const mRows = bedingung ? await q.select().from(mitglieder).where(bedingung) : [];
  const nachEvent = new Map(rows.map((r) => [`${r.eventId}:${r.mitgliedSub}`, r] as const));
  for (const { id, kreis } of aktive) {
    const zeilen: TeilnahmeZeile[] = [];
    for (const m of mRows) {
      const row = nachEvent.get(`${id}:${m.sub}`);
      const zustand = teilnahmeZustand({
        kreis,
        status: m.status,
        eingeladen: row?.eingeladen ?? false,
        antwort: row?.antwort ?? null,
      });
      if (zustand) zeilen.push({ mitglied: m, zustand, eingeladen: row?.eingeladen ?? false });
    }
    ergebnis.set(id, zeilen);
  }
  return ergebnis;
}

/**
 * Members who declared themselves unavailable (`absage`) for the given `dienste` events (those
 * without a circle). `teilnahme` events keep their absagen in `teilnahmenLaden`.
 */
async function absagenLaden(
  q: Q,
  eventRows: readonly { id: string; teilnahmeStatus: string | null }[],
): Promise<Map<string, MitgliedRow[]>> {
  const ergebnis = new Map<string, MitgliedRow[]>();
  const ids = eventRows.filter((e) => e.teilnahmeStatus === null).map((e) => e.id);
  if (ids.length === 0) return ergebnis;
  const rows = await q
    .select({ eventId: eventTeilnahmen.eventId, mitglied: mitglieder })
    .from(eventTeilnahmen)
    .innerJoin(mitglieder, eq(mitglieder.sub, eventTeilnahmen.mitgliedSub))
    .where(and(inArray(eventTeilnahmen.eventId, ids), eq(eventTeilnahmen.antwort, 'absage')));
  for (const r of rows) ergebnis.set(r.eventId, [...(ergebnis.get(r.eventId) ?? []), r.mitglied]);
  return ergebnis;
}

/** Subs of the members who take part (state `teilnahme`) in an event. */
async function teilnehmerSubs(
  q: Q,
  event: { id: string; teilnahmeStatus: string | null },
): Promise<string[]> {
  const zeilen = (await teilnahmenLaden(q, [event])).get(event.id) ?? [];
  return zeilen.filter((z) => z.zustand === 'teilnahme').map((z) => z.mitglied.sub);
}

/** Members and Externe by id, as the `DienstPerson` shown in DTOs (usernames are added by the app). */
async function personenLaden(
  q: Q,
  mitgliedSubs: readonly string[],
  externIds: readonly string[],
): Promise<{ mitglieder: Map<string, DienstPerson>; externe: Map<string, DienstPerson> }> {
  const [mRows, eRows] = await Promise.all([
    mitgliedSubs.length > 0
      ? q
          .select()
          .from(mitglieder)
          .where(inArray(mitglieder.sub, [...mitgliedSubs]))
      : [],
    externIds.length > 0
      ? q
          .select()
          .from(externe)
          .where(inArray(externe.id, [...externIds]))
      : [],
  ]);
  return {
    mitglieder: new Map(mRows.map((m) => [m.sub, mitgliedPerson(m)])),
    externe: new Map(
      eRows.map((e) => [
        e.id,
        { art: 'extern' as const, id: e.id, name: e.name, quelle: e.quelle },
      ]),
    ),
  };
}

const titelKategorie = (name: string | null | undefined) => (name ? { name } : null);

/** Loads events (matching `bedingung`) with Schichten, Bedarfe, Dienste and the Ampel. */
async function eventsLaden(
  q: Q,
  bedingung: ReturnType<typeof and>,
  sub?: string,
): Promise<EventDto[]> {
  const eventRows = await q
    .select({
      event: events,
      kategorieName: eventKategorien.name,
      kategorieFarbe: eventKategorien.farbe,
      kategorieArt: eventKategorien.art,
      kategorieDauer: eventKategorien.dauer,
    })
    .from(events)
    .leftJoin(eventKategorien, eq(eventKategorien.id, events.kategorieId))
    .where(bedingung)
    .orderBy(asc(events.beginn), asc(events.id));
  if (eventRows.length === 0) return [];
  const eventIds = eventRows.map((r) => r.event.id);
  const [teilnahmen, absagen, aboRows] = await Promise.all([
    teilnahmenLaden(
      q,
      eventRows.map((r) => r.event),
    ),
    absagenLaden(
      q,
      eventRows.map((r) => r.event),
    ),
    sub
      ? q
          .select({ eventId: kalenderEventAbos.eventId })
          .from(kalenderEventAbos)
          .where(
            and(
              eq(kalenderEventAbos.mitgliedSub, sub),
              inArray(kalenderEventAbos.eventId, eventIds),
            ),
          )
      : [],
  ]);
  const abonniert = new Set(aboRows.map((a) => a.eventId));
  const schichtRows = await q
    .select()
    .from(schichten)
    .where(inArray(schichten.eventId, eventIds))
    .orderBy(asc(schichten.beginn), asc(schichten.reihenfolge), asc(schichten.id));
  const schichtIds = schichtRows.map((s) => s.id);
  const [bedarfRows, dienstRows, formRows] = await Promise.all([
    schichtIds.length > 0
      ? q.select().from(schichtBedarfe).where(inArray(schichtBedarfe.schichtId, schichtIds))
      : [],
    schichtIds.length > 0
      ? q
          .select()
          .from(dienste)
          .where(inArray(dienste.schichtId, schichtIds))
          .orderBy(asc(dienste.eingetragenAm), asc(dienste.id))
      : [],
    q.select().from(dienstformen),
  ]);
  const personen = await personenLaden(
    q,
    einzigartig([
      ...dienstRows.flatMap((d) => (d.mitgliedSub ? [d.mitgliedSub] : [])),
      ...eventRows.flatMap((r) => (r.event.verantwortlichSub ? [r.event.verantwortlichSub] : [])),
    ]),
    einzigartig(dienstRows.flatMap((d) => (d.externId ? [d.externId] : []))),
  );
  const formPos = new Map(
    [...formRows]
      .sort((a, b) => a.reihenfolge - b.reihenfolge || a.name.localeCompare(b.name, 'de'))
      .map((f, i) => [f.id, i]),
  );

  const alsSchicht = (s: (typeof schichtRows)[number]): SchichtDto => ({
    id: s.id,
    art: s.art,
    beginn: iso(s.beginn),
    ende: iso(s.ende),
    minimum: s.minimum,
    wunsch: s.wunsch,
    bedarfe: bedarfRows
      .filter((b) => b.schichtId === s.id)
      .sort((a, b) => (formPos.get(a.dienstformId) ?? 0) - (formPos.get(b.dienstformId) ?? 0))
      .map((b): BedarfDto => ({
        dienstformId: b.dienstformId,
        minimum: b.minimum,
        wunsch: b.wunsch,
      })),
    dienste: dienstRows
      .filter((d) => d.schichtId === s.id)
      .flatMap((d): DienstDto[] => {
        const person = d.mitgliedSub
          ? personen.mitglieder.get(d.mitgliedSub)
          : d.externId
            ? personen.externe.get(d.externId)
            : undefined;
        if (!person) return [];
        return [
          {
            id: d.id,
            dienstformId: d.dienstformId,
            kommentar: d.kommentar,
            eingetragenVon: d.eingetragenVon,
            person,
          },
        ];
      }),
  });

  return eventRows.map(
    ({ event: e, kategorieName, kategorieFarbe, kategorieArt, kategorieDauer }) => {
      const kreis = teilnahmeKreisLesen(e.teilnahmeStatus);
      const zeilen = teilnahmen.get(e.id) ?? [];
      const nichtVerfuegbar = (absagen.get(e.id) ?? [])
        .map(mitgliedPerson)
        .sort(
          (a, b) =>
            a.nachname.localeCompare(b.nachname, 'de') || a.vorname.localeCompare(b.vorname, 'de'),
        );
      const meineTeilnahme: TeilnahmeAntwort | null =
        kreis === null || !sub
          ? null
          : (zeilen.find((z) => z.mitglied.sub === sub)?.zustand ?? null);
      const alleSchichten = schichtRows.filter((s) => s.eventId === e.id).map(alsSchicht);
      return {
        id: e.id,
        titel: e.titel ?? '',
        anzeigeTitel: eventTitel(e, kategorieName === null ? null : { name: kategorieName }),
        beschreibung: e.beschreibung,
        kategorie:
          e.kategorieId && kategorieName !== null && kategorieFarbe !== null
            ? { id: e.kategorieId, name: kategorieName, farbe: kategorieFarbe }
            : null,
        art: artVon({ art: kategorieArt }),
        dauer: dauerVon({ dauer: kategorieDauer }),
        beginn: iso(e.beginn),
        ende: iso(e.ende),
        abgesagt: e.abgesagt,
        serie: e.serie,
        schichten: alleSchichten,
        bewertung: eventBewertung({ abgesagt: e.abgesagt, schichten: alleSchichten }),
        verantwortlich: verantwortlicheR(e.verantwortlichSub, personen.mitglieder),
        teilnahmeStatus: kreis,
        teilnahmen: zeilen.map((z): TeilnahmeDto => ({
          person: mitgliedPerson(z.mitglied),
          zustand: z.zustand,
          eingeladen: z.eingeladen,
        })),
        ichNehmeTeil: kreis === null || !sub ? null : meineTeilnahme === 'teilnahme',
        meineTeilnahme,
        nichtVerfuegbar,
        ichBinNichtVerfuegbar: !!sub && nichtVerfuegbar.some((p) => p.sub === sub),
        imAbo: abonniert.has(e.id),
      };
    },
  );
}

const verantwortlicheR = (
  sub: string | null,
  personen: Map<string, DienstPerson>,
): EventDto['verantwortlich'] => {
  const person = sub ? personen.get(sub) : undefined;
  return person?.art === 'mitglied' ? person : null;
};

const artVon = (k: { art: string | null } | null | undefined): EventArt =>
  k?.art === 'teilnahme' ? 'teilnahme' : 'dienste';

/** A Kategorie with its resolved kind and default circle. */
export interface KategorieInfo {
  art: EventArt;
  teilnahmeStatus: TeilnahmeKreis;
  dauer: EventDauer;
}

/** Throws unless the event's begin and end fit the Kategorie's `dauer`. */
function dauerPruefen(kategorie: KategorieInfo, daten: { beginn: string; ende: string }): void {
  const fehler = eventDauerFehler(kategorie.dauer, daten.beginn, daten.ende);
  if (fehler) throw new KalenderUngueltig(fehler);
}

const dauerVon = (k: { dauer: string | null }): EventDauer =>
  (EVENT_DAUERN as readonly string[]).includes(k.dauer ?? '')
    ? (k.dauer as EventDauer)
    : 'eintaegig';

/** The responsible member must have a profile row. */
async function verantwortlicheRPruefen(q: Q, sub: string | null | undefined): Promise<void> {
  if (!sub) return;
  const [m] = await q
    .select({ sub: mitglieder.sub })
    .from(mitglieder)
    .where(eq(mitglieder.sub, sub));
  if (!m) throw new KalenderUngueltig('Die verantwortliche Person gibt es nicht.');
}

/** Returns the Kategorie; throws unless it exists (and is not archived, unless it is `bisherige`). */
async function kategorieMussExistieren(
  q: Q,
  id: string,
  bisherige?: string | null,
): Promise<KategorieInfo> {
  const [k] = await q.select().from(eventKategorien).where(eq(eventKategorien.id, id));
  if (!k || (k.archiviert && id !== bisherige)) {
    throw new KalenderUngueltig('Die Kategorie gibt es nicht.');
  }
  return {
    art: artVon(k),
    teilnahmeStatus: teilnahmeKreisLesen(k.teilnahmeStatus),
    dauer: dauerVon(k),
  };
}

/**
 * Checks the input against the Kategorie's kind: Dienste events have no participation, participation
 * events no Schichten. Returns the circle to store (null for Dienste; for participation the given circle,
 * else the Kategorie's default).
 */
export function artPruefen(
  kategorie: Pick<KategorieInfo, 'art' | 'teilnahmeStatus'>,
  daten: {
    schichten: readonly unknown[];
    teilnahmeStatus: TeilnahmeKreis;
    eingeladen?: readonly string[];
  },
): TeilnahmeKreis {
  if (kategorie.art === 'dienste') {
    if (daten.teilnahmeStatus !== null || (daten.eingeladen?.length ?? 0) > 0) {
      throw new KalenderUngueltig('Events mit Diensten haben keine Teilnahme.');
    }
    return null;
  }
  if (daten.schichten.length > 0) {
    throw new KalenderUngueltig('Events mit Teilnahme haben keine Schichten.');
  }
  return daten.teilnahmeStatus ?? kategorie.teilnahmeStatus ?? [];
}

/** Replacing a series event never involves participation: neither the old nor the new Kategorie may be Teilnahme. */
export function serieErsetzenPruefen(
  neu: Pick<KategorieInfo, 'art'>,
  bisher?: Pick<KategorieInfo, 'art'> | null,
): void {
  if (neu.art === 'teilnahme' || bisher?.art === 'teilnahme') {
    throw new KalenderUngueltig(
      'Ein Serien-Event kann nur durch ein Event mit Diensten ersetzt werden, nicht durch eines mit Teilnahme.',
    );
  }
}

/** Throws unless every Dienstform exists (archived ones only when listed in `erlaubt`). */
async function dienstformenMuessenExistieren(
  q: Q,
  ids: readonly string[],
  erlaubt: ReadonlySet<string> = new Set(),
) {
  const eindeutig = einzigartig(ids);
  if (eindeutig.length === 0) return;
  const rows = await q.select().from(dienstformen).where(inArray(dienstformen.id, eindeutig));
  const ok = new Map(rows.map((f) => [f.id, f]));
  for (const id of eindeutig) {
    const f = ok.get(id);
    if (!f || (f.archiviert && !erlaubt.has(id))) {
      throw new KalenderUngueltig('Die Dienstform gibt es nicht.');
    }
  }
}

/** The Dienstformen that Schicht or Vorlage-Schicht inputs need (Betrieb only). */
const dienstformIdsVon = (
  schichten: readonly ({ art: 'betrieb'; bedarfe: BedarfEingabe[] } | { art: SchichtArt })[],
) =>
  schichten.flatMap((s) =>
    'bedarfe' in s && s.art === 'betrieb' ? s.bedarfe.map((b) => b.dienstformId) : [],
  );

export function createKalenderStore(db: Db): KalenderStore {
  const schichtenSchreiben = async (
    tx: Tx,
    eventId: string,
    eintraege: readonly { index: number; id?: string; eingabe: SchichtEingabe }[],
  ) => {
    for (const { index, id: vorhandeneId, eingabe: s } of eintraege) {
      const werte = {
        art: s.art,
        beginn: new Date(s.beginn),
        ende: new Date(s.ende),
        reihenfolge: index,
        minimum: s.art === 'betrieb' ? null : s.minimum,
        wunsch: s.art === 'betrieb' ? null : s.wunsch,
      };
      let id = vorhandeneId;
      if (id === undefined) {
        id = randomUUID();
        await tx.insert(schichten).values({ id, eventId, ...werte });
      } else {
        await tx.update(schichten).set(werte).where(eq(schichten.id, id));
        await tx.delete(schichtBedarfe).where(eq(schichtBedarfe.schichtId, id));
      }
      if (s.art === 'betrieb') {
        await tx.insert(schichtBedarfe).values(
          s.bedarfe.map((b) => ({
            schichtId: id,
            dienstformId: b.dienstformId,
            minimum: b.minimum,
            wunsch: b.wunsch,
          })),
        );
      }
    }
  };

  /** Writes the individual invitations (the circle itself is a column of the event). */
  const teilnahmeSchreiben = async (
    tx: Tx,
    eventId: string,
    kreis: TeilnahmeKreis,
    daten: { eingeladen: readonly string[] },
  ) => {
    if (kreis === null) {
      // A Dienste event keeps the absagen ("nicht verfügbar"), everything else goes.
      await tx
        .delete(eventTeilnahmen)
        .where(
          and(
            eq(eventTeilnahmen.eventId, eventId),
            or(isNull(eventTeilnahmen.antwort), ne(eventTeilnahmen.antwort, 'absage')),
          ),
        );
      await tx
        .update(eventTeilnahmen)
        .set({ eingeladen: false })
        .where(and(eq(eventTeilnahmen.eventId, eventId), eq(eventTeilnahmen.eingeladen, true)));
      return;
    }
    if (daten.eingeladen.length > 0) {
      const gefunden = await tx
        .select({ sub: mitglieder.sub })
        .from(mitglieder)
        .where(inArray(mitglieder.sub, [...daten.eingeladen]));
      if (gefunden.length !== daten.eingeladen.length) {
        throw new KalenderUngueltig('Eine eingeladene Person gibt es nicht.');
      }
    }
    const bisher = await tx
      .select()
      .from(eventTeilnahmen)
      .where(eq(eventTeilnahmen.eventId, eventId));
    for (const r of bisher) {
      if (!r.eingeladen || daten.eingeladen.includes(r.mitgliedSub)) continue;
      const bedingung = and(
        eq(eventTeilnahmen.eventId, eventId),
        eq(eventTeilnahmen.mitgliedSub, r.mitgliedSub),
      );
      if (r.antwort === null) await tx.delete(eventTeilnahmen).where(bedingung);
      else await tx.update(eventTeilnahmen).set({ eingeladen: false }).where(bedingung);
    }
    for (const sub of daten.eingeladen) {
      await tx
        .insert(eventTeilnahmen)
        .values({ eventId, mitgliedSub: sub, eingeladen: true })
        .onConflictDoUpdate({
          target: [eventTeilnahmen.eventId, eventTeilnahmen.mitgliedSub],
          set: { eingeladen: true, geaendertAm: new Date() },
        });
    }
  };

  const eventErzeugen = async (
    tx: Tx,
    daten: EventEingabe,
    von: string | null,
    serie: string | null,
    id: string = randomUUID(),
  ) => {
    const kategorie = await kategorieMussExistieren(tx, daten.kategorieId);
    const kreis = artPruefen(kategorie, daten);
    dauerPruefen(kategorie, daten);
    await dienstformenMuessenExistieren(tx, dienstformIdsVon(daten.schichten));
    await verantwortlicheRPruefen(tx, daten.verantwortlichSub);
    if (daten.schichten.some((s) => s.id !== undefined)) {
      throw new KalenderUngueltig('Neue Events haben noch keine Schichten mit Id.');
    }
    await tx.insert(events).values({
      id,
      titel: daten.titel || null,
      beschreibung: daten.beschreibung,
      kategorieId: daten.kategorieId,
      beginn: new Date(daten.beginn),
      ende: new Date(daten.ende),
      serie,
      teilnahmeStatus: teilnahmeKreisKodieren(kreis),
      verantwortlichSub: daten.verantwortlichSub ?? null,
      angelegtVon: von,
    });
    await teilnahmeSchreiben(tx, id, kreis, daten);
    await schichtenSchreiben(
      tx,
      id,
      daten.schichten.map((eingabe, index) => ({ index, eingabe })),
    );
    return id;
  };

  const vorlageSchreiben = async (tx: Tx, vorlageId: string, daten: VorlageEingabe) => {
    for (const [index, s] of daten.schichten.entries()) {
      const id = randomUUID();
      await tx.insert(vorlageSchichten).values({
        id,
        vorlageId,
        art: s.art,
        tagVersatz: s.art === 'betrieb' ? 0 : s.tagVersatz,
        beginnZeit: s.beginnZeit,
        endeZeit: s.endeZeit,
        reihenfolge: index,
        minimum: s.art === 'betrieb' ? null : s.minimum,
        wunsch: s.art === 'betrieb' ? null : s.wunsch,
      });
      if (s.art === 'betrieb') {
        await tx.insert(vorlageBedarfe).values(
          s.bedarfe.map((b) => ({
            vorlageSchichtId: id,
            dienstformId: b.dienstformId,
            minimum: b.minimum,
            wunsch: b.wunsch,
          })),
        );
      }
    }
  };

  const eventsFuerBedingung = (bedingung: ReturnType<typeof and>, sub?: string) =>
    eventsLaden(db, bedingung, sub);

  /** `handarbeit`: an edit by a person, which marks a series event as adjusted. */
  const aktualisieren = (
    id: string,
    daten: EventEingabe,
    handarbeit: boolean,
  ): Promise<EventAenderung | undefined> =>
    db.transaction(async (tx) => {
      const [bisher] = await tx.select().from(events).where(eq(events.id, id));
      if (!bisher) return undefined;
      const schichtRows = await tx.select().from(schichten).where(eq(schichten.eventId, id));
      const schichtIds = schichtRows.map((s) => s.id);
      const [dienstRows, bedarfRows] =
        schichtIds.length > 0
          ? await Promise.all([
              tx.select().from(dienste).where(inArray(dienste.schichtId, schichtIds)),
              tx.select().from(schichtBedarfe).where(inArray(schichtBedarfe.schichtId, schichtIds)),
            ])
          : [[], []];

      const kategorie = await kategorieMussExistieren(tx, daten.kategorieId, bisher.kategorieId);
      const kreis = artPruefen(kategorie, daten);
      dauerPruefen(kategorie, daten);
      if (daten.ersetzeSerie === true) {
        const [alteKategorie] = bisher.kategorieId
          ? await tx
              .select()
              .from(eventKategorien)
              .where(eq(eventKategorien.id, bisher.kategorieId))
          : [];
        serieErsetzenPruefen(kategorie, alteKategorie ? { art: artVon(alteKategorie) } : null);
      }
      await dienstformenMuessenExistieren(
        tx,
        dienstformIdsVon(daten.schichten),
        new Set(bedarfRows.map((b) => b.dienstformId)),
      );

      await verantwortlicheRPruefen(tx, daten.verantwortlichSub);
      const abgleich = schichtAbgleich(
        schichtRows.map((s) => ({
          id: s.id,
          art: s.art,
          dienste: dienstRows.filter((d) => d.schichtId === s.id),
        })),
        daten.schichten,
      );

      let entfernte: BetroffenerDienst[] = [];
      if (abgleich.entfernteDienste.length > 0) {
        const personen = await personenLaden(
          tx,
          einzigartig(
            abgleich.entfernteDienste.flatMap((e) => {
              const sub = dienstRows.find((d) => d.id === e.dienstId)?.mitgliedSub;
              return sub ? [sub] : [];
            }),
          ),
          einzigartig(
            abgleich.entfernteDienste.flatMap((e) => {
              const extern = dienstRows.find((d) => d.id === e.dienstId)?.externId;
              return extern ? [extern] : [];
            }),
          ),
        );
        entfernte = abgleich.entfernteDienste.flatMap((e) => {
          const row = dienstRows.find((d) => d.id === e.dienstId);
          const person = row?.mitgliedSub
            ? personen.mitglieder.get(row.mitgliedSub)
            : row?.externId
              ? personen.externe.get(row.externId)
              : undefined;
          const schicht = schichtRows.find((x) => x.id === e.schichtId);
          if (!person || !schicht) return [];
          return [
            {
              dienstId: e.dienstId,
              schichtId: e.schichtId,
              schichtArt: schicht.art,
              schichtBeginn: iso(schicht.beginn),
              schichtEnde: iso(schicht.ende),
              dienstformId: e.dienstformId,
              person,
              grund: e.grund,
            },
          ];
        });
      }

      // Switching to a Dienste Kategorie deletes all individual answers and invitations.
      let verlorene: TeilnahmeDto[] = [];
      if (kreis === null) {
        // Absagen stay (they mean the same for a Dienste event); only answers and invitations are lost.
        const alte = (
          await tx.select().from(eventTeilnahmen).where(eq(eventTeilnahmen.eventId, id))
        ).filter((r) => r.antwort !== 'absage' || r.eingeladen);
        const personen = await personenLaden(
          tx,
          alte.map((r) => r.mitgliedSub),
          [],
        );
        verlorene = alte.flatMap((r): TeilnahmeDto[] => {
          const person = personen.mitglieder.get(r.mitgliedSub);
          return person?.art === 'mitglied'
            ? [{ person, zustand: r.antwort ?? 'teilnahme', eingeladen: r.eingeladen }]
            : [];
        });
      }
      if ((entfernte.length > 0 || verlorene.length > 0) && daten.bestaetigt !== true) {
        throw new EntfernungBestaetigen(entfernte, verlorene);
      }

      const entfernteIds = new Set(abgleich.entfernteDienste.map((e) => e.dienstId));
      const beginnNeu = new Date(daten.beginn);
      const endeNeu = new Date(daten.ende);
      await tx
        .update(events)
        .set({
          titel: daten.titel || null,
          beschreibung: daten.beschreibung,
          kategorieId: daten.kategorieId,
          beginn: beginnNeu,
          ende: endeNeu,
          teilnahmeStatus: teilnahmeKreisKodieren(kreis),
          ...(daten.verantwortlichSub !== undefined && {
            verantwortlichSub: daten.verantwortlichSub,
          }),
          ...(daten.ersetzeSerie === true && { serie: null }),
          ...(handarbeit &&
            bisher.serie !== null &&
            daten.ersetzeSerie !== true && { serieAngepasst: true }),
          aktualisiertAm: new Date(),
        })
        .where(eq(events.id, id));
      await teilnahmeSchreiben(tx, id, kreis, daten);
      if (entfernteIds.size > 0) {
        await tx.delete(dienste).where(inArray(dienste.id, [...entfernteIds]));
      }
      if (abgleich.dienstformLeeren.length > 0) {
        await tx
          .update(dienste)
          .set({ dienstformId: null })
          .where(inArray(dienste.id, abgleich.dienstformLeeren));
      }
      if (abgleich.entfernt.length > 0) {
        await tx.delete(schichtBedarfe).where(inArray(schichtBedarfe.schichtId, abgleich.entfernt));
        await tx.delete(schichten).where(inArray(schichten.id, abgleich.entfernt));
      }
      await schichtenSchreiben(tx, id, [...abgleich.behalten, ...abgleich.neu]);

      const mitglieder = (schichtId: string) =>
        einzigartig(
          dienstRows.flatMap((d) =>
            d.schichtId === schichtId && !entfernteIds.has(d.id) && d.mitgliedSub
              ? [d.mitgliedSub]
              : [],
          ),
        );
      const geaenderteSchichten = abgleich.behalten.flatMap((b) => {
        const alt = schichtRows.find((s) => s.id === b.id)!;
        const geaendert =
          alt.beginn.getTime() !== new Date(b.eingabe.beginn).getTime() ||
          alt.ende.getTime() !== new Date(b.eingabe.ende).getTime();
        const subs = mitglieder(b.id);
        return geaendert && subs.length > 0
          ? [
              {
                schichtId: b.id,
                art: b.eingabe.art,
                beginn: b.eingabe.beginn,
                ende: b.eingabe.ende,
                mitgliedSubs: subs,
              },
            ]
          : [];
      });
      return {
        zeitGeaendert:
          bisher.beginn.getTime() !== beginnNeu.getTime() ||
          bisher.ende.getTime() !== endeNeu.getTime(),
        geaenderteSchichten,
        entfernteDienste: entfernte,
        mitgliedSubs: einzigartig(
          dienstRows.flatMap((d) =>
            !entfernteIds.has(d.id) && d.mitgliedSub ? [d.mitgliedSub] : [],
          ),
        ),
        teilnehmerSubs: await teilnehmerSubs(tx, {
          id,
          teilnahmeStatus: teilnahmeKreisKodieren(kreis),
        }),
        verantwortlichNeu:
          daten.verantwortlichSub && daten.verantwortlichSub !== bisher.verantwortlichSub
            ? daten.verantwortlichSub
            : null,
      };
    });

  // ----- Series
  const zahlen = (text: string): number[] => (text === '' ? [] : text.split(',').map(Number));
  const serieDto = (r: KalenderSerieRow): SerieDto => ({
    id: r.id,
    name: r.name,
    vorlageId: r.vorlageId,
    regel: r.regel === 'monatlich' ? 'monatlich' : 'woechentlich',
    wochentage: zahlen(r.wochentage),
    wochen: zahlen(r.wochen),
    startDatum: r.startDatum,
    endDatum: r.endDatum,
    aktiv: r.aktiv,
  });
  const serieWerte = (d: SerieEingabe) => ({
    name: d.name,
    vorlageId: d.vorlageId,
    regel: d.regel,
    wochentage: d.wochentage.join(','),
    wochen: d.wochen.join(','),
    startDatum: d.startDatum,
    endDatum: d.endDatum,
  });
  const serienLesen = async (): Promise<SerieDto[]> =>
    (await db.select().from(kalenderSerien))
      .map(serieDto)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  interface KuenftigesSerienEvent {
    id: string;
    serie: string;
    /** Berlin date of the event begin. */
    datum: string;
    /** Still as generated: not edited or cancelled, no Dienste, no answers or invitations. */
    unveraendert: boolean;
  }
  /** Events of a series (all series without `serieId`) that begin after `jetzt`. */
  const kuenftigeSerienEvents = async (
    serieId: string | undefined,
    jetzt: Date,
  ): Promise<KuenftigesSerienEvent[]> => {
    const rows = await db
      .select({
        id: events.id,
        serie: events.serie,
        beginn: events.beginn,
        angepasst: events.serieAngepasst,
        teilnahmeStatus: events.teilnahmeStatus,
      })
      .from(events)
      .where(
        and(
          gte(events.beginn, jetzt),
          serieId === undefined ? isNotNull(events.serie) : eq(events.serie, serieId),
        ),
      );
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const schichtRows = await db
      .select({ id: schichten.id, eventId: schichten.eventId })
      .from(schichten)
      .where(inArray(schichten.eventId, ids));
    const mitDiensten = new Set<string>();
    if (schichtRows.length > 0) {
      const dienstRows = await db
        .select({ schichtId: dienste.schichtId })
        .from(dienste)
        .where(
          inArray(
            dienste.schichtId,
            schichtRows.map((s) => s.id),
          ),
        );
      const mit = new Set(dienstRows.map((d) => d.schichtId));
      for (const s of schichtRows) if (mit.has(s.id)) mitDiensten.add(s.eventId);
    }
    // An absage ("nicht verfügbar") of a Dienste event is no entry: the event stays unchanged.
    const mitTeilnahme = new Set(rows.filter((r) => r.teilnahmeStatus !== null).map((r) => r.id));
    const mitAntworten = new Set(
      (
        await db
          .select({ eventId: eventTeilnahmen.eventId, antwort: eventTeilnahmen.antwort })
          .from(eventTeilnahmen)
          .where(inArray(eventTeilnahmen.eventId, ids))
      )
        .filter((t) => zaehltAlsEintrag(t.antwort, mitTeilnahme.has(t.eventId)))
        .map((t) => t.eventId),
    );
    return rows.map((r) => ({
      id: r.id,
      serie: r.serie ?? '',
      datum: datumBerlin(r.beginn.toISOString()),
      unveraendert: r.angepasst !== true && !mitDiensten.has(r.id) && !mitAntworten.has(r.id),
    }));
  };
  const pruefeBetroffene = (kuenftig: KuenftigesSerienEvent[], bestehende?: SerienBestehende) => {
    if (kuenftig.length > 0 && bestehende === undefined) {
      const unveraendert = kuenftig.filter((e) => e.unveraendert).length;
      throw new SerieBetroffen(unveraendert, kuenftig.length - unveraendert);
    }
  };
  /** Deletes the events and their `serien_termine` (the days become free again); skips events that gained Dienste meanwhile. */
  const serienEventsLoeschen = async (liste: KuenftigesSerienEvent[]) => {
    for (const e of liste) {
      try {
        await store.eventLoeschen(e.id);
      } catch (err) {
        if (err instanceof KalenderKonflikt) continue;
        throw err;
      }
      await db.delete(serienTermine).where(eq(serienTermine.eventId, e.id));
    }
  };
  const vorlageMussExistieren = async (id: string) => {
    const [v] = await db
      .select({ archiviert: eventVorlagen.archiviert })
      .from(eventVorlagen)
      .where(eq(eventVorlagen.id, id));
    if (!v || v.archiviert) throw new KalenderUngueltig('Die Vorlage gibt es nicht.');
  };

  const store: KalenderStore = {
    // ----- Events
    async events(von, bis, sub) {
      const { start, ende } = zeitraumGrenzen(von, bis);
      return eventsFuerBedingung(and(lt(events.beginn, ende), gte(events.ende, start)), sub);
    },
    async event(id, sub) {
      return (await eventsFuerBedingung(eq(events.id, id), sub))[0];
    },
    async eventAnlegen(daten, von) {
      return db.transaction((tx) => eventErzeugen(tx, daten, von, null));
    },
    async serienTage(serie) {
      const rows = await db
        .select({ datum: serienTermine.datum })
        .from(serienTermine)
        .where(eq(serienTermine.serie, serie));
      return rows.map((r) => r.datum);
    },
    async serienTerminAnlegen(serie, datum, daten) {
      return db.transaction(async (tx) => {
        const id = randomUUID();
        const eingefuegt = await tx
          .insert(serienTermine)
          .values({ serie, datum, eventId: id })
          .onConflictDoNothing()
          .returning({ datum: serienTermine.datum });
        if (eingefuegt.length === 0) return false;
        await eventErzeugen(tx, daten, null, serie, id);
        return true;
      });
    },
    async serien() {
      return serienLesen();
    },
    async serienMitAnzahl() {
      const liste = await serienLesen();
      const kuenftig = await kuenftigeSerienEvents(undefined, new Date());
      return liste.map((s) => {
        const eigene = kuenftig.filter((e) => e.serie === s.id);
        return {
          ...s,
          kuenftig: eigene.length,
          unveraendert: eigene.filter((e) => e.unveraendert).length,
        };
      });
    },
    async serieAnlegen(daten) {
      await vorlageMussExistieren(daten.vorlageId);
      const vergeben = new Set(
        (await db.select({ id: kalenderSerien.id }).from(kalenderSerien)).map((r) => r.id),
      );
      // Events and days of a series that no longer exists keep their id, so a new series with the same
      // name takes them over.
      const id = serieIdAus(daten.name, vergeben);
      await db.insert(kalenderSerien).values({ id, ...serieWerte(daten), aktiv: true });
      return id;
    },
    async serieAktualisieren(id, daten, bestehende) {
      const [alt] = await db.select().from(kalenderSerien).where(eq(kalenderSerien.id, id));
      if (!alt) return false;
      await vorlageMussExistieren(daten.vorlageId);
      const bisher = serieDto(alt);
      const regelGeaendert =
        bisher.vorlageId !== daten.vorlageId ||
        bisher.regel !== daten.regel ||
        bisher.wochentage.join() !== daten.wochentage.join() ||
        bisher.wochen.join() !== daten.wochen.join() ||
        bisher.startDatum !== daten.startDatum ||
        bisher.endDatum !== daten.endDatum;
      const kuenftig = regelGeaendert ? await kuenftigeSerienEvents(id, new Date()) : [];
      pruefeBetroffene(kuenftig, bestehende);
      await db.update(kalenderSerien).set(serieWerte(daten)).where(eq(kalenderSerien.id, id));
      if (bestehende !== 'anpassen') return true;
      const unveraendert = kuenftig.filter((e) => e.unveraendert);
      const regel = { ...daten };
      const passt = (e: KuenftigesSerienEvent) => regelTage(regel, e.datum, e.datum).length > 0;
      await serienEventsLoeschen(unveraendert.filter((e) => !passt(e)));
      const bleiben = unveraendert.filter(passt);
      if (bleiben.length > 0) {
        const [vorlage] = (await store.vorlagen(false)).filter((v) => v.id === daten.vorlageId);
        const kategorie = (await store.kategorien(true)).find((k) => k.id === vorlage?.kategorieId);
        if (vorlage) {
          for (const e of bleiben) {
            try {
              await aktualisieren(e.id, ausVorlage(vorlage, e.datum, kategorie), false);
            } catch (err) {
              if (err instanceof EntfernungBestaetigen) continue;
              throw err;
            }
          }
        }
      }
      return true;
    },
    async serieAktivSetzen(id, aktiv, bestehende) {
      const [alt] = await db.select().from(kalenderSerien).where(eq(kalenderSerien.id, id));
      if (!alt) return false;
      const ausschalten = !aktiv && alt.aktiv;
      const kuenftig = ausschalten ? await kuenftigeSerienEvents(id, new Date()) : [];
      pruefeBetroffene(kuenftig, bestehende);
      await db.update(kalenderSerien).set({ aktiv }).where(eq(kalenderSerien.id, id));
      if (bestehende === 'anpassen')
        await serienEventsLoeschen(kuenftig.filter((e) => e.unveraendert));
      return true;
    },
    async serieLoeschen(id, bestehende) {
      const [alt] = await db.select().from(kalenderSerien).where(eq(kalenderSerien.id, id));
      if (!alt) return false;
      const kuenftig = await kuenftigeSerienEvents(id, new Date());
      pruefeBetroffene(kuenftig, bestehende);
      if (bestehende === 'anpassen')
        await serienEventsLoeschen(kuenftig.filter((e) => e.unveraendert));
      await db.delete(serienTermine).where(eq(serienTermine.serie, id));
      await db.delete(kalenderSerien).where(eq(kalenderSerien.id, id));
      return true;
    },
    async eventAktualisieren(id, daten) {
      return aktualisieren(id, daten, true);
    },
    async eventLoeschen(id) {
      return db.transaction(async (tx) => {
        const [vorhanden] = await tx
          .select({ id: events.id })
          .from(events)
          .where(eq(events.id, id));
        if (!vorhanden) return false;
        const schichtIds = (
          await tx.select({ id: schichten.id }).from(schichten).where(eq(schichten.eventId, id))
        ).map((s) => s.id);
        if (schichtIds.length > 0) {
          const eintraege = await tx
            .select({ id: dienste.id })
            .from(dienste)
            .where(inArray(dienste.schichtId, schichtIds))
            .limit(1);
          if (eintraege.length > 0) {
            throw new KalenderKonflikt(
              'Das Event hat Dienste und kann nicht gelöscht werden. Sage es stattdessen ab.',
            );
          }
          await tx.delete(schichtBedarfe).where(inArray(schichtBedarfe.schichtId, schichtIds));
          await tx.delete(schichten).where(eq(schichten.eventId, id));
        }
        await tx.delete(eventTeilnahmen).where(eq(eventTeilnahmen.eventId, id));
        await tx.delete(kalenderEventAbos).where(eq(kalenderEventAbos.eventId, id));
        await tx.delete(events).where(eq(events.id, id));
        return true;
      });
    },
    async absageSetzen(id, abgesagt) {
      return db.transaction(async (tx) => {
        const [bisher] = await tx.select().from(events).where(eq(events.id, id));
        if (!bisher) return undefined;
        const schichtIds = (
          await tx.select({ id: schichten.id }).from(schichten).where(eq(schichten.eventId, id))
        ).map((s) => s.id);
        const rows =
          schichtIds.length > 0
            ? await tx
                .select({ sub: dienste.mitgliedSub })
                .from(dienste)
                .where(inArray(dienste.schichtId, schichtIds))
            : [];
        if (bisher.abgesagt !== abgesagt) {
          await tx
            .update(events)
            .set({
              abgesagt,
              aktualisiertAm: new Date(),
              ...(bisher.serie !== null && { serieAngepasst: true }),
            })
            .where(eq(events.id, id));
        }
        return {
          geaendert: bisher.abgesagt !== abgesagt,
          mitgliedSubs: einzigartig(rows.flatMap((r) => (r.sub ? [r.sub] : []))),
          teilnehmerSubs: await teilnehmerSubs(tx, bisher),
        };
      });
    },

    // ----- Participation and event subscription
    async teilnahmeSetzen(eventId, sub, teilnahme) {
      const istTeilnahmeEvent = async (e: { kategorieId: string | null }) => {
        if (e.kategorieId === null) return false;
        const [k] = await db
          .select()
          .from(eventKategorien)
          .where(eq(eventKategorien.id, e.kategorieId));
        return artVon(k) === 'teilnahme';
      };
      const [event] = await db.select().from(events).where(eq(events.id, eventId));
      if (!event) return undefined;
      if (event.abgesagt) {
        throw new KalenderKonflikt(
          'Das Event ist abgesagt. Die Teilnahme lässt sich nicht ändern.',
        );
      }
      if (
        teilnahmeKreisLesen(event.teilnahmeStatus) === null ||
        !(await istTeilnahmeEvent(event))
      ) {
        throw new KalenderKonflikt('Für dieses Event ist keine Teilnahme vorgesehen.');
      }
      const antwort: TeilnahmeAntwort = teilnahme ? 'teilnahme' : 'absage';
      await db
        .insert(eventTeilnahmen)
        .values({ eventId, mitgliedSub: sub, antwort })
        .onConflictDoUpdate({
          target: [eventTeilnahmen.eventId, eventTeilnahmen.mitgliedSub],
          set: { antwort, geaendertAm: new Date() },
        });
      return true;
    },
    async verfuegbarkeitSetzen(eventId, sub, verfuegbar, bestaetigt) {
      return db.transaction(async (tx) => {
        const [zeile] = await tx
          .select({ event: events, kategorieArt: eventKategorien.art })
          .from(events)
          .leftJoin(eventKategorien, eq(eventKategorien.id, events.kategorieId))
          .where(eq(events.id, eventId));
        if (!zeile) return undefined;
        if (zeile.event.abgesagt) {
          throw new KalenderKonflikt(
            'Das Event ist abgesagt. Die Verfügbarkeit lässt sich nicht ändern.',
          );
        }
        if (artVon({ art: zeile.kategorieArt }) === 'teilnahme') {
          throw new KalenderKonflikt(
            'Bei Events mit Teilnahme gibst du an, ob du teilnimmst, nicht ob du verfügbar bist.',
          );
        }
        const bedingung = and(
          eq(eventTeilnahmen.eventId, eventId),
          eq(eventTeilnahmen.mitgliedSub, sub),
        );
        if (verfuegbar) {
          await tx.delete(eventTeilnahmen).where(bedingung);
          return true;
        }
        const eigene = await tx
          .select({ id: dienste.id })
          .from(dienste)
          .innerJoin(schichten, eq(schichten.id, dienste.schichtId))
          .where(and(eq(schichten.eventId, eventId), eq(dienste.mitgliedSub, sub)));
        if (eigene.length > 0 && !bestaetigt) throw new VerfuegbarkeitBestaetigen(eigene.length);
        if (eigene.length > 0) {
          await tx.delete(dienste).where(
            inArray(
              dienste.id,
              eigene.map((d) => d.id),
            ),
          );
        }
        await tx
          .insert(eventTeilnahmen)
          .values({ eventId, mitgliedSub: sub, antwort: 'absage' })
          .onConflictDoUpdate({
            target: [eventTeilnahmen.eventId, eventTeilnahmen.mitgliedSub],
            set: { antwort: 'absage', eingeladen: false, geaendertAm: new Date() },
          });
        return true;
      });
    },
    async eventAboSetzen(eventId, sub, abonniert) {
      const [event] = await db.select({ id: events.id }).from(events).where(eq(events.id, eventId));
      if (!event) return false;
      if (abonniert) {
        await db
          .insert(kalenderEventAbos)
          .values({ mitgliedSub: sub, eventId })
          .onConflictDoNothing();
      } else {
        await db
          .delete(kalenderEventAbos)
          .where(
            and(eq(kalenderEventAbos.mitgliedSub, sub), eq(kalenderEventAbos.eventId, eventId)),
          );
      }
      return true;
    },

    // ----- Dienste
    async dienstEintragen(schichtId, daten, eingetragenVon) {
      try {
        return await db.transaction(async (tx) => {
          const [zeile] = await tx
            .select({
              schicht: schichten,
              abgesagt: events.abgesagt,
              eventId: events.id,
              kategorieArt: eventKategorien.art,
            })
            .from(schichten)
            .innerJoin(events, eq(events.id, schichten.eventId))
            .leftJoin(eventKategorien, eq(eventKategorien.id, events.kategorieId))
            .where(eq(schichten.id, schichtId));
          if (!zeile) return undefined;
          if (artVon({ art: zeile.kategorieArt }) === 'teilnahme') {
            throw new KalenderKonflikt('Bei Events mit Teilnahme gibt es keine Dienste.');
          }
          if (zeile.abgesagt) {
            throw new KalenderKonflikt('Das Event ist abgesagt. Eintragen ist nicht möglich.');
          }
          if (zeile.schicht.art === 'betrieb') {
            if (daten.dienstformId === undefined) {
              throw new KalenderUngueltig('Bitte wähle eine Dienstform.');
            }
            const [bedarf] = await tx
              .select()
              .from(schichtBedarfe)
              .where(
                and(
                  eq(schichtBedarfe.schichtId, schichtId),
                  eq(schichtBedarfe.dienstformId, daten.dienstformId),
                ),
              );
            if (!bedarf) {
              throw new KalenderUngueltig(
                'Für diese Dienstform gibt es in der Schicht keinen Bedarf.',
              );
            }
          } else if (daten.dienstformId !== undefined) {
            throw new KalenderUngueltig(
              `${SCHICHT_ART_BEZEICHNUNG[zeile.schicht.art]} hat keine Dienstformen.`,
            );
          }
          const mitgliedSub =
            daten.externId === undefined ? (daten.mitgliedSub ?? eingetragenVon) : null;
          if (daten.externId !== undefined) {
            const [extern] = await tx.select().from(externe).where(eq(externe.id, daten.externId));
            if (!extern || extern.archiviert) {
              throw new KalenderUngueltig('Die externe Person gibt es nicht.');
            }
          }
          const vorhanden = await tx
            .select({ id: dienste.id })
            .from(dienste)
            .where(
              and(
                eq(dienste.schichtId, schichtId),
                mitgliedSub !== null
                  ? eq(dienste.mitgliedSub, mitgliedSub)
                  : eq(dienste.externId, daten.externId!),
              ),
            );
          if (vorhanden.length > 0) {
            throw new KalenderKonflikt('Die Person ist in dieser Schicht schon eingetragen.');
          }
          const id = randomUUID();
          await tx.insert(dienste).values({
            id,
            schichtId,
            dienstformId: daten.dienstformId ?? null,
            mitgliedSub,
            externId: mitgliedSub === null ? (daten.externId ?? null) : null,
            kommentar: daten.kommentar,
            eingetragenVon,
          });
          // Entering a member withdraws their absage ("nicht verfügbar") for the event.
          let absageAufgehoben = false;
          if (mitgliedSub !== null) {
            const geloescht = await tx
              .delete(eventTeilnahmen)
              .where(
                and(
                  eq(eventTeilnahmen.eventId, zeile.eventId),
                  eq(eventTeilnahmen.mitgliedSub, mitgliedSub),
                  eq(eventTeilnahmen.antwort, 'absage'),
                ),
              )
              .returning({ sub: eventTeilnahmen.mitgliedSub });
            absageAufgehoben = geloescht.length > 0;
          }
          return { id, absageAufgehoben };
        });
      } catch (err) {
        if (istEindeutigVerletzt(err)) {
          throw new KalenderKonflikt('Die Person ist in dieser Schicht schon eingetragen.');
        }
        throw err;
      }
    },
    async dienstHolen(id) {
      const [r] = await db
        .select({
          dienst: dienste,
          schichtArt: schichten.art,
          schichtBeginn: schichten.beginn,
          schichtEnde: schichten.ende,
          eventId: events.id,
          eventTitelRoh: events.titel,
          eventBeginn: events.beginn,
          kategorieName: eventKategorien.name,
          abgesagt: events.abgesagt,
        })
        .from(dienste)
        .innerJoin(schichten, eq(schichten.id, dienste.schichtId))
        .innerJoin(events, eq(events.id, schichten.eventId))
        .leftJoin(eventKategorien, eq(eventKategorien.id, events.kategorieId))
        .where(eq(dienste.id, id));
      if (!r) return undefined;
      return {
        id: r.dienst.id,
        schichtId: r.dienst.schichtId,
        schichtArt: r.schichtArt,
        schichtBeginn: iso(r.schichtBeginn),
        schichtEnde: iso(r.schichtEnde),
        eventId: r.eventId,
        eventTitel: eventTitel({ titel: r.eventTitelRoh }, titelKategorie(r.kategorieName)),
        eventBeginn: iso(r.eventBeginn),
        abgesagt: r.abgesagt,
        dienstformId: r.dienst.dienstformId,
        mitgliedSub: r.dienst.mitgliedSub,
        externId: r.dienst.externId,
        eingetragenVon: r.dienst.eingetragenVon,
      };
    },
    async dienstEntfernen(id) {
      const rows = await db.delete(dienste).where(eq(dienste.id, id)).returning({ id: dienste.id });
      return rows.length > 0;
    },

    // ----- Externe
    async externe(mitArchiv) {
      const rows = await db.select().from(externe);
      return rows
        .filter((e) => mitArchiv || !e.archiviert)
        .sort((a, b) => a.name.localeCompare(b.name, 'de'))
        .map((e) => ({
          id: e.id,
          name: e.name,
          quelle: e.quelle,
          kontakt: e.kontakt,
          archiviert: e.archiviert,
        }));
    },
    async externAnlegen(daten, von) {
      const id = randomUUID();
      await db.insert(externe).values({
        id,
        name: daten.name,
        quelle: daten.quelle,
        kontakt: daten.kontakt,
        angelegtVon: von,
        archiviert: daten.archiviert ?? false,
      });
      return id;
    },
    async externAktualisieren(id, daten) {
      const rows = await db
        .update(externe)
        .set({
          name: daten.name,
          quelle: daten.quelle,
          kontakt: daten.kontakt,
          ...(daten.archiviert !== undefined && { archiviert: daten.archiviert }),
        })
        .where(eq(externe.id, id))
        .returning({ id: externe.id });
      return rows.length > 0;
    },
    async externeZusammenfuehren(zielId, quelleIds) {
      return db.transaction(async (tx) => {
        const [ziel] = await tx.select().from(externe).where(eq(externe.id, zielId));
        if (!ziel) return undefined;
        const quellen = await tx
          .select({ id: externe.id })
          .from(externe)
          .where(inArray(externe.id, [...quelleIds]));
        if (quellen.length !== new Set(quelleIds).size) {
          throw new KalenderUngueltig('Eine der ausgewählten Personen gibt es nicht.');
        }
        const zielDienste = await tx
          .select({ schichtId: dienste.schichtId })
          .from(dienste)
          .where(eq(dienste.externId, zielId));
        const quellDienste = await tx
          .select({ id: dienste.id, schichtId: dienste.schichtId })
          .from(dienste)
          .where(inArray(dienste.externId, [...quelleIds]))
          .orderBy(asc(dienste.eingetragenAm), asc(dienste.id));
        const plan = zusammenfuehrenPlan(zielDienste, quellDienste);
        if (plan.verschieben.length > 0) {
          await tx
            .update(dienste)
            .set({ externId: zielId })
            .where(inArray(dienste.id, plan.verschieben));
        }
        if (plan.verwerfen.length > 0) {
          await tx.delete(dienste).where(inArray(dienste.id, plan.verwerfen));
        }
        await tx.delete(externe).where(inArray(externe.id, [...quelleIds]));
        return { verschoben: plan.verschieben.length, verworfen: plan.verwerfen.length };
      });
    },

    // ----- Stammdaten
    async dienstformen(mitArchiv) {
      const rows = await db.select().from(dienstformen);
      return rows
        .filter((f) => mitArchiv || !f.archiviert)
        .sort((a, b) => a.reihenfolge - b.reihenfolge || a.name.localeCompare(b.name, 'de'));
    },
    async dienstformAnlegen(daten) {
      const id = randomUUID();
      const alle = await db.select({ r: dienstformen.reihenfolge }).from(dienstformen);
      await db.insert(dienstformen).values({
        id,
        name: daten.name,
        reihenfolge: daten.reihenfolge ?? Math.max(-1, ...alle.map((f) => f.r)) + 1,
        archiviert: daten.archiviert ?? false,
      });
      return id;
    },
    async dienstformAktualisieren(id, daten) {
      const rows = await db
        .update(dienstformen)
        .set({
          name: daten.name,
          ...(daten.reihenfolge !== undefined && { reihenfolge: daten.reihenfolge }),
          ...(daten.archiviert !== undefined && { archiviert: daten.archiviert }),
        })
        .where(eq(dienstformen.id, id))
        .returning({ id: dienstformen.id });
      return rows.length > 0;
    },
    async kategorien(mitArchiv) {
      const [rows, benutzt] = await Promise.all([
        db.select().from(eventKategorien),
        db.selectDistinct({ id: events.kategorieId }).from(events),
      ]);
      const benutzteIds = new Set(benutzt.map((b) => b.id));
      return rows
        .filter((k) => mitArchiv || !k.archiviert)
        .sort((a, b) => a.name.localeCompare(b.name, 'de'))
        .map((k): EventKategorieDto => ({
          id: k.id,
          name: k.name,
          farbe: k.farbe,
          art: artVon(k),
          teilnahmeStatus:
            artVon(k) === 'teilnahme' ? teilnahmeKreisLesen(k.teilnahmeStatus) : null,
          dauer: dauerVon(k),
          benutzt: benutzteIds.has(k.id),
          archiviert: k.archiviert,
        }));
    },
    async kategorieAnlegen(daten) {
      const id = randomUUID();
      await db.insert(eventKategorien).values({
        id,
        name: daten.name,
        farbe: daten.farbe,
        art: daten.art,
        teilnahmeStatus: teilnahmeKreisKodieren(daten.teilnahmeStatus),
        dauer: daten.dauer,
        archiviert: daten.archiviert ?? false,
      });
      return id;
    },
    async kategorieAktualisieren(id, daten) {
      return db.transaction(async (tx) => {
        const [bisher] = await tx.select().from(eventKategorien).where(eq(eventKategorien.id, id));
        if (!bisher) return false;
        if (artVon(bisher) !== daten.art) {
          const benutzt = await tx
            .select({ id: events.id })
            .from(events)
            .where(eq(events.kategorieId, id))
            .limit(1);
          if (benutzt.length > 0) {
            throw new KalenderKonflikt('Die Kategorie wird von Events benutzt.');
          }
        }
        await tx
          .update(eventKategorien)
          .set({
            name: daten.name,
            farbe: daten.farbe,
            art: daten.art,
            teilnahmeStatus: teilnahmeKreisKodieren(daten.teilnahmeStatus),
            // Existing events keep their times; only new and edited ones follow the new `dauer`.
            dauer: daten.dauer,
            ...(daten.archiviert !== undefined && { archiviert: daten.archiviert }),
          })
          .where(eq(eventKategorien.id, id));
        return true;
      });
    },
    async vorlagen(mitArchiv) {
      const [rows, schichtRows, bedarfRows] = await Promise.all([
        db.select().from(eventVorlagen),
        db.select().from(vorlageSchichten),
        db.select().from(vorlageBedarfe),
      ]);
      return rows
        .filter((v) => mitArchiv || !v.archiviert)
        .sort((a, b) => (a.titel ?? '').localeCompare(b.titel ?? '', 'de'))
        .map((v): VorlageDto => ({
          id: v.id,
          titel: v.titel ?? '',
          beschreibung: v.beschreibung,
          kategorieId: v.kategorieId ?? '',
          beginnZeit: v.beginnZeit,
          endeZeit: v.endeZeit,
          teilnahmeStatus: teilnahmeKreisLesen(v.teilnahmeStatus),
          tage: v.tage ?? 1,
          archiviert: v.archiviert,
          schichten: schichtRows
            .filter((s) => s.vorlageId === v.id)
            .sort((a, b) => a.reihenfolge - b.reihenfolge)
            .map((s): VorlageSchicht => {
              const zeiten = { beginnZeit: s.beginnZeit, endeZeit: s.endeZeit };
              if (s.art !== 'betrieb') {
                return {
                  art: s.art,
                  tagVersatz: s.tagVersatz,
                  ...zeiten,
                  minimum: s.minimum ?? 0,
                  wunsch: s.wunsch ?? 1,
                };
              }
              return {
                art: 'betrieb',
                ...zeiten,
                bedarfe: bedarfRows
                  .filter((b) => b.vorlageSchichtId === s.id)
                  .map((b) => ({
                    dienstformId: b.dienstformId,
                    minimum: b.minimum,
                    wunsch: b.wunsch,
                  })),
              };
            }),
        }));
    },
    async vorlageAnlegen(daten) {
      return db.transaction(async (tx) => {
        artPruefen(await kategorieMussExistieren(tx, daten.kategorieId), daten);
        await dienstformenMuessenExistieren(tx, dienstformIdsVon(daten.schichten));
        const id = randomUUID();
        await tx.insert(eventVorlagen).values({
          id,
          titel: daten.titel || null,
          beschreibung: daten.beschreibung,
          kategorieId: daten.kategorieId,
          beginnZeit: daten.beginnZeit,
          endeZeit: daten.endeZeit,
          teilnahmeStatus: teilnahmeKreisKodieren(daten.teilnahmeStatus),
          tage: daten.tage,
          archiviert: daten.archiviert ?? false,
        });
        await vorlageSchreiben(tx, id, daten);
        return id;
      });
    },
    async vorlageAktualisieren(id, daten) {
      return db.transaction(async (tx) => {
        const [bisher] = await tx.select().from(eventVorlagen).where(eq(eventVorlagen.id, id));
        if (!bisher) return false;
        const alteSchichten = await tx
          .select({ id: vorlageSchichten.id })
          .from(vorlageSchichten)
          .where(eq(vorlageSchichten.vorlageId, id));
        const alteIds = alteSchichten.map((s) => s.id);
        const alteBedarfe =
          alteIds.length > 0
            ? await tx
                .select({ dienstformId: vorlageBedarfe.dienstformId })
                .from(vorlageBedarfe)
                .where(inArray(vorlageBedarfe.vorlageSchichtId, alteIds))
            : [];
        artPruefen(await kategorieMussExistieren(tx, daten.kategorieId, bisher.kategorieId), daten);
        await dienstformenMuessenExistieren(
          tx,
          dienstformIdsVon(daten.schichten),
          new Set(alteBedarfe.map((b) => b.dienstformId)),
        );
        await tx
          .update(eventVorlagen)
          .set({
            titel: daten.titel || null,
            beschreibung: daten.beschreibung,
            kategorieId: daten.kategorieId,
            beginnZeit: daten.beginnZeit,
            endeZeit: daten.endeZeit,
            teilnahmeStatus: teilnahmeKreisKodieren(daten.teilnahmeStatus),
            tage: daten.tage,
            ...(daten.archiviert !== undefined && { archiviert: daten.archiviert }),
          })
          .where(eq(eventVorlagen.id, id));
        if (alteIds.length > 0) {
          await tx.delete(vorlageBedarfe).where(inArray(vorlageBedarfe.vorlageSchichtId, alteIds));
          await tx.delete(vorlageSchichten).where(eq(vorlageSchichten.vorlageId, id));
        }
        await vorlageSchreiben(tx, id, daten);
        return true;
      });
    },
    async erinnerungen() {
      const rows = await db.select().from(kalenderFehltErinnerungen);
      return rows.map((r) => r.minutenVorher).sort((a, b) => b - a);
    },
    async erinnerungenSetzen(minutenVorher) {
      await db.transaction(async (tx) => {
        await tx.delete(kalenderFehltErinnerungen);
        await tx
          .insert(kalenderFehltErinnerungen)
          .values(
            [...new Set(minutenVorher)].map((m) => ({ id: `erinnerung-${m}`, minutenVorher: m })),
          );
      });
    },
    async vorlageLoeschen(id) {
      return db.transaction(async (tx) => {
        const [vorhanden] = await tx
          .select({ id: eventVorlagen.id })
          .from(eventVorlagen)
          .where(eq(eventVorlagen.id, id));
        if (!vorhanden) return false;
        const benutzt = await tx
          .select({ id: kalenderSerien.id })
          .from(kalenderSerien)
          .where(eq(kalenderSerien.vorlageId, id))
          .limit(1);
        if (benutzt.length > 0)
          throw new KalenderKonflikt('Die Vorlage wird von einer Serie benutzt.');
        const ids = (
          await tx
            .select({ id: vorlageSchichten.id })
            .from(vorlageSchichten)
            .where(eq(vorlageSchichten.vorlageId, id))
        ).map((s) => s.id);
        if (ids.length > 0) {
          await tx.delete(vorlageBedarfe).where(inArray(vorlageBedarfe.vorlageSchichtId, ids));
          await tx.delete(vorlageSchichten).where(eq(vorlageSchichten.vorlageId, id));
        }
        await tx.delete(eventVorlagen).where(eq(eventVorlagen.id, id));
        return true;
      });
    },

    // ----- Statistik
    async statistik(jahr) {
      const { start, ende } = jahrGrenzen(jahr);
      const rows = await db
        .select({
          dienstformId: dienste.dienstformId,
          mitgliedSub: dienste.mitgliedSub,
          externId: dienste.externId,
          schichtArt: schichten.art,
          schichtBeginn: schichten.beginn,
          abgesagt: events.abgesagt,
        })
        .from(dienste)
        .innerJoin(schichten, eq(schichten.id, dienste.schichtId))
        .innerJoin(events, eq(events.id, schichten.eventId))
        .where(and(gte(schichten.beginn, start), lt(schichten.beginn, ende)));
      const personen = await personenLaden(
        db,
        einzigartig(rows.flatMap((r) => (r.mitgliedSub ? [r.mitgliedSub] : []))),
        einzigartig(rows.flatMap((r) => (r.externId ? [r.externId] : []))),
      );
      return statistikZeilen(
        rows.flatMap((r) => {
          const person = r.mitgliedSub
            ? personen.mitglieder.get(r.mitgliedSub)
            : r.externId
              ? personen.externe.get(r.externId)
              : undefined;
          return person
            ? [
                {
                  person,
                  dienstformId: r.dienstformId,
                  schichtArt: r.schichtArt,
                  schichtBeginn: iso(r.schichtBeginn),
                  abgesagt: r.abgesagt,
                },
              ]
            : [];
        }),
        jahr,
      );
    },

    async tokenErzeugen(sub) {
      const token = randomBytes(32).toString('base64url');
      const werte = { tokenHash: tokenHash(token), erstellt: new Date() };
      await db
        .insert(kalenderTokens)
        .values({ mitgliedSub: sub, ...werte })
        .onConflictDoUpdate({ target: kalenderTokens.mitgliedSub, set: werte });
      return token;
    },
    async tokenVorhanden(sub) {
      const [row] = await db
        .select({ sub: kalenderTokens.mitgliedSub })
        .from(kalenderTokens)
        .where(eq(kalenderTokens.mitgliedSub, sub));
      return row !== undefined;
    },
    async subPerTokenHash(hash) {
      const [row] = await db
        .select({ sub: kalenderTokens.mitgliedSub })
        .from(kalenderTokens)
        .where(eq(kalenderTokens.tokenHash, hash));
      return row?.sub;
    },
    async meineDienste(sub, ab) {
      const rows = await db
        .select({
          id: dienste.id,
          eventId: events.id,
          eventTitelRoh: events.titel,
          kategorieName: eventKategorien.name,
          abgesagt: events.abgesagt,
          schichtArt: schichten.art,
          beginn: schichten.beginn,
          ende: schichten.ende,
          dienstformName: dienstformen.name,
        })
        .from(dienste)
        .innerJoin(schichten, eq(schichten.id, dienste.schichtId))
        .innerJoin(events, eq(events.id, schichten.eventId))
        .leftJoin(eventKategorien, eq(eventKategorien.id, events.kategorieId))
        .leftJoin(dienstformen, eq(dienstformen.id, dienste.dienstformId))
        .where(and(eq(dienste.mitgliedSub, sub), gte(schichten.beginn, ab)))
        .orderBy(asc(schichten.beginn), asc(dienste.id));
      return rows.map(({ eventTitelRoh, kategorieName, ...r }) => ({
        ...r,
        eventTitel: eventTitel({ titel: eventTitelRoh }, titelKategorie(kategorieName)),
        beginn: iso(r.beginn),
        ende: iso(r.ende),
      }));
    },
    async meineEvents(sub, ab) {
      const aboIds = (
        await db
          .select({ eventId: kalenderEventAbos.eventId })
          .from(kalenderEventAbos)
          .where(eq(kalenderEventAbos.mitgliedSub, sub))
      ).map((a) => a.eventId);
      const zeilen = await db
        .select({ e: events, kategorieName: eventKategorien.name, dauer: eventKategorien.dauer })
        .from(events)
        .leftJoin(eventKategorien, eq(eventKategorien.id, events.kategorieId))
        .where(
          and(
            gte(events.ende, ab),
            or(
              isNotNull(events.teilnahmeStatus),
              eq(events.verantwortlichSub, sub),
              aboIds.length > 0 ? inArray(events.id, aboIds) : undefined,
            ),
          ),
        )
        .orderBy(asc(events.beginn), asc(events.id));
      const rows = zeilen.map((z) => z.e);
      const kategorien = new Map(zeilen.map((z) => [z.e.id, z.kategorieName]));
      const ganztaegig = new Set(
        zeilen.filter((z) => dauerVon(z) === 'ganztaegig').map((z) => z.e.id),
      );
      const teilnahmen = await teilnahmenLaden(db, rows);
      const abonniert = new Set(aboIds);
      return rows
        .filter(
          (e) =>
            abonniert.has(e.id) ||
            e.verantwortlichSub === sub ||
            (teilnahmen.get(e.id) ?? []).some(
              (z) => z.mitglied.sub === sub && z.zustand === 'teilnahme',
            ),
        )
        .map((e) => ({
          id: e.id,
          titel: eventTitel(e, titelKategorie(kategorien.get(e.id))),
          beschreibung: e.beschreibung,
          beginn: iso(e.beginn),
          ende: iso(e.ende),
          abgesagt: e.abgesagt,
          ganztaegig: ganztaegig.has(e.id),
        }));
    },
    async erinnerungsTeilnahmen(von, bis) {
      const zeilen = await db
        .select({ e: events, kategorieName: eventKategorien.name })
        .from(events)
        .leftJoin(eventKategorien, eq(eventKategorien.id, events.kategorieId))
        .where(
          and(
            eq(events.abgesagt, false),
            isNotNull(events.teilnahmeStatus),
            gte(events.beginn, von),
            lt(events.beginn, bis),
          ),
        )
        .orderBy(asc(events.beginn), asc(events.id));
      const rows = zeilen.map((z) => z.e);
      const kategorien = new Map(zeilen.map((z) => [z.e.id, z.kategorieName]));
      const teilnahmen = await teilnahmenLaden(db, rows);
      return rows.flatMap((e) =>
        (teilnahmen.get(e.id) ?? [])
          .filter((z) => z.zustand === 'teilnahme')
          .map((z) => ({
            eventId: e.id,
            eventTitel: eventTitel(e, titelKategorie(kategorien.get(e.id))),
            mitgliedSub: z.mitglied.sub,
            beginn: iso(e.beginn),
          })),
      );
    },
    async erinnerungsDienste(von, bis) {
      const rows = await db
        .select({
          dienstId: dienste.id,
          mitgliedSub: dienste.mitgliedSub,
          eventId: events.id,
          eventTitelRoh: events.titel,
          kategorieName: eventKategorien.name,
          schichtArt: schichten.art,
          dienstformName: dienstformen.name,
          beginn: schichten.beginn,
        })
        .from(dienste)
        .innerJoin(schichten, eq(schichten.id, dienste.schichtId))
        .innerJoin(events, eq(events.id, schichten.eventId))
        .leftJoin(eventKategorien, eq(eventKategorien.id, events.kategorieId))
        .leftJoin(dienstformen, eq(dienstformen.id, dienste.dienstformId))
        .where(
          and(eq(events.abgesagt, false), gte(schichten.beginn, von), lt(schichten.beginn, bis)),
        )
        .orderBy(asc(schichten.beginn), asc(dienste.id));
      return rows.flatMap(({ eventTitelRoh, kategorieName, ...r }) =>
        r.mitgliedSub === null
          ? []
          : [
              {
                ...r,
                eventTitel: eventTitel({ titel: eventTitelRoh }, titelKategorie(kategorieName)),
                mitgliedSub: r.mitgliedSub,
                beginn: iso(r.beginn),
              },
            ],
      );
    },
  };
  return store;
}
