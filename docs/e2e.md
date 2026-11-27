# E2E-Tests (Playwright)

## Überblick

Das Paket `packages/e2e` (`@c4/e2e`) prüft die App automatisiert im Browser (Playwright, nur Chromium) gegen
`https://dev.c4-leipzig.de/app/`. Der Lauf ist deutlich billiger als ein `browser-check` im eingebauten Browser und
wird vom `tester`-Agenten ausgeführt. Bisher gibt es einen **Layout-Smoke-Test über alle Routen**; fachliche Flows
folgen später. Die Tests laufen **nicht in CI**.

Abschnitte: Einrichtung, Aufruf, Projekte und Prüfungen, Routen pflegen, Ausnahmen, Testdaten, Grenzen.

## Einrichtung

Einmalig lokal: `pnpm install`, `pnpm --filter @c4/e2e e2e:install` (lädt Chromium), dann
`packages/e2e/.env.e2e` nach dem Muster von `.env.e2e.example` anlegen. Die Datei ist gitignored und fehlt
daher in jedem neuen Worktree; Claude legt sie bei Bedarf selbst an (Passwort aus dem Memory des Users). Das
Passwort steht nie im Repo, im Chat oder in Testausgaben. Optional
`E2E_BASE_URL` für ein anderes Ziel.

Das Setup-Projekt meldet sich bei jedem Lauf neu über die Cognito-Hosted-UI an (`setup/login.setup.ts`) und schreibt
`.auth/state.json`. Außerdem löst es per API-Aufruf IDs für Routen mit Parametern auf (`setup/idQuellen.ts`) und legt
sie in `.auth/ids.json` ab, Schlüssel ist der Router-Pfad. Ist eine Liste leer, wird die Route mit Begründung
übersprungen.

## Aufruf

- Alles: `pnpm e2e 2>&1 | tail -40`
- Eine Route: `pnpm e2e --grep "finanzen/konten" 2>&1 | tail -40` (Testtitel = Router-Pfad)
- Nur ein Projekt: `pnpm e2e --project phone`
- Fehler erscheinen als eine Zeile je Verstoß, z. B. `[phone] /finanzen/konten touch: button "Konto anlegen" 36x36`.
  Screenshots und Traces liegen in `packages/e2e/test-results/`, der HTML-Report in `playwright-report/`.

## Projekte und Prüfungen

Projekte: `setup`, `phone` (375x812, Touch) und `desktop` (1440x900); beide hängen von `setup` ab.
Je Route und Projekt (`smoke.spec.ts`, `pruefungen.ts`):

- keine horizontale Seitenscroll
- keine Console-Fehler, Page-Errors oder 5xx-Antworten
- Seite rendert (kein „Kein Zugriff“, kein Redirect)
- nur `phone`: Touch-Ziele mindestens 42 px, Input-Schrift mindestens 16 px. Bei Inputs zählt die Fläche des umgebenden
  Feldes bzw. der Beschriftung (Schalter, Zeit-Segmente, Suchinput in Mehrfachauswahlen); Links im Fließtext (inline,
  Textblock enthält weiteren Text) sind ausgenommen, eigenständige Links (Logo, Zurück-Link) nicht

Der Test liest nur und legt nichts an.

## Routen pflegen

`routen.ts` listet alle Routen der App. `routen-vollstaendig.spec.ts` vergleicht sie mit dem Router von `packages/web`
und schlägt fehl, wenn eine Route fehlt oder überzählig ist. Eine neue Route braucht deshalb einen Eintrag in
`routen.ts`; hat sie einen Parameter (z. B. `:id`), zusätzlich einen Eintrag in `setup/idQuellen.ts`, der die ID per
API ermittelt.

## Ausnahmen

Erlaubte Verstöße stehen zentral in `ausnahmen.ts` (Route, Prüfung, Treffer, Begründung), nicht im App-Code. Jeder
Eintrag braucht eine Begründung; bei offenen Mängeln verweist sie auf `docs/refactoring.md`. Sekundäre Ziele (Mitgliedsnamen als Link in Listen, Termin-Einträge im Monat, `mailto:`-Links, Pill-Entfernen-Knöpfe) sind über
`touchAusnahmeSelektoren` für alle Routen ausgenommen (WCAG 2.5.8, Ausnahme "Abstand"; Mindestgröße 24 px). Bisher: `/protokolle/:id`
meldet einen 409-Console-Fehler, weil Phone- und Desktop-Projekt denselben Entwurf öffnen und der zweite Tab die
Bearbeitungssperre nicht bekommt (erwartet).

## Testdaten

Der Smoke-Test legt nichts an. Spätere Flow-Specs legen Daten mit Präfix `E2E` an. Bis zum ersten Prod-Release darf der
dev-Bestand gelöscht werden.

## Grenzen

Nur dev, nur Chromium (kein WebKit/iOS-Safari), nicht in CI. Visuelle Urteile (Überlappung, Farben) und neue, noch nicht
als Spec geschriebene Flows prüft weiter der `browser-check`-Agent.
