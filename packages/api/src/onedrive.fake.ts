import type { OneDriveStatusDto } from '@c4/shared';
import {
  basisPfadBereinigen,
  NichtKonfiguriert,
  NichtVerbunden,
  OneDriveFehler,
  OrdnerExistiert,
  OrdnerFehlt,
  STANDARD_BASIS_PFAD,
  type OneDrive,
  type OneDriveOrdner,
} from './onedrive';

export interface FakeOrdner extends OneDriveOrdner {
  /** Number of items inside; folders with content are not deleted. */
  inhalt: number;
}

/**
 * In-memory OneDrive for tests and local development. `ordner` is inspectable; `ausfall` makes every
 * folder operation throw (network error); `verbunden` can be switched by tests.
 */
export function createFakeOneDrive(start: { verbunden?: boolean; ordner?: string[] } = {}) {
  let n = 0;
  const ordner = new Map<string, FakeOrdner>();
  const neu = (name: string, inhalt = 0): FakeOrdner => {
    n += 1;
    const o = {
      id: `ordner${n}`,
      name,
      webUrl: `https://onedrive.example/${encodeURIComponent(name)}`,
      inhalt,
    };
    ordner.set(o.id, o);
    return o;
  };
  for (const name of start.ordner ?? []) neu(name);
  const zustand = {
    verbunden: start.verbunden ?? true,
    clientId: start.verbunden === false ? (null as string | null) : 'fake-client',
    basisPfad: STANDARD_BASIS_PFAD,
    konto: 'Test Konto (test@example.com)' as string | null,
    fehler: null as string | null,
    verbundenVon: 'admin' as string | null,
    ausfall: false,
  };
  const pruefen = () => {
    if (zustand.ausfall) throw new Error('Netzwerkfehler');
    if (!zustand.verbunden) throw new NichtVerbunden();
  };
  const alsOrdner = ({ id, name, webUrl }: FakeOrdner): OneDriveOrdner => ({ id, name, webUrl });
  const status = (): OneDriveStatusDto => ({
    verbunden: zustand.verbunden,
    konto: zustand.verbunden ? zustand.konto : null,
    basisPfad: zustand.basisPfad,
    fehler: zustand.fehler,
    clientIdGesetzt: !!zustand.clientId,
    clientId: zustand.clientId || null,
    verbundenAm: zustand.verbunden ? '2025-01-01T00:00:00.000Z' : null,
    verbundenVon: zustand.verbunden ? zustand.verbundenVon : null,
  });

  const onedrive: OneDrive & {
    ordner: Map<string, FakeOrdner>;
    /** Test hooks. */
    zustand: typeof zustand;
    hinzufuegen(name: string, inhalt?: number): FakeOrdner;
    /** Codes handed to `codeEinloesen`. */
    codes: string[];
    tokenGepflegt: number;
    /** Number of `freigabeLink` calls. */
    freigaben: number;
    /** Uploaded files by path. */
    dateien: Map<string, { inhalt: Uint8Array; contentType: string }>;
  } = {
    ordner,
    zustand,
    codes: [],
    tokenGepflegt: 0,
    freigaben: 0,
    dateien: new Map(),
    hinzufuegen: neu,
    async status() {
      return status();
    },
    async konfigurieren(daten, von) {
      zustand.clientId = daten.clientId;
      zustand.basisPfad = basisPfadBereinigen(daten.basisPfad) || STANDARD_BASIS_PFAD;
      zustand.verbundenVon = von;
    },
    async loginUrl(redirectUri, state) {
      if (!zustand.clientId) throw new NichtKonfiguriert();
      return `https://login.example/authorize?redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
    },
    async codeEinloesen(code, _redirectUri, von) {
      onedrive.codes.push(code);
      if (code === 'ungueltig')
        throw new OneDriveFehler('Der Anmeldecode ist ungültig oder abgelaufen.');
      zustand.verbunden = true;
      zustand.fehler = null;
      zustand.verbundenVon = von;
      return status();
    },
    async trennen() {
      zustand.verbunden = false;
    },
    async ordnerListen() {
      pruefen();
      return [...ordner.values()].map(alsOrdner);
    },
    async ordnerAnlegen(name) {
      pruefen();
      if ([...ordner.values()].some((o) => o.name.toLowerCase() === name.toLowerCase())) {
        throw new OrdnerExistiert(name);
      }
      return alsOrdner(neu(name));
    },
    async umbenennen(id, name) {
      pruefen();
      const o = ordner.get(id);
      if (!o) throw new OrdnerFehlt();
      if (
        [...ordner.values()].some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase())
      ) {
        throw new OrdnerExistiert(name);
      }
      o.name = name;
      o.webUrl = `https://onedrive.example/${encodeURIComponent(name)}`;
      return alsOrdner(o);
    },
    async freigabeLink(id) {
      pruefen();
      if (!ordner.has(id)) throw new OrdnerFehlt();
      onedrive.freigaben += 1;
      return `https://1drv.ms/f/${id}`;
    },
    async loeschenWennLeer(id) {
      pruefen();
      const o = ordner.get(id);
      if (!o) return 'fehlt';
      if (o.inhalt > 0) return 'nicht-leer';
      ordner.delete(id);
      return 'geloescht';
    },
    async dateiHochladen(pfad, inhalt, contentType) {
      pruefen();
      onedrive.dateien.set(pfad, { inhalt, contentType });
    },
    async tokenPflegen() {
      onedrive.tokenGepflegt += 1;
    },
  };
  return onedrive;
}
