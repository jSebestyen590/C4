import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { Anrede, MitgliedStatus } from '@c4/shared';

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
