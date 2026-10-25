import { randomUUID } from 'node:crypto';
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import {
  berlinZuUtc,
  eventBewertung,
  statistikZeilen,
  type BedarfDto,
  type DienstDto,
  type DienstEintragen,
  type DienstformDto,
  type DienstformEingabe,
  type DienstPerson,
  type EventDto,
  type EventEingabe,
  type EventKategorieDto,
  type EventKategorieEingabe,
  type ExterneDto,
  type ExterneEingabe,
  type SchichtDto,
  type SchichtEingabe,
  type StatistikZeileDto,
  type VorlageDto,
  type VorlageEingabe,
} from '@c4/shared';
import type { Db } from './db/client';
import {
  dienste,
  dienstformen,
  eventKategorien,
  events,
  eventVorlagen,
  externe,
  mitglieder,
  schichtBedarfe,
  schichten,
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

/** A Dienst that an event update would delete. */
export interface BetroffenerDienst {
  dienstId: string;
  schichtId: string;
  schichtName: string;
  dienstformId: string;
  person: DienstPerson;
  /** `schicht`: the whole Schicht is removed, `bedarf`: its Bedarf for the Dienstform is removed. */
  grund: 'schicht' | 'bedarf';
}

/** An event update would delete Dienste and was not confirmed (HTTP 409 with the list). */
export class EntfernungBestaetigen extends Error {
  constructor(readonly betroffene: BetroffenerDienst[]) {
    super('Dabei werden Dienste entfernt. Bitte bestätige das.');
  }
}

// ---------------------------------------------------------------------------------------------
// Pure logic (unit tested)
// ---------------------------------------------------------------------------------------------

/** What the reconciliation needs to know about a stored Schicht. */
export interface BestehendeSchicht {
  id: string;
  dienste: { id: string; dienstformId: string }[];
}

export interface EntferntesDienst {
  dienstId: string;
  schichtId: string;
  dienstformId: string;
  grund: 'schicht' | 'bedarf';
}

export interface SchichtAbgleich {
  /** Input Schichten without an id: to insert, in input order. */
  neu: { index: number; eingabe: SchichtEingabe }[];
  /** Input Schichten with the id of a stored one: to update (including their Bedarfe). */
  behalten: { index: number; id: string; eingabe: SchichtEingabe }[];
  /** Stored Schichten that are not in the input: to delete with their Bedarfe and Dienste. */
  entfernt: string[];
  /** Dienste that vanish: all of a removed Schicht, and those whose Dienstform lost its Bedarf. */
  entfernteDienste: EntferntesDienst[];
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
  const ergebnis: SchichtAbgleich = { neu: [], behalten: [], entfernt: [], entfernteDienste: [] };
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
    const formen = new Set(s.bedarfe.map((b) => b.dienstformId));
    for (const d of alt.dienste) {
      if (!formen.has(d.dienstformId)) {
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
  schichtName: string;
  schichtBeginn: string;
  eventId: string;
  eventTitel: string;
  abgesagt: boolean;
  dienstformId: string;
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
  geaenderteSchichten: { schichtId: string; name: string; mitgliedSubs: string[] }[];
  /** Dienste that were deleted by the update (confirmed by the caller). */
  entfernteDienste: BetroffenerDienst[];
  /** Everybody with a remaining Dienst in the event. */
  mitgliedSubs: string[];
}

export interface AbsageErgebnis {
  /** False when the event already had the requested state. */
  geaendert: boolean;
  /** Members with a Dienst in the event. */
  mitgliedSubs: string[];
}

export interface KalenderStore {
  // ----- Events
  /** Events overlapping the Berlin dates `von`..`bis` (inclusive), ordered by start. */
  events(von: string, bis: string): Promise<EventDto[]>;
  event(id: string): Promise<EventDto | undefined>;
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

  // ----- Dienste
  /** Undefined when the Schicht does not exist. Throws KalenderUngueltig / KalenderKonflikt. */
  dienstEintragen(
    schichtId: string,
    daten: DienstEintragen,
    eingetragenVon: string,
  ): Promise<string | undefined>;
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

  // ----- Statistik
  statistik(jahr: number): Promise<StatistikZeileDto[]>;
}

// ---------------------------------------------------------------------------------------------
// Drizzle implementation
// ---------------------------------------------------------------------------------------------

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** What the loaders need; satisfied by the database and by a transaction. */
type Q = Pick<Db, 'select'>;

const iso = (d: Date) => d.toISOString();
const einzigartig = <T>(werte: readonly T[]) => [...new Set(werte)];

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
    mitglieder: new Map(
      mRows.map((m) => [
        m.sub,
        {
          art: 'mitglied' as const,
          sub: m.sub,
          username: null,
          vorname: m.vorname,
          nachname: m.nachname,
          status: m.status,
          anrede: m.anrede ?? 'neutral',
        },
      ]),
    ),
    externe: new Map(
      eRows.map((e) => [
        e.id,
        { art: 'extern' as const, id: e.id, name: e.name, quelle: e.quelle },
      ]),
    ),
  };
}

/** Loads events (matching `bedingung`) with Schichten, Bedarfe, Dienste and the Ampel. */
async function eventsLaden(q: Q, bedingung: ReturnType<typeof and>): Promise<EventDto[]> {
  const eventRows = await q
    .select({
      event: events,
      kategorieName: eventKategorien.name,
      kategorieFarbe: eventKategorien.farbe,
    })
    .from(events)
    .leftJoin(eventKategorien, eq(eventKategorien.id, events.kategorieId))
    .where(bedingung)
    .orderBy(asc(events.beginn), asc(events.id));
  if (eventRows.length === 0) return [];
  const eventIds = eventRows.map((r) => r.event.id);
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
    einzigartig(dienstRows.flatMap((d) => (d.mitgliedSub ? [d.mitgliedSub] : []))),
    einzigartig(dienstRows.flatMap((d) => (d.externId ? [d.externId] : []))),
  );
  const formPos = new Map(
    [...formRows]
      .sort((a, b) => a.reihenfolge - b.reihenfolge || a.name.localeCompare(b.name, 'de'))
      .map((f, i) => [f.id, i]),
  );

  const alsSchicht = (s: (typeof schichtRows)[number]): SchichtDto => ({
    id: s.id,
    name: s.name,
    art: s.art,
    beginn: iso(s.beginn),
    ende: iso(s.ende),
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

  return eventRows.map(({ event: e, kategorieName, kategorieFarbe }) => {
    const alleSchichten = schichtRows.filter((s) => s.eventId === e.id).map(alsSchicht);
    return {
      id: e.id,
      titel: e.titel,
      beschreibung: e.beschreibung,
      kategorie:
        e.kategorieId && kategorieName !== null && kategorieFarbe !== null
          ? { id: e.kategorieId, name: kategorieName, farbe: kategorieFarbe }
          : null,
      beginn: iso(e.beginn),
      ende: iso(e.ende),
      abgesagt: e.abgesagt,
      fehltHinweisStunden: e.fehltHinweisStunden,
      schichten: alleSchichten,
      bewertung: eventBewertung({ abgesagt: e.abgesagt, schichten: alleSchichten }),
    };
  });
}

/** Throws unless the Kategorie exists (and is not archived, unless it is `bisherige`). */
async function kategorieMussExistieren(q: Q, id: string | null, bisherige?: string | null) {
  if (id === null) return;
  const [k] = await q.select().from(eventKategorien).where(eq(eventKategorien.id, id));
  if (!k || (k.archiviert && id !== bisherige)) {
    throw new KalenderUngueltig('Die Kategorie gibt es nicht.');
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

export function createKalenderStore(db: Db): KalenderStore {
  const schichtenSchreiben = async (
    tx: Tx,
    eventId: string,
    eintraege: readonly { index: number; id?: string; eingabe: SchichtEingabe }[],
  ) => {
    for (const { index, id: vorhandeneId, eingabe: s } of eintraege) {
      const werte = {
        name: s.name,
        art: s.art,
        beginn: new Date(s.beginn),
        ende: new Date(s.ende),
        reihenfolge: index,
      };
      let id = vorhandeneId;
      if (id === undefined) {
        id = randomUUID();
        await tx.insert(schichten).values({ id, eventId, ...werte });
      } else {
        await tx.update(schichten).set(werte).where(eq(schichten.id, id));
        await tx.delete(schichtBedarfe).where(eq(schichtBedarfe.schichtId, id));
      }
      if (s.bedarfe.length > 0) {
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

  const vorlageSchreiben = async (tx: Tx, vorlageId: string, daten: VorlageEingabe) => {
    for (const [index, s] of daten.schichten.entries()) {
      const id = randomUUID();
      await tx.insert(vorlageSchichten).values({
        id,
        vorlageId,
        name: s.name,
        art: s.art,
        tagVersatz: s.tagVersatz,
        beginnZeit: s.beginnZeit,
        endeTagVersatz: s.endeTagVersatz,
        endeZeit: s.endeZeit,
        reihenfolge: index,
      });
      if (s.bedarfe.length > 0) {
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

  const eventsFuerBedingung = (bedingung: ReturnType<typeof and>) => eventsLaden(db, bedingung);

  return {
    // ----- Events
    async events(von, bis) {
      const { start, ende } = zeitraumGrenzen(von, bis);
      return eventsFuerBedingung(and(lt(events.beginn, ende), gte(events.ende, start)));
    },
    async event(id) {
      return (await eventsFuerBedingung(eq(events.id, id)))[0];
    },
    async eventAnlegen(daten, von) {
      return db.transaction(async (tx) => {
        await kategorieMussExistieren(tx, daten.kategorieId);
        await dienstformenMuessenExistieren(
          tx,
          daten.schichten.flatMap((s) => s.bedarfe.map((b) => b.dienstformId)),
        );
        if (daten.schichten.some((s) => s.id !== undefined)) {
          throw new KalenderUngueltig('Neue Events haben noch keine Schichten mit Id.');
        }
        const id = randomUUID();
        await tx.insert(events).values({
          id,
          titel: daten.titel,
          beschreibung: daten.beschreibung,
          kategorieId: daten.kategorieId,
          beginn: new Date(daten.beginn),
          ende: new Date(daten.ende),
          fehltHinweisStunden: daten.fehltHinweisStunden,
          angelegtVon: von,
        });
        await schichtenSchreiben(
          tx,
          id,
          daten.schichten.map((eingabe, index) => ({ index, eingabe })),
        );
        return id;
      });
    },
    async eventAktualisieren(id, daten) {
      return db.transaction(async (tx) => {
        const [bisher] = await tx.select().from(events).where(eq(events.id, id));
        if (!bisher) return undefined;
        const schichtRows = await tx.select().from(schichten).where(eq(schichten.eventId, id));
        const schichtIds = schichtRows.map((s) => s.id);
        const [dienstRows, bedarfRows] =
          schichtIds.length > 0
            ? await Promise.all([
                tx.select().from(dienste).where(inArray(dienste.schichtId, schichtIds)),
                tx
                  .select()
                  .from(schichtBedarfe)
                  .where(inArray(schichtBedarfe.schichtId, schichtIds)),
              ])
            : [[], []];

        await kategorieMussExistieren(tx, daten.kategorieId, bisher.kategorieId);
        await dienstformenMuessenExistieren(
          tx,
          daten.schichten.flatMap((s) => s.bedarfe.map((b) => b.dienstformId)),
          new Set(bedarfRows.map((b) => b.dienstformId)),
        );

        const abgleich = schichtAbgleich(
          schichtRows.map((s) => ({
            id: s.id,
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
            if (!person) return [];
            return [
              {
                dienstId: e.dienstId,
                schichtId: e.schichtId,
                schichtName: schichtRows.find((s) => s.id === e.schichtId)?.name ?? '',
                dienstformId: e.dienstformId,
                person,
                grund: e.grund,
              },
            ];
          });
          if (daten.bestaetigt !== true) throw new EntfernungBestaetigen(entfernte);
        }

        const entfernteIds = new Set(abgleich.entfernteDienste.map((e) => e.dienstId));
        const beginnNeu = new Date(daten.beginn);
        const endeNeu = new Date(daten.ende);
        await tx
          .update(events)
          .set({
            titel: daten.titel,
            beschreibung: daten.beschreibung,
            kategorieId: daten.kategorieId,
            beginn: beginnNeu,
            ende: endeNeu,
            fehltHinweisStunden: daten.fehltHinweisStunden,
            aktualisiertAm: new Date(),
          })
          .where(eq(events.id, id));
        if (entfernteIds.size > 0) {
          await tx.delete(dienste).where(inArray(dienste.id, [...entfernteIds]));
        }
        if (abgleich.entfernt.length > 0) {
          await tx
            .delete(schichtBedarfe)
            .where(inArray(schichtBedarfe.schichtId, abgleich.entfernt));
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
            ? [{ schichtId: b.id, name: b.eingabe.name, mitgliedSubs: subs }]
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
        };
      });
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
            .set({ abgesagt, aktualisiertAm: new Date() })
            .where(eq(events.id, id));
        }
        return {
          geaendert: bisher.abgesagt !== abgesagt,
          mitgliedSubs: einzigartig(rows.flatMap((r) => (r.sub ? [r.sub] : []))),
        };
      });
    },

    // ----- Dienste
    async dienstEintragen(schichtId, daten, eingetragenVon) {
      try {
        return await db.transaction(async (tx) => {
          const [zeile] = await tx
            .select({ schicht: schichten, abgesagt: events.abgesagt })
            .from(schichten)
            .innerJoin(events, eq(events.id, schichten.eventId))
            .where(eq(schichten.id, schichtId));
          if (!zeile) return undefined;
          if (zeile.abgesagt) {
            throw new KalenderKonflikt('Das Event ist abgesagt. Eintragen ist nicht möglich.');
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
            dienstformId: daten.dienstformId,
            mitgliedSub,
            externId: mitgliedSub === null ? (daten.externId ?? null) : null,
            kommentar: daten.kommentar,
            eingetragenVon,
          });
          return id;
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
          schichtName: schichten.name,
          schichtBeginn: schichten.beginn,
          eventId: events.id,
          eventTitel: events.titel,
          abgesagt: events.abgesagt,
        })
        .from(dienste)
        .innerJoin(schichten, eq(schichten.id, dienste.schichtId))
        .innerJoin(events, eq(events.id, schichten.eventId))
        .where(eq(dienste.id, id));
      if (!r) return undefined;
      return {
        id: r.dienst.id,
        schichtId: r.dienst.schichtId,
        schichtName: r.schichtName,
        schichtBeginn: iso(r.schichtBeginn),
        eventId: r.eventId,
        eventTitel: r.eventTitel,
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
      const rows = await db.select().from(eventKategorien);
      return rows
        .filter((k) => mitArchiv || !k.archiviert)
        .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    },
    async kategorieAnlegen(daten) {
      const id = randomUUID();
      await db.insert(eventKategorien).values({
        id,
        name: daten.name,
        farbe: daten.farbe,
        archiviert: daten.archiviert ?? false,
      });
      return id;
    },
    async kategorieAktualisieren(id, daten) {
      const rows = await db
        .update(eventKategorien)
        .set({
          name: daten.name,
          farbe: daten.farbe,
          ...(daten.archiviert !== undefined && { archiviert: daten.archiviert }),
        })
        .where(eq(eventKategorien.id, id))
        .returning({ id: eventKategorien.id });
      return rows.length > 0;
    },
    async vorlagen(mitArchiv) {
      const [rows, schichtRows, bedarfRows] = await Promise.all([
        db.select().from(eventVorlagen),
        db.select().from(vorlageSchichten),
        db.select().from(vorlageBedarfe),
      ]);
      return rows
        .filter((v) => mitArchiv || !v.archiviert)
        .sort((a, b) => a.titel.localeCompare(b.titel, 'de'))
        .map((v): VorlageDto => ({
          id: v.id,
          titel: v.titel,
          beschreibung: v.beschreibung,
          kategorieId: v.kategorieId,
          beginnZeit: v.beginnZeit,
          endeTagVersatz: v.endeTagVersatz,
          endeZeit: v.endeZeit,
          fehltHinweisStunden: v.fehltHinweisStunden,
          archiviert: v.archiviert,
          schichten: schichtRows
            .filter((s) => s.vorlageId === v.id)
            .sort((a, b) => a.reihenfolge - b.reihenfolge)
            .map((s) => ({
              name: s.name,
              art: s.art,
              tagVersatz: s.tagVersatz,
              beginnZeit: s.beginnZeit,
              endeTagVersatz: s.endeTagVersatz,
              endeZeit: s.endeZeit,
              bedarfe: bedarfRows
                .filter((b) => b.vorlageSchichtId === s.id)
                .map((b) => ({
                  dienstformId: b.dienstformId,
                  minimum: b.minimum,
                  wunsch: b.wunsch,
                })),
            })),
        }));
    },
    async vorlageAnlegen(daten) {
      return db.transaction(async (tx) => {
        await kategorieMussExistieren(tx, daten.kategorieId);
        await dienstformenMuessenExistieren(
          tx,
          daten.schichten.flatMap((s) => s.bedarfe.map((b) => b.dienstformId)),
        );
        const id = randomUUID();
        await tx.insert(eventVorlagen).values({
          id,
          titel: daten.titel,
          beschreibung: daten.beschreibung,
          kategorieId: daten.kategorieId,
          beginnZeit: daten.beginnZeit,
          endeTagVersatz: daten.endeTagVersatz,
          endeZeit: daten.endeZeit,
          fehltHinweisStunden: daten.fehltHinweisStunden,
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
        await kategorieMussExistieren(tx, daten.kategorieId, bisher.kategorieId);
        await dienstformenMuessenExistieren(
          tx,
          daten.schichten.flatMap((s) => s.bedarfe.map((b) => b.dienstformId)),
          new Set(alteBedarfe.map((b) => b.dienstformId)),
        );
        await tx
          .update(eventVorlagen)
          .set({
            titel: daten.titel,
            beschreibung: daten.beschreibung,
            kategorieId: daten.kategorieId,
            beginnZeit: daten.beginnZeit,
            endeTagVersatz: daten.endeTagVersatz,
            endeZeit: daten.endeZeit,
            fehltHinweisStunden: daten.fehltHinweisStunden,
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
    async vorlageLoeschen(id) {
      return db.transaction(async (tx) => {
        const [vorhanden] = await tx
          .select({ id: eventVorlagen.id })
          .from(eventVorlagen)
          .where(eq(eventVorlagen.id, id));
        if (!vorhanden) return false;
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
                  schichtBeginn: iso(r.schichtBeginn),
                  abgesagt: r.abgesagt,
                },
              ]
            : [];
        }),
        jahr,
      );
    },
  };
}
