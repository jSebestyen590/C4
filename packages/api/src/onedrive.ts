import { eq } from 'drizzle-orm';
import type { OneDriveStatusDto } from '@c4/shared';
import type { Benachrichtigungen } from './benachrichtigungen';
import type { Db } from './db/client';
import { bilderFreigaben, bilderOrdnerCache, onedriveVerbindung } from './db/schema';

// Access to the club's OneDrive photo folders through Microsoft Graph (delegated, personal account,
// confidential client). The connection (client id/secret, tokens) lives in one DB row, see docs/bilder.md.

export const STANDARD_BASIS_PFAD = 'Cloud4/Bilder';
/** Folder of the PDFs of closed minutes, relative to the drive root (not to the Bilder base folder). */
export const PROTOKOLL_PFAD = 'Cloud4/Sitzungen/C4/Protokolle';
/** Graph's simple upload takes files up to 4 MB. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const VERBINDUNG_ID = 'onedrive';
const AUTHORIZE_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize';
const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPES = 'Files.ReadWrite offline_access User.Read';
/** The access token is renewed this long before it expires. */
const ABLAUF_PUFFER_MS = 60_000;
/** The refresh token is renewed at most this often by the job (so it does not lapse from inactivity). */
const PFLEGE_INTERVALL_MS = 24 * 3600_000;

const FEHLER_ABGELAUFEN =
  'Die Verbindung zu OneDrive ist abgelaufen oder wurde widerrufen. Bitte verbinde OneDrive neu.';

/** OneDrive is not connected (never, disconnected or the token was revoked). */
export class NichtVerbunden extends Error {
  constructor() {
    super('OneDrive ist nicht verbunden.');
    this.name = 'NichtVerbunden';
  }
}

/** A folder with this name exists already. */
export class OrdnerExistiert extends Error {
  constructor(name: string) {
    super(`Einen Ordner „${name}“ gibt es schon.`);
    this.name = 'OrdnerExistiert';
  }
}

/** The folder does not exist (anymore). */
export class OrdnerFehlt extends Error {
  constructor() {
    super('Der Ordner existiert nicht mehr.');
    this.name = 'OrdnerFehlt';
  }
}

/** Client id or secret are not stored yet, so no login is possible. */
export class NichtKonfiguriert extends Error {
  constructor() {
    super('Bitte speichere zuerst Client-ID und Client-Secret.');
    this.name = 'NichtKonfiguriert';
  }
}

/** Microsoft refused something the user can fix; the message is German and safe to show. */
export class OneDriveFehler extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OneDriveFehler';
  }
}

export interface OneDriveOrdner {
  id: string;
  name: string;
  webUrl: string;
}

export interface OneDrive {
  status(): Promise<OneDriveStatusDto>;
  /** Stores client id, optionally a new secret (else the stored one stays) and the base folder. */
  konfigurieren(
    daten: { clientId: string; clientSecret?: string; basisPfad: string },
    von: string,
  ): Promise<void>;
  /** The Microsoft sign-in URL; throws `NichtKonfiguriert` without client id and secret. */
  loginUrl(redirectUri: string, state: string): Promise<string>;
  /** Exchanges the authorization code for tokens and stores the connection. */
  codeEinloesen(code: string, redirectUri: string, von: string): Promise<OneDriveStatusDto>;
  /** Forgets tokens and account (client id, secret and base folder stay). */
  trennen(): Promise<void>;
  /** Sub-folders of the base folder. */
  ordnerListen(): Promise<OneDriveOrdner[]>;
  /** Throws `OrdnerExistiert` when the name is taken. */
  ordnerAnlegen(name: string): Promise<OneDriveOrdner>;
  /** Throws `OrdnerFehlt` (404) or `OrdnerExistiert` (409). */
  umbenennen(id: string, name: string): Promise<OneDriveOrdner>;
  /**
   * Anonymous read-only sharing link (`1drv.ms`, opens the OneDrive app on phones). Microsoft returns
   * the existing link when there is one. Throws `OrdnerFehlt` (404).
   */
  freigabeLink(id: string): Promise<string>;
  /** Deletes the folder (to the OneDrive recycle bin) only if it has no content. */
  loeschenWennLeer(id: string): Promise<'geloescht' | 'nicht-leer' | 'fehlt'>;
  /**
   * Uploads a file (at most `MAX_UPLOAD_BYTES`) to a path relative to the drive root, e.g.
   * `Cloud4/Sitzungen/C4/Protokolle/x.pdf`; missing folders are created, an existing file is replaced.
   * Throws `NichtVerbunden` or a generic Error when Microsoft fails.
   */
  dateiHochladen(pfad: string, inhalt: Uint8Array, contentType: string): Promise<void>;
  /** Job task: renews the refresh token at most once a day; does nothing when not connected. */
  tokenPflegen(jetzt: Date): Promise<void>;
}

// ---------------------------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------------------------

export interface VerbindungRow {
  clientId: string | null;
  clientSecret: string | null;
  basisPfad: string;
  refreshToken: string | null;
  accessToken: string | null;
  accessAblauf: Date | null;
  konto: string | null;
  verbundenVon: string | null;
  verbundenAm: Date | null;
  fehler: string | null;
  tokenErneuertAm: Date | null;
}

export interface OneDriveStore {
  lesen(): Promise<VerbindungRow | null>;
  /** Upsert of the given columns of the single row. */
  speichern(daten: Partial<VerbindungRow>): Promise<void>;
}

export function createOneDriveStore(db: Db): OneDriveStore {
  return {
    async lesen() {
      const [row] = await db
        .select()
        .from(onedriveVerbindung)
        .where(eq(onedriveVerbindung.id, VERBINDUNG_ID));
      if (!row) return null;
      return row;
    },
    async speichern(daten) {
      await db
        .insert(onedriveVerbindung)
        .values({ id: VERBINDUNG_ID, ...daten })
        .onConflictDoUpdate({ target: onedriveVerbindung.id, set: daten });
    },
  };
}

/** Cache of the sharing links per OneDrive folder id (table `bilder_freigaben`). */
export interface FreigabenStore {
  /** Folder id -> sharing link. */
  alle(): Promise<Map<string, string>>;
  setzen(ordnerId: string, url: string): Promise<void>;
  loeschen(ordnerId: string): Promise<void>;
}

export function createFreigabenStore(db: Db): FreigabenStore {
  return {
    async alle() {
      const rows = await db.select().from(bilderFreigaben);
      return new Map(rows.map((r) => [r.ordnerId, r.url]));
    },
    async setzen(ordnerId, url) {
      await db
        .insert(bilderFreigaben)
        .values({ ordnerId, url })
        .onConflictDoUpdate({ target: bilderFreigaben.ordnerId, set: { url } });
    },
    async loeschen(ordnerId) {
      await db.delete(bilderFreigaben).where(eq(bilderFreigaben.ordnerId, ordnerId));
    },
  };
}

/** Last snapshot of the folder list (table `bilder_ordner_cache`, one row). */
export interface OrdnerCacheStore {
  lesen(): Promise<{ ordner: OneDriveOrdner[]; stand: Date } | null>;
  schreiben(ordner: readonly OneDriveOrdner[], stand: Date): Promise<void>;
}

const LISTE_ID = 'liste';

export function createOrdnerCacheStore(db: Db): OrdnerCacheStore {
  return {
    async lesen() {
      const [row] = await db
        .select()
        .from(bilderOrdnerCache)
        .where(eq(bilderOrdnerCache.id, LISTE_ID));
      if (!row) return null;
      try {
        return { ordner: JSON.parse(row.daten) as OneDriveOrdner[], stand: row.stand };
      } catch {
        return null;
      }
    },
    async schreiben(ordner, stand) {
      const daten = JSON.stringify(ordner);
      await db
        .insert(bilderOrdnerCache)
        .values({ id: LISTE_ID, daten, stand })
        .onConflictDoUpdate({ target: bilderOrdnerCache.id, set: { daten, stand } });
    },
  };
}

/** In-memory store for tests. */
export function createMemoryOrdnerCacheStore(): OrdnerCacheStore & {
  stand: { ordner: OneDriveOrdner[]; stand: Date } | null;
} {
  const store = {
    stand: null as { ordner: OneDriveOrdner[]; stand: Date } | null,
    async lesen() {
      return store.stand && { ordner: [...store.stand.ordner], stand: store.stand.stand };
    },
    async schreiben(ordner: readonly OneDriveOrdner[], stand: Date) {
      store.stand = { ordner: [...ordner], stand };
    },
  };
  return store;
}

/** In-memory store for tests. */
export function createMemoryFreigabenStore(): FreigabenStore & { karte: Map<string, string> } {
  const karte = new Map<string, string>();
  return {
    karte,
    async alle() {
      return new Map(karte);
    },
    async setzen(ordnerId, url) {
      karte.set(ordnerId, url);
    },
    async loeschen(ordnerId) {
      karte.delete(ordnerId);
    },
  };
}

/** In-memory store for tests. */
export function createMemoryOneDriveStore(start?: Partial<VerbindungRow>): OneDriveStore & {
  row: VerbindungRow | null;
} {
  const store = {
    row: start ? leereZeile(start) : (null as VerbindungRow | null),
    async lesen() {
      return store.row && { ...store.row };
    },
    async speichern(daten: Partial<VerbindungRow>) {
      store.row = { ...(store.row ?? leereZeile()), ...daten };
    },
  };
  return store;
}

function leereZeile(start: Partial<VerbindungRow> = {}): VerbindungRow {
  return {
    clientId: null,
    clientSecret: null,
    basisPfad: STANDARD_BASIS_PFAD,
    refreshToken: null,
    accessToken: null,
    accessAblauf: null,
    konto: null,
    verbundenVon: null,
    verbundenAm: null,
    fehler: null,
    tokenErneuertAm: null,
    ...start,
  };
}

// ---------------------------------------------------------------------------------------------
// Graph implementation
// ---------------------------------------------------------------------------------------------

export interface OneDriveDeps {
  store: OneDriveStore;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  jetzt?: () => Date;
}

/** Base folder as clean path (no leading/trailing slashes, no empty segments). */
export const basisPfadBereinigen = (pfad: string): string =>
  pfad
    .split(/[\\/]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join('/');

const kodiereSegmente = (pfad: string): string => pfad.split('/').map(encodeURIComponent).join('/');

interface TokenAntwort {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GraphItem {
  id: string;
  name: string;
  webUrl: string;
  folder?: { childCount?: number };
}

export function createOneDrive(deps: OneDriveDeps): OneDrive {
  const { store } = deps;
  const http: typeof fetch = deps.fetch ?? ((...args) => fetch(...args));
  const jetzt = deps.jetzt ?? (() => new Date());

  const statusAus = (row: VerbindungRow | null): OneDriveStatusDto => ({
    verbunden: !!row?.refreshToken,
    konto: row?.refreshToken ? (row.konto ?? null) : null,
    basisPfad: row?.basisPfad ?? STANDARD_BASIS_PFAD,
    fehler: row?.refreshToken ? null : (row?.fehler ?? null),
    clientIdGesetzt: !!row?.clientId,
    clientId: row?.clientId || null,
    verbundenAm: row?.refreshToken && row.verbundenAm ? row.verbundenAm.toISOString() : null,
    verbundenVon: row?.refreshToken ? (row.verbundenVon ?? null) : null,
  });

  /** POST to the token endpoint; null `invalid_grant` is reported as `{ ungueltig: true }`. */
  const tokenAnfrage = async (
    row: VerbindungRow,
    felder: Record<string, string>,
  ): Promise<{ ungueltig: true } | { ungueltig: false; antwort: Required<TokenAntwort> }> => {
    const body = new URLSearchParams({
      client_id: row.clientId ?? '',
      client_secret: row.clientSecret ?? '',
      scope: SCOPES,
      ...felder,
    });
    const res = await http(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const daten = (await res.json().catch(() => ({}))) as TokenAntwort;
    if (!res.ok) {
      if (daten.error === 'invalid_grant') return { ungueltig: true };
      throw new Error(
        `OneDrive token request failed (${res.status} ${daten.error ?? ''}): ${daten.error_description ?? ''}`,
      );
    }
    if (!daten.access_token) throw new Error('OneDrive token response without access token');
    return {
      ungueltig: false,
      antwort: {
        access_token: daten.access_token,
        refresh_token: daten.refresh_token ?? '',
        expires_in: daten.expires_in ?? 3600,
        error: '',
        error_description: '',
      },
    };
  };

  /** Renews the tokens with the refresh token. On `invalid_grant` the connection is dropped. */
  const erneuern = async (row: VerbindungRow): Promise<string> => {
    if (!row.refreshToken) throw new NichtVerbunden();
    const jetztWert = jetzt();
    const erg = await tokenAnfrage(row, {
      grant_type: 'refresh_token',
      refresh_token: row.refreshToken,
    });
    if (erg.ungueltig) {
      await store.speichern({
        refreshToken: null,
        accessToken: null,
        accessAblauf: null,
        fehler: FEHLER_ABGELAUFEN,
      });
      throw new NichtVerbunden();
    }
    const a = erg.antwort;
    await store.speichern({
      accessToken: a.access_token,
      accessAblauf: new Date(jetztWert.getTime() + a.expires_in * 1000),
      // The refresh token rotates; the new one always replaces the old one.
      refreshToken: a.refresh_token || row.refreshToken,
      tokenErneuertAm: jetztWert,
      fehler: null,
    });
    return a.access_token;
  };

  const zugriffstoken = async (
    erzwingen = false,
  ): Promise<{ token: string; row: VerbindungRow }> => {
    const row = await store.lesen();
    if (!row?.refreshToken) throw new NichtVerbunden();
    if (
      !erzwingen &&
      row.accessToken &&
      row.accessAblauf &&
      row.accessAblauf.getTime() - ABLAUF_PUFFER_MS > jetzt().getTime()
    ) {
      return { token: row.accessToken, row };
    }
    return { token: await erneuern(row), row };
  };

  /** Graph request with the current token; one retry with a fresh token on 401. */
  const graph = async (
    methode: string,
    pfadOderUrl: string,
    body?: unknown,
    /** Raw bytes with their content type instead of a JSON body. */
    roh?: { inhalt: Uint8Array; contentType: string },
  ): Promise<Response> => {
    const url = pfadOderUrl.startsWith('http') ? pfadOderUrl : `${GRAPH}${pfadOderUrl}`;
    const senden = async (token: string) =>
      http(url, {
        method: methode,
        headers: {
          authorization: `Bearer ${token}`,
          ...(roh && { 'content-type': roh.contentType }),
          ...(!roh && body !== undefined && { 'content-type': 'application/json' }),
        },
        ...(roh && { body: roh.inhalt as unknown as BodyInit }),
        ...(!roh && body !== undefined && { body: JSON.stringify(body) }),
      });
    let res = await senden((await zugriffstoken()).token);
    if (res.status === 401) res = await senden((await zugriffstoken(true)).token);
    return res;
  };

  const graphFehler = async (res: Response): Promise<Error> =>
    new Error(`OneDrive request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);

  const kinderUrl = (basisPfad: string) =>
    basisPfad
      ? `/me/drive/root:/${kodiereSegmente(basisPfad)}:/children`
      : '/me/drive/root/children';

  const alsOrdner = (i: GraphItem): OneDriveOrdner => ({
    id: i.id,
    name: i.name,
    webUrl: i.webUrl,
  });

  /** Creates the base folder path segment by segment (existing segments are fine). */
  const basisOrdnerAnlegen = async (basisPfad: string) => {
    const segmente = basisPfad.split('/').filter(Boolean);
    for (let i = 0; i < segmente.length; i++) {
      const eltern = segmente.slice(0, i).join('/');
      const res = await graph('POST', kinderUrl(eltern), {
        name: segmente[i],
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail',
      });
      if (!res.ok && res.status !== 409) throw await graphFehler(res);
    }
  };

  const basisPfadLesen = async () => (await store.lesen())?.basisPfad ?? STANDARD_BASIS_PFAD;

  return {
    async status() {
      return statusAus(await store.lesen());
    },

    async konfigurieren(daten) {
      const row = await store.lesen();
      const clientIdNeu = daten.clientId.trim();
      const secret = daten.clientSecret?.trim();
      if (!clientIdNeu) throw new OneDriveFehler('Bitte gib die Client-ID an.');
      if (!secret && !row?.clientSecret)
        throw new OneDriveFehler('Bitte gib das Client-Secret an.');
      const basisPfad = basisPfadBereinigen(daten.basisPfad) || STANDARD_BASIS_PFAD;
      const idGeaendert = !!row?.clientId && row.clientId !== clientIdNeu;
      await store.speichern({
        clientId: clientIdNeu,
        ...(secret && { clientSecret: secret }),
        basisPfad,
        // Tokens belong to the client id; a different app registration needs a new login.
        ...(idGeaendert && {
          refreshToken: null,
          accessToken: null,
          accessAblauf: null,
          konto: null,
          verbundenAm: null,
        }),
      });
    },

    async loginUrl(redirectUri, state) {
      const row = await store.lesen();
      if (!row?.clientId || !row.clientSecret) throw new NichtKonfiguriert();
      const q = new URLSearchParams({
        client_id: row.clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        response_mode: 'query',
        scope: SCOPES,
        state,
      });
      return `${AUTHORIZE_URL}?${q.toString()}`;
    },

    async codeEinloesen(code, redirectUri, von) {
      const row = await store.lesen();
      if (!row?.clientId || !row.clientSecret) throw new NichtKonfiguriert();
      const jetztWert = jetzt();
      // redirect_uri must be identical to the one of the authorize request.
      const erg = await tokenAnfrage(row, {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      });
      if (erg.ungueltig) {
        throw new OneDriveFehler(
          'Der Anmeldecode ist ungültig oder abgelaufen. Bitte verbinde OneDrive erneut.',
        );
      }
      const a = erg.antwort;
      if (!a.refresh_token) {
        throw new OneDriveFehler(
          'Microsoft hat keinen Refresh-Token geliefert. Bitte versuche es erneut.',
        );
      }
      let konto: string | null = null;
      const me = await http(`${GRAPH}/me`, {
        headers: { authorization: `Bearer ${a.access_token}` },
      });
      if (me.ok) {
        const m = (await me.json()) as {
          displayName?: string;
          mail?: string;
          userPrincipalName?: string;
        };
        const adresse = m.mail ?? m.userPrincipalName;
        konto =
          m.displayName && adresse
            ? `${m.displayName} (${adresse})`
            : (m.displayName ?? adresse ?? null);
      }
      await store.speichern({
        accessToken: a.access_token,
        accessAblauf: new Date(jetztWert.getTime() + a.expires_in * 1000),
        refreshToken: a.refresh_token,
        tokenErneuertAm: jetztWert,
        konto,
        verbundenVon: von,
        verbundenAm: jetztWert,
        fehler: null,
      });
      return statusAus(await store.lesen());
    },

    async trennen() {
      if (!(await store.lesen())) return;
      await store.speichern({
        refreshToken: null,
        accessToken: null,
        accessAblauf: null,
        konto: null,
        verbundenVon: null,
        verbundenAm: null,
        tokenErneuertAm: null,
        fehler: null,
      });
    },

    async ordnerListen() {
      const ordner: OneDriveOrdner[] = [];
      let url: string | undefined =
        `${kinderUrl(await basisPfadLesen())}?$select=id,name,webUrl,folder&$top=200`;
      while (url) {
        const res: Response = await graph('GET', url);
        // The base folder does not exist yet: nothing to list.
        if (res.status === 404) return [];
        if (!res.ok) throw await graphFehler(res);
        const seite = (await res.json()) as { value: GraphItem[]; '@odata.nextLink'?: string };
        for (const item of seite.value) if (item.folder) ordner.push(alsOrdner(item));
        url = seite['@odata.nextLink'];
      }
      return ordner;
    },

    async ordnerAnlegen(name) {
      const basisPfad = await basisPfadLesen();
      const anlegen = () =>
        graph('POST', kinderUrl(basisPfad), {
          name,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'fail',
        });
      let res = await anlegen();
      if (res.status === 404) {
        await basisOrdnerAnlegen(basisPfad);
        res = await anlegen();
      }
      if (res.status === 409) throw new OrdnerExistiert(name);
      if (!res.ok) throw await graphFehler(res);
      return alsOrdner((await res.json()) as GraphItem);
    },

    async umbenennen(id, name) {
      const res = await graph('PATCH', `/me/drive/items/${encodeURIComponent(id)}`, {
        name,
        '@microsoft.graph.conflictBehavior': 'fail',
      });
      if (res.status === 404) throw new OrdnerFehlt();
      if (res.status === 409) throw new OrdnerExistiert(name);
      if (!res.ok) throw await graphFehler(res);
      return alsOrdner((await res.json()) as GraphItem);
    },

    async freigabeLink(id) {
      const res = await graph('POST', `/me/drive/items/${encodeURIComponent(id)}/createLink`, {
        type: 'view',
        scope: 'anonymous',
      });
      if (res.status === 404) throw new OrdnerFehlt();
      if (!res.ok) throw await graphFehler(res);
      const link = (await res.json()) as { link?: { webUrl?: string } };
      if (!link.link?.webUrl) throw new Error('OneDrive createLink response without link');
      return link.link.webUrl;
    },

    async loeschenWennLeer(id) {
      const pfad = `/me/drive/items/${encodeURIComponent(id)}`;
      const res = await graph('GET', `${pfad}?$select=id,folder`);
      if (res.status === 404) return 'fehlt';
      if (!res.ok) throw await graphFehler(res);
      const item = (await res.json()) as GraphItem;
      if (item.folder?.childCount !== 0) return 'nicht-leer';
      const del = await graph('DELETE', pfad);
      if (del.status === 404) return 'fehlt';
      if (!del.ok) throw await graphFehler(del);
      return 'geloescht';
    },

    async dateiHochladen(pfad, inhalt, contentType) {
      if (inhalt.byteLength > MAX_UPLOAD_BYTES) throw new OneDriveFehler('Die Datei ist zu groß.');
      // Graph creates missing parent folders on a path-based upload.
      const res = await graph(
        'PUT',
        `/me/drive/root:/${kodiereSegmente(basisPfadBereinigen(pfad))}:/content?@microsoft.graph.conflictBehavior=replace`,
        undefined,
        { inhalt, contentType },
      );
      if (!res.ok) throw await graphFehler(res);
    },

    async tokenPflegen(jetztWert) {
      const row = await store.lesen();
      if (!row?.refreshToken) return;
      if (
        row.tokenErneuertAm &&
        jetztWert.getTime() - row.tokenErneuertAm.getTime() < PFLEGE_INTERVALL_MS
      ) {
        return;
      }
      try {
        await erneuern(row);
      } catch (err) {
        // Revoked: `fehler` is stored already and shown to the admins.
        if (!(err instanceof NichtVerbunden)) throw err;
      }
    },
  };
}

/** Time budget and parallelism of one run of the job that creates missing sharing links. */
export const FREIGABE_ZEITBUDGET_MS = 8000;
export const FREIGABE_PARALLEL = 6;

/**
 * Creates the missing anonymous sharing links of the folders in the list snapshot (limited by the time
 * budget; the rest follows on the next run). Does nothing when OneDrive is not connected or there is no
 * snapshot. Errors per folder are only logged.
 */
export async function freigabenNachziehen(
  deps: {
    onedrive: Pick<OneDrive, 'status' | 'freigabeLink'>;
    ordnerCache: OrdnerCacheStore;
    freigaben: FreigabenStore;
  },
  zeitbudgetMs = FREIGABE_ZEITBUDGET_MS,
): Promise<number> {
  if (!(await deps.onedrive.status()).verbunden) return 0;
  const snapshot = await deps.ordnerCache.lesen();
  if (!snapshot) return 0;
  const links = await deps.freigaben.alle();
  const warteschlange = snapshot.ordner.filter((o) => !links.has(o.id)).map((o) => o.id);
  const frist = Date.now() + zeitbudgetMs;
  let angelegt = 0;
  const arbeiter = async () => {
    for (let id = warteschlange.shift(); id !== undefined; id = warteschlange.shift()) {
      if (Date.now() >= frist) return;
      try {
        await deps.freigaben.setzen(id, await deps.onedrive.freigabeLink(id));
        angelegt += 1;
      } catch (err) {
        if (err instanceof NichtVerbunden) return;
        console.error(`OneDrive sharing link of folder ${id} failed`, err);
      }
    }
  };
  await Promise.all(Array.from({ length: FREIGABE_PARALLEL }, arbeiter));
  return angelegt;
}

/** Registers the job tasks: keeps the refresh token alive and (optionally) creates missing sharing links. */
export function registriereOneDriveAufgaben(
  benachrichtigungen: Pick<Benachrichtigungen, 'registriereAufgabe'>,
  onedrive: Pick<OneDrive, 'tokenPflegen'>,
  bilder?: {
    onedrive: Pick<OneDrive, 'status' | 'freigabeLink'>;
    ordnerCache: OrdnerCacheStore;
    freigaben: FreigabenStore;
  },
): void {
  benachrichtigungen.registriereAufgabe('onedrive.token', (jetzt) => onedrive.tokenPflegen(jetzt));
  if (bilder) {
    benachrichtigungen.registriereAufgabe('bilder.freigaben', async () => {
      await freigabenNachziehen(bilder);
    });
  }
}
