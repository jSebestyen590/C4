# Todos

Aufgaben mit Deadline. Sie entstehen beim Abschließen eines Protokolls aus dem Baustein **Todo** (siehe
[protokolle.md](./protokolle.md); das Todo steht dort nur in den Notizen eines anderen Bausteins, nie auf oberster Ebene, und erscheint im Dokument und PDF als Aufzählungspunkt) oder werden von Mitgliedern für sich selbst angelegt. Jede Person sieht ihre Todos auf der Seite
**Todos** (`/todos`, Navigation „Todos“ mit `IconChecklist`, für alle angemeldeten Mitglieder mit Profil; es ist kein eigenes Recht nötig).

## Datenmodell

- `todos`: `id`, `titel` (höchstens 200 Zeichen), `notizen` (Text, höchstens 2000 Zeichen), `faellig_am` (Datum), `modus`
  (`gemeinsam` oder `einzeln`), `protokoll_id` und `baustein_id` (nur bei Todos aus einem Protokoll), `erledigt_am` und
  `erledigt_von` (nur Modus `gemeinsam`), `erstellt_von`, `erstellt_am`, `geaendert_am`.
- `todo_zustaendige`: je Todo und Person eine Zeile (`todo_id`, `sub`) mit `erledigt_am` und `erledigt_von` (Modus `einzeln`).
- Shared: `packages/shared/src/todos.ts` (`Todo`, `todoEingabeSchema`, `todoFuerMichErledigt`, `todoFaelligKurz`, `todosSortieren`),
  Store `packages/api/src/todos.ts`.

## Modi

- **Gemeinsam:** Eine Person hakt ab, dann ist das Todo für alle erledigt (`erledigt_am`, `erledigt_von`). Jede zuständige Person kann das
  Häkchen wieder entfernen.
- **Einzeln:** Jede Person hakt für sich ab (Zeile in `todo_zustaendige`). Die Karte zeigt bei mehreren Personen „3 von 12 erledigt“.
- Eigene Todos sind immer **Einzeln** und nur für dich.
- Ändert sich der Modus (beim erneuten Abschließen eines Protokolls), werden alle Häkchen zurückgesetzt.

## Seite „Todos“

Mobile first, eine Liste aus Karten (auch am Desktop, ab `md` höchstens 720 px breit). Oben der Titel und „Todo anlegen“.

- **Offen:** nach Deadline sortiert. Jede Karte hat eine große Checkbox (42 px Tippfläche), Titel, Deadline („Fällig Sa, 14.11.“, rot
  und „überfällig“ nach Ablauf, orange ab zwei Tage davor), Notizen (Zeilenumbrüche bleiben), bei Todos aus einem Protokoll „Aus
  Protokoll: Sitzung 04.11.2026“ (verlinkt, wenn du `protokolle:lesen` hast) und bei mehreren Zuständigen den Fortschritt (Gemeinsam:
  „Erledigt von <Name>“, Einzeln: „3 von 12 erledigt“). Ohne offene Todos steht dort „Keine offenen Todos.“
- **Erledigt:** eingeklappt hinter „Erledigte anzeigen“; dort lässt sich das Häkchen wieder entfernen.
- **Eigene Todos** (`bearbeitbar`: selbst angelegt, ohne Protokoll) haben ein Menü mit „Bearbeiten“ und „Löschen“. Todos aus einem
  Protokoll lassen sich nicht von Hand ändern oder löschen; sie folgen dem Protokoll.
- Das Häkchen erscheint sofort (optimistisch) und wird danach neu geladen.
- Code: `pages/TodosPage.tsx`, `TodoDialog.tsx` (Anlegen/Bearbeiten, validiert mit `todoEingabeSchema`), `todoDaten.tsx` (Abfragen).

## API

Alle Routen brauchen nur die Anmeldung und beziehen sich auf die angemeldete Person.

| Route                            | Wirkung                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| `GET /api/me/todos`              | Alle Todos, für die du zuständig bist; offene zuerst, nach Deadline                           |
| `POST /api/me/todos`             | Eigenes Todo (`titel`, `notizen`, `faelligAm`), nur für dich, Modus Einzeln; 201 mit dem Todo |
| `PUT /api/me/todos/:id`          | Eigenes Todo ändern (nur von dir angelegt, ohne Protokoll)                                    |
| `DELETE /api/me/todos/:id`       | Eigenes Todo löschen (gleiche Bedingung)                                                      |
| `PUT /api/me/todos/:id/erledigt` | `{ erledigt }`: Häkchen setzen oder entfernen; nur für Zuständige (sonst 403)                 |

## Erinnerung

Art `todo.frist` (nicht abschaltbar), siehe [benachrichtigungen.md](./benachrichtigungen.md). Push erreicht nur Geräte, auf denen
Benachrichtigungen erlaubt sind. Tippen auf die Nachricht öffnet die Seite Todos.
