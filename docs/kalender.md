# Kalender

Events mit Schichten und Diensten. Rechte: `kalender:lesen` (ansehen, sich eintragen), `events:verwalten`
(Events anlegen, ändern, absagen), `kalender:einrichten` (Dienstformen, Kategorien, Vorlagen, Externe).

## Datenmodell

Migrationen `0037`–`0054`, Code in `packages/api/src/kalender.ts`, Logik in `packages/shared/src/kalender.ts`.

| Tabelle                                                  | Inhalt                                                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `dienstformen`, `event_kategorien`                       | Stammdaten (Kategorie mit Mantine-Farbe), archivierbar                                   |
| `externe`                                                | Gastdienste: Name, Kontakt, Quelle (z. B. „Freund:in von X“, „StuK“)                     |
| `events`                                                 | Titel, Beschreibung, Kategorie, Beginn, avisiertes Ende, `abgesagt`, Hinweis-Stunden     |
| `schichten`, `schicht_bedarfe`                           | Schicht mit Art `aufbau`/`betrieb`/`putzen`; Bedarf je Dienstform mit Minimum und Wunsch |
| `dienste`                                                | Eintrag: Mitglied **oder** Externe, Dienstform, Kommentar, eingetragen von               |
| `event_vorlagen`, `vorlage_schichten`, `vorlage_bedarfe` | Vorlagen mit Uhrzeit + Tagesversatz (`ausVorlage`, Europe/Berlin inkl. Sommerzeit)       |

## Regeln

- Eintragen nur in Dienstformen mit Bedarf in der Schicht; mehr als der Wunsch geht immer. Ein Dienst je Person und
  Schicht (409). Überlappende Schichten sind nur ein Hinweis. Bei abgesagten Events kein Eintragen.
- Sich selbst ein-/austragen geht jederzeit (auch rückwirkend). Externe anlegen und eintragen darf jede:r; ihren
  Eintrag entfernen, wer ihn eingetragen hat oder `events:verwalten`. Andere Mitglieder nur mit `events:verwalten`.
- **Ampel** (`schichtBewertung`): rot = eine Dienstform unter Minimum oder Anwärter:in ohne Mitglied/EM in derselben
  Schicht (Externe zählen nicht als Begleitung, Anwärter:innen zählen zum Bedarf); gelb = Wunsch nicht erreicht;
  grün = alles erfüllt. Ein Event hat die schlechteste Farbe seiner Schichten, abgesagt = grau.
- Ändern eines Events behält die Einträge; entfernt es Schichten oder Bedarfe mit Einträgen, antwortet das API mit 409
  und der Liste der Betroffenen, bis `bestaetigt: true` mitkommt. Löschen nur ohne Einträge, sonst absagen.

## Seiten

| Seite                                  | Zweck                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `/kalender`                            | Kartenliste je Monat (Handy), ab `sm` umschaltbar auf Monatsraster; Filter fehlend/meine |
| `/kalender/events/:id`                 | Schichten, Bedarfe, Ein-/Austragen, Externe, `.ics` je eigenem Dienst                    |
| `/kalender/events/neu`, `…/bearbeiten` | Formular mit Vorlage + Datum, Schicht-Editor                                             |
| `/kalender/statistik`                  | **Dienstschwein**: Dienste je Person (inkl. Externe) und Dienstform pro Kalenderjahr     |
| `/kalender/einrichtung`                | Dienstformen, Kategorien, Vorlagen, Externe (Zusammenführen)                             |
| `/kalender/mein-kalender`              | Abo und Download (siehe unten)                                                           |

Das Dienstschwein zählt jeden Eintrag einmal, nach dem Jahr des Schichtbeginns (Europe/Berlin); abgesagte Events
zählen nicht. Es ist für alle mit `kalender:lesen` sichtbar.

## Mein Kalender (ICS-Abo und Download)

- Seite `/kalender/mein-kalender`. Jede:r hat einen geheimen Feed-Token (Tabelle `kalender_tokens`, nur der
  sha256-Hash wird gespeichert). Der Klartext-Token wird nur direkt nach dem Erzeugen angezeigt; ein neuer Link
  ersetzt den alten (der alte Link geht dann nicht mehr).
- `GET /api/me/kalender-token` (`{ vorhanden }`), `POST /api/me/kalender-token` (`{ token }`).
- `GET /api/kalender/feed/:token(.ics)` ist öffentlich (kein Bearer-Token, in API Gateway eine eigene Route ohne
  Authorizer). Er enthält die eigenen Dienste ab 90 Tage zurück, `text/calendar`, `no-store`. Titel
  „Dienstform · Event“, abgesagte Events als `STATUS:CANCELLED`. Links zum Event nur, wenn die Lambda-Variable
  `PUBLIC_URL` gesetzt ist (Terraform: nur mit eigener Domain).
- `GET /api/me/dienste`: eigene kommende Dienste; der Browser erzeugt daraus per `icsErzeugen` die `.ics`-Downloads
  (alle kommenden auf der Mein-Kalender-Seite, einzelne Dienste auf der Event-Seite).
- Google aktualisiert abonnierte Kalender nur alle paar Stunden.

## Push-Benachrichtigungen

Das allgemeine Modul ist in [benachrichtigungen.md](./benachrichtigungen.md) beschrieben; der Kalender nutzt drei Arten:
`kalender.erinnerung` (vor der eigenen Schicht, einstellbar), `kalender.fehlende_dienste` (zum Hinweiszeitpunkt des
Events, wenn es noch rot ist; einmal je Event; für EM standardmäßig aus) und `kalender.aenderung` (Event verschoben,
abgesagt/wieder aktiv, eigene Schicht geändert oder entfernt, von anderen ausgetragen; die handelnde Person bekommt
nichts). Einstellungen: Profil, Abschnitt „Benachrichtigungen“; „Mein Kalender“ verlinkt dorthin. Die Job-Aufgaben
stehen in `kalenderBenachrichtigungen.ts`. Auf iPhone/iPad nur über „Zum Home-Bildschirm“ (iOS 16.4+).
