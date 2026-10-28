import {
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
  IfcoGrundflaeche,
  LagerortArt,
  MhdArt,
  SchichtArt,
  MitgliedStatus,
  Quelle,
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
  status: text('status').$type<MitgliedStatus>().notNull().default('anwaerter'),
  aktualisiertAm: timestamp('aktualisiert_am', { withTimezone: true }).notNull().defaultNow(),
});
export type MitgliedRow = typeof mitglieder.$inferSelect;

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
  titel: text('titel').notNull(),
  beschreibung: text('beschreibung'),
  kategorieId: text('kategorie_id').references(() => eventKategorien.id),
  beginn: timestamp('beginn', { withTimezone: true }).notNull(),
  ende: timestamp('ende', { withTimezone: true }).notNull(),
  abgesagt: boolean('abgesagt').notNull().default(false),
  /** Cognito sub, deliberately without a foreign key. */
  angelegtVon: text('angelegt_von').notNull(),
  angelegtAm: timestamp('angelegt_am', { withTimezone: true }).notNull().defaultNow(),
  aktualisiertAm: timestamp('aktualisiert_am', { withTimezone: true }).notNull().defaultNow(),
});
export type EventRow = typeof events.$inferSelect;

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
  titel: text('titel').notNull(),
  beschreibung: text('beschreibung'),
  kategorieId: text('kategorie_id').references(() => eventKategorien.id),
  /** Berlin wall time `HH:MM`. */
  beginnZeit: text('beginn_zeit').notNull(),
  endeZeit: text('ende_zeit').notNull(),
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

/** Global "Dienste fehlen" reminders; `id` is `erinnerung-<minutenVorher>`. */
export const kalenderFehltErinnerungen = pgTable('kalender_fehlt_erinnerungen', {
  id: text('id').primaryKey(),
  minutenVorher: integer('minuten_vorher').notNull(),
});
