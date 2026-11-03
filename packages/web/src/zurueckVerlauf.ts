/** Where each history entry was reached from, so back links can return there instead of a fixed page. */

export interface Ort {
  key: string;
  pathname: string;
  search: string;
}

/** Per history entry (location.key): the in-app page it was reached from. */
export type Verlauf = Record<string, Ort>;

const SPEICHER = 'c4.zurueckVerlauf';

/**
 * Records a location change. A push remembers the previous page; a replace inherits the replaced entry's origin
 * (e.g. a form replaced by the saved item); a pop (back/forward, reload) adds nothing.
 */
export function merken(
  verlauf: Verlauf,
  vorher: Ort | null,
  jetzt: Ort,
  typ: 'PUSH' | 'REPLACE' | 'POP',
): Verlauf {
  if (!vorher || vorher.key === jetzt.key || verlauf[jetzt.key]) return verlauf;
  if (typ === 'PUSH') return { ...verlauf, [jetzt.key]: vorher };
  const geerbt = verlauf[vorher.key];
  if (typ === 'REPLACE' && geerbt) return { ...verlauf, [jetzt.key]: geerbt };
  return verlauf;
}

/**
 * The page a back link returns to, and how many history steps that is. Entries with the same path as the current
 * page (only the query changed, or the page was replaced by itself) are skipped. Null without in-app history.
 */
export function rueckweg(verlauf: Verlauf, jetzt: Ort): { ort: Ort; schritte: number } | null {
  let ort = verlauf[jetzt.key];
  let schritte = 1;
  while (ort && ort.pathname === jetzt.pathname) {
    ort = verlauf[ort.key];
    schritte++;
  }
  return ort ? { ort, schritte } : null;
}

let verlauf: Verlauf = laden();
let letzter: Ort | null = null;

function laden(): Verlauf {
  try {
    return JSON.parse(sessionStorage.getItem(SPEICHER) ?? '{}') as Verlauf;
  } catch {
    return {};
  }
}

/** Called by the layout on every render, before the pages render their back links. */
export function ortMerken(jetzt: Ort, typ: 'PUSH' | 'REPLACE' | 'POP') {
  const neu = merken(verlauf, letzter, jetzt, typ);
  letzter = jetzt;
  if (neu === verlauf) return;
  verlauf = neu;
  try {
    // Survives pull-to-refresh reloads; the browser keeps the history entries and their keys.
    sessionStorage.setItem(SPEICHER, JSON.stringify(verlauf));
  } catch {
    // Without storage the back links fall back to their fixed target after a reload.
  }
}

export function aktuellerRueckweg(jetzt: Ort) {
  return rueckweg(verlauf, jetzt);
}
