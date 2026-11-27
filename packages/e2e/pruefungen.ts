import { expect, type Page } from '@playwright/test';

/** Verstöße je Prüfung, je Zeile ein Verstoß; `weich` sind nur Hinweise (siehe Tabelle im Plan). */
export interface Funde {
  hart: string[];
  weich: string[];
}

/** Sammelt Console-Fehler, Page-Errors und API-5xx ab dem Aufruf (vor `goto` starten). */
export function beobachteConsole(page: Page): () => string[] {
  const meldungen: string[] = [];
  page.on('console', (nachricht) => {
    if (nachricht.type() === 'error') meldungen.push(`console: ${kuerzen(nachricht.text(), 150)}`);
  });
  page.on('pageerror', (fehler) => meldungen.push(`pageerror: ${kuerzen(fehler.message, 150)}`));
  page.on('response', (antwort) => {
    const url = new URL(antwort.url());
    if (url.pathname.includes('/api/') && antwort.status() >= 500) {
      meldungen.push(`${antwort.status()} ${antwort.request().method()} ${url.pathname}`);
    }
  });
  return () => meldungen;
}

function kuerzen(text: string, max: number): string {
  const eins = text.replace(/\s+/g, ' ').trim();
  return eins.length > max ? `${eins.slice(0, max - 1)}…` : eins;
}

/** Wartet auf `networkidle` und darauf, dass kein Mantine-Loader mehr sichtbar ist. */
export async function warteBisGeladen(page: Page): Promise<string | null> {
  try {
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.mantine-Loader-root:visible')).toHaveCount(0);
    return null;
  } catch {
    return 'Seite lädt nicht fertig';
  }
}

/** Die Seite zeigt das Ziel (kein Redirect) und keine Fehlermeldung statt des Inhalts. */
export async function rendert(page: Page, pfad: string, basis: string): Promise<string[]> {
  const zeilen: string[] = [];
  const erwartet = (new URL(basis).pathname.replace(/\/$/, '') + pfad).replace(/\/$/, '') || '/';
  const ist = new URL(page.url()).pathname.replace(/\/$/, '') || '/';
  if (ist !== erwartet) zeilen.push(`Weiterleitung auf ${ist} (erwartet ${erwartet})`);
  for (const text of ['Kein Zugriff', 'Verbindung fehlgeschlagen']) {
    if (await page.getByText(text).first().isVisible()) zeilen.push(`Meldung "${text}" sichtbar`);
  }
  return zeilen;
}

export async function scrollVerstoesse(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const breite = window.innerWidth;
    const scroll = document.documentElement.scrollWidth;
    if (scroll <= breite + 1) return [];
    const kurz = (t: string) => {
      const s = t.replace(/\s+/g, ' ').trim();
      return s.length > 40 ? `${s.slice(0, 39)}…` : s;
    };
    const breiteste = [...document.body.querySelectorAll('*')]
      .map((el) => ({ el, rechts: el.getBoundingClientRect().right }))
      .filter((e) => e.rechts > breite + 1)
      .sort((a, b) => b.rechts - a.rechts)
      .slice(0, 5)
      .map(
        (e) =>
          `${e.el.tagName.toLowerCase()} "${kurz(e.el.getAttribute('aria-label') ?? e.el.textContent ?? '')}" rechts ${Math.round(e.rechts)}`,
      );
    return [`scrollWidth ${scroll} > ${breite}`, ...breiteste];
  });
}

export async function touchVerstoesse(page: Page): Promise<Funde> {
  return page.evaluate(() => {
    const kurz = (t: string) => {
      const s = t.replace(/\s+/g, ' ').trim();
      return s.length > 40 ? `${s.slice(0, 39)}…` : s;
    };
    const auswahl = [
      'button',
      '[role=button]',
      '[role=tab]',
      '[role=switch]',
      '[role=combobox]',
      'select',
      'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file])',
      'textarea',
      'a[href]',
    ].join(',');
    const funde: { hart: string[]; weich: string[] } = { hart: [], weich: [] };
    for (const el of document.querySelectorAll<HTMLElement>(auswahl)) {
      const rect = el.getBoundingClientRect();
      const stil = getComputedStyle(el);
      if (rect.width <= 1 && rect.height <= 1) continue;
      if (stil.display === 'none' || stil.visibility === 'hidden') continue;
      if (el.closest('[aria-hidden=true], [inert]')) continue;
      if (rect.width >= 41.5 && rect.height >= 41.5) continue;
      if (el.tagName === 'A') {
        const eltern = el.parentElement;
        const imText =
          eltern !== null &&
          (['P', 'LI', 'TD'].includes(eltern.tagName) ||
            kurz(eltern.textContent ?? '') !== kurz(el.textContent ?? ''));
        if (imText) continue;
      }
      const name = kurz(
        el.getAttribute('aria-label') ??
          el.textContent ??
          el.getAttribute('placeholder') ??
          el.getAttribute('title') ??
          '',
      );
      const zeile = `${el.tagName.toLowerCase()} "${name}" ${Math.round(rect.width)}x${Math.round(rect.height)}`;
      const weich = el.closest('table, [class*="mantine-Pagination"], [class*="mantine-Badge"]');
      (weich ? funde.weich : funde.hart).push(zeile);
    }
    return funde;
  });
}

export async function schriftVerstoesse(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const kurz = (t: string) => {
      const s = t.replace(/\s+/g, ' ').trim();
      return s.length > 40 ? `${s.slice(0, 39)}…` : s;
    };
    const zeilen: string[] = [];
    const auswahl =
      'input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable=true]';
    for (const el of document.querySelectorAll<HTMLElement>(auswahl)) {
      const rect = el.getBoundingClientRect();
      const stil = getComputedStyle(el);
      if (rect.width <= 1 && rect.height <= 1) continue;
      if (stil.display === 'none' || stil.visibility === 'hidden') continue;
      const groesse = parseFloat(stil.fontSize);
      if (groesse >= 16) continue;
      const name = kurz(
        el.getAttribute('aria-label') ??
          el.getAttribute('placeholder') ??
          el.getAttribute('name') ??
          '',
      );
      zeilen.push(`${el.tagName.toLowerCase()} "${name}" ${groesse}px`);
    }
    return zeilen;
  });
}
