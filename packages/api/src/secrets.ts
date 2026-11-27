import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import type { z } from 'zod';

const CACHE_MS = 5 * 60_000;

/**
 * Reads (and caches for 5 minutes) a JSON secret from Secrets Manager; undefined when unset,
 * empty or unusable (logged under `name`).
 */
export function createSecretLeser<T>(
  secretArn: string | undefined,
  region: string,
  schema: z.ZodType<T>,
  name: string,
) {
  let cache: { bis: number; wert: T | undefined } | undefined;
  const client = secretArn ? new SecretsManagerClient({ region }) : undefined;
  return async (): Promise<T | undefined> => {
    if (!client || !secretArn) return undefined;
    if (cache && cache.bis > Date.now()) return cache.wert;
    let wert: T | undefined;
    try {
      const res = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
      if (res.SecretString) {
        const geparst = schema.safeParse(JSON.parse(res.SecretString));
        if (geparst.success) wert = geparst.data;
        else console.error(`${name} secret is incomplete`, geparst.error.issues[0]);
      }
    } catch (err) {
      // An empty secret (no version yet) lands here, too.
      console.error(`${name} secret could not be read`, err instanceof Error ? err.name : err);
    }
    cache = { bis: Date.now() + CACHE_MS, wert };
    return wert;
  };
}
