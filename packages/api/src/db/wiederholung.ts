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
      return await aktion();
    } catch (err) {
      if (!istKonflikt(err) || i >= versuche) throw err;
      await warten(Math.round(basisMs * 2 ** (i - 1) * (0.5 + zufall() / 2)));
    }
  }
}
