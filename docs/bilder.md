# Bilder

Die Fotos der Veranstaltungen liegen im privaten OneDrive des Vereins im Ordner `Cloud4/Bilder` (Basisordner, einstellbar).
Jedes Event hat dort einen Unterordner `Datum_Event`. Die Seite **Bilder** (`/bilder`) listet diese Ordner, durchsuchbar
nach Eventname und Datum; ein Klick öffnet den Ordner in OneDrive. Unterordner werden nicht betrachtet. Rechte:
`bilder:lesen` (alle Status: ansehen und Ordner anlegen), Verbindung einrichten mit `users:manage`.

## Namensschema

| Form                    | Beispiel                          |
| ----------------------- | --------------------------------- |
| Ein Tag                 | `2025-06-14_Sommerfest`           |
| Range im selben Monat   | `2025-07-18-20_Festival`          |
| Range über Monatsgrenze | `2025-07-30-08-02_Festival`       |
| Range über Jahresgrenze | `2025-12-30-2026-01-02_Silvester` |

`ordnerNameParsen` / `ordnerName` in `packages/shared/src/bilder.ts`. Erzeugt wird immer die kürzeste Form; Zeichen, die
OneDrive nicht erlaubt (`" * : < > ? / \ |`), sowie Punkte und Leerzeichen am Ende fallen weg. Ordner ohne passendes
Datum erscheinen trotzdem (unter „Ohne Datum“, mit Rohnamen). Die Suche (`bilderSuche`) verknüpft mehrere Wörter mit UND;
ein Wort trifft den Eventnamen oder ein Datum (`2025-06-14`, `2025-06`, `2025`, `14.06.2025`, `14.06.`), bei einer Range
jeden Tag dazwischen.

## Events und Vorlagen

- Im Event-Formular legt „Bilder-Ordner in OneDrive anlegen“ beim Speichern den Ordner an (beim Anlegen und Bearbeiten).
  Vorlagen haben dafür die Vorgabe `bilderOrdner` (Spalte `event_vorlagen.bilder_ordner`); Serien-Events bekommen nie
  automatisch einen Ordner. Auf der Event-Seite kann jede:r mit `bilder:lesen` den Ordner nachträglich anlegen.
- Name und Datum: `eventOrdnerDaten` (Anzeigetitel; Datum = Berliner Datum des Beginns, bei mehrtägigen/ganztägigen
  Kategorien bis zum letzten Tag). Ein bestehender Ordner mit demselben Namen wird nicht übernommen (Hinweis).
- Ändern sich Titel, Kategorie oder Datum, wird der Ordner beim Speichern umbenannt. Fehlt er in OneDrive, wird die
  Verknüpfung gelöst.
- Wird ein Event gelöscht (auch über eine Serie), wird sein Ordner gelöscht, wenn er leer ist (landet im OneDrive-Papierkorb);
  sonst bleibt er.
- Fehler von OneDrive (nicht verbunden, Netz, Namenskonflikt) lassen das Speichern oder Löschen des Events nie scheitern;
  die Antwort trägt dann `bilderHinweis`, das Formular zeigt ihn an.
- Spalten `events.bilder_ordner_id`, `events.bilder_ordner_url` (DTO `bilderOrdnerUrl`).

## Verbindung zu OneDrive

Microsoft Graph mit delegiertem Zugriff: Ein privates Microsoft-Konto erlaubt keine App-Anmeldung ohne Person, deshalb hält
die API einen Refresh-Token. Tabelle `onedrive_verbindung` (eine Zeile, wie `push_schluessel`; kein Secret in Terraform):
Client-ID, Client-Secret, Basisordner, Tokens, Konto, verbunden von/am, Fehler. Secret und Tokens verlassen die API nie.

- Der Access-Token wird kurz vor Ablauf erneuert; der neue Refresh-Token ersetzt immer den alten. Die Job-Aufgabe
  `onedrive.token` (Push-Job, alle 5 Minuten) erneuert höchstens einmal am Tag, damit er nicht durch Inaktivität verfällt.
- Bei `invalid_grant` (z. B. Passwort geändert, Zugriff widerrufen) gilt OneDrive als nicht verbunden; die Seiten zeigen
  das, Admins verbinden neu.
- Code: `packages/api/src/onedrive.ts` (Graph), `onedrive.fake.ts` (Tests).

### Einrichtung (einmalig)

1. Im [Azure-Portal](https://portal.azure.com) mit dem Vereins-Microsoft-Konto anmelden, **Microsoft Entra ID → App-Registrierungen → Neue Registrierung**:
   - Name z. B. „C4“, Kontotyp **Nur persönliche Microsoft-Konten**.
   - Umleitungs-URI, Plattform **Web**: `https://www.c4-leipzig.de/app/bilder/einrichtung`. Unter
     „Authentifizierung“ zusätzlich `https://dev.c4-leipzig.de/app/bilder/einrichtung` und für lokal
     `http://localhost:5173/app/bilder/einrichtung` eintragen.
2. **Zertifikate & Geheimnisse → Neuer geheimer Clientschlüssel** (höchstens 24 Monate; vor Ablauf erneuern und neu eintragen).
3. **API-Berechtigungen**: Microsoft Graph, delegiert: `Files.ReadWrite`, `offline_access`, `User.Read`.
4. In der App unter **Bilder → Einrichtung** (`/bilder/einrichtung`) Client-ID (Anwendungs-ID), Secret und Basisordner
   speichern, dann **Mit Microsoft verbinden** und mit dem Konto anmelden, dem der OneDrive gehört.

Ablauf: Die API liefert die Authorize-URL (`/consumers`-Endpunkt, `state` gegen CSRF im `sessionStorage`); Microsoft leitet
zurück auf `/app/bilder/einrichtung?code=…`, die Seite schickt den Code an die API, die ihn serverseitig eintauscht.

## API

- `GET /api/bilder/ordner` → `{ verbunden, ordner: [{ id, name, webUrl, von, bis, eventName, eventId }] }` (neueste zuerst)
- `POST /api/bilder/ordner` `{ eventName, von, bis? }` → 201; 409 bei vorhandenem Namen, 503 ohne Verbindung
- `POST /api/kalender/events/:id/bilder-ordner` → `{ bilderOrdnerUrl }` (409, wenn schon einer existiert)
- Verbindung (`users:manage`): `GET`/`PUT`/`DELETE /api/bilder/verbindung`, `POST /api/bilder/verbindung/login`
  `{ redirectUri, state }` → `{ url }`, `POST /api/bilder/verbindung/code` `{ code, redirectUri }`

## Datenbank

Migrationen `0104`–`0107` (siehe `datenbank.md`).
