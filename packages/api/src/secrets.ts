import {
  GetSecretValueCommand,
  PutSecretValueCommand,
  ResourceNotFoundException,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

/** The secrets the API owns (see docs/datenbank.md, "Geheimnisse"). */
export type GeheimnisName = 'onedrive' | 'vapid';

/** JSON secrets in AWS Secrets Manager (or a stand-in). `get` returns null while a secret is empty. */
export interface SecretStore {
  /** `frisch` skips the cache (needed before rotating a token another instance may have rotated). */
  get<T>(name: GeheimnisName, frisch?: boolean): Promise<T | null>;
  put(name: GeheimnisName, wert: unknown): Promise<void>;
}

const CACHE_MS = 30_000;

export interface SecretStoreOptionen {
  region: string;
  /** Secret ARN per name; a name without ARN falls back to memory (local development). */
  arns: Partial<Record<GeheimnisName, string>>;
  ttlMs?: number;
  now?: () => number;
  client?: Pick<SecretsManagerClient, 'send'>;
}

/**
 * Secrets Manager backed store with a short in-memory cache. Without an ARN for a name, values live
 * only in memory (local development, where no secret exists).
 */
export function createSecretStore(opt: SecretStoreOptionen): SecretStore {
  const ttl = opt.ttlMs ?? CACHE_MS;
  const now = opt.now ?? Date.now;
  const client = opt.client ?? new SecretsManagerClient({ region: opt.region });
  const cache = new Map<GeheimnisName, { bis: number; wert: unknown }>();
  return {
    async get<T>(name: GeheimnisName, frisch = false) {
      const treffer = cache.get(name);
      const arn = opt.arns[name];
      if (!arn) return (treffer?.wert as T | undefined) ?? null;
      if (!frisch && treffer && treffer.bis > now()) return treffer.wert as T | null;
      let wert: T | null = null;
      try {
        const res = await client.send(new GetSecretValueCommand({ SecretId: arn }));
        if (res.SecretString?.trim()) wert = JSON.parse(res.SecretString) as T;
      } catch (err) {
        // A secret without a version yet is empty, not broken.
        if (!(err instanceof ResourceNotFoundException)) throw err;
      }
      cache.set(name, { bis: now() + ttl, wert });
      return wert;
    },
    async put(name, wert) {
      const arn = opt.arns[name];
      if (arn) {
        await client.send(
          new PutSecretValueCommand({ SecretId: arn, SecretString: JSON.stringify(wert) }),
        );
      }
      cache.set(name, { bis: now() + ttl, wert });
    },
  };
}

/** In-memory stand-in for tests; `werte` is exposed for assertions. */
export function createMemorySecretStore(
  start: Partial<Record<GeheimnisName, unknown>> = {},
): SecretStore & { werte: Map<GeheimnisName, unknown> } {
  const werte = new Map<GeheimnisName, unknown>(
    Object.entries(start) as [GeheimnisName, unknown][],
  );
  return {
    werte,
    async get<T>(name: GeheimnisName) {
      return (werte.get(name) as T | undefined) ?? null;
    },
    async put(name, wert) {
      werte.set(name, JSON.parse(JSON.stringify(wert)));
    },
  };
}
