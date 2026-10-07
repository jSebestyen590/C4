# C4

See `README.md` for the architecture and setup.

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
- Code, identifiers, comments and commit messages stay English.
