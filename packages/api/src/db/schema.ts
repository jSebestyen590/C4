import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Placeholder table; real domain tables go here. DSQL: no foreign keys, no sequences. */
export const appInfo = pgTable('app_info', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** One row per member, keyed by the Cognito `sub`. */
export const mitglieder = pgTable('mitglieder', {
  sub: text('sub').primaryKey(),
  vorname: text('vorname').notNull(),
  nachname: text('nachname').notNull(),
  spitzname: text('spitzname'),
  adresse: text('adresse'),
  telefon: text('telefon'),
  ueberMich: text('ueber_mich'),
  profilbildKey: text('profilbild_key'),
  aktualisiertAm: timestamp('aktualisiert_am', { withTimezone: true }).notNull().defaultNow(),
});
export type MitgliedRow = typeof mitglieder.$inferSelect;
