# C4

See `README.md` for the architecture and setup.

## Dokumentation (`docs/`)

Die Feature-Dokumentation liegt in `docs/` (Einstieg: `docs/README.md`, auf Deutsch). **Lies vor dem
Planen oder Umsetzen eines Features die passende Seite dort** (z. B. `docs/members.md` für alles rund
um Mitglieder, Profile, Rechte oder Kontaktkanäle), damit die Änderung zum Bestehenden passt. Wenn du
ein Feature anlegst oder änderst, aktualisiere dessen Seite im selben Change. Für neue Feature-Bereiche
legst du eine neue Seite samt Zeile in `docs/README.md` an. Halte sie kurz und sachlich.

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
- Touch targets must be at least 44px (keep Mantine size `md`+ for inputs and buttons). Input font
  size must stay >= 16px, otherwise iOS Safari zooms in on focus.
- For numbers use `ZahlFeld` (`packages/web/src/ZahlFeld.tsx`) instead of Mantine's `NumberInput`: big
  -/+ buttons that don't open the phone keyboard.
- Wide data (tables) must not be rendered as a plain `<table>` on phones: use stacked cards/lists
  below `sm`, or a horizontally scrollable container as a last resort.
- Navigation lives in `AppLayout` (burger menu on mobile, sidebar from `md`); add new routes there.
- Use `100dvh` instead of `100vh`; respect safe-area insets for fixed headers/footers.

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
