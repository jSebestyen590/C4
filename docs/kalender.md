# Kalender

Events mit Schichten und Diensten. Rechte: `kalender:lesen` (ansehen, sich eintragen), `events:verwalten`
(Events anlegen, ändern, absagen), `kalender:einrichten` (Dienstformen, Kategorien, Vorlagen, Externe).

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
