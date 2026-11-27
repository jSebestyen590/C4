# E2E-Tests (Playwright)

## Überblick

Das Paket `packages/e2e` (`@c4/e2e`) prüft die App automatisiert im Browser (Playwright, nur Chromium) gegen
`https://dev.c4-leipzig.de/app/`. Der Lauf ist deutlich billiger als ein `browser-check` im eingebauten Browser und
wird vom `tester`-Agenten ausgeführt. Bisher gibt es einen **Layout-Smoke-Test über alle Routen**; fachliche Flows
folgen später. Die Tests laufen **nicht in CI**.

Abschnitte: Einrichtung, Aufruf, Projekte und Prüfungen, Routen pflegen, Ausnahmen, Testdaten, Grenzen.

## Einrichtung

Einmalig lokal: `pnpm install`, `pnpm --filter @c4/e2e e2e:install` (lädt Chromium), dann
`packages/e2e/.env.e2e.example` nach `packages/e2e/.env.e2e` kopieren und das Passwort des Testaccounts selbst
eintragen. Die Datei ist gitignored; das Passwort steht nie im Repo, im Chat oder in Testausgaben. Optional
`E2E_BASE_URL` für ein anderes Ziel.

Das Setup-Projekt meldet sich bei jedem Lauf neu über die Cognito-Hosted-UI an (`setup/login.setup.ts`) und schreibt
`.auth/state.json`. Außerdem löst es per API-Aufruf IDs für Routen mit Parametern auf (`setup/idQuellen.ts`) und legt
sie in `.auth/ids.json` ab, Schlüssel ist der Router-Pfad. Ist eine Liste leer, wird die Route mit Begründung
übersprungen.

## Aufruf

- Alles: `pnpm e2e 2>&1 | tail -40`
- Eine Route: `pnpm e2e -- --grep "finanzen/konten" 2>&1 | tail -40` (Testtitel = Router-Pfad)
- Nur ein Projekt: `pnpm e2e -- --project phone`
- Fehler erscheinen als eine Zeile je Verstoß, z. B. `[phone] /finanzen/konten touch: button "Konto anlegen" 36x36`.
  Screenshots und Traces liegen in `packages/e2e/test-results/`, der HTML-Report in `playwright-report/`.

## Projekte und Prüfungen

Projekte: `setup`, `phone` (375x812, Touch) und `desktop` (1440x900); beide hängen von `setup` ab.
Je Route und Projekt (`smoke.spec.ts`, `pruefungen.ts`):

- keine horizontale Seitenscroll
- keine Console-Fehler, Page-Errors oder 5xx-Antworten
- Seite rendert (kein „Kein Zugriff“, kein Redirect)
- nur `phone`: Touch-Ziele mindestens 42 px, Input-Schrift mindestens 16 px

Der Test liest nur und legt nichts an.

## Routen pflegen

`routen.ts` listet alle Routen der App. `routen-vollstaendig.spec.ts` vergleicht sie mit dem Router von `packages/web`
und schlägt fehl, wenn eine Route fehlt oder überzählig ist. Eine neue Route braucht deshalb einen Eintrag in
`routen.ts`; hat sie einen Parameter (z. B. `:id`), zusätzlich einen Eintrag in `setup/idQuellen.ts`, der die ID per
API ermittelt.

## Ausnahmen

Erlaubte Verstöße stehen zentral in `ausnahmen.ts` (Route, Prüfung, Treffer, Begründung), nicht im App-Code. Jeder
Eintrag braucht eine Begründung; bei offenen Mängeln verweist sie auf `docs/refactoring.md`.

## Testdaten

Der Smoke-Test legt nichts an. Spätere Flow-Specs legen Daten mit Präfix `E2E` an. Bis zum ersten Prod-Release darf der
dev-Bestand gelöscht werden.

## Grenzen

Nur dev, nur Chromium (kein WebKit/iOS-Safari), nicht in CI. Visuelle Urteile (Überlappung, Farben) und neue, noch nicht
als Spec geschriebene Flows prüft weiter der `browser-check`-Agent.
