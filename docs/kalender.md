# Kalender

Events mit Schichten und Diensten. Rechte: `kalender:lesen` (ansehen, sich eintragen), `events:verwalten`
(Events anlegen, ändern, absagen), `kalender:einrichten` (Dienstformen, Kategorien, Vorlagen, Externe).

## Datenmodell

Migrationen `0037`–`0054`, Code in `packages/api/src/kalender.ts`, Logik in `packages/shared/src/kalender.ts`.

| Tabelle                                                  | Inhalt                                                                                                                                                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dienstformen`, `event_kategorien`                       | Stammdaten (Kategorie mit Mantine-Farbe), archivierbar                                                                                                                                                                                           |
| `externe`                                                | Gastdienste: Name, Kontakt, Quelle (z. B. „Freund:in von X“, „StuK“)                                                                                                                                                                             |
| `events`                                                 | Titel, Beschreibung, Kategorie, Beginn, avisiertes Ende, `abgesagt`, Hinweis-Stunden                                                                                                                                                             |
| `schichten`, `schicht_bedarfe`                           | Schicht nur mit Zeit + Art `aufbau`/`betrieb`/`putzen` (kein Name, Anzeige per `schichtBezeichnung`, z. B. „Betrieb 20:00–04:00“). Betrieb: Bedarf je Dienstform mit Minimum und Wunsch. Aufbau/Putzen: `minimum`/`wunsch` direkt an der Schicht |
| `dienste`                                                | Eintrag: Mitglied **oder** Externe, Dienstform (nur Betrieb, sonst `null`), Kommentar, eingetragen von                                                                                                                                           |
| `event_vorlagen`, `vorlage_schichten`, `vorlage_bedarfe` | Vorlagen mit Uhrzeit + Tagesversatz (`ausVorlage`, Europe/Berlin inkl. Sommerzeit)                                                                                                                                                               |

## Regeln

- **Bedarf je Art:** Betrieb braucht mindestens eine Dienstform, je Dienstform Minimum ≥ 1 und Wunsch ≥ Minimum.
  Aufbau/Putzen haben keine Dienstform, nur eine Anzahl (Minimum ≥ 0, Wunsch ≥ 1, Wunsch ≥ Minimum); die Dienstformen
  „Aufbau“/„Putzen“ gibt es nicht mehr. Die Validierung ist eine Discriminated Union nach `art` (`schichtEingabeSchema`,
  `vorlageSchichtSchema`); Fehler erscheinen im Editor direkt am Feld.
- Eintragen: bei Betrieb nur in Dienstformen mit Bedarf in der Schicht (Dienstform Pflicht, 400 sonst), bei
  Aufbau/Putzen ohne Dienstform (mit Dienstform 400); mehr als der Wunsch geht immer. Im Dialog entfällt das
  Dienstform-Feld bei Aufbau/Putzen und bei Betrieb mit genau einer Dienstform („Dienst: Bar“ als Text, vorbelegt). Ein Dienst je Person und
  Schicht (409). Überlappende Schichten sind nur ein Hinweis. Bei abgesagten Events kein Eintragen.
- Sich selbst ein-/austragen geht jederzeit (auch rückwirkend). Externe anlegen und eintragen darf jede:r; ihren
  Eintrag entfernen, wer ihn eingetragen hat oder `events:verwalten`. Andere Mitglieder nur mit `events:verwalten`.
- **Ampel** (`schichtBewertung`): rot = eine Dienstform (bei Aufbau/Putzen: die Anzahl aller Einträge) unter Minimum oder Anwärter:in ohne Mitglied/EM in derselben
  Schicht (Externe zählen nicht als Begleitung, Anwärter:innen zählen zum Bedarf); gelb = Wunsch nicht erreicht;
  grün = alles erfüllt. Ein Event hat die schlechteste Farbe seiner Schichten, abgesagt = grau.
- Ändern eines Events behält die Einträge; entfernt es Schichten oder Bedarfe mit Einträgen, antwortet das API mit 409
  und der Liste der Betroffenen, bis `bestaetigt: true` mitkommt. Wechselt die Art einer Schicht mit Einträgen von
  Betrieb zu Aufbau/Putzen, bleiben die Einträge (ihre Dienstform wird geleert); von Aufbau/Putzen zu Betrieb passen sie
  keiner Dienstform und zählen als entfernt (409 bis zur Bestätigung). Löschen nur ohne Einträge, sonst absagen.

## Seiten

| Seite                                  | Zweck                                                                                                                                                                              |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/kalender`                            | Kartenliste je Monat (Handy), ab `sm` umschaltbar auf Monatsraster; Filter fehlend/meine                                                                                           |
| `/kalender/events/:id`                 | Schichten, Bedarfe, Ein-/Austragen, Externe, `.ics` je eigenem Dienst                                                                                                              |
| `/kalender/events/neu`, `…/bearbeiten` | Formular mit Vorlage + Datum, Schicht-Editor                                                                                                                                       |
| `/kalender/statistik`                  | **Dienstschwein**: Dienste je Person (inkl. Externe) und Dienstform pro Kalenderjahr, dazu die Spalten Aufbau und Putzen (`nachSpalte`: Dienstform-Id, `art:aufbau`, `art:putzen`) |
| `/kalender/einrichtung`                | Dienstformen, Kategorien, Vorlagen, Externe (Zusammenführen)                                                                                                                       |
| `/kalender/mein-kalender`              | Abo und Download (siehe unten)                                                                                                                                                     |

Das Dienstschwein zählt jeden Eintrag einmal, nach dem Jahr des Schichtbeginns (Europe/Berlin); abgesagte Events
zählen nicht. Es ist für alle mit `kalender:lesen` sichtbar.

## Mein Kalender (ICS-Abo und Download)

- Seite `/kalender/mein-kalender`. Jede:r hat einen geheimen Feed-Token (Tabelle `kalender_tokens`, nur der
  sha256-Hash wird gespeichert). Der Klartext-Token wird nur direkt nach dem Erzeugen angezeigt; ein neuer Link
  ersetzt den alten (der alte Link geht dann nicht mehr).
- `GET /api/me/kalender-token` (`{ vorhanden }`), `POST /api/me/kalender-token` (`{ token }`).
- `GET /api/kalender/feed/:token(.ics)` ist öffentlich (kein Bearer-Token, in API Gateway eine eigene Route ohne
  Authorizer). Er enthält die eigenen Dienste ab 90 Tage zurück, `text/calendar`, `no-store`. Titel
  „Dienstform · Event“ (bei Aufbau/Putzen „Aufbau · Event“), abgesagte Events als `STATUS:CANCELLED`. Links zum Event nur, wenn die Lambda-Variable
  `PUBLIC_URL` gesetzt ist (Terraform: nur mit eigener Domain).
- `GET /api/me/dienste`: eigene kommende Dienste; der Browser erzeugt daraus per `icsErzeugen` die `.ics`-Downloads
  (alle kommenden auf der Mein-Kalender-Seite, einzelne Dienste auf der Event-Seite).
- Google aktualisiert abonnierte Kalender nur alle paar Stunden.

## Push-Benachrichtigungen

Das allgemeine Modul ist in [benachrichtigungen.md](./benachrichtigungen.md) beschrieben; der Kalender nutzt drei Arten:
`kalender.erinnerung` (vor der eigenen Schicht, einstellbar; Titel „Bar-Dienst in 30 Minuten“, bei Aufbau/Putzen „Aufbau in 30 Minuten“), `kalender.fehlende_dienste` (zum Hinweiszeitpunkt des
Events, wenn es noch rot ist; einmal je Event; für EM standardmäßig aus) und `kalender.aenderung` (Event verschoben,
abgesagt/wieder aktiv, eigene Schicht geändert oder entfernt, von anderen ausgetragen; die handelnde Person bekommt
nichts). Einstellungen: Seite „Benachrichtigungen“ (`/benachrichtigungen`); „Mein Kalender“ verlinkt dorthin. Die Job-Aufgaben
stehen in `kalenderBenachrichtigungen.ts`. Auf iPhone/iPad nur über „Zum Home-Bildschirm“ (iOS 16.4+).
