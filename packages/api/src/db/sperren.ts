import { sql } from 'drizzle-orm';
import type { Db } from './client';
import { sperren } from './schema';

/** Sorted, de-duplicated keys: every transaction writes them in the same order. */
export const sperrSchluessel = (schluessel: readonly string[]): string[] =>
  [...new Set(schluessel)].sort();

/**
 * Aurora DSQL has no row locks and only detects conflicts on rows two transactions both write. A
 * check-then-insert would never conflict, so the transaction first touches a key per contended
 * thing here: a concurrent transaction touching the same key conflicts, and the retry (see
 * `db/wiederholung.ts`) then sees the other's result in its check. Call it inside the transaction,
 * before the check.
 */
export async function sperreBeruehren(
  tx: Pick<Db, 'insert'>,
  ...schluessel: string[]
): Promise<void> {
  const keys = sperrSchluessel(schluessel);
  if (keys.length === 0) return;
  const beruehrtAm = new Date();
  await tx
    .insert(sperren)
    .values(keys.map((k) => ({ schluessel: k, beruehrtAm })))
    .onConflictDoUpdate({
      target: sperren.schluessel,
      set: { beruehrtAm: sql`excluded.beruehrt_am` },
    });
}
