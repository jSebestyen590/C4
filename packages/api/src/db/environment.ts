import type pg from 'pg';

/** Records which environment (dev/prod) a database belongs to; used to protect prod from reset/rollback. */
export async function markEnvironment(pool: Pick<pg.Pool, 'query'>, env: string): Promise<void> {
  await pool.query(
    "INSERT INTO app_info (key, value) VALUES ('env', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [env],
  );
}

/** Throws when the database is marked as prod. A missing table or row means "not marked": proceed. */
export async function assertNotProd(pool: Pick<pg.Pool, 'query'>, action: string): Promise<void> {
  let env: string | undefined;
  try {
    const { rows } = await pool.query<{ value: string }>(
      "SELECT value FROM app_info WHERE key = 'env'",
    );
    env = rows[0]?.value;
  } catch (err) {
    // 42P01 = undefined_table (fresh database).
    if ((err as { code?: string }).code === '42P01') return;
    throw err;
  }
  if (env === 'prod') {
    throw new Error(`Refusing to ${action}: this database is marked as prod (app_info.env).`);
  }
}
