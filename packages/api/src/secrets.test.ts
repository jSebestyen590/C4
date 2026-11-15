import { ResourceNotFoundException } from '@aws-sdk/client-secrets-manager';
import { describe, expect, it } from 'vitest';
import { createVapidLeser } from './benachrichtigungen';
import { createOneDriveStore } from './onedrive';
import { createMemorySecretStore, createSecretStore } from './secrets';
import type { Db } from './db/client';

/** Secrets Manager client stand-in: one secret, records the calls. */
function fakeClient(start?: string) {
  let wert = start;
  const aufrufe: string[] = [];
  return {
    aufrufe,
    client: {
      send: async (cmd: { constructor: { name: string }; input: { SecretString?: string } }) => {
        aufrufe.push(cmd.constructor.name);
        if (cmd.constructor.name === 'PutSecretValueCommand') {
          wert = cmd.input.SecretString;
          return {};
        }
        if (wert === undefined)
          throw new ResourceNotFoundException({ message: 'no version', $metadata: {} });
        return { SecretString: wert };
      },
    } as never,
  };
}

describe('secret store', () => {
  it('treats a secret without a version as empty', async () => {
    const f = fakeClient();
    const s = createSecretStore({ region: 'x', arns: { vapid: 'arn' }, client: f.client });
    expect(await s.get('vapid')).toBeNull();
  });

  it('caches reads until the TTL and bypasses with frisch', async () => {
    const f = fakeClient('{"a":1}');
    let t = 0;
    const s = createSecretStore({
      region: 'x',
      arns: { onedrive: 'arn' },
      client: f.client,
      ttlMs: 1000,
      now: () => t,
    });
    await s.get('onedrive');
    await s.get('onedrive');
    expect(f.aufrufe).toHaveLength(1);
    await s.get('onedrive', true);
    expect(f.aufrufe).toHaveLength(2);
    t = 1500;
    await s.get('onedrive');
    expect(f.aufrufe).toHaveLength(3);
  });

  it('put writes through and updates the cache', async () => {
    const f = fakeClient();
    const s = createSecretStore({ region: 'x', arns: { vapid: 'arn' }, client: f.client });
    await s.put('vapid', { k: 'v' });
    expect(await s.get('vapid')).toEqual({ k: 'v' });
    expect(f.aufrufe).toEqual(['PutSecretValueCommand']);
  });

  it('keeps values in memory without an ARN', async () => {
    const s = createSecretStore({ region: 'x', arns: {}, client: fakeClient().client });
    await s.put('vapid', { k: 1 });
    expect(await s.get('vapid')).toEqual({ k: 1 });
  });
});

describe('VAPID keys', () => {
  it('generates and stores the pair when the secret is empty', async () => {
    const secrets = createMemorySecretStore();
    let n = 0;
    const lesen = createVapidLeser(secrets, () => ({ publicKey: `pub${++n}`, privateKey: 'priv' }));
    expect(await lesen()).toEqual({ publicKey: 'pub1', privateKey: 'priv' });
    expect(secrets.werte.get('vapid')).toEqual({ publicKey: 'pub1', privateKey: 'priv' });
    expect(await lesen()).toEqual({ publicKey: 'pub1', privateKey: 'priv' });
    expect(n).toBe(1);
  });

  it('uses the stored pair without generating', async () => {
    const secrets = createMemorySecretStore({ vapid: { publicKey: 'p', privateKey: 's' } });
    const lesen = createVapidLeser(secrets, () => {
      throw new Error('must not generate');
    });
    expect(await lesen()).toEqual({ publicKey: 'p', privateKey: 's' });
  });

  it('uses what is stored after the write when another start won the race', async () => {
    const memory = createMemorySecretStore();
    const secrets = {
      ...memory,
      put: async (name: 'vapid' | 'onedrive', wert: unknown) => {
        // The other cold start writes after us and wins.
        await memory.put(name, wert);
        await memory.put(name, { publicKey: 'winner', privateKey: 'w' });
      },
    };
    const lesen = createVapidLeser(secrets, () => ({ publicKey: 'mine', privateKey: 'm' }));
    expect(await lesen()).toEqual({ publicKey: 'winner', privateKey: 'w' });
  });
});

describe('OneDrive store with secrets', () => {
  /** Minimal Drizzle stand-in for the single connection row. */
  function fakeDb() {
    const state: { row: Record<string, unknown> | null } = { row: null };
    const db = {
      select: () => ({ from: () => ({ where: async () => (state.row ? [state.row] : []) }) }),
      insert: () => ({
        values: (v: Record<string, unknown>) => ({
          onConflictDoUpdate: async ({ set }: { set: Record<string, unknown> }) => {
            state.row = state.row ? { ...state.row, ...set } : { basisPfad: 'x', ...v };
          },
        }),
      }),
    };
    return { state, db: db as unknown as Db };
  }

  it('keeps tokens and client secret out of the database', async () => {
    const { state, db } = fakeDb();
    const secrets = createMemorySecretStore();
    const store = createOneDriveStore(db, secrets);
    const ablauf = new Date('2025-06-01T12:30:00Z');
    await store.speichern({
      clientId: 'cid',
      clientSecret: 'sec',
      refreshToken: 'r1',
      accessToken: 'a1',
      accessAblauf: ablauf,
      konto: 'Konto',
    });
    expect(state.row).toMatchObject({ clientId: 'cid', konto: 'Konto' });
    expect(state.row).not.toHaveProperty('clientSecret');
    expect(state.row).not.toHaveProperty('refreshToken');
    expect(state.row).not.toHaveProperty('accessToken');
    expect(secrets.werte.get('onedrive')).toEqual({
      clientSecret: 'sec',
      refreshToken: 'r1',
      accessToken: 'a1',
      accessAblauf: ablauf.toISOString(),
    });
    const row = await store.lesen();
    expect(row).toMatchObject({ clientId: 'cid', clientSecret: 'sec', refreshToken: 'r1' });
    expect(row?.accessAblauf).toEqual(ablauf);
  });

  it('a partial write keeps the other secret fields and null clears one', async () => {
    const { db } = fakeDb();
    const store = createOneDriveStore(db, createMemorySecretStore());
    await store.speichern({ clientId: 'c', clientSecret: 'sec', refreshToken: 'r1' });
    await store.speichern({ refreshToken: 'r2' });
    expect((await store.lesen())?.clientSecret).toBe('sec');
    expect((await store.lesen())?.refreshToken).toBe('r2');
    await store.speichern({ refreshToken: null, accessToken: null });
    const row = await store.lesen();
    expect(row?.refreshToken).toBeNull();
    expect(row?.clientSecret).toBe('sec');
  });

  it('reads no secret data while the connection row does not exist', async () => {
    const { db } = fakeDb();
    const secrets = createMemorySecretStore({ onedrive: { refreshToken: 'x' } });
    expect(await createOneDriveStore(db, secrets).lesen()).toBeNull();
  });
});
