import { DsqlSigner } from '@aws-sdk/dsql-signer';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Config } from '../config';
import * as schema from './schema';
import { transaktionenWiederholen } from './wiederholung';

/** Pool authenticating with a short-lived IAM token (generated per new connection). */
export function createPool(config: Pick<Config, 'region' | 'dsqlEndpoint'>): pg.Pool {
  const signer = new DsqlSigner({ hostname: config.dsqlEndpoint, region: config.region });
  return new pg.Pool({
    host: config.dsqlEndpoint,
    port: 5432,
    user: 'admin',
    database: 'postgres',
    password: () => signer.getDbConnectAdminAuthToken(),
    ssl: { rejectUnauthorized: true },
    max: 2,
    idleTimeoutMillis: 10_000,
  });
}

export function createDb(pool: pg.Pool) {
  // Top-level transactions retry on DSQL concurrency conflicts (docs/datenbank.md).
  return transaktionenWiederholen(drizzle(pool, { schema }));
}
export type Db = ReturnType<typeof createDb>;
