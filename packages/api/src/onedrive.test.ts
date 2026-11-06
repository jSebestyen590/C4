import { describe, expect, it } from 'vitest';
import {
  createMemoryOneDriveStore,
  createOneDrive,
  NichtKonfiguriert,
  NichtVerbunden,
  OrdnerExistiert,
  OrdnerFehlt,
  registriereOneDriveAufgaben,
} from './onedrive';

interface Aufruf {
  url: string;
  methode: string;
  body: string | undefined;
  auth: string | undefined;
}

const json = (status: number, daten: unknown = {}) =>
  new Response(status === 204 ? null : JSON.stringify(daten), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** Fetch mock that answers by a handler and records the calls. */
function mock(handler: (a: Aufruf) => Response | Promise<Response>) {
  const aufrufe: Aufruf[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const a: Aufruf = {
      url: String(url),
      methode: init?.method ?? 'GET',
      body: init?.body as string | undefined,
      auth: headers.authorization,
    };
    aufrufe.push(a);
    return handler(a);
  }) as typeof fetch;
  return { fetchFn, aufrufe };
}

const JETZT = new Date('2025-06-01T12:00:00Z');
const verbunden = (extra = {}) => ({
  clientId: 'cid',
  clientSecret: 'sec',
  refreshToken: 'r1',
  accessToken: 'a1',
  accessAblauf: new Date(JETZT.getTime() + 30 * 60_000),
  ...extra,
});

describe('token handling', () => {
  it('uses the cached access token while it is valid', async () => {
    const store = createMemoryOneDriveStore(verbunden());
    const m = mock(() => json(200, { value: [] }));
    const od = createOneDrive({ store, fetch: m.fetchFn, jetzt: () => JETZT });
    await od.ordnerListen();
    expect(m.aufrufe).toHaveLength(1);
    expect(m.aufrufe[0]?.auth).toBe('Bearer a1');
  });

  it('refreshes one minute before expiry and stores the rotated refresh token', async () => {
    const store = createMemoryOneDriveStore(
      verbunden({ accessAblauf: new Date(JETZT.getTime() + 30_000) }),
    );
    const m = mock((a) =>
      a.url.includes('/token')
        ? json(200, { access_token: 'a2', refresh_token: 'r2', expires_in: 3600 })
        : json(200, { value: [] }),
    );
    const od = createOneDrive({ store, fetch: m.fetchFn, jetzt: () => JETZT });
    await od.ordnerListen();
    const token = m.aufrufe[0]!;
    expect(token.url).toBe('https://login.microsoftonline.com/consumers/oauth2/v2.0/token');
    const felder = new URLSearchParams(token.body);
    expect(felder.get('grant_type')).toBe('refresh_token');
    expect(felder.get('refresh_token')).toBe('r1');
    expect(felder.get('client_secret')).toBe('sec');
    expect(m.aufrufe[1]?.auth).toBe('Bearer a2');
    expect(store.row).toMatchObject({ accessToken: 'a2', refreshToken: 'r2' });
    expect(store.row?.accessAblauf?.getTime()).toBe(JETZT.getTime() + 3600_000);
  });

  it('drops the connection and sets an error on invalid_grant', async () => {
    const store = createMemoryOneDriveStore(verbunden({ accessAblauf: new Date(0) }));
    const m = mock(() => json(400, { error: 'invalid_grant' }));
    const od = createOneDrive({ store, fetch: m.fetchFn, jetzt: () => JETZT });
    await expect(od.ordnerListen()).rejects.toBeInstanceOf(NichtVerbunden);
    expect(store.row).toMatchObject({ refreshToken: null, accessToken: null });
    expect(store.row?.fehler).toContain('OneDrive');
    const status = await od.status();
    expect(status).toMatchObject({ verbunden: false, clientIdGesetzt: true });
    expect(status.fehler).toBeTruthy();
  });

  it('retries once with a fresh token on 401', async () => {
    const store = createMemoryOneDriveStore(verbunden());
    let versuch = 0;
    const m = mock((a) => {
      if (a.url.includes('/token')) {
        return json(200, { access_token: 'a2', refresh_token: 'r2', expires_in: 3600 });
      }
      versuch += 1;
      return versuch === 1 ? json(401) : json(200, { value: [] });
    });
    const od = createOneDrive({ store, fetch: m.fetchFn, jetzt: () => JETZT });
    await expect(od.ordnerListen()).resolves.toEqual([]);
    expect(m.aufrufe.map((a) => a.auth)).toEqual(['Bearer a1', undefined, 'Bearer a2']);
  });

  it('is not connected without a refresh token', async () => {
    const od = createOneDrive({
      store: createMemoryOneDriveStore(),
      fetch: mock(() => json(200)).fetchFn,
    });
    await expect(od.ordnerListen()).rejects.toBeInstanceOf(NichtVerbunden);
    await expect(od.ordnerAnlegen('x')).rejects.toBeInstanceOf(NichtVerbunden);
  });

  it('tokenPflegen renews at most once a day and is a no-op when not connected', async () => {
    const store = createMemoryOneDriveStore(verbunden());
    const m = mock(() => json(200, { access_token: 'a2', refresh_token: 'r2', expires_in: 3600 }));
    const od = createOneDrive({ store, fetch: m.fetchFn, jetzt: () => JETZT });
    await od.tokenPflegen(JETZT);
    expect(m.aufrufe).toHaveLength(1);
    await od.tokenPflegen(new Date(JETZT.getTime() + 3600_000));
    expect(m.aufrufe).toHaveLength(1);
    await od.tokenPflegen(new Date(JETZT.getTime() + 25 * 3600_000));
    expect(m.aufrufe).toHaveLength(2);

    const leer = mock(() => json(200));
    await createOneDrive({
      store: createMemoryOneDriveStore(),
      fetch: leer.fetchFn,
    }).tokenPflegen(JETZT);
    expect(leer.aufrufe).toHaveLength(0);
  });

  it('tokenPflegen swallows a revoked token', async () => {
    const store = createMemoryOneDriveStore(verbunden());
    const od = createOneDrive({
      store,
      fetch: mock(() => json(400, { error: 'invalid_grant' })).fetchFn,
    });
    await expect(od.tokenPflegen(JETZT)).resolves.toBeUndefined();
    expect(store.row?.refreshToken).toBeNull();
  });

  it('registers the job task', async () => {
    const aufgaben = new Map<string, (j: Date) => Promise<void>>();
    let gepflegt: Date | undefined;
    registriereOneDriveAufgaben(
      { registriereAufgabe: (n, f) => void aufgaben.set(n, f) },
      {
        tokenPflegen: async (j) => {
          gepflegt = j;
        },
      },
    );
    await aufgaben.get('onedrive.token')?.(JETZT);
    expect(gepflegt).toBe(JETZT);
  });
});

describe('login', () => {
  it('builds the authorize URL and exchanges the code with the same redirect URI', async () => {
    const store = createMemoryOneDriveStore({ clientId: 'cid', clientSecret: 'sec' });
    const m = mock((a) =>
      a.url.includes('/token')
        ? json(200, { access_token: 'a1', refresh_token: 'r1', expires_in: 3600 })
        : json(200, { displayName: 'Cloud 4', mail: 'c4@example.com' }),
    );
    const od = createOneDrive({ store, fetch: m.fetchFn, jetzt: () => JETZT });
    const url = new URL(await od.loginUrl('https://x.de/app/bilder/einrichtung', 'st'));
    expect(url.origin + url.pathname).toBe(
      'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
    );
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('scope')).toBe('Files.ReadWrite offline_access User.Read');
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('redirect_uri')).toBe('https://x.de/app/bilder/einrichtung');

    const status = await od.codeEinloesen('code1', 'https://x.de/app/bilder/einrichtung', 'jan');
    const felder = new URLSearchParams(m.aufrufe[0]?.body);
    expect(felder.get('grant_type')).toBe('authorization_code');
    expect(felder.get('redirect_uri')).toBe('https://x.de/app/bilder/einrichtung');
    expect(status).toMatchObject({
      verbunden: true,
      konto: 'Cloud 4 (c4@example.com)',
      verbundenVon: 'jan',
      clientIdGesetzt: true,
    });
    expect(JSON.stringify(status)).not.toContain('sec');
    expect(store.row?.refreshToken).toBe('r1');
  });

  it('needs client id and secret', async () => {
    const od = createOneDrive({ store: createMemoryOneDriveStore() });
    await expect(od.loginUrl('u', 's')).rejects.toBeInstanceOf(NichtKonfiguriert);
  });

  it('konfigurieren keeps the stored secret and disconnects when the client id changes', async () => {
    const store = createMemoryOneDriveStore(verbunden());
    const od = createOneDrive({ store });
    await od.konfigurieren({ clientId: 'cid', basisPfad: '/Foto/Bilder/' }, 'jan');
    expect(store.row).toMatchObject({
      clientSecret: 'sec',
      basisPfad: 'Foto/Bilder',
      refreshToken: 'r1',
    });
    await od.konfigurieren({ clientId: 'neu', clientSecret: 'neues', basisPfad: '' }, 'jan');
    expect(store.row).toMatchObject({
      clientId: 'neu',
      clientSecret: 'neues',
      basisPfad: 'Cloud4/Bilder',
      refreshToken: null,
    });
  });

  it('trennen clears the tokens', async () => {
    const store = createMemoryOneDriveStore(verbunden({ konto: 'x' }));
    await createOneDrive({ store }).trennen();
    expect(store.row).toMatchObject({
      refreshToken: null,
      accessToken: null,
      konto: null,
      clientId: 'cid',
    });
  });
});

describe('folders', () => {
  const setup = (handler: (a: Aufruf) => Response | Promise<Response>) => {
    const store = createMemoryOneDriveStore(verbunden({ basisPfad: 'Cloud4/Bilder Fotos' }));
    const m = mock(handler);
    return { od: createOneDrive({ store, fetch: m.fetchFn, jetzt: () => JETZT }), m };
  };

  it('lists folders only, follows paging and encodes each path segment', async () => {
    const { od, m } = setup((a) =>
      a.url.includes('skip')
        ? json(200, { value: [{ id: '3', name: 'C', webUrl: 'wc', folder: {} }] })
        : json(200, {
            value: [
              { id: '1', name: 'A', webUrl: 'wa', folder: { childCount: 2 } },
              { id: '2', name: 'datei.jpg', webUrl: 'wd' },
            ],
            '@odata.nextLink': 'https://graph.microsoft.com/v1.0/next?skip=1',
          }),
    );
    expect(await od.ordnerListen()).toEqual([
      { id: '1', name: 'A', webUrl: 'wa' },
      { id: '3', name: 'C', webUrl: 'wc' },
    ]);
    expect(m.aufrufe).toHaveLength(2);
    expect(m.aufrufe[0]?.url).toContain('/me/drive/root:/Cloud4/Bilder%20Fotos:/children?');
    expect(m.aufrufe[0]?.url).toContain('$select=id,name,webUrl,folder');
  });

  it('returns an empty list when the base folder does not exist', async () => {
    const { od } = setup(() => json(404));
    expect(await od.ordnerListen()).toEqual([]);
  });

  it('creates a folder with conflictBehavior fail and reports a conflict', async () => {
    const { od, m } = setup((a) =>
      a.body?.includes('Doppelt')
        ? json(409)
        : json(201, { id: 'n', name: 'Neu', webUrl: 'wn', folder: {} }),
    );
    expect(await od.ordnerAnlegen('Neu')).toEqual({ id: 'n', name: 'Neu', webUrl: 'wn' });
    expect(JSON.parse(m.aufrufe[0]?.body ?? '')).toEqual({
      name: 'Neu',
      folder: {},
      '@microsoft.graph.conflictBehavior': 'fail',
    });
    await expect(od.ordnerAnlegen('Doppelt')).rejects.toBeInstanceOf(OrdnerExistiert);
  });

  it('creates the base folder when it is missing', async () => {
    let basis = false;
    const { od, m } = setup((a) => {
      const name = (JSON.parse(a.body ?? '{}') as { name?: string }).name;
      if (name === 'Neu') {
        return basis ? json(201, { id: 'n', name: 'Neu', webUrl: 'wn' }) : json(404);
      }
      basis = true;
      return json(201, { id: 'b', name: String(name), webUrl: 'wb' });
    });
    expect((await od.ordnerAnlegen('Neu')).id).toBe('n');
    expect(m.aufrufe.map((a) => a.methode)).toEqual(['POST', 'POST', 'POST', 'POST']);
  });

  it('renames and maps 404 and 409', async () => {
    const { od, m } = setup((a) =>
      a.url.includes('weg')
        ? json(404)
        : a.url.includes('doppelt')
          ? json(409)
          : json(200, { id: 'x', name: 'Neu', webUrl: 'w2' }),
    );
    expect(await od.umbenennen('x!1', 'Neu')).toEqual({ id: 'x', name: 'Neu', webUrl: 'w2' });
    expect(m.aufrufe[0]).toMatchObject({ methode: 'PATCH' });
    expect(m.aufrufe[0]?.url).toContain('/me/drive/items/x!1');
    await expect(od.umbenennen('weg', 'N')).rejects.toBeInstanceOf(OrdnerFehlt);
    await expect(od.umbenennen('doppelt', 'N')).rejects.toBeInstanceOf(OrdnerExistiert);
  });

  it('creates an anonymous read-only sharing link and maps 404', async () => {
    const { od, m } = setup((a) =>
      a.url.includes('weg') ? json(404) : json(201, { link: { webUrl: 'https://1drv.ms/f/abc' } }),
    );
    expect(await od.freigabeLink('x!1')).toBe('https://1drv.ms/f/abc');
    expect(m.aufrufe[0]).toMatchObject({ methode: 'POST' });
    expect(m.aufrufe[0]?.url).toBe(
      'https://graph.microsoft.com/v1.0/me/drive/items/x!1/createLink',
    );
    expect(JSON.parse(m.aufrufe[0]?.body ?? '{}')).toEqual({ type: 'view', scope: 'anonymous' });
    await expect(od.freigabeLink('weg')).rejects.toBeInstanceOf(OrdnerFehlt);
  });

  it('deletes only empty folders', async () => {
    const { od, m } = setup((a) => {
      if (a.methode === 'DELETE') return json(204);
      if (a.url.includes('/leer')) return json(200, { id: 'leer', folder: { childCount: 0 } });
      if (a.url.includes('/voll')) return json(200, { id: 'voll', folder: { childCount: 3 } });
      return json(404);
    });
    expect(await od.loeschenWennLeer('leer')).toBe('geloescht');
    expect(m.aufrufe.map((a) => a.methode)).toEqual(['GET', 'DELETE']);
    expect(await od.loeschenWennLeer('voll')).toBe('nicht-leer');
    expect(m.aufrufe.filter((a) => a.methode === 'DELETE')).toHaveLength(1);
    expect(await od.loeschenWennLeer('weg')).toBe('fehlt');
  });
});

describe('dateiHochladen', () => {
  it('puts the bytes to the path below the drive root and replaces existing files', async () => {
    const store = createMemoryOneDriveStore(verbunden());
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xff, 0x00]);
    let gesehen: { body: unknown; typ: string | undefined } | null = null;
    const aufrufe: { url: string; methode: string }[] = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      aufrufe.push({ url: String(url), methode: init?.method ?? 'GET' });
      gesehen = {
        body: init?.body,
        typ: (init?.headers as Record<string, string>)['content-type'],
      };
      return json(201, { id: 'x' });
    }) as typeof fetch;
    const od = createOneDrive({ store, fetch: fetchFn, jetzt: () => JETZT });
    await od.dateiHochladen(
      'Cloud4/Sitzungen/Protokolle/2026-11-04_Sitzung & Co.pdf',
      bytes,
      'application/pdf',
    );
    expect(aufrufe).toEqual([
      {
        url: 'https://graph.microsoft.com/v1.0/me/drive/root:/Cloud4/Sitzungen/Protokolle/2026-11-04_Sitzung%20%26%20Co.pdf:/content?@microsoft.graph.conflictBehavior=replace',
        methode: 'PUT',
      },
    ]);
    expect(gesehen).toEqual({ body: bytes, typ: 'application/pdf' });
  });

  it('refuses files over 4 MB, fails on Graph errors and without connection', async () => {
    const store = createMemoryOneDriveStore(verbunden());
    const m = mock(() => json(507, { error: 'quota' }));
    const od = createOneDrive({ store, fetch: m.fetchFn, jetzt: () => JETZT });
    await expect(
      od.dateiHochladen('a/b.pdf', new Uint8Array(4 * 1024 * 1024 + 1), 'application/pdf'),
    ).rejects.toThrow('zu groß');
    expect(m.aufrufe).toHaveLength(0);
    await expect(
      od.dateiHochladen('a/b.pdf', new Uint8Array(3), 'application/pdf'),
    ).rejects.toThrow(/507/);
    const ohne = createOneDrive({
      store: createMemoryOneDriveStore(),
      fetch: m.fetchFn,
      jetzt: () => JETZT,
    });
    await expect(
      ohne.dateiHochladen('a/b.pdf', new Uint8Array(3), 'application/pdf'),
    ).rejects.toBeInstanceOf(NichtVerbunden);
  });
});
