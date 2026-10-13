import { boolean, date, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import type { Anrede, MitgliedStatus } from '@c4/shared';

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
  /** Period in which the Posten's permissions apply; null falls back to start / end of the Besetzung. */
  rechteVon: date('rechte_von', { mode: 'string' }),
  rechteBis: date('rechte_bis', { mode: 'string' }),
});
export type BesetzungRow = typeof postenBesetzungen.$inferSelect;
