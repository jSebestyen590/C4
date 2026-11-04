# Protokolle

Sitzungsprotokolle der Mitgliederversammlungen und Sitzungen. Ein Protokoll gehört zu genau einem Sitzungs-Event und besteht
aus dem **Kopf** (Teilnahme, EMs, Gäste) und einem **Dokument** mit drei festen Abschnitten (Vergangenes, Gegenwärtiges,
Zukünftiges), in dem Text und **Bausteine** stehen. Rechte: `protokolle:lesen` (alle Status: ansehen, drucken),
`protokolle:schreiben` (anlegen, bearbeiten, abschließen, löschen). Das Schreibrecht geben Admins immer, sonst ein Posten
(`POSTEN_RECHTE`, siehe [posten.md](./posten.md)).

## Datenmodell

Tabelle `protokolle`: `id`, `event_id` (eindeutig), `inhalt` (Text, TipTap-JSON), `kopf` (Text, JSON), `status`
(`entwurf`/`abgeschlossen`), `version` (zählt bei jeder Änderung hoch), `erstellt_von/_am`, `geaendert_von/_am`. Migrationen
`0110`–`0112` (siehe [datenbank.md](./datenbank.md)); `event_kategorien.protokoll` ist das Sitzungs-Häkchen.

Code: Typen, Prüfung, Vorbelegung in `packages/shared/src/protokolle.ts` (kennt TipTap nicht, nur die Knotenformen), Store
`packages/api/src/protokolle.ts`, Listen und Schnappschuss `protokolleAnsicht.ts`, Routen in `app.ts`, Web unter
`packages/web/src/protokoll/` (Editor), `ProtokollKopf.tsx`, `useProtokollAutosave.ts` und `pages/Protokoll*.tsx`.

## Sitzungen

- Eine Kategorie mit Teilnahme bekommt in der Kalender-Einrichtung das Häkchen **„Sitzung mit Protokoll“**
  (`event_kategorien.protokoll`; für Dienste-Kategorien 400). Events dieser Kategorie sind Sitzungen. Siehe auch
  [kalender.md](./kalender.md).
- Je Event gibt es höchstens ein Protokoll (eindeutiger Index; ein zweites gibt 409). Abgesagte Events und Events anderer
  Kategorien nimmt die API nicht an (400).
- **Löschschutz:** Ein Event mit Protokoll lässt sich nicht löschen (409); erst das Protokoll löschen (nur im Entwurf).
- **Serien** löschen oder ersetzen ein Event mit Protokoll nie: Es zählt in Serienänderungen als geändert und bleibt.

## Kopf

Der Kopf ist ein Formular über dem Dokument, nicht Teil des Editors (`kopf` als JSON).

- **Teilnahme** aller aktiven Anwärter:innen und Mitglieder (ohne Deaktivierte und Externe) mit den Werten `anwesend`,
  `verspaetet`, `entschuldigt`, `unentschuldigt` (Anzeige „da / spät / entsch. / fehlt“).
- **Ableitung** aus den eigenen Antworten auf das Sitzungs-Event (`teilnahmeAbleiten`): Zusage = anwesend, Absage =
  entschuldigt, keine Antwort = unentschuldigt.
- **Nur Überschreibungen** stehen im `kopf` (`teilnahme`: Mitglied → Wert). Alle anderen folgen im Entwurf live dem Event; ein
  Punkt markiert Abweichungen. „Aus der Sitzung übernehmen“ verwirft alle Überschreibungen. Wählt man wieder den abgeleiteten
  Wert, entfällt die Überschreibung. Auf dem Handy ist die Liste eingeklappt.
- **EMs:** Auswahl aus den aktiven EM-Mitgliedern plus Freitext (`emsFreitext`). Ohne Auswahl (`ems: null`) gelten die EMs mit
  Zusage; wer ausgewählt wird, ersetzt diese Ableitung.
- **Gäste:** nur Freitext.
- **Schnappschuss:** „Abschließen“ friert Teilnahme und gewählte EMs ein (`schnappschuss`, `emsSchnappschuss`). Danach zeigt
  das Protokoll genau diese Personen und Werte; spätere Zu- oder Absagen, Statuswechsel oder Deaktivierungen ändern sie nicht.
  „Wieder öffnen“ verwirft den Schnappschuss, der Entwurf folgt wieder dem Event. Den Schnappschuss setzt nur die API, ein
  Speichern des Entwurfs löscht ihn.

## Dokument und Bausteine

Das Dokument (TipTap, `@mantine/tiptap`) besteht aus genau drei Abschnitten mit fester Überschrift. Sie lassen sich weder
löschen, verschieben noch umbenennen (auch nicht durch Alles-markieren + Löschen oder Einfügen; der Editor lehnt solche
Änderungen ab, die API prüft Anzahl und Reihenfolge). In einem Abschnitt stehen Absätze, Überschriften (Ebene 2 und 3),
Listen, Links, fett und kursiv sowie Bausteine. Am Ende jedes Abschnitts bleibt ein leerer Absatz.

Ein **Baustein** ist ein Block mit Feldern (Formular im Dokument) und einem Freitext darunter (normaler Text mit
Formatierung). Jeder hat eine stabile `id` (UUID, bei Kopien neu vergeben) und `daten`. Lesende sehen Bausteine als kompakte
Karten.

| Baustein (Knoten)                              | Felder                                                                                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Event (`bausteinEvent`)                        | Vorlage (`vorlageId`, optional), Name, Datum (bei mehreren Tagen von/bis), Beginn und Ende, Dienste (Schichten im Format der Vorlage), Verantwortliche:r, Kalender-Event (`eventId`, mit Link „Im Kalender“) |
| Vergangenes Event (`bausteinVergangenesEvent`) | Kalender-Event (`eventId`) oder Name und Datum von Hand                                                                                                                                                      |
| Anwärter:in (`bausteinAnwaerter`)              | Vorname, Nachname, E-Mail (optional)                                                                                                                                                                         |
| Beschluss (`bausteinBeschluss`)                | Antrag, Ja / Nein / Enthaltung (`ZahlFeld`), Ergebnis `angenommen`/`abgelehnt` (aus den Stimmen vorgeschlagen, überschreibbar; Gleichstand = abgelehnt, ohne Ja- und Nein-Stimmen kein Vorschlag)            |

Die Feld-Schemata (`BAUSTEIN_DATEN_SCHEMAS`) prüft die API streng, im Entwurf dürfen Felder leer sein. Das übrige Dokument
prüft sie nur in der Struktur (Knotentypen, Tiefe höchstens 30, höchstens 500 KB).

**Einschränkungen der Dienste** im Event-Baustein: Sie sind eine Planung, kein Eintrag im Kalender. Je Dienst lassen sich nur
Zeiten und Anzahlen (Minimum, Wunsch) ändern, Schichten lassen sich nicht hinzufügen oder entfernen (höchstens 20), und die
Vorlage bestimmt die Dienstformen. Die Uhrzeitfelder entfallen bei ganztägigen Kategorien, das Bis-Datum erscheint bei
mehrtägigen.

## Slash-Befehle und Button „Baustein“

- `/` im Dokument öffnet das Menü der Bausteine; Weitertippen filtert (`/ev`, auch Aliasse wie `/rueckblick`, Umlaute
  schreibt man aus oder normal). Pfeiltasten, Enter, Tab, Escape und Antippen funktionieren.
- **Zweite Stufe:** `/event` + Enter zeigt „Ohne Vorlage“ und alle nicht archivierten Vorlagen (filterbar: `/event bar`).
  Die Vorlage füllt Name, Uhrzeiten, Dauer und Dienste, das Datum bleibt leer. `/vergangenes` + Enter zeigt „Ohne
  Kalender-Event“ und die vergangenen, nicht abgesagten Events der letzten rund drei Monate vor der Sitzung (die Sitzung selbst
  nicht).
- Anwärter:in und Beschluss werden direkt eingefügt.
- **Zitat** (`/zitat`, `/quote`) ist kein Baustein: Es macht den aktuellen Absatz am Cursor zum Zitat (Knoten `blockquote`,
  nur Absätze darin) und lässt den Cursor darin. Das geht überall, auch im Freitext („Notizen“) eines Bausteins; „— Name“ ist
  einfach eine weitere Zeile. Derselbe Eintrag steht im Menü „Baustein“, dazu der Zitat-Button der Werkzeugleiste. Die API
  prüft `blockquote` wie jeden anderen Knoten (Struktur, Tiefe).
- Der Baustein kommt hinter den aktuellen Block (ein leerer Absatz wird ersetzt, im Freitext eines Bausteins dahinter; keine
  Verschachtelung). Der **Cursor springt ins erste leere Feld** (Event: Name, dann Datum, Beschluss: Antrag, sonst der
  Freitext).
- Auf dem Handy ist `/` umständlich: Die Werkzeugleiste (klebt unter dem Header) hat den Button **„Baustein“** mit demselben
  Menü, dazu fett, kursiv, Überschriften, Listen, Link, Rückgängig/Wiederholen.

## Vorbelegung eines neuen Protokolls

`protokollVorschlag` (Shared, getestet) baut das Dokument aus dem letzten Protokoll einer **früheren** Sitzung; Kopf und
Gegenwärtiges starten leer. Ohne Vorgänger sind alle drei Abschnitte leer. Gelesen werden alle Event-Bausteine des
Vorgängers (jeder Abschnitt), aktualisiert mit den heutigen Kalenderdaten (Name, Datum, Uhrzeiten), soweit das Event noch
existiert:

- Abgesagte Events entfallen.
- Endet das Event vor dem Tag der neuen Sitzung, wird es ein Baustein **Vergangenes Event** (Name, Datum, `eventId`, leerer
  Text) in „Vergangenes“, nach Datum sortiert.
- Alle anderen bleiben Event-Bausteine in „Zukünftiges“, samt Freitext.
- Mehrfache Bausteine mit derselben `eventId` erscheinen einmal; Events, die es im Kalender nicht mehr gibt, bleiben wie
  geschrieben. Alle Kopien bekommen neue Ids.

## Speichern

- **Autosave** 2 Sekunden nach der letzten Änderung (Dokument und Kopf); Statuszeile „Gespeichert · 20:14“ bzw. „Wird
  gespeichert …“. Speichern überlappt nie, jedes sendet den neuesten Stand. Beim Verlassen der Seite wird zuletzt gespeichert,
  beim Schließen des Tabs warnt der Browser.
- **Versionskonflikt:** `PUT` trägt die geladene `version`; hat jemand anderes inzwischen gespeichert, antwortet die API mit 409
  (und der aktuellen `version`). Die Seite zeigt „Jemand anderes hat das Protokoll inzwischen geändert.“ mit **Neu laden**,
  ungespeicherte Änderungen gehen dabei verloren.
- **Abschließen / Wieder öffnen:** Der Dialog erklärt das Einfrieren der Teilnahme. Vorher wird gespeichert. Ein
  abgeschlossenes Protokoll ist schreibgeschützt (409 bei `PUT`/`DELETE`).
- **Löschen** nur im Entwurf (Menü „Weitere Aktionen“ mit Bestätigung).
- **Drucken:** Button für alle; Druck-CSS blendet Bedienelemente aus (`PROTOKOLL_DRUCK_CSS`, `data-druck="aus"`).

## Seiten

| Seite              | Recht                  | Inhalt                                                                                                                                                 |
| ------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/protokolle`      | `protokolle:lesen`     | Nach Jahr gruppiert, Karten (Handy) bzw. Tabelle (ab `sm`), ganze Karte/Zeile klickbar; Badge „Entwurf“; Button „Neues Protokoll“ nur mit Schreibrecht |
| `/protokolle/neu`  | `protokolle:schreiben` | Sitzung wählen (Events mit Sitzungs-Kategorie ohne Protokoll, bis morgen, höchstens 20, jüngste vorgewählt), „Protokoll anlegen“ mit Vorbelegung       |
| `/protokolle/<id>` | `protokolle:lesen`     | Schreibende bearbeiten Kopf und Dokument; alle anderen und abgeschlossene Protokolle sehen alles schreibgeschützt                                      |

## API

| Route                            | Recht                  | Inhalt                                                                                                             |
| -------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `GET /api/protokolle`            | `protokolle:lesen`     | Liste: Id, Sitzung (Titel, Beginn), Status, zuletzt geändert (neueste Sitzung zuerst)                              |
| `GET /api/protokolle/:id`        | `protokolle:lesen`     | Inhalt, Kopf, `version`, Teilnahme- und EM-Listen (live abgeleitet, abgeschlossen aus Schnappschuss)               |
| `GET /api/protokolle/sitzungen`  | `protokolle:schreiben` | Sitzungen ohne Protokoll                                                                                           |
| `GET /api/protokolle/vorschlag`  | `protokolle:schreiben` | `?eventId=` → vorbelegtes `{ inhalt, kopf }`                                                                       |
| `POST /api/protokolle`           | `protokolle:schreiben` | `{ eventId, inhalt?, kopf? }` → 201 `{ id }`; ohne `inhalt`/`kopf` gilt die Vorbelegung; 409 bei zweitem Protokoll |
| `PUT /api/protokolle/:id`        | `protokolle:schreiben` | `{ inhalt, kopf, version }` → `{ version, geaendertAm }`; 409 bei veralteter Version oder abgeschlossen            |
| `PUT /api/protokolle/:id/status` | `protokolle:schreiben` | `{ status }` (`entwurf`/`abgeschlossen`): Abschließen friert die Teilnahme ein, Wieder öffnen löst sie             |
| `DELETE /api/protokolle/:id`     | `protokolle:schreiben` | nur im Entwurf (409 sonst)                                                                                         |

`DELETE /api/kalender/events/:id` antwortet 409, solange das Event ein Protokoll hat.

## Ausblick (Stufe 2)

Noch nicht umgesetzt; die stabilen Baustein-Ids und das Feld `eventId` bereiten es vor:

- **Daten übernehmen:** Ein Event-Baustein legt das Event samt Diensten im Kalender an (und verknüpft es per `eventId`), ein
  Anwärter:in-Baustein lädt die Person ein.
- Ein weiterer Baustein **PP**, sobald seine Felder feststehen.
