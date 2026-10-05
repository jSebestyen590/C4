import { pgTable, text } from 'drizzle-orm/pg-core';

/** Placeholder table; real domain tables go here. DSQL: no foreign keys, no sequences. */
export const appInfo = pgTable('app_info', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
