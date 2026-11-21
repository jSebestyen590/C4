/**
 * Unsaved form state in `localStorage`, so a reload (or a killed tab on a phone) does not lose
 * what was typed. Every access is wrapped in try/catch: storage can be full, blocked or missing.
 */
const PRAEFIX = 'c4:entwurf:';

export interface LokalerEntwurf<T> {
  wert: T;
  /** Milliseconds since the epoch when it was stored. */
  zeit: number;
}

export function lokalSpeichern<T>(schluessel: string, wert: T, jetzt = Date.now()): void {
  try {
    localStorage.setItem(PRAEFIX + schluessel, JSON.stringify({ wert, zeit: jetzt }));
  } catch {
    // Storage unavailable: the server draft is still there.
  }
}

/** The stored entry, or null when absent, unreadable or not shaped like an entry. */
export function lokalLesen<T>(schluessel: string): LokalerEntwurf<T> | null {
  try {
    const roh = localStorage.getItem(PRAEFIX + schluessel);
    if (!roh) return null;
    const p = JSON.parse(roh) as Partial<LokalerEntwurf<T>> | null;
    if (!p || typeof p !== 'object' || typeof p.zeit !== 'number' || p.wert == null) return null;
    return { wert: p.wert, zeit: p.zeit };
  } catch {
    return null;
  }
}

export function lokalLoeschen(...schluessel: string[]): void {
  for (const s of schluessel) {
    try {
      localStorage.removeItem(PRAEFIX + s);
    } catch {
      // Ignore.
    }
  }
}

/** Whether the local state is newer than the server's last change (ISO timestamp). */
export const lokalIstNeuer = (zeit: number, serverIso: string): boolean => {
  const server = Date.parse(serverIso);
  return Number.isNaN(server) || zeit > server;
};
