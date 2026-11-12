import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Whether the error is an Aurora DSQL optimistic concurrency conflict: SQLSTATE 40001 (serialization
 * failure), or the DSQL codes OC000 (data conflict) / OC001 (schema changed by another transaction)
 * in the message.
 */
export const istKonflikt = (err: unknown): boolean => {
  // Drizzle wraps driver errors (`DrizzleQueryError`) and keeps the original as `cause`.
  for (
    let e = err as { code?: unknown; message?: unknown; cause?: unknown } | undefined, i = 0;
    e && i < 5;
    i++
  ) {
    if (e.code === '40001') return true;
    if (typeof e.message === 'string' && /\bOC00[01]\b/.test(e.message)) return true;
    e = e.cause as typeof e;
  }
  return false;
};

/** The SQLSTATE of the error or of the first `cause` that has one (drizzle wraps driver errors). */
export const sqlState = (err: unknown): string | undefined => {
  for (let e = err as { code?: unknown; cause?: unknown } | undefined, i = 0; e && i < 5; i++) {
    if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) return e.code;
    e = e.cause as typeof e;
  }
  return undefined;
};

/** Unique violation (23505) or foreign-key violation (23503): the data changed since it was read. */
export const istDatenAbweichung = (err: unknown): boolean => {
  const code = sqlState(err);
  return code === '23505' || code === '23503';
};

/** True while an action runs inside `mitWiederholung`, so that retries are not nested. */
const laeuft = new AsyncLocalStorage<true>();
export const inWiederholung = (): boolean => laeuft.getStore() === true;

const schlafen = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Runs `aktion` and retries it on DSQL concurrency conflicts (up to `versuche` attempts in total).
 * Wait time doubles per attempt from `basisMs` and is randomised ("jitter", 50-100 %) so that
 * competing transactions do not collide again in lockstep. `aktion` must be safe to repeat: DDL
 * with `IF NOT EXISTS` / `ON CONFLICT`, or a whole database transaction that rolled back.
 */
export async function mitWiederholung<T>(
  aktion: () => Promise<T>,
  versuche = 5,
  warten: (ms: number) => Promise<unknown> = schlafen,
  basisMs = 500,
  zufall: () => number = Math.random,
): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await laeuft.run(true, aktion);
    } catch (err) {
      if (!istKonflikt(err) || i >= versuche) throw err;
      await warten(Math.round(basisMs * 2 ** (i - 1) * (0.5 + zufall() / 2)));
    }
  }
}

/** Total attempts and first wait of a top-level transaction (worst case well under a second). */
export const TRANSAKTION_VERSUCHE = 3;
export const TRANSAKTION_WARTEN_MS = 100;

/**
 * Makes `db.transaction` retry on concurrency conflicts (see `mitWiederholung`). The callback can
 * therefore run more than once and must only do database work. Nested `tx.transaction` calls
 * (savepoints) are untouched, and a transaction started inside an explicit `mitWiederholung` runs
 * once per attempt of that outer retry instead of multiplying the attempts. Returns the same `db`.
 */
export function transaktionenWiederholen<D extends { transaction: (...args: never[]) => unknown }>(
  db: D,
  warten?: (ms: number) => Promise<unknown>,
): D {
  const original = db.transaction.bind(db) as (...args: unknown[]) => Promise<unknown>;
  db.transaction = ((...args: unknown[]) =>
    inWiederholung()
      ? original(...args)
      : mitWiederholung(
          () => original(...args),
          TRANSAKTION_VERSUCHE,
          warten,
          TRANSAKTION_WARTEN_MS,
        )) as D['transaction'];
  return db;
}
