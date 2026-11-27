# Playwright: E2E-Setup und Layout-Smoke-Test

Umsetzungsplan für automatisierte Browser-Checks mit Playwright. Hintergrund: `browser-check`-Läufe im eingebauten
Browser kosten pro Seite und Durchlauf 2–12 M Tokens (Screenshots, Seitenbäume, Wiederholung nach jedem Fix), ein
Playwright-Lauf über den `tester`-Agenten nur ~0,1–0,2 M. Diese erste Umsetzung bringt nur das Setup und **einen
generischen Layout-Smoke-Test über alle Routen**. Fachliche E2E-Flows kommen später (siehe „Spätere Folgearbeiten“).

## Entscheidungen

| Thema          | Entscheidung                                                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Paket          | Neues Workspace-Paket **`packages/e2e`** (`@c4/e2e`): eigene Node-tsconfig, keine Vermischung mit dem Vite/jsdom-Setup von `packages/web`                                                                                            |
| Ziel           | `https://dev.c4-leipzig.de/app/`, überschreibbar mit `E2E_BASE_URL` (lokal später, braucht `allow_localhost_callback` und eine lokale API)                                                                                           |
| Browser        | Nur **Chromium** (ein Download, schnell). WebKit/iOS-Safari später, falls nötig                                                                                                                                                      |
| Projekte       | `phone` 375x812 (`isMobile`, `hasTouch`, `deviceScaleFactor: 2`) und `desktop` 1440x900, beide hängen vom Projekt `setup` ab                                                                                                         |
| CI             | **Nicht in CI** (Actions-Minuten knapp). Kein `test`/`build`-Skript im Paket, damit `pnpm -r test`/`build` es überspringt. `typecheck` ja (billig, kein Browser nötig)                                                               |
| Login          | Setup-Projekt meldet sich **bei jedem Lauf** neu über die Cognito-Hosted-UI an (wenige Sekunden) und schreibt `storageState`. Keine Wiederverwendung über Läufe: Refresh-Token-Rotation würde alte Dateien ungültig machen           |
| Passwort       | `packages/e2e/.env.e2e` (gitignored über `.env.*`), füllt der User selbst. Nie in Repo, Chat oder Testausgabe                                                                                                                        |
| IDs für Routen | Per **API-Aufruf** im Setup (Bearer-Token aus dem `storageState`), erstes Element der Liste. Leere Liste → Route wird mit Begründung übersprungen, nicht rot                                                                         |
| Testdaten      | Der Smoke-Test **liest nur**, legt nichts an. Spätere Flow-Specs legen Daten mit Präfix `E2E` an; Aufräumen optional (bis zum ersten Prod-Release darf dev-Datenbestand gelöscht werden)                                             |
| Prüfungen      | Je Route und Projekt: keine horizontale Seitenscroll, keine Console-Fehler/Page-Errors/5xx, Seite rendert (kein „Kein Zugriff“, kein Redirect); auf `phone` zusätzlich Touch-Ziele ≥ 42 px und Input-Schrift ≥ 16 px (Details unten) |
| Ausnahmen      | Zentral in `packages/e2e/ausnahmen.ts` (Route + Selektor + Begründung), keine Test-Attribute im App-Code                                                                                                                             |
| Erstlauf-Funde | Klein → im selben PR beheben; größer → in `docs/refactoring.md` („Offen“) eintragen **und** als Ausnahme mit Verweis darauf, damit der Lauf grün ist                                                                                 |

## Dateien

```
packages/e2e/
  package.json            @c4/e2e, devDependency @playwright/test, Skripte (unten)
  tsconfig.json           extends ../../tsconfig.base.json, types: ["node"], lib ES2022 + DOM (für page.evaluate)
  playwright.config.ts    Projekte setup/phone/desktop, baseURL, Reporter, Timeouts
  .env.e2e.example        E2E_USER=Testuser2, E2E_PASSWORD= (leer), E2E_BASE_URL= (optional)
  setup/login.setup.ts    Login + IDs auflösen → .auth/state.json, .auth/ids.json
  routen.ts               Liste aller Routen mit Art und ID-Quelle
  ausnahmen.ts            erlaubte Verstöße mit Begründung
  pruefungen.ts           die vier Layout-Prüfungen als Funktionen (page.evaluate)
  smoke.spec.ts           ein Test je Route, läuft in phone und desktop
  routen-vollstaendig.spec.ts  Abgleich routen.ts ↔ path= in packages/web/src (ohne Browser)
```

Weitere Änderungen:

- `.gitignore`: `packages/e2e/.auth/`, `packages/e2e/test-results/`, `packages/e2e/playwright-report/`, Ausnahme
  `!packages/e2e/.env.e2e.example` (sonst greift `.env.*`).
- `eslint.config.js`: `packages/e2e/**/*.ts` in den Block mit Node-Globals aufnehmen; Artefakt-Ordner ignorieren.
- Root-`package.json`: `"e2e": "pnpm --filter @c4/e2e e2e"`.
- `pnpm-lock.yaml` mitcommitten (CI nutzt `--frozen-lockfile`). `pnpm-workspace.yaml` braucht keine Änderung
  (`packages/*`); der Postinstall von `@playwright/test` lädt keine Browser.

Skripte in `packages/e2e/package.json`:

```json
{
  "e2e": "playwright test",
  "e2e:install": "playwright install chromium",
  "typecheck": "tsc -p ."
}
```

## Konfiguration (`playwright.config.ts`)

- `.env.e2e` mit `process.loadEnvFile('.env.e2e')` laden (Node ≥ 22, kein `dotenv`); fehlt sie oder `E2E_PASSWORD`,
  bricht das Setup mit klarer deutscher Meldung ab („`packages/e2e/.env.e2e` fehlt, siehe `.env.e2e.example`“).
- `baseURL`: `E2E_BASE_URL ?? 'https://dev.c4-leipzig.de/app/'`. Navigation immer relativ ohne führenden Slash
  (`page.goto('finanzen/konten')`), damit `/app/` erhalten bleibt.
- `use`: `serviceWorkers: 'block'`, `locale: 'de-DE'`, `timezoneId: 'Europe/Berlin'`, `screenshot: 'only-on-failure'`,
  `trace: 'retain-on-failure'`. Screenshots/Traces landen als Dateien in `test-results/`, nicht im Agent-Kontext.
- `workers: 4`, `fullyParallel: true`, `retries: 1` (Lambda-Kaltstarts), `timeout: 30_000`, `expect.timeout: 10_000`.
- `reporter`: `[['line'], ['html', { open: 'never' }]]`. `line` hält die Ausgabe kurz; Details stehen im HTML-Report.
- Projekte: `setup` (`testMatch: /.*\.setup\.ts/`), `phone` und `desktop` mit `dependencies: ['setup']` und
  `storageState: '.auth/state.json'`. `routen-vollstaendig.spec.ts` nur im Projekt `desktop` (braucht keinen Browser,
  einmal reicht).

## Login (`setup/login.setup.ts`)

1. `page.goto('')` → `Protected` leitet automatisch zur Cognito-Hosted-UI (`*.auth.eu-central-1.amazoncognito.com`).
   Es gibt keinen Login-Button in der App.
2. Klassische Hosted UI (kein Managed Login, siehe `infra/modules/app/main.tf`): Sie enthält das Formular **doppelt**
   (Desktop- und Mobilvariante), nur eines sichtbar. Deshalb `locator('input[name="username"]:visible')`,
   `input[name="password"]:visible`, Absenden-Button `:visible`. Das Feld nimmt Benutzername oder E-Mail.
3. Warten bis URL wieder unter `baseURL` liegt und die Startseite gerendert ist (kein Loader „Weiterleitung zur
   Anmeldung“ mehr).
4. Vor dem Speichern `localStorage['c4.push.nein'] = '1'` setzen (Wert wie in `PushAbfrage.tsx` schreiben), sonst
   verdeckt der Push-Dialog die Seiten. Dann `page.context().storageState({ path: '.auth/state.json' })`.
5. **IDs auflösen:** Access-Token aus `localStorage` lesen (Schlüssel beginnt mit `oidc.user:`, JSON mit
   `access_token`), dann mit `request` (`authorization: Bearer …`) die Listen-Endpunkte aus `routen.ts` abfragen und
   `{ "<route>": { "<param>": "<wert>" } }` nach `.auth/ids.json` schreiben. Fehlende Daten → Eintrag `null`.

Tokens: Access-Token 60 min, ein Lauf dauert wenige Minuten; `automaticSilentRenew` greift also nicht. Alle Worker
teilen denselben `storageState`, das ist ohne Refresh unkritisch.

Das Passwort steht nur in `.env.e2e`. Der Setup-Test loggt es nie (kein `console.log` der Env, `fill` statt `type` mit
Trace-Text; im Trace wird `fill` mitgeschrieben, deshalb `trace` für das Setup-Projekt auf `'off'` setzen).

## Routen (`routen.ts`)

Eine Liste, kein Ableiten zur Laufzeit:

```ts
type Art = 'mobil' | 'finanzen-arbeit';
interface Route {
  pfad: string; // wie im Router, z. B. '/finanzen/journal/:id'
  art: Art;
  ids?: Record<string, { api: string; feld: string; query?: Record<string, string> }>;
  ueberspringen?: string; // Begründung, z. B. Seite legt beim Öffnen Daten an
}
```

Quelle der Pfade: `packages/web/src/App.tsx` und `packages/web/src/routes/*Routen.tsx` (alle `path=` sind absolut,
nicht verschachtelt). Ohne `/auth/callback` und `*`. Stand bei Planung (~79 Pfade):

- **mobil:** `/`, `/profil`, `/todos`, `/benachrichtigungen`, `/benachrichtigungen/verlauf`, `/mitglieder`,
  `/mitglieder/:kennung`, `/historie`, `/posten`, `/posten/:id`, `/buch`, `/belege`, `/belege/einreichen`,
  `/belege/:id`, `/bilder`, `/bilder/einrichtung`, `/schluessel`, `/schluessel/:id`, `/schluessel/anfragen/:id`,
  `/trichter`, `/trichter/neu`, `/trichter/verwaltung`, alle `/privatpartys…`, `/protokolle`, `/protokolle/neu`,
  `/protokolle/:id`, alle `/umfragen…`, `/waren`, `/waren/:id`, `/lager`, `/lager/stammdaten`, `/lager/inventur/:id`,
  `/lager/:id/entnehmen|einlagern|umlagern`, alle `/inventar…`, alle `/kalender…`.
- **finanzen-arbeit:** alle `/finanzen/…` (inkl. `/finanzen/buch…`, `/finanzen/lager-abgleich…`). Die
  Kassenzählung am Event hat keine eigene Route (Teil der Event-Seite, also mobil).

ID-Quellen (Antwortform je Endpunkt beim Umsetzen prüfen: Array oder Objekt mit Liste; Feldname meist `id`):

| Param-Route                                                    | Endpunkt                                                                                        |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `/mitglieder/:kennung`                                         | `GET /api/mitglieder` (Feld `kennung` prüfen)                                                   |
| `/posten/:id`                                                  | `GET /api/posten`                                                                               |
| `/schluessel/:id`, `/schluessel/anfragen/:id`                  | `GET /api/schluessel`, `GET /api/schluessel/anfragen`                                           |
| `/protokolle/:id`                                              | `GET /api/protokolle`                                                                           |
| `/umfragen/:id`, `/umfragen/:id/bearbeiten`                    | `GET /api/umfragen` (leer → `/api/umfragen/beendet`)                                            |
| `/privatpartys/:id…`, `/privatpartys/personen/:id`             | Liste in `routes/privatpartys.ts` suchen; `/api/privatpartys/personen`                          |
| `/waren/:id`                                                   | `GET /api/waren`                                                                                |
| `/lager/inventur/:id`, `/lager/:id/…`                          | `GET /api/inventuren`, `GET /api/lagerorte`                                                     |
| `/inventar/gegenstaende                                        | ausleihen                                                                                       | ifcos/:id` | `GET /api/inventar/gegenstaende | ausleihen | ifcos` |
| `/kalender/events/:id…`                                        | `GET /api/kalender/events?von&bis` (heute −60 / +60 Tage, Format laut `kalenderZeitraumSchema`) |
| `/finanzen/journal/:id`                                        | `GET /api/finanzen/buchungen`                                                                   |
| `/finanzen/bargeld/zaehlungen/:id`                             | `GET /api/finanzen/zaehlungen`                                                                  |
| `/finanzen/kassen/abrechnungen/:id`                            | `GET /api/finanzen/kassenabrechnungen`                                                          |
| `/finanzen/kassen/:kontoId/abrechnen`                          | `GET /api/finanzen/kassen`                                                                      |
| `/finanzen/belege/:id`, `/finanzen/belege/entwurf/:id`         | `GET /api/finanzen/belege`; Entwurfsliste in `routes/finanzen.ts` suchen                        |
| `/finanzen/rechnungen/:id`, `/finanzen/rechnungen/entwurf/:id` | `GET /api/finanzen/rechnungen`, `GET /api/finanzen/rechnung-entwuerfe`                          |
| `/belege/:id`                                                  | `GET /api/finanzen/einreichungen`                                                               |
| `/finanzen/buch/seiten/:id`                                    | `GET /api/buch/seiten`                                                                          |
| `/finanzen/lager-abgleich/:wareId`                             | `GET /api/lager-abgleich`                                                                       |

**Seiten mit Nebenwirkung beim Öffnen:** Beim Umsetzen für alle `…/neu`- und `…/entwurf/…`-Seiten prüfen (grep nach
Mutationen in `useEffect`/beim Mount), ob schon das Öffnen Daten anlegt (z. B. Entwurf per Autosave). Solche Routen
bekommen `ueberspringen` mit Begründung, bis eine Flow-Spec sie mit `E2E`-Daten abdeckt.

`routen-vollstaendig.spec.ts` liest per Regex alle `path="…"` aus `App.tsx` und `routes/*Routen.tsx` und vergleicht
mit `routen.ts`: neue Route ohne Eintrag → rot mit der Liste der fehlenden Pfade. So bleibt der Smoke-Test aktuell.

## Prüfungen (`pruefungen.ts`, `smoke.spec.ts`)

Ablauf je Route und Projekt:

1. Listener vor `goto`: `page.on('console')` (Typ `error`), `page.on('pageerror')`, `page.on('response')` für
   `/api/…` mit Status ≥ 500.
2. `page.goto(pfad mit eingesetzten IDs)`; dann warten auf `networkidle` und bis kein `.mantine-Loader` mehr sichtbar
   ist (Timeout → Fehler „Seite lädt nicht fertig“).
3. **Rendert:** URL-Pfad entspricht dem Ziel (kein Redirect auf `/` oder `/profil`), kein Alert „Kein Zugriff“ oder
   „Verbindung fehlgeschlagen“ (Testuser2 ist Admin).
4. Prüfungen per `page.evaluate`, je Verstoß eine kurze Zeile (Selektor-Hinweis = Tag + Text/aria-label, gekürzt auf
   40 Zeichen, plus Messwert). Pro Prüfung ein `expect.soft`, damit ein Lauf alle Verstöße zeigt.

| Prüfung                | Regel                                                                                                                                                 | mobil @phone | mobil @desktop | finanzen-arbeit @phone | finanzen-arbeit @desktop |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------- | ---------------------- | ------------------------ |
| Rendert                | siehe 3.                                                                                                                                              | hart         | hart           | hart                   | hart                     |
| Horizontale Scroll     | `documentElement.scrollWidth <= innerWidth + 1`; bei Verstoß die breitesten Elemente mit `getBoundingClientRect().right > innerWidth` nennen (max. 5) | hart         | hart           | hart                   | hart                     |
| Console/Page-Error/5xx | keine, außer Einträgen in `ausnahmen.ts`                                                                                                              | hart         | hart           | hart                   | hart                     |
| Touch-Ziele ≥ 42 px    | siehe unten                                                                                                                                           | hart         | –              | Hinweis                | –                        |
| Input-Schrift ≥ 16 px  | `input` (ohne hidden/checkbox/radio), `textarea`, `select`, `[contenteditable=true]`: berechnete `font-size` ≥ 16                                     | hart         | –              | Hinweis                | –                        |

„Hinweis“ = kein Fehlschlag, sondern `test.info().annotations.push({ type: 'hinweis', … })`; erscheint im HTML-Report.
Begründung: Finanzen-Arbeitsseiten sind desktop first, das Phone-Layout ist zweitrangig, darf aber nicht seitlich
scrollen (CLAUDE.md). Am Desktop zählen Touch-Ziele und iOS-Zoom nicht.

**Touch-Ziele** (sichtbare Elemente, `getBoundingClientRect`, Breite **und** Höhe ≥ 42, Toleranz 0,5 px):
`button`, `[role=button]`, `[role=tab]`, `[role=switch]`, `[role=combobox]`, `select`, `input` (ohne
hidden/checkbox/radio/file), `textarea`, `a[href]` **außer** Links im Fließtext (Elternelement ist `p`, `li`, `td`
oder Text mit mehr als dem Linktext). Checkboxen/Radios werden über ihr Label bedient und sind ausgenommen. Bei
Elementen in einem Mantine-`Table`, `Pagination` oder `Badge` ebenfalls nur Hinweis (zu erwarten, eigene Entscheidung
nach dem Erstlauf). Explorer-Befund: 63 `ActionIcon`-Stellen in 40 Dateien und viele `size="xs|sm"` – mit Funden
rechnen.

`ausnahmen.ts`:

```ts
export const ausnahmen: {
  route: string | RegExp;
  pruefung: 'touch' | 'schrift' | 'scroll' | 'console';
  treffer: string | RegExp;
  grund: string;
}[] = [];
```

`treffer` wird gegen die Verstoß-Zeile geprüft (Selektor-Hinweis bzw. Console-Text). Jeder Eintrag braucht einen
`grund`; Einträge für offene Mängel verweisen auf `docs/refactoring.md`.

## Ausgabe und Aufruf durch den `tester`

- Einmalig lokal: `pnpm install`, `pnpm --filter @c4/e2e e2e:install`, `.env.e2e` aus der Vorlage anlegen und
  Passwort eintragen (User).
- Lauf: `pnpm e2e 2>&1 | tail -40`. Nur eine Route/Seite: `pnpm e2e -- --grep "finanzen/konten" 2>&1 | tail -40`;
  nur Phone: `pnpm e2e -- --project phone`. Testtitel = Pfad mit Param-Platzhalter, damit `--grep` den Router-Pfad nimmt.
- Fehlermeldungen so formatieren, dass `tail -40` reicht: je Verstoß eine Zeile `[phone] /finanzen/konten touch:
button "Konto anlegen" 36x36`. Keine Screenshots oder Traces öffnen, außer der Hauptchat verlangt es (dann
  `test-results/…/test-failed-1.png` per Read).
- Fehlt `.env.e2e`, meldet der `tester` das und bittet um Anlage durch den User; er liest weder das Passwort aus dem
  Memory noch schreibt er es irgendwohin.

## Erstlauf und Funde

Der erste Lauf wird Verstöße finden. Vorgehen in derselben Umsetzung:

1. `tester` lässt den kompletten Lauf laufen und liefert die Verstöße gruppiert nach Komponente/Muster (z. B. „ActionIcon
   ohne size in 12 Seiten“, „TextInput size sm in 4 Seiten“).
2. Hauptchat entscheidet je Muster: **klein** (eine Prop wie `size="md"`, `wrap`, `miw={0}`, betrifft eine Komponente
   oder wenige Stellen) → `implementer` behebt im selben PR, danach nur die betroffenen Routen per `--grep` neu prüfen.
   **Größer** (Layout-Umbau, Tabelle → Karten, Designentscheidung) → Eintrag in `docs/refactoring.md` unter „Offen“
   plus Ausnahme in `ausnahmen.ts` mit Verweis.
3. Ziel des PRs: Lauf grün, alle Ausnahmen begründet. Gemeinsame Ursachen bevorzugt zentral beheben (Theme-Default in
   `packages/web/src/theme.ts`, z. B. `ActionIcon` `defaultProps`), nicht an jeder Stelle.

## Doku und Regeln

- **Neue Seite `docs/e2e.md`** (Deutsch, mit `## Überblick`): Zweck, Einrichtung (Install, `.env.e2e`), Aufruf,
  Projekte und Prüfungen, Routenliste pflegen (`routen-vollstaendig`), Ausnahmen, Testdaten (`E2E`-Präfix), Grenzen
  (nur dev, nur Chromium, nicht in CI). Zeile in `docs/README.md`.
- `README.md` (Root): ein Satz unter Entwicklung/Tests mit Verweis auf `docs/e2e.md`.
- `.claude/agents/tester.md`: Abschnitt E2E (Aufruf wie oben, `| tail -40`, `--grep` für einzelne Routen, keine
  Screenshots öffnen, Passwort nie anfassen).
- `.claude/agents/browser-check.md`: Hinweis, dass reine Layout-Checks (Scroll, Touch, Schrift) der Smoke-Test
  abdeckt; `browser-check` nur für visuelle Urteile und neue, noch nicht spezifizierte Flows.
- **`CLAUDE.md`**, neuer Abschnitt „E2E-Tests (Playwright)“ (Englisch wie der Rest der Datei), sinngemäß:
  - Layout checks (no horizontal scroll, touch targets, input font size, console errors) run via `pnpm e2e` in a
    `tester` agent, not via `browser-check`. A new route needs an entry in `packages/e2e/routen.ts`.
  - (a) When a `browser-check` flow would have to run a second time (e.g. after a fix), write it as a Playwright spec
    in `packages/e2e` instead and let `tester` run it.
  - (b) Full E2E flows only for stable, critical Finanzen paths (Kassenzählung, Kassenabrechnung, Buchung, Beleg
    einreichen, Rechnung), written once the slice is functionally stable. Test data uses the prefix `E2E`.
  - In der Tabelle „Models and token usage“ beim `tester` „Playwright E2E (`pnpm e2e`)“ ergänzen.

## Phasen (je ein frischer `implementer`)

1. **Setup:** Paket, Config, `.gitignore`, ESLint, Root-Skript, `.env.e2e.example`, Login-Setup inkl. ID-Auflösung
   (ID-Endpunkte aus der Tabelle oben). Abnahme: `tester` führt nach Anlage der `.env.e2e` durch den User nur das
   Setup-Projekt aus (`pnpm e2e -- --project setup`), `.auth/ids.json` ist gefüllt; `pnpm lint`, `pnpm typecheck` grün.
2. **Smoke-Test:** `routen.ts` (vollständig, inkl. Nebenwirkungsprüfung für neu/entwurf), `pruefungen.ts`,
   `ausnahmen.ts`, `smoke.spec.ts`, `routen-vollstaendig.spec.ts`. Abnahme: Lauf läuft durch (rot durch Funde ist ok).
3. **Erstlauf und Funde:** wie oben; Korrekturen an der App durch einen eigenen `implementer`.
4. **Doku:** `docs/e2e.md`, `docs/README.md`, `README.md`, `CLAUDE.md`, Agent-Dateien, ggf. `docs/refactoring.md`.

Ein PR für alles. Commit `pnpm-lock.yaml`. CI muss grün sein (lint/typecheck berühren das neue Paket).

## Spätere Folgearbeiten (nicht Teil dieser Umsetzung)

- Flow-Specs für stabile, kritische Finanzen-Pfade, je Scheibe sobald fachlich stabil: Kassenzählung am Event (phone),
  Kassenabrechnung, Buchung erfassen, Beleg einreichen (phone, Foto-Upload per `setInputFiles`), Rechnung stellen.
  Daten mit Präfix `E2E`, wo möglich über die API vorbereiten statt per UI.
- Optional Aufräum-Skript für `E2E`-Daten auf dev (bis zum Prod-Release genügt Löschen des dev-Bestands).
- Lokales Ziel (`E2E_BASE_URL=http://localhost:5173/app/`): braucht `allow_localhost_callback` auf dev und laufende API.
- WebKit-Projekt für iOS-Safari-Besonderheiten, falls ein Fehler nur dort auftritt.
- Visuelle Regression (Screenshot-Vergleich) bewusst nicht: zu instabil bei sich ändernden dev-Daten.

## Offene Punkte, beim Umsetzen zu klären

- Exakte Antwortform und ID-Feld je Listen-Endpunkt (DTOs in `packages/shared`).
- Listen-Endpunkte für Privatpartys und Beleg-Entwürfe (nicht im Explorer-Ergebnis).
- Ob `…/neu`- oder Entwurfsseiten beim Öffnen Daten anlegen (dann `ueberspringen`).
- Hosted-UI-Selektoren beim ersten Lauf bestätigen (klassische UI: `input[name=username]`, `input[name=password]`,
  `input[name=signInSubmitButton]`, jeweils `:visible`).
