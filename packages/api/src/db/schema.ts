import {
  bigint,
  boolean,
  customType,
  date,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import type {
  Anrede,
  BuchungsArt,
  Einheit,
  EventArt,
  KontoArt,
  SteuerArt,
  IfcoGrundflaeche,
  LagerortArt,
  MhdArt,
  SchichtArt,
  MitgliedStatus,
  PrivatpartyStatus,
  PrivatpartyStufe,
  TeilnahmeAntwort,
  Quelle,
  UmfrageErgebnisse,
  Verpackungseinheit,
  VorgangTyp,
} from '@c4/shared';

/** `numeric` as a JS number (the driver returns numeric values as strings). */
const dezimal = customType<{ data: number; driverData: string }>({
  dataType: () => 'numeric(10,3)',
  fromDriver: (value) => Number(value),
  toDriver: (value) => String(value),
});

/** `numeric` with one decimal as a JS number (heights in cm, Stellflächen). */
const dezimal1 = customType<{ data: number; driverData: string }>({
  dataType: () => 'numeric(5,1)',
  fromDriver: (value) => Number(value),
  toDriver: (value) => String(value),
});

/** Placeholder table; real domain tables go here. DSQL: no sequences. */
export const appInfo = pgTable('app_info', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** One row per member, keyed by the Cognito `sub`. */
export const mitglieder = pgTable('mitglieder', {
  sub: text('sub').primaryKey(),
  vorname: text('vorname').notNull(),
  nachname: text('nachname').notNull(),
  /** Null until the member chose; the app then treats it as neutral. */
  anrede: text('anrede').$type<Anrede>(),
  /** Comma-separated channels, e.g. "whatsapp,mail"; null when none were chosen. */
  kontaktkanaele: text('kontaktkanaele'),
  discordName: text('discord_name'),
  adresse: text('adresse'),
  telefon: text('telefon'),
  ueberMich: text('ueber_mich'),
  profilbildKey: text('profilbild_key'),
  /** Date of birth; optional. */
  geburtsdatum: date('geburtsdatum', { mode: 'string' }),
  /** Whether other members see the birthday; null (never chosen) counts as true. */
  geburtstagImKalender: boolean('geburtstag_im_kalender'),
  /** Lives in the Wohnheim and is asked about key handovers; null counts as false. */
  wohnheim: boolean('wohnheim'),
  status: text('status').$type<MitgliedStatus>().notNull().default('anwaerter'),
  /** Set when an admin deactivated the account; null = active. */
  deaktiviertAm: timestamp('deaktiviert_am', { withTimezone: true }),
  aktualisiertAm: timestamp('aktualisiert_am', { withTimezone: true }).notNull().defaultNow(),
});
export type MitgliedRow = typeof mitglieder.$inferSelect;

/** Status history of a member; `ab` is the first day, null = start unknown. `mitglieder.status` mirrors the newest. */
export const mitgliedStatusVerlauf = pgTable('mitglied_status_verlauf', {
  id: text('id').primaryKey(),
  mitgliedSub: text('mitglied_sub')
    .notNull()
    .references(() => mitglieder.sub),
  status: text('status').$type<MitgliedStatus>().notNull(),
  ab: date('ab', { mode: 'string' }),
  erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
});
export type StatusVerlaufRow = typeof mitgliedStatusVerlauf.$inferSelect;

/** A responsibility of the club, held by one or more members (see `postenBesetzungen`). */
export const posten = pgTable('posten', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  beschreibung: text('beschreibung'),
  /** Title of the holder in each form of address, e.g. "Chef" / "Chefin" / "Chef:in"; null if unset. */
  bezeichnungMaennlich: text('bezeichnung_maennlich'),
  bezeichnungWeiblich: text('bezeichnung_weiblich'),
  bezeichnungNeutral: text('bezeichnung_neutral'),
  archiviert: boolean('archiviert').notNull().default(false),
  aktualisiertAm: timestamp('aktualisiert_am', { withTimezone: true }).notNull().defaultNow(),
});
export type PostenRow = typeof posten.$inferSelect;

/** Permissions granted to whoever currently holds the Posten. */
export const postenRechte = pgTable(
  'posten_rechte',
  {
    postenId: text('posten_id')
      .notNull()
      .references(() => posten.id),
    recht: text('recht').notNull(),
  },
  (t) => [primaryKey({ columns: [t.postenId, t.recht] })],
);

/** A member holds a Posten from `startDatum` until `endDatum` (inclusive); no end = open. */
export const postenBesetzungen = pgTable('posten_besetzungen', {
  id: text('id').primaryKey(),
  postenId: text('posten_id')
    .notNull()
    .references(() => posten.id),
  mitgliedSub: text('mitglied_sub')
    .notNull()
    .references(() => mitglieder.sub),
  startDatum: date('start_datum', { mode: 'string' }).notNull(),
  endDatum: date('end_datum', { mode: 'string' }),
});
export type BesetzungRow = typeof postenBesetzungen.$inferSelect;

// ---------------------------------------------------------------------------
// Waren

/** Tree of storage places (Lager > Regal > Etage); `position` orders siblings. */
export const lagerorte = pgTable('lagerorte', {
  id: text('id').primaryKey(),
  parentId: text('parent_id').references((): AnyPgColumn => lagerorte.id),
  name: text('name').notNull(),
  beschreibung: text('beschreibung'),
  position: integer('position').notNull().default(0),
  archiviert: boolean('archiviert').notNull().default(false),
  /** null = normal Lagerort; see `LAGERORT_ARTEN` in shared. */
  art: text('art').$type<LagerortArt>(),
  /** IFCO-Lagerplatz: height of every half-column in cm (null = normal place), see `ifcosPassen` in shared. */
  ifcoHoeheCm: dezimal1('ifco_hoehe_cm'),
  /** IFCO-Lagerplatz: number of 60x40 footprints (steps of 0.5); set together with `ifcoHoeheCm`. */
  ifcoStellflaechen: dezimal1('ifco_stellflaechen'),
});
export type LagerortRow = typeof lagerorte.$inferSelect;

export const warengruppen = pgTable('warengruppen', {
  id: text('id').primaryKey(),
  parentId: text('parent_id').references((): AnyPgColumn => warengruppen.id),
  name: text('name').notNull(),
  archiviert: boolean('archiviert').notNull().default(false),
});
export type WarengruppeRow = typeof warengruppen.$inferSelect;

/**
 * Packaging unit. A Basisgebinde has `menge` + `einheit`; an Obergebinde instead contains
 * `unterAnzahl` of its `unterGebindeId`. `pfandCent` null means no deposit.
 */
export const gebinde = pgTable('gebinde', {
  id: text('id').primaryKey(),
  menge: dezimal('menge'),
  einheit: text('einheit').$type<Einheit>(),
  verpackungseinheit: text('verpackungseinheit').$type<Verpackungseinheit>().notNull(),
  pfandCent: integer('pfand_cent'),
  unterGebindeId: text('unter_gebinde_id').references((): AnyPgColumn => gebinde.id),
  unterAnzahl: integer('unter_anzahl'),
  archiviert: boolean('archiviert').notNull().default(false),
});
export type GebindeRow = typeof gebinde.$inferSelect;

export const waren = pgTable('waren', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  warengruppeId: text('warengruppe_id')
    .notNull()
    .references(() => warengruppen.id),
  mhdArt: text('mhd_art').$type<MhdArt>().notNull(),
  archiviert: boolean('archiviert').notNull().default(false),
});
export type WareRow = typeof waren.$inferSelect;

export const wareAliase = pgTable(
  'ware_aliase',
  {
    wareId: text('ware_id')
      .notNull()
      .references(() => waren.id),
    alias: text('alias').notNull(),
  },
  (t) => [primaryKey({ columns: [t.wareId, t.alias] })],
);

export const wareGebinde = pgTable(
  'ware_gebinde',
  {
    wareId: text('ware_id')
      .notNull()
      .references(() => waren.id),
    gebindeId: text('gebinde_id')
      .notNull()
      .references(() => gebinde.id),
  },
  (t) => [primaryKey({ columns: [t.wareId, t.gebindeId] })],
);

/** The ordered Warenliste of a Lagerort (what is expected to be stored there). */
export const lagerortWaren = pgTable(
  'lagerort_waren',
  {
    lagerortId: text('lagerort_id')
      .notNull()
      .references(() => lagerorte.id),
    wareId: text('ware_id')
      .notNull()
      .references(() => waren.id),
    position: integer('position').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.lagerortId, t.wareId] })],
);

/** One stock operation (Einlagerung, Entnahme, Inventur) with many Buchungszeilen. */
export const bestandsvorgaenge = pgTable('bestandsvorgaenge', {
  id: text('id').primaryKey(),
  typ: text('typ').$type<VorgangTyp>().notNull(),
  quelle: text('quelle').$type<Quelle>().notNull(),
  zeitpunkt: timestamp('zeitpunkt', { withTimezone: true }).notNull(),
  kommentar: text('kommentar'),
  /** Cognito sub, deliberately without a foreign key (users without a profile may book). */
  erstelltVon: text('erstellt_von').notNull(),
  erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
});
export type VorgangRow = typeof bestandsvorgaenge.$inferSelect;

export const bestandsbuchungen = pgTable('bestandsbuchungen', {
  id: text('id').primaryKey(),
  vorgangId: text('vorgang_id')
    .notNull()
    .references(() => bestandsvorgaenge.id),
  wareId: text('ware_id')
    .notNull()
    .references(() => waren.id),
  lagerortId: text('lagerort_id')
    .notNull()
    .references(() => lagerorte.id),
  gebindeId: text('gebinde_id')
    .notNull()
    .references(() => gebinde.id),
  mhd: date('mhd', { mode: 'string' }),
  menge: integer('menge').notNull(),
  art: text('art').$type<BuchungsArt>().notNull(),
});
export type BuchungRow = typeof bestandsbuchungen.$inferSelect;

/** Server-side draft of an Inventur; `status` is `offen` or `abgeschlossen`. */
export const inventuren = pgTable('inventuren', {
  id: text('id').primaryKey(),
  lagerortId: text('lagerort_id')
    .notNull()
    .references(() => lagerorte.id),
  status: text('status').$type<'offen' | 'abgeschlossen'>().notNull(),
  gestartetVon: text('gestartet_von').notNull(),
  gestartetAm: timestamp('gestartet_am', { withTimezone: true }).notNull().defaultNow(),
  vorgangId: text('vorgang_id').references(() => bestandsvorgaenge.id),
});
export type InventurRow = typeof inventuren.$inferSelect;

export const inventurKnoten = pgTable(
  'inventur_knoten',
  {
    inventurId: text('inventur_id')
      .notNull()
      .references(() => inventuren.id),
    lagerortId: text('lagerort_id')
      .notNull()
      .references(() => lagerorte.id),
    erledigt: boolean('erledigt').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.inventurId, t.lagerortId] })],
);

export const inventurZaehlungen = pgTable('inventur_zaehlungen', {
  id: text('id').primaryKey(),
  inventurId: text('inventur_id')
    .notNull()
    .references(() => inventuren.id),
  lagerortId: text('lagerort_id')
    .notNull()
    .references(() => lagerorte.id),
  wareId: text('ware_id')
    .notNull()
    .references(() => waren.id),
  gebindeId: text('gebinde_id')
    .notNull()
    .references(() => gebinde.id),
  mhd: date('mhd', { mode: 'string' }),
  anzahl: integer('anzahl').notNull(),
});

// ---------------------------------------------------------------------------
// Inventar

/** Tree of categories for Gegenstände (like `warengruppen`). */
export const inventarKategorien = pgTable('inventar_kategorien', {
  id: text('id').primaryKey(),
  parentId: text('parent_id').references((): AnyPgColumn => inventarKategorien.id),
  name: text('name').notNull(),
  archiviert: boolean('archiviert').notNull().default(false),
});
export type InventarKategorieRow = typeof inventarKategorien.$inferSelect;

/** Master data of an IFCO kind: footprint and height. */
export const ifcoTypen = pgTable('ifco_typen', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  grundflaeche: text('grundflaeche').$type<IfcoGrundflaeche>().notNull(),
  hoeheCm: dezimal1('hoehe_cm').notNull(),
  archiviert: boolean('archiviert').notNull().default(false),
});
export type IfcoTypRow = typeof ifcoTypen.$inferSelect;

/** A Euronorm box holding Gegenstände; `lagerortId` null = currently without a place. */
export const ifcos = pgTable('ifcos', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  beschreibung: text('beschreibung'),
  lagerortId: text('lagerort_id').references(() => lagerorte.id),
  archiviert: boolean('archiviert').notNull().default(false),
  /** Reference to `ifco_typen` without a foreign key (enforced in the API); null = no type. */
  typId: text('typ_id'),
});
export type IfcoRow = typeof ifcos.$inferSelect;

/** A durable item of the club; `anzahl` is the target total spread over its Plätze. */
export const gegenstaende = pgTable('gegenstaende', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  beschreibung: text('beschreibung'),
  kategorieId: text('kategorie_id')
    .notNull()
    .references(() => inventarKategorien.id),
  anzahl: integer('anzahl').notNull().default(1),
  archiviert: boolean('archiviert').notNull().default(false),
  /** Parent Gegenstand when this one is a part ("Teil"); reference without a foreign key (enforced in the API). */
  teilVon: text('teil_von'),
  /** Virtual: has an amount but never Plätze, fixed installations or Ausleihen (null = false). */
  virtuell: boolean('virtuell'),
  /** Pieces of this part per piece of its parent; set exactly when `teilVon` is set. */
  anzahlJe: integer('anzahl_je'),
});
export type GegenstandRow = typeof gegenstaende.$inferSelect;

/** Where `anzahl` pieces of a Gegenstand belong: exactly one of `lagerortId` and `ifcoId` is set (CHECK). */
export const gegenstandPlaetze = pgTable('gegenstand_plaetze', {
  id: text('id').primaryKey(),
  gegenstandId: text('gegenstand_id')
    .notNull()
    .references(() => gegenstaende.id),
  lagerortId: text('lagerort_id').references(() => lagerorte.id),
  ifcoId: text('ifco_id').references(() => ifcos.id),
  anzahl: integer('anzahl').notNull(),
});
export type GegenstandPlatzRow = typeof gegenstandPlaetze.$inferSelect;

/**
 * Zugänge and Abgänge of a Gegenstand; their sum is kept in `gegenstaende.anzahl`. `ort` is a display
 * snapshot of the Platz (no foreign key), `erstelltVon` a Cognito sub.
 */
export const gegenstandBewegungen = pgTable('gegenstand_bewegungen', {
  id: text('id').primaryKey(),
  gegenstandId: text('gegenstand_id')
    .notNull()
    .references(() => gegenstaende.id),
  art: text('art').$type<'zugang' | 'abgang'>().notNull(),
  grund: text('grund').notNull(),
  anzahl: integer('anzahl').notNull(),
  datum: date('datum', { mode: 'string' }).notNull(),
  kommentar: text('kommentar'),
  ort: text('ort'),
  erstelltVon: text('erstellt_von').notNull(),
  erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
});
export type GegenstandBewegungRow = typeof gegenstandBewegungen.$inferSelect;

/** Pieces of a Gegenstand built in for good at a free-text place; not on any Platz. */
export const gegenstandVerbaut = pgTable('gegenstand_verbaut', {
  id: text('id').primaryKey(),
  gegenstandId: text('gegenstand_id')
    .notNull()
    .references(() => gegenstaende.id),
  ort: text('ort').notNull(),
  anzahl: integer('anzahl').notNull(),
});

export const ausleihen = pgTable('ausleihen', {
  id: text('id').primaryKey(),
  /** Free text: person, club or company. */
  an: text('an').notNull(),
  ausgeliehenAm: timestamp('ausgeliehen_am', { withTimezone: true }).notNull(),
  rueckgabeGeplant: date('rueckgabe_geplant', { mode: 'string' }),
  kommentar: text('kommentar'),
  /** Cognito sub, deliberately without a foreign key. */
  erstelltVon: text('erstellt_von').notNull(),
  /** Cognito sub of the Mitglied who organised it, no foreign key; null on older rows (then `erstelltVon` counts). */
  organisiertVon: text('organisiert_von'),
  erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
});
export type AusleiheRow = typeof ausleihen.$inferSelect;

/** Origin is a place (exactly one of `lagerortId`/`ifcoId`, CHECK), not a `gegenstandPlaetze` id. */
export const ausleihePositionen = pgTable('ausleihe_positionen', {
  id: text('id').primaryKey(),
  ausleiheId: text('ausleihe_id')
    .notNull()
    .references(() => ausleihen.id),
  gegenstandId: text('gegenstand_id')
    .notNull()
    .references(() => gegenstaende.id),
  lagerortId: text('lagerort_id').references(() => lagerorte.id),
  ifcoId: text('ifco_id').references(() => ifcos.id),
  anzahl: integer('anzahl').notNull(),
  /** Null while the position is still lent out. */
  zurueckAm: timestamp('zurueck_am', { withTimezone: true }),
  /** True when the position belongs to lending a whole IFCO (null/false = single item). */
  ganzeIfco: boolean('ganze_ifco'),
});
export type AusleihePositionRow = typeof ausleihePositionen.$inferSelect;

/** A clean-up after an event, open while `beendetAm` is null; the `*Von` columns are Cognito subs without a foreign key. */
export const aufraeumaktionen = pgTable('aufraeumaktionen', {
  id: text('id').primaryKey(),
  gestartetAm: timestamp('gestartet_am', { withTimezone: true }).notNull().defaultNow(),
  gestartetVon: text('gestartet_von').notNull(),
  beendetAm: timestamp('beendet_am', { withTimezone: true }),
  beendetVon: text('beendet_von'),
});
export type AufraeumaktionRow = typeof aufraeumaktionen.$inferSelect;

/** An IFCO marked as done (sorted and stored correctly) in an Aufräumaktion. */
export const aufraeumIfcos = pgTable('aufraeum_ifcos', {
  id: text('id').primaryKey(),
  aktionId: text('aktion_id')
    .notNull()
    .references(() => aufraeumaktionen.id),
  ifcoId: text('ifco_id')
    .notNull()
    .references(() => ifcos.id),
  fertigAm: timestamp('fertig_am', { withTimezone: true }).notNull().defaultNow(),
  fertigVon: text('fertig_von').notNull(),
});

// ---------------------------------------------------------------------------------------------
// Kalender: Events, Schichten, Dienste (see docs/kalender.md)
// ---------------------------------------------------------------------------------------------

/** A kind of work in a Schicht, e.g. Bar or Technik. */
export const dienstformen = pgTable('dienstformen', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  reihenfolge: integer('reihenfolge').notNull().default(0),
  archiviert: boolean('archiviert').notNull().default(false),
});
export type DienstformRow = typeof dienstformen.$inferSelect;

export const eventKategorien = pgTable('event_kategorien', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** Mantine color name. */
  farbe: text('farbe').notNull(),
  /** `dienste` or `teilnahme` (CHECK). */
  art: text('art').$type<EventArt>().notNull(),
  /** Default participation circle of a `teilnahme` category (same coding as `events.teilnahmeStatus`). */
  teilnahmeStatus: text('teilnahme_status'),
  /** `eintaegig` (null), `mehrtaegig` or `ganztaegig`. */
  dauer: text('dauer'),
  /** Meetings of this category get minutes (`teilnahme` categories only); null = no. */
  protokoll: boolean('protokoll'),
  /** Kind of Sitzung for categories with `protokoll`: `sitzung` (null) or `mitgliederversammlung`. */
  protokollArt: text('protokoll_art'),
  archiviert: boolean('archiviert').notNull().default(false),
});
export type EventKategorieRow = typeof eventKategorien.$inferSelect;

/** Helpers from outside the club who can be entered into Dienste. */
export const externe = pgTable('externe', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kontakt: text('kontakt'),
  /** Free text, e.g. "Freund:in von X" or "StuK". */
  quelle: text('quelle'),
  angelegtVon: text('angelegt_von')
    .notNull()
    .references(() => mitglieder.sub),
  archiviert: boolean('archiviert').notNull().default(false),
});
export type ExterneRow = typeof externe.$inferSelect;

export const events = pgTable('events', {
  id: text('id').primaryKey(),
  /** Null (or '') = no title: the Kategorie's name is shown instead. */
  titel: text('titel'),
  beschreibung: text('beschreibung'),
  kategorieId: text('kategorie_id')
    .notNull()
    .references(() => eventKategorien.id),
  beginn: timestamp('beginn', { withTimezone: true }).notNull(),
  ende: timestamp('ende', { withTimezone: true }).notNull(),
  abgesagt: boolean('abgesagt').notNull().default(false),
  /** Series the event belongs to (id of a `kalender_serien` row); null for ordinary events. */
  serie: text('serie'),
  /** True once a series event was edited by hand or cancelled; such events are left alone when the series changes. */
  serieAngepasst: boolean('serie_angepasst'),
  /** Participation circle: null = no participation, else comma-separated member statuses ('' = by invitation only). */
  teilnahmeStatus: text('teilnahme_status'),
  /** Responsible member (optional). */
  verantwortlichSub: text('verantwortlich_sub').references(() => mitglieder.sub),
  /** Cognito sub, deliberately without a foreign key; null for events created by the system. */
  angelegtVon: text('angelegt_von'),
  angelegtAm: timestamp('angelegt_am', { withTimezone: true }).notNull().defaultNow(),
  aktualisiertAm: timestamp('aktualisiert_am', { withTimezone: true }).notNull().defaultNow(),
  /** OneDrive photo folder of the event (id and link); null = none. */
  bilderOrdnerId: text('bilder_ordner_id'),
  bilderOrdnerUrl: text('bilder_ordner_url'),
});
export type EventRow = typeof events.$inferSelect;

/** Configurable event series (see kalenderSerien.ts). The id is a slug of the first name and stays fixed. */
export const kalenderSerien = pgTable('kalender_serien', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  vorlageId: text('vorlage_id')
    .notNull()
    .references(() => eventVorlagen.id),
  /** `woechentlich` or `monatlich`. */
  regel: text('regel').notNull(),
  /** Comma-separated weekdays, 0 = Sunday ... 6 = Saturday. */
  wochentage: text('wochentage').notNull(),
  /** Monthly only: comma-separated weeks 1..4 or -1 (last); empty for weekly. */
  wochen: text('wochen').notNull().default(''),
  startDatum: date('start_datum', { mode: 'string' }).notNull(),
  endDatum: date('end_datum', { mode: 'string' }),
  aktiv: boolean('aktiv').notNull().default(true),
  erstellt: timestamp('erstellt', { withTimezone: true }).notNull().defaultNow(),
});
export type KalenderSerieRow = typeof kalenderSerien.$inferSelect;

/** Days a series already created an event for; never removed, so deleted days are not recreated. */
export const serienTermine = pgTable(
  'serien_termine',
  {
    serie: text('serie').notNull(),
    datum: date('datum', { mode: 'string' }).notNull(),
    eventId: text('event_id'),
    erzeugt: timestamp('erzeugt', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.serie, t.datum] })],
);

/** Individual participation: invited by a manager and/or the member's own answer (null/'teilnahme'/'absage'). */
export const eventTeilnahmen = pgTable(
  'event_teilnahmen',
  {
    eventId: text('event_id')
      .notNull()
      .references(() => events.id),
    mitgliedSub: text('mitglied_sub')
      .notNull()
      .references(() => mitglieder.sub),
    antwort: text('antwort').$type<TeilnahmeAntwort>(),
    eingeladen: boolean('eingeladen').notNull().default(false),
    geaendertAm: timestamp('geaendert_am', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.mitgliedSub] })],
);

/** Events a member added to their own calendar feed. */
export const kalenderEventAbos = pgTable(
  'kalender_event_abos',
  {
    mitgliedSub: text('mitglied_sub')
      .notNull()
      .references(() => mitglieder.sub),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id),
  },
  (t) => [primaryKey({ columns: [t.mitgliedSub, t.eventId] })],
);

export const schichten = pgTable('schichten', {
  id: text('id').primaryKey(),
  eventId: text('event_id')
    .notNull()
    .references(() => events.id),
  art: text('art').$type<SchichtArt>().notNull(),
  beginn: timestamp('beginn', { withTimezone: true }).notNull(),
  ende: timestamp('ende', { withTimezone: true }).notNull(),
  reihenfolge: integer('reihenfolge').notNull().default(0),
  /** Head count of Aufbau/Putzen; null for Betrieb (see `schichtBedarfe`). */
  minimum: integer('minimum'),
  wunsch: integer('wunsch'),
});
export type SchichtRow = typeof schichten.$inferSelect;

export const schichtBedarfe = pgTable(
  'schicht_bedarfe',
  {
    schichtId: text('schicht_id')
      .notNull()
      .references(() => schichten.id),
    dienstformId: text('dienstform_id')
      .notNull()
      .references(() => dienstformen.id),
    minimum: integer('minimum').notNull(),
    wunsch: integer('wunsch').notNull(),
  },
  (t) => [primaryKey({ columns: [t.schichtId, t.dienstformId] })],
);
export type SchichtBedarfRow = typeof schichtBedarfe.$inferSelect;

/** One person in one Schicht; exactly one of `mitgliedSub` / `externId` is set (CHECK). */
export const dienste = pgTable('dienste', {
  id: text('id').primaryKey(),
  schichtId: text('schicht_id')
    .notNull()
    .references(() => schichten.id),
  /** Null for Dienste in Aufbau/Putzen Schichten. */
  dienstformId: text('dienstform_id').references(() => dienstformen.id),
  mitgliedSub: text('mitglied_sub').references(() => mitglieder.sub),
  externId: text('extern_id').references(() => externe.id),
  kommentar: text('kommentar'),
  eingetragenVon: text('eingetragen_von')
    .notNull()
    .references(() => mitglieder.sub),
  eingetragenAm: timestamp('eingetragen_am', { withTimezone: true }).notNull().defaultNow(),
});
export type DienstRow = typeof dienste.$inferSelect;

export const eventVorlagen = pgTable('event_vorlagen', {
  id: text('id').primaryKey(),
  /** Null (or '') = no title. */
  titel: text('titel'),
  beschreibung: text('beschreibung'),
  kategorieId: text('kategorie_id')
    .notNull()
    .references(() => eventKategorien.id),
  /** Berlin wall time `HH:MM`. */
  beginnZeit: text('beginn_zeit').notNull(),
  endeZeit: text('ende_zeit').notNull(),
  /** Participation circle handed to events (same encoding as `events.teilnahmeStatus`). */
  teilnahmeStatus: text('teilnahme_status'),
  /** Days of multi-day and whole-day events (null = 1). */
  tage: integer('tage'),
  /** Events from the Vorlage get a OneDrive photo folder by default (null = no). */
  bilderOrdner: boolean('bilder_ordner'),
  archiviert: boolean('archiviert').notNull().default(false),
});
export type EventVorlageRow = typeof eventVorlagen.$inferSelect;

export const vorlageSchichten = pgTable('vorlage_schichten', {
  id: text('id').primaryKey(),
  vorlageId: text('vorlage_id')
    .notNull()
    .references(() => eventVorlagen.id),
  art: text('art').$type<SchichtArt>().notNull(),
  tagVersatz: integer('tag_versatz').notNull(),
  beginnZeit: text('beginn_zeit').notNull(),
  endeZeit: text('ende_zeit').notNull(),
  reihenfolge: integer('reihenfolge').notNull().default(0),
  minimum: integer('minimum'),
  wunsch: integer('wunsch'),
});
export type VorlageSchichtRow = typeof vorlageSchichten.$inferSelect;

export const vorlageBedarfe = pgTable(
  'vorlage_bedarfe',
  {
    vorlageSchichtId: text('vorlage_schicht_id')
      .notNull()
      .references(() => vorlageSchichten.id),
    dienstformId: text('dienstform_id')
      .notNull()
      .references(() => dienstformen.id),
    minimum: integer('minimum').notNull(),
    wunsch: integer('wunsch').notNull(),
  },
  (t) => [primaryKey({ columns: [t.vorlageSchichtId, t.dienstformId] })],
);
export type VorlageBedarfRow = typeof vorlageBedarfe.$inferSelect;

/** Secret of the ICS subscription feed per member; only the sha256 hex hash of the token is stored. */
export const kalenderTokens = pgTable('kalender_tokens', {
  mitgliedSub: text('mitglied_sub')
    .primaryKey()
    .references(() => mitglieder.sub),
  tokenHash: text('token_hash').notNull(),
  erstellt: timestamp('erstellt', { withTimezone: true }).notNull().defaultNow(),
});

/** Short-lived secret per member for the vCard links; only the sha256 hex hash of the token is stored. */
export const vcardTokens = pgTable('vcard_tokens', {
  mitgliedSub: text('mitglied_sub')
    .primaryKey()
    .references(() => mitglieder.sub),
  tokenHash: text('token_hash').notNull(),
  ablauf: timestamp('ablauf', { withTimezone: true }).notNull(),
  erstellt: timestamp('erstellt', { withTimezone: true }).notNull().defaultNow(),
});

/** One Web Push subscription per device (generic notification module, see docs/benachrichtigungen.md). */
export const pushAbos = pgTable('push_abos', {
  id: text('id').primaryKey(),
  mitgliedSub: text('mitglied_sub')
    .notNull()
    .references(() => mitglieder.sub),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  erstellt: timestamp('erstellt', { withTimezone: true }).notNull().defaultNow(),
});

/** A member's setting of one notification type; a missing row means the default of the type. */
export const benachrichtigungEinstellungen = pgTable(
  'benachrichtigung_einstellungen',
  {
    mitgliedSub: text('mitglied_sub')
      .notNull()
      .references(() => mitglieder.sub),
    art: text('art').notNull(),
    aktiv: boolean('aktiv').notNull(),
    minuten: integer('minuten'),
  },
  (t) => [primaryKey({ columns: [t.mitgliedSub, t.art] })],
);

/** Notification history per member (kept 90 days); `gelesen` null = unread. */
export const benachrichtigungVerlauf = pgTable('benachrichtigung_verlauf', {
  id: text('id').primaryKey(),
  mitgliedSub: text('mitglied_sub')
    .notNull()
    .references(() => mitglieder.sub),
  art: text('art').notNull(),
  titel: text('titel').notNull(),
  text: text('text').notNull(),
  url: text('url').notNull(),
  /** Dedupe key of the Sendung (unique per member); null without dedupe. */
  schluessel: text('schluessel'),
  erstellt: timestamp('erstellt', { withTimezone: true }).notNull().defaultNow(),
  gelesen: timestamp('gelesen', { withTimezone: true }),
});

/** Dedupe keys of notifications that were already sent. */
export const pushVersand = pgTable('push_versand', {
  schluessel: text('schluessel').primaryKey(),
  gesendet: timestamp('gesendet', { withTimezone: true }).notNull().defaultNow(),
});

/** The VAPID key pair (single row), generated lazily by the API. */
export const pushSchluessel = pgTable('push_schluessel', {
  id: text('id').primaryKey(),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
  erstellt: timestamp('erstellt', { withTimezone: true }).notNull().defaultNow(),
});

/** OneDrive connection of the club (single row, id `onedrive`); see onedrive.ts. */
export const onedriveVerbindung = pgTable('onedrive_verbindung', {
  id: text('id').primaryKey(),
  clientId: text('client_id'),
  clientSecret: text('client_secret'),
  basisPfad: text('basis_pfad').notNull().default('Cloud4/Bilder'),
  refreshToken: text('refresh_token'),
  accessToken: text('access_token'),
  accessAblauf: timestamp('access_ablauf', { withTimezone: true }),
  konto: text('konto'),
  verbundenVon: text('verbunden_von'),
  verbundenAm: timestamp('verbunden_am', { withTimezone: true }),
  fehler: text('fehler'),
  tokenErneuertAm: timestamp('token_erneuert_am', { withTimezone: true }),
});

/** Cached anonymous read-only sharing links of the OneDrive photo folders (key: OneDrive item id). */
export const bilderFreigaben = pgTable('bilder_freigaben', {
  ordnerId: text('ordner_id').primaryKey(),
  url: text('url').notNull(),
  erstellt: timestamp('erstellt', { withTimezone: true }).notNull().defaultNow(),
});

/** Last snapshot of the OneDrive folder list (row id `liste`, `daten` = JSON array of id/name/webUrl). */
export const bilderOrdnerCache = pgTable('bilder_ordner_cache', {
  id: text('id').primaryKey(),
  daten: text('daten').notNull(),
  stand: timestamp('stand', { withTimezone: true }).notNull(),
});

/** Meeting minutes of one event (see docs/protokolle.md); `inhalt` is the TipTap document and `kopf` the header, both JSON text. */
export const protokolle = pgTable('protokolle', {
  id: text('id').primaryKey(),
  /** Event of a Kategorie with `protokoll`; unique, deliberately without a foreign key (checked in the API). */
  eventId: text('event_id').notNull(),
  inhalt: text('inhalt').notNull(),
  kopf: text('kopf').notNull(),
  /** `entwurf` or `abgeschlossen` (CHECK). */
  status: text('status').$type<'entwurf' | 'abgeschlossen'>().notNull().default('entwurf'),
  /** Counts saves, for optimistic locking. */
  version: integer('version').notNull().default(1),
  /** Cognito subs, deliberately without a foreign key. */
  erstelltVon: text('erstellt_von'),
  erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
  geaendertVon: text('geaendert_von'),
  geaendertAm: timestamp('geaendert_am', { withTimezone: true }).notNull().defaultNow(),
});
export type ProtokollRow = typeof protokolle.$inferSelect;

/** Global "Dienste fehlen" reminders; `id` is `erinnerung-<minutenVorher>`. */
export const kalenderFehltErinnerungen = pgTable('kalender_fehlt_erinnerungen', {
  id: text('id').primaryKey(),
  minutenVorher: integer('minuten_vorher').notNull(),
});

// ---------------------------------------------------------------------------
// Schlüssel

/** Club key; the holder is a member (`halterSub`), a person without the app (`halterName`) or nobody. */
export const schluessel = pgTable('schluessel', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  beschreibung: text('beschreibung'),
  halterSub: text('halter_sub').references(() => mitglieder.sub),
  halterName: text('halter_name'),
  halterSeit: timestamp('halter_seit', { withTimezone: true }),
  archiviert: boolean('archiviert').notNull().default(false),
});
export type SchluesselRow = typeof schluessel.$inferSelect;

/** Newest handovers per key (older ones are deleted by the API). */
export const schluesselUebergaben = pgTable('schluessel_uebergaben', {
  id: text('id').primaryKey(),
  schluesselId: text('schluessel_id')
    .notNull()
    .references(() => schluessel.id),
  vonSub: text('von_sub').references(() => mitglieder.sub),
  vonName: text('von_name'),
  anSub: text('an_sub').references(() => mitglieder.sub),
  anName: text('an_name'),
  /** Cognito sub, deliberately without a foreign key. */
  eingetragenVon: text('eingetragen_von').notNull(),
  zeitpunkt: timestamp('zeitpunkt', { withTimezone: true }).notNull().defaultNow(),
});
export type UebergabeRow = typeof schluesselUebergaben.$inferSelect;

/** Key request: `art` 'bedarf' (needs a key, `schluesselId` optional) or 'abgabe' (hands one over). */
export const schluesselAnfragen = pgTable('schluessel_anfragen', {
  id: text('id').primaryKey(),
  art: text('art').$type<'bedarf' | 'abgabe'>().notNull(),
  erstellerSub: text('ersteller_sub')
    .notNull()
    .references(() => mitglieder.sub),
  schluesselId: text('schluessel_id').references(() => schluessel.id),
  datum: date('datum', { mode: 'string' }).notNull(),
  /** `HH:MM` (Berlin); both null = all day. */
  ab: text('ab'),
  bis: text('bis'),
  notiz: text('notiz'),
  status: text('status')
    .$type<'offen' | 'vergeben' | 'zurueckgezogen'>()
    .notNull()
    .default('offen'),
  erstellt: timestamp('erstellt', { withTimezone: true }).notNull().defaultNow(),
  /** When the push (or its hourly repeat) last went out. */
  erinnert: timestamp('erinnert', { withTimezone: true }).notNull().defaultNow(),
});
export type SchluesselAnfrageRow = typeof schluesselAnfragen.$inferSelect;

/** One answer per member and request (unique `anfrage_id` + `sub`). */
export const schluesselAntworten = pgTable('schluessel_antworten', {
  id: text('id').primaryKey(),
  anfrageId: text('anfrage_id')
    .notNull()
    .references(() => schluesselAnfragen.id),
  sub: text('sub')
    .notNull()
    .references(() => mitglieder.sub),
  art: text('art').$type<'zusage' | 'ablehnung' | 'gegenvorschlag'>().notNull(),
  datum: date('datum', { mode: 'string' }),
  ab: text('ab'),
  bis: text('bis'),
  notiz: text('notiz'),
  /** The key a responder offers for a Bedarf without a named key. */
  schluesselId: text('schluessel_id').references(() => schluessel.id),
  erstellt: timestamp('erstellt', { withTimezone: true }).notNull().defaultNow(),
});
export type SchluesselAntwortRow = typeof schluesselAntworten.$inferSelect;

/** Planned handover: the key goes to `anSub` at the given time. */
export const schluesselPlanungen = pgTable('schluessel_planungen', {
  id: text('id').primaryKey(),
  schluesselId: text('schluessel_id')
    .notNull()
    .references(() => schluessel.id),
  anSub: text('an_sub')
    .notNull()
    .references(() => mitglieder.sub),
  datum: date('datum', { mode: 'string' }).notNull(),
  ab: text('ab'),
  bis: text('bis'),
  notiz: text('notiz'),
  anfrageId: text('anfrage_id').references(() => schluesselAnfragen.id),
  /** Cognito sub, deliberately without a foreign key. */
  erstelltVon: text('erstellt_von').notNull(),
  erstellt: timestamp('erstellt', { withTimezone: true }).notNull().defaultNow(),
});
export type SchluesselPlanungRow = typeof schluesselPlanungen.$inferSelect;

// ---------------------------------------------------------------------------
// Todos

/** A Todo (see docs/todos.md); the people it is for are in `todoZustaendige`. */
export const todos = pgTable('todos', {
  id: text('id').primaryKey(),
  titel: text('titel').notNull(),
  notizen: text('notizen'),
  /** `YYYY-MM-DD` */
  faelligAm: text('faellig_am').notNull(),
  /** `gemeinsam` or `einzeln` (CHECK). */
  modus: text('modus').$type<'gemeinsam' | 'einzeln'>().notNull(),
  /** Protocol and Baustein the Todo comes from, deliberately without a foreign key; null = created by a member. */
  protokollId: text('protokoll_id'),
  bausteinId: text('baustein_id'),
  /** Mode `gemeinsam`: when and by whom (Cognito sub) it was ticked. */
  erledigtAm: timestamp('erledigt_am', { withTimezone: true }),
  erledigtVon: text('erledigt_von'),
  /** Cognito sub, deliberately without a foreign key. */
  erstelltVon: text('erstellt_von').notNull(),
  erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
  geaendertAm: timestamp('geaendert_am', { withTimezone: true }).notNull().defaultNow(),
});
export type TodoRow = typeof todos.$inferSelect;

/** A person a Todo is for; in mode `einzeln` their own tick. */
export const todoZustaendige = pgTable(
  'todo_zustaendige',
  {
    todoId: text('todo_id')
      .notNull()
      .references(() => todos.id),
    sub: text('sub').notNull(),
    erledigtAm: timestamp('erledigt_am', { withTimezone: true }),
    erledigtVon: text('erledigt_von'),
  },
  (t) => [primaryKey({ columns: [t.todoId, t.sub] })],
);
export type TodoZustaendigerRow = typeof todoZustaendige.$inferSelect;

// ---------------------------------------------------------------------------
// Umfragen

/** A poll; runs until the end of `endetAm` (Berlin) unless `beendetAm` is set. */
export const umfragen = pgTable('umfragen', {
  id: text('id').primaryKey(),
  titel: text('titel').notNull(),
  beschreibung: text('beschreibung'),
  erstellerSub: text('ersteller_sub')
    .notNull()
    .references(() => mitglieder.sub),
  erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
  endetAm: date('endet_am', { mode: 'string' }).notNull(),
  beendetAm: timestamp('beendet_am', { withTimezone: true }),
  anonym: boolean('anonym').notNull(),
  ergebnisse: text('ergebnisse').$type<UmfrageErgebnisse>().notNull(),
  /** Comma-separated statuses of the circles. */
  pflichtStatus: text('pflicht_status').notNull().default(''),
  optionalStatus: text('optional_status').notNull().default(''),
  /** Comma-separated days before the end. */
  erinnerungenPflicht: text('erinnerungen_pflicht').notNull().default(''),
  erinnerungenOptional: text('erinnerungen_optional').notNull().default(''),
  /** Scheduling without an event. */
  terminFrei: boolean('termin_frei').notNull().default(false),
});
export type UmfrageRow = typeof umfragen.$inferSelect;

/** Posten (`art` posten, `ref` = Posten id) and members (`art` person, `ref` = sub) in a circle. */
export const umfrageKreis = pgTable(
  'umfrage_kreis',
  {
    umfrageId: text('umfrage_id')
      .notNull()
      .references(() => umfragen.id),
    pflicht: boolean('pflicht').notNull(),
    art: text('art').$type<'posten' | 'person'>().notNull(),
    ref: text('ref').notNull(),
  },
  (t) => [primaryKey({ columns: [t.umfrageId, t.pflicht, t.art, t.ref] })],
);

export const umfrageFragen = pgTable('umfrage_fragen', {
  id: text('id').primaryKey(),
  umfrageId: text('umfrage_id')
    .notNull()
    .references(() => umfragen.id),
  position: integer('position').notNull(),
  text: text('text').notNull(),
  freitext: boolean('freitext').notNull(),
  /** Null = all answers may be picked. */
  maxAntworten: integer('max_antworten'),
});

export const umfrageOptionen = pgTable('umfrage_optionen', {
  id: text('id').primaryKey(),
  frageId: text('frage_id')
    .notNull()
    .references(() => umfrageFragen.id),
  position: integer('position').notNull(),
  text: text('text').notNull(),
});

/** Who voted; `erneutNoetig` once an edit invalidated the vote. */
export const umfrageAbgaben = pgTable(
  'umfrage_abgaben',
  {
    umfrageId: text('umfrage_id')
      .notNull()
      .references(() => umfragen.id),
    mitgliedSub: text('mitglied_sub')
      .notNull()
      .references(() => mitglieder.sub),
    abgegebenAm: timestamp('abgegeben_am', { withTimezone: true }).notNull().defaultNow(),
    erneutNoetig: boolean('erneut_noetig').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.umfrageId, t.mitgliedSub] })],
);

/** One answer: an option, or a free text when `optionId` is null. */
export const umfrageStimmen = pgTable('umfrage_stimmen', {
  id: text('id').primaryKey(),
  umfrageId: text('umfrage_id')
    .notNull()
    .references(() => umfragen.id),
  frageId: text('frage_id')
    .notNull()
    .references(() => umfrageFragen.id),
  mitgliedSub: text('mitglied_sub')
    .notNull()
    .references(() => mitglieder.sub),
  optionId: text('option_id').references(() => umfrageOptionen.id),
  freitext: text('freitext'),
});

/** Scheduling poll settings; `eventId`/`optionId` once the chosen date became an event. */
export const umfrageTermine = pgTable('umfrage_termine', {
  umfrageId: text('umfrage_id')
    .primaryKey()
    .references(() => umfragen.id),
  kategorieId: text('kategorie_id').notNull(),
  /** Event created from this Vorlage (its Kategorie is `kategorieId`); null = Kategorie and Bedarf. */
  vorlageId: text('vorlage_id'),
  jeTermin: boolean('je_termin').notNull(),
  beginn: text('beginn'),
  ende: text('ende'),
  dienstformId: text('dienstform_id'),
  minimum: integer('minimum'),
  wunsch: integer('wunsch'),
  eventId: text('event_id'),
  optionId: text('option_id'),
});

/** The date of an answer in a scheduling poll. */
export const umfrageOptionTermine = pgTable('umfrage_option_termine', {
  optionId: text('option_id')
    .primaryKey()
    .references(() => umfrageOptionen.id),
  datum: date('datum', { mode: 'string' }).notNull(),
  /** Last day of a multi-day date; null for one-day Kategorien. */
  bis: date('bis', { mode: 'string' }),
  beginn: text('beginn'),
  ende: text('ende'),
  /** Optional name shown with the date. */
  name: text('name'),
});

// ---------------------------------------------------------------------------
// Trichter

/** A funnel; volume in whole millilitres. Archived ones stay in the ranking. */
export const trichter = pgTable('trichter', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  volumenMl: integer('volumen_ml').notNull(),
  auslaesse: integer('auslaesse').notNull(),
  archiviert: boolean('archiviert').notNull().default(false),
  erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
});
export type TrichterRow = typeof trichter.$inferSelect;

/** One funnel session; `volumenMl` is the total, shared by the participants. */
export const trichterDurchgaenge = pgTable('trichter_durchgaenge', {
  id: text('id').primaryKey(),
  trichterId: text('trichter_id')
    .notNull()
    .references(() => trichter.id),
  volumenMl: integer('volumen_ml').notNull(),
  zeitpunkt: timestamp('zeitpunkt', { withTimezone: true }).notNull().defaultNow(),
  /** Cognito sub, deliberately without a foreign key. */
  eingetragenVon: text('eingetragen_von').notNull(),
  eingetragenAm: timestamp('eingetragen_am', { withTimezone: true }).notNull().defaultNow(),
});
export type TrichterDurchgangRow = typeof trichterDurchgaenge.$inferSelect;

export const trichterTeilnahmen = pgTable(
  'trichter_teilnahmen',
  {
    durchgangId: text('durchgang_id')
      .notNull()
      .references(() => trichterDurchgaenge.id),
    // No foreign key: accounts without a profile row may take part too.
    mitgliedSub: text('mitglied_sub').notNull(),
  },
  (t) => [primaryKey({ columns: [t.durchgangId, t.mitgliedSub] })],
);

// ---------------------------------------------------------------------------
// Privatpartys (see docs/privatpartys.md); no foreign keys, references are checked in the API.

/** An external person who rents the club for a private party. */
export const privatpartyPersonen = pgTable('privatparty_personen', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email'),
  /** Free text: phone, Instagram, ... */
  kontakt: text('kontakt'),
  notizen: text('notizen'),
  /** Cognito sub. */
  angelegtVon: text('angelegt_von'),
  angelegtAm: timestamp('angelegt_am', { withTimezone: true }).notNull().defaultNow(),
  aktualisiertAm: timestamp('aktualisiert_am', { withTimezone: true }).notNull().defaultNow(),
});
export type PrivatpartyPersonRow = typeof privatpartyPersonen.$inferSelect;

/** A request for a private party; `personId` is null for blank entries (e.g. created from a mail). */
export const privatpartys = pgTable('privatpartys', {
  id: text('id').primaryKey(),
  personId: text('person_id'),
  anlass: text('anlass'),
  notizen: text('notizen'),
  /** `offen`, `zugesagt` or `abgesagt` (CHECK). */
  status: text('status').$type<PrivatpartyStatus>().notNull().default('offen'),
  /** The accepted wish date (`privatparty_termine.id`). */
  terminId: text('termin_id'),
  umfrageId: text('umfrage_id'),
  eventId: text('event_id'),
  /** Where replies go: Reply-To / From of the last incoming mail. */
  mailAdresse: text('mail_adresse'),
  letzteNachrichtAm: timestamp('letzte_nachricht_am', { withTimezone: true }),
  angelegtVon: text('angelegt_von'),
  angelegtAm: timestamp('angelegt_am', { withTimezone: true }).notNull().defaultNow(),
  aktualisiertAm: timestamp('aktualisiert_am', { withTimezone: true }).notNull().defaultNow(),
});
export type PrivatpartyRow = typeof privatpartys.$inferSelect;

/** Wish date with Berlin wall times `HH:MM` (`ende` before `beginn` = next day). */
export const privatpartyTermine = pgTable('privatparty_termine', {
  id: text('id').primaryKey(),
  privatpartyId: text('privatparty_id').notNull(),
  datum: date('datum', { mode: 'string' }).notNull(),
  beginn: text('beginn').notNull(),
  ende: text('ende').notNull(),
  /** `bevorzugt`, `moeglich` or `notfalls` (CHECK). */
  stufe: text('stufe').$type<PrivatpartyStufe>().notNull(),
  /** Keeps the entered order. */
  position: integer('position').notNull().default(0),
});
export type PrivatpartyTerminRow = typeof privatpartyTermine.$inferSelect;

/** Mails of a request (filled by the mail job); `anhaenge` are file names as JSON text. */
export const privatpartyNachrichten = pgTable('privatparty_nachrichten', {
  id: text('id').primaryKey(),
  privatpartyId: text('privatparty_id').notNull(),
  /** `ein` or `aus` (CHECK). */
  richtung: text('richtung').$type<'ein' | 'aus'>().notNull(),
  /** Unique index. */
  messageId: text('message_id').notNull(),
  inReplyTo: text('in_reply_to'),
  referenzen: text('referenzen'),
  vonAdresse: text('von_adresse'),
  vonName: text('von_name'),
  anAdresse: text('an_adresse'),
  betreff: text('betreff'),
  text: text('text').notNull().default(''),
  anhaenge: text('anhaenge'),
  zeitpunkt: timestamp('zeitpunkt', { withTimezone: true }).notNull().defaultNow(),
  /** Cognito sub of the sender of an outgoing mail. */
  mitgliedSub: text('mitglied_sub'),
});
export type PrivatpartyNachrichtRow = typeof privatpartyNachrichten.$inferSelect;

/** State of the mail job: one row with id `partymail`. */
export const mailAbruf = pgTable('mail_abruf', {
  id: text('id').primaryKey(),
  uidValidity: text('uid_validity'),
  letzteUid: bigint('letzte_uid', { mode: 'number' }).notNull().default(0),
  letzterAbruf: timestamp('letzter_abruf', { withTimezone: true }),
  fehler: text('fehler'),
});

// ----- Finanzen (see docs/finanzen.md): append-only journal with a hash chain. Money is whole
// cents; bigint columns are mapped to numbers (safe: amounts are capped far below 2^53).

/** Chart of accounts. `art` has a CHECK constraint without `buch`. */
export const finKonten = pgTable('fin_konten', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  art: text('art').$type<KontoArt>().notNull(),
  parentId: text('parent_id').references((): AnyPgColumn => finKonten.id),
  stueckelung: boolean('stueckelung').notNull().default(false),
  /** Basis points, 1900 = 19 %. */
  steuersatzStandard: integer('steuersatz_standard'),
  archiviert: boolean('archiviert').notNull().default(false),
  erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull().defaultNow(),
});
export type FinKontoRow = typeof finKonten.$inferSelect;

/** Journal entry; rows are only ever inserted. `seq` and `storno_von` have unique indexes. */
export const finBuchungen = pgTable('fin_buchungen', {
  id: text('id').primaryKey(),
  seq: bigint('seq', { mode: 'number' }).notNull(),
  datum: date('datum', { mode: 'string' }).notNull(),
  text: text('text').notNull(),
  quelleTyp: text('quelle_typ').notNull(),
  quelleId: text('quelle_id'),
  eventId: text('event_id').references(() => events.id),
  stornoVon: text('storno_von').references((): AnyPgColumn => finBuchungen.id),
  /** Cognito sub, deliberately without a foreign key (like `bestandsvorgaenge`). */
  erstelltVon: text('erstellt_von').notNull(),
  /** Truncated to milliseconds: it is part of the hash. */
  erstelltAm: timestamp('erstellt_am', { withTimezone: true }).notNull(),
  prevHash: text('prev_hash').notNull(),
  hash: text('hash').notNull(),
  /** Technical, not part of the hash; unique index. NULL for system bookings. */
  idempotenzSchluessel: text('idempotenz_schluessel'),
});
export type FinBuchungRow = typeof finBuchungen.$inferSelect;

export const finBuchungszeilen = pgTable('fin_buchungszeilen', {
  id: text('id').primaryKey(),
  buchungId: text('buchung_id')
    .notNull()
    .references(() => finBuchungen.id),
  pos: integer('pos').notNull(),
  kontoId: text('konto_id')
    .notNull()
    .references(() => finKonten.id),
  betragCent: bigint('betrag_cent', { mode: 'number' }).notNull(),
  nettoCent: bigint('netto_cent', { mode: 'number' }),
  steuerCent: bigint('steuer_cent', { mode: 'number' }),
  steuersatz: integer('steuersatz'),
  steuerArt: text('steuer_art').$type<SteuerArt>().notNull().default('keine'),
});
export type FinBuchungszeileRow = typeof finBuchungszeilen.$inferSelect;

export const finStueckelung = pgTable(
  'fin_stueckelung',
  {
    zeileId: text('zeile_id')
      .notNull()
      .references(() => finBuchungszeilen.id),
    nennwertCent: integer('nennwert_cent').notNull(),
    anzahl: integer('anzahl').notNull(),
  },
  (t) => [primaryKey({ columns: [t.zeileId, t.nennwertCent] })],
);

/** Protocol of a cash count of a Fach (insert-only). `buchungId`: the difference booking, if any. */
export const finZaehlungen = pgTable('fin_zaehlungen', {
  id: text('id').primaryKey(),
  kontoId: text('konto_id')
    .notNull()
    .references(() => finKonten.id),
  datum: date('datum', { mode: 'string' }).notNull(),
  text: text('text'),
  /** Cognito sub, deliberately without a foreign key. */
  gezaehltVon: text('gezaehlt_von').notNull(),
  gezaehltAm: timestamp('gezaehlt_am', { withTimezone: true }).notNull(),
  sollCent: bigint('soll_cent', { mode: 'number' }).notNull(),
  istCent: bigint('ist_cent', { mode: 'number' }).notNull(),
  differenzCent: bigint('differenz_cent', { mode: 'number' }).notNull(),
  buchungId: text('buchung_id').references(() => finBuchungen.id),
  /** Set by a count at an event (later slice). */
  eventId: text('event_id').references(() => events.id),
  /** Unique index. */
  idempotenzSchluessel: text('idempotenz_schluessel').notNull(),
});
export type FinZaehlungRow = typeof finZaehlungen.$inferSelect;

export const finZaehlungPosten = pgTable(
  'fin_zaehlung_posten',
  {
    zaehlungId: text('zaehlung_id')
      .notNull()
      .references(() => finZaehlungen.id),
    nennwertCent: integer('nennwert_cent').notNull(),
    sollAnzahl: integer('soll_anzahl').notNull(),
    istAnzahl: integer('ist_anzahl').notNull(),
  },
  (t) => [primaryKey({ columns: [t.zaehlungId, t.nennwertCent] })],
);

/** Counter rows; 'journal' holds the last `seq` and the hash of the last entry. */
export const finZaehler = pgTable('fin_zaehler', {
  name: text('name').primaryKey(),
  wert: bigint('wert', { mode: 'number' }).notNull(),
  letzterHash: text('letzter_hash').notNull(),
});
