# C4

See `README.md` for the architecture and setup.

## Dokumentation (`docs/`)

Die Feature-Dokumentation liegt in `docs/` (Einstieg: `docs/README.md`, auf Deutsch). **Lies vor dem
Planen oder Umsetzen eines Features die passende Seite dort** (z. B. `docs/members.md` für alles rund
um Mitglieder, Profile, Rechte oder Kontaktkanäle), damit die Änderung zum Bestehenden passt. Jede
Seite beginnt mit einem kurzen `## Überblick` samt Abschnittsliste: Lies zuerst nur den, dann gezielt
die Abschnitte, die du brauchst (`grep -n '^## '` liefert die Zeilen), nicht die ganze Seite. Wenn du
ein Feature anlegst oder änderst, aktualisiere dessen Seite im selben Change. Für neue Feature-Bereiche
legst du eine neue Seite samt Zeile in `docs/README.md` an. Halte sie kurz und sachlich.

Vor einem Review oder Refactoring liest du `docs/refactoring.md`: Dort steht, was bereits geprüft und
behoben ist und was offen bleibt. Erledigte Punkte trägst du dort aus.

## Models and token usage

The main chat (Opus) plans, decides and reviews; it re-reads its whole context on every step, so
keep hands-on work out of it:

Use the project's dedicated Sonnet agents (`.claude/agents/`), not `general-purpose` or `Explore`:
they only carry the tools they need, so each call starts with a much smaller context.

| Agent | For |
|---|---|
| `explorer` | code search over more than a couple of files (instead of many `grep`/`sed -n` in the main chat) |
| `implementer` | implementing an approved plan; the main chat reviews the diff and sends corrections back via `SendMessage` instead of editing itself |
| `tester` | unit/integration tests, type checks, lint, builds, waiting for a dev deploy |
| `browser-check` | browser checks in the preview or on dev.c4-leipzig.de (page reads, phone width, screenshots) |

- The main chat doesn't run tests, take screenshots or read page trees itself; agents report a
  short result.
- When `explorer` ran first, put its findings (files, patterns, line ranges) into the `implementer`
  prompt so it doesn't explore the same area again.
- `implementer` doesn't run browser checks: after it finishes, a fresh `browser-check` does, with the
  routes/pages to check named in its prompt.
- Split larger browser checks into one `browser-check` per page or flow (e.g. "create Kasse",
  "count at event on phone", "Abrechnung"), run one after another, not in parallel (they share the
  browser pane). An agent's context, screenshots included, is gone when it finishes; one agent for
  everything carries all of it to the end. After a fix, re-check only the affected page or flow.
- Plan and implementation of a larger feature (roughly 50+ expected implementation steps) run in
  separate sessions: after `/plan` the plan is written to `docs/plans/<feature>.md` completely
  (files, decisions, answers to open questions, docs page to update), and a new session implements
  it from that file. The planning context (docs, code, Q&A) would otherwise be re-read on every
  implementation step. Small features stay in the planning session.
- Split the implementation of a larger plan into phases (e.g. shared types + API/DB, web, docs) and
  start a fresh `implementer` per phase with only its part of the plan plus the files the previous
  phases touched. One agent for everything grows its context to 400k+ and re-reads it on every
  step. Corrections to a phase still go to that phase's agent via `SendMessage`.
- When reviewing an `implementer` diff, start with `git diff --stat` and read only the relevant
  hunks, not the whole diff.
- Command output stays short: tests and builds via `| tail -40` or filtered to errors; files are read
  in excerpts (`offset`/`limit`), not whole.
- Don't poll PR CI (`ci.yml` checks) with `gh run watch`/`gh run view`; bind the PR to the session
  and let the app's CI monitor / Auto-fix report failures.
- Deploys to dev (`gh workflow run deploy.yml --ref <branch> -f env=dev`) aren't covered by the CI
  monitor, so waiting for them is allowed, but only in a `tester` agent: get the run id with
  `gh run list --workflow deploy.yml --limit 1`, then a single blocking
  `gh run watch <id> --exit-status >/dev/null` (no polling loops), then run the browser check. A
  green run already includes the workflow's `/api/health` smoke test.

## Testing on dev

- Deploy a feature branch to dev with the Deploy workflow:
  `gh workflow run deploy.yml --ref <branch> -f env=dev` (a push to `main` deploys dev automatically,
  tags `v*` deploy prod after the repo owner approves it in the `prod` environment).
  Commit and push first; the workflow deploys the pushed ref.
- Browser checks then run on https://dev.c4-leipzig.de/app/ (`browser-check` agent). Log in through the dev
  Cognito hosted UI with the admin test account `Testuser2`; the password is in the user's memory
  (`reference_dev_testuser.md`), never put it into the repo or chat.
- The local API (`pnpm dev`) needs `packages/api/.env.local` from `pnpm db:up` (README); without it,
  use dev.

## UI: mobile first (important)

The app is used **mainly on cellphones**, and only sometimes on tablets or desktops. Every new page
and component must be designed and built **mobile first**:

- Start from the phone layout (~375px wide) and add `sm`/`md`/`lg` overrides for larger screens.
  With Mantine, put the phone value in `base`, e.g. `<SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>`.
  Never design for desktop and "shrink" it afterwards.
- Verify every new page at phone width (e.g. 375x812) before calling it done; check tablet and
  desktop afterwards.
- Use Mantine components (`@mantine/core`) and the theme in `packages/web/src/theme.ts`; don't hand-roll
  styles with fixed pixel widths. No horizontal scrolling of the page.
- Inputs side by side in one row always sit at the same height, aligned to the tallest (wrapped) label: align the
  row at the bottom (`Group align="flex-end"`, `Grid align="end"`, `SimpleGrid` with `alignItems: 'end'`).
- Touch targets must be at least 42px, the Mantine `md` input height (keep Mantine size `md`+ for inputs and buttons). Input font
  size must stay >= 16px, otherwise iOS Safari zooms in on focus.
- For numbers use `ZahlFeld` (`packages/web/src/ZahlFeld.tsx`) instead of Mantine's `NumberInput`: big
  -/+ buttons that don't open the phone keyboard.
- Wide data (tables) must not be rendered as a plain `<table>` on phones: use stacked cards/lists
  below `sm`, or a horizontally scrollable container as a last resort.
- Navigation lives in `AppLayout` (burger menu on mobile, sidebar from `md`); add new routes there.
- Use `100dvh` instead of `100vh`; respect safe-area insets for fixed headers/footers.

### Exception: Finanzen work pages are desktop first

The pages the Finanzer:in works on (journal, bookings, Kontenplan, Belege entry, Buch-Abrechnung,
Kassenabrechnung, bank matching, invoices, reports) are used mainly on a desktop, a lot, and errors
there are costly. Design them **desktop first** and optimise for fast, safe data entry; the rules are
in `docs/plans/finanzen.md` ("Bedienung"). They must still work on a phone (no horizontal page
scroll), but the phone layout is secondary. Finance pages for all members (own Buch page, Rangliste,
Kassenzählung at an event, submitting a Beleg photo) stay mobile first.

## Build warnings

Bundle size is not a concern. Ignore Vite's "Some chunks are larger than 500 kB" warning; don't
add code-splitting or chunk-size tweaks to silence it.

## Language: German

The whole application is **in German**: all UI texts, labels, buttons, validation and error
messages, and `<html lang="de">`. Use the informal "du" form. Every new text must be German from the
start; don't add English user-facing strings.

- Fixed backend values (roles, permissions, user statuses, ...) are translated in
  `packages/web/src/i18n.ts`. When you add a role, permission or status, add its German label there.
  Example: `reader` -> "Lesender Zugriff". Use `label()` for values that may not be translated yet.
- Texts that name a person (status, roles, ...) exist in a male, female and neutral form
  (`Gegendert` in `i18n.ts`, e.g. Anwärter / Anwärterin / Anwärter:in). Pick the form with
  `labelFuer(labels, value, anrede)` using the `anrede` of the person the text is about; never hardcode
  one form. New texts naming a person need all three forms.
- Code, identifiers, comments and commit messages stay English.
- The brand **IFCO** (Euro boxes) is always written in capitals in user-facing texts and docs:
  "IFCO", plural "IFCOs" (e.g. "IFCO anlegen", "Ganze IFCO verleihen"). Identifiers stay as they are
  (`ifco`, `IfcoFormular`, `/inventar/ifcos`).

## Members in the UI

- A member is always shown by their **username**, unless a page explicitly asks for the real name
  (e.g. the profile). Fall back to "Vorname Nachname" only when no username is set. Select options
  that need to be recognisable may show "username (Vorname Nachname)".
- Every mention of a member is bold and in the color of their status: use `StatusName`
  (`packages/web/src/StatusAnzeige.tsx`), ideally linking to the member page via `mitgliedLink`.
  DTOs that embed a member therefore carry `username` and `status`.
