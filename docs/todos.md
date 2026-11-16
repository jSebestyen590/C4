# Todos

Aufgaben mit Deadline. Sie entstehen beim Abschließen eines Protokolls aus dem Baustein **Todo** (siehe
[protokolle.md](./protokolle.md), [Baustein Todo](./protokolle/bausteine.md#todo-bausteintodo); das Todo steht dort nur in den Notizen eines anderen Bausteins, nie auf oberster Ebene, und erscheint im Dokument und PDF als Aufzählungspunkt) oder werden von Mitgliedern für sich selbst angelegt. Jede Person sieht ihre Todos auf der Seite
**Todos** (`/todos`, Navigation „Todos“ mit `IconChecklist`, für alle angemeldeten Mitglieder mit Profil; es ist kein eigenes Recht nötig).

## Invarianten

- Der Weg ins System: Todos aus einem Protokoll entstehen nur beim Abschließen (Aktionen `todo.anlegen`/`todo.aendern`, siehe
  [protokolle/aktionen.md](./protokolle/aktionen.md)); eigene Todos legt man über `POST /api/me/todos` an. Es gibt keinen anderen Weg.
- Nur selbst angelegte Todos **ohne** Protokoll lassen sich ändern oder löschen (sonst 403, `todoBearbeitbarLaden`); Todos aus einem
  Protokoll folgen dem Protokoll. Wird der Todo-Baustein entfernt, bleibt das Todo bestehen.
- Eigene Todos sind immer Modus `einzeln` und nur für die anlegende Person.
- Abhaken dürfen nur Zuständige (403 sonst); beim Ändern und Löschen sind fremde Todos 404 (`eigenesTodoLaden`), damit keine Ids durchsickern.
- Ein Moduswechsel setzt alle Häkchen zurück; wer in der Zuständigenliste bleibt, behält sein Häkchen (`zustaendigeSetzen`).
- Die Erinnerung `todo.frist` ist nicht abschaltbar und kommt einmal je Todo, Deadline und Person (siehe [Erinnerung](#erinnerung)).

## Dateien

| Bereich | Dateien                                                                                                                                                                                         |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API     | `packages/api/src/todos.ts` (Store), `todoBenachrichtigungen.ts` (Erinnerung), `todos.fake.ts`, Routen `/api/me/todos…` in `routes/todos.ts`; Anlegen aus Protokollen in `protokollAktionen.ts` |
| Shared  | `packages/shared/src/todos.ts` (Schemas, Sortierung, Anzeige-Texte)                                                                                                                             |
| Web     | `pages/TodosPage.tsx`, `TodoDialog.tsx`, `todoDaten.tsx`                                                                                                                                        |
| Tests   | `packages/shared/src/todos.test.ts`, `packages/api/src/todoBenachrichtigungen.test.ts`, `packages/web/src/pages/TodosPage.test.tsx`                                                             |

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

Art `todo.frist` (nicht abschaltbar), siehe [benachrichtigungen.md](./benachrichtigungen.md#todos). Umsetzung:
`todoErinnerungen` in `packages/api/src/todoBenachrichtigungen.ts`, Abfrage `offeneFaelligZwischen` in `todos.ts`. Der Job läuft alle 5 Minuten.

- **Welche Todos:** Alle mit Deadline (`faelligAm`) von **heute bis heute + 2 Tage** (beide Tage eingeschlossen, `TODO_ERINNERUNG_TAGE`),
  die für mindestens eine Person noch offen sind. Offen ist: bei `gemeinsam` für alle Zuständigen, solange niemand abgehakt hat; bei
  `einzeln` für die, die noch nicht abgehakt haben (`offeneSubsVon`). Gesendet wird einzeln an jede dieser Personen.
- **Ab wann:** Erst ab **09:00 Uhr Berliner Zeit** (`stundeBerlin`); davor tut der Job nichts. „Heute“ ist das Berliner Datum.
- **Wie oft:** Dedupe-Schlüssel `todo.frist:<todoId>:<faelligAm>:<sub>`, also **einmal je Todo, Deadline und Person**: Die Nachricht kommt
  am ersten Tag, an dem das Todo im Fenster liegt (zwei Tage vor der Deadline, bei später angelegten Todos entsprechend später), nicht
  noch einmal am Tag davor oder am Fälligkeitstag. Verschiebt sich die Deadline, kommt sie erneut. Hat eine Person kein Push-Gerät, wird
  der Schlüssel nicht belegt (siehe [benachrichtigungen.md](./benachrichtigungen.md#versand-und-job)).
- **Überfällige Todos** (Deadline vor heute, noch offen): Ab 09:00 Uhr jeden Tag eine Nachricht an die Personen, für die das Todo noch offen ist,
  ohne Ende, bis es erledigt ist. Art `todo.frist` (dieselbe Einstellung), Titel „Todo überfällig“, Text „„Titel“ ist seit n Tagen
  überfällig.“ (n = volle Berliner Tage seit der Deadline, bei 1 „seit 1 Tag“). Dedupe-Schlüssel `todo.frist.ueberfaellig:<todoId>:<datum>:<sub>`:
  einmal je Todo, Tag und Person.
- Push erreicht nur Geräte, auf denen Benachrichtigungen erlaubt sind. Tippen auf die Nachricht öffnet die Seite Todos (`/app/todos`).
