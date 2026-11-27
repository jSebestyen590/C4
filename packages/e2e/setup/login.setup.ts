import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test as setup } from '@playwright/test';
import { idQuellen, type IdQuelle } from './idQuellen';

const STATE = '.auth/state.json';
const IDS = '.auth/ids.json';

type Eintrag = Record<string, unknown>;

setup('Anmeldung und IDs auflösen', async ({ page, request, baseURL }) => {
  const benutzer = process.env.E2E_USER || 'Testuser2';
  const passwort = process.env.E2E_PASSWORD;
  if (!passwort) {
    throw new Error(
      'packages/e2e/.env.e2e fehlt oder E2E_PASSWORD ist leer, siehe .env.e2e.example.',
    );
  }
  mkdirSync('.auth', { recursive: true });

  // `Protected` leitet ohne Anmeldung selbst zur Cognito-Hosted-UI weiter (kein Login-Button in der App).
  await page.goto('');
  await page.waitForURL(/amazoncognito\.com/);
  // Die klassische Hosted UI enthält das Formular doppelt (Desktop und Mobil), nur eines ist sichtbar.
  await page.locator('input[name="username"]:visible').fill(benutzer);
  await page.locator('input[name="password"]:visible').fill(passwort);
  await page.locator('input[name="signInSubmitButton"]:visible').click();

  // Zurück in der App und Startseite gerendert (Rückweg über `/auth/callback`).
  await page.waitForURL(
    (url) => url.href.startsWith(baseURL!) && !url.pathname.endsWith('/auth/callback'),
  );
  await expect(page.getByText('Weiterleitung zur Anmeldung')).toHaveCount(0);
  await expect(page.locator('main, [role="main"], nav').first()).toBeVisible();

  // Push-Dialog würde die Seiten verdecken (Schlüssel wie in `PushAbfrage.tsx`).
  await page.evaluate(() => localStorage.setItem('c4.push.nein', '1'));
  const token = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const schluessel = localStorage.key(i);
      if (schluessel?.startsWith('oidc.user:')) {
        const user = JSON.parse(localStorage.getItem(schluessel) ?? '{}') as {
          access_token?: string;
        };
        return user.access_token ?? null;
      }
    }
    return null;
  });
  expect(token, 'Kein Access-Token im localStorage gefunden').toBeTruthy();
  await page.context().storageState({ path: STATE });

  async function ersterWert(quelle: IdQuelle): Promise<string | null> {
    for (const abfrage of quelle.abfragen) {
      const antwort = await request.get(abfrage.api, {
        params: abfrage.query,
        headers: { authorization: `Bearer ${token}` },
      });
      if (!antwort.ok()) continue;
      if (!antwort.headers()['content-type']?.includes('application/json')) {
        throw new Error(`${abfrage.api} liefert kein JSON (falscher Pfad?)`);
      }
      const body: unknown = await antwort.json();
      const liste = abfrage.liste ? (body as Eintrag)[abfrage.liste] : body;
      if (!Array.isArray(liste)) continue;
      const element = (liste as Eintrag[]).find((e) => !quelle.filter || quelle.filter(e));
      if (!element) continue;
      const wert = typeof quelle.feld === 'function' ? quelle.feld(element) : element[quelle.feld];
      if (typeof wert === 'string' && wert) return wert;
    }
    return null;
  }

  // `{ "<Router-Pfad>": { "<param>": "<wert>" } | null }`
  const ids: Record<string, Record<string, string> | null> = {};
  for (const quelle of idQuellen()) {
    const wert = await ersterWert(quelle);
    for (const route of quelle.routen) {
      ids[route] = wert === null ? null : { [quelle.param]: wert };
    }
  }
  writeFileSync(IDS, `${JSON.stringify(ids, null, 2)}\n`);
});
