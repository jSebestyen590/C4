# Bilder

Die Fotos der Veranstaltungen liegen im privaten OneDrive des Vereins im Ordner `Cloud4/Bilder` (Basisordner, einstellbar).
Jedes Event hat dort einen Unterordner `Datum_Event`. Die Seite **Bilder** (`/bilder`) listet diese Ordner, durchsuchbar
nach Eventname und Datum; ein Klick öffnet den Ordner in OneDrive. Unterordner werden nicht betrachtet. Rechte:
`bilder:lesen` (alle Status: ansehen und Ordner anlegen), Verbindung einrichten mit `users:manage`.

Die Bilder in Protokollen sind davon getrennt: Sie liegen in S3, nicht in OneDrive (siehe [protokolle/ansicht-pdf.md](./protokolle/ansicht-pdf.md#bilder)).

## Überblick

Die Veranstaltungsfotos liegen im privaten OneDrive des Vereins (Basisordner `Cloud4/Bilder`), je Event ein Unterordner `Datum_Event`. Die Seite `/bilder` listet und durchsucht diese Ordner und kann neue anlegen; Rechte sind `bilder:lesen` und `users:manage` (Verbindung einrichten). Die Bilder in Protokollen sind davon getrennt und liegen in S3.

Abschnitte: Namensschema, Freigabelinks und Teilen, Ladezeit: Snapshot der Ordnerliste, Events und Vorlagen, Verbindung zu OneDrive, PDFs der Protokolle, API, Datenbank

## Namensschema

| Form                    | Beispiel                          | Genauigkeit |
| ----------------------- | --------------------------------- | ----------- |
| Ein Tag                 | `2025-06-14_Sommerfest`           | `tag`       |
| Range im selben Monat   | `2025-07-18-20_Festival`          | `tag`       |
| Range über Monatsgrenze | `2025-07-30-08-02_Festival`       | `tag`       |
| Range über Jahresgrenze | `2025-12-30-2026-01-02_Silvester` | `tag`       |
| Nur ein Datum / Range   | `2025-06-14`, `2025-07-18-20`     | `tag`       |
| Monat                   | `2025-07_Urlaub`, `2025-07`       | `monat`     |
| Jahr                    | `2025_Archiv`, `2025`             | `jahr`      |

`ordnerNameParsen` / `ordnerName` in `packages/shared/src/bilder.ts`. Ein Name nur aus Datum (oder `YYYY`/`YYYY-MM`)
zeigt den Rohnamen als Eventnamen. Bei `monat`/`jahr` spannen `von`/`bis` den ganzen Monat bzw. das ganze Jahr
(`genauigkeit` im DTO); die Seite zeigt „Juli 2025“ bzw. „2025“. Zur Anzeige werden Unterstriche im Eventnamen zu
Leerzeichen (mehrfache Leerzeichen zusammengefasst); der Ordnername in OneDrive und `name` bleiben unverändert.

Erzeugt wird immer die kürzeste Tagesform, und Leerzeichen im Eventnamen werden zu Unterstrichen
(`2026-05-01_Erster_Mai`); das gilt für Event-Ordner, das Umbenennen (ein Ordner mit dem Soll-Namen wird nicht angefasst)
und „Ordner anlegen“ samt Vorschau. Zeichen, die OneDrive nicht erlaubt (`" * : < > ? / \ |`), sowie Punkte und Leerzeichen
am Ende fallen weg. Ordner ohne passendes Datum erscheinen trotzdem (unter „Ohne Datum“, mit Rohnamen). Die Suche
(`bilderSuche`) verknüpft mehrere Wörter mit UND; ein Wort trifft den Eventnamen oder ein Datum (`2025-06-14`, `2025-06`,
`2025`, `14.06.2025`, `14.06.`), bei einer Range jeden Tag dazwischen. Jahres-/Monatsordner treffen nur Jahres- bzw.
Monatswörter, keine Einzeltage. Sortierung: `von` absteigend, bei gleichem `von` der genauere zuerst.

## Freigabelinks und Teilen

Die Ordner-Links von OneDrive (`onedrive.live.com/?cid=…&id=…`) öffnet iOS nur im Browser. Nur `1drv.ms`-Links übergibt iOS
an die OneDrive-App. Deshalb gibt es pro Ordner einen anonymen Lese-Link: `POST /me/drive/items/{id}/createLink` mit
`{ type: 'view', scope: 'anonymous' }` (`OneDrive.freigabeLink`; Microsoft liefert bei erneutem Aufruf den vorhandenen
Link; 404 → `OrdnerFehlt`). **Alle mit dem Link können die Bilder ansehen**, ändern können sie nichts.

- Cache: Tabelle `bilder_freigaben` (`ordner_id`, `url`, `erstellt`), Store `FreigabenStore` in `onedrive.ts`. Die Zeile
  fällt weg, wenn der Ordner gelöscht wird (`loeschenWennLeer`).
- `GET /api/bilder/ordner` füllt `freigabeUrl` nur aus dem Cache und legt keine Links an (das macht die Liste langsam).
  Fehlende Links legt die Job-Aufgabe `bilder.freigaben` an (Push-Job, alle 5 Minuten): für die Ordner des Listen-Snapshots
  (siehe unten), 6 parallel, höchstens ca. 8 s je Lauf, der Rest beim nächsten Lauf; ohne Verbindung passiert nichts.
  Fehler je Ordner werden nur geloggt.
- Neue Ordner (Anlegen-Dialog, Event-Ordner) bekommen ihren Link sofort; schlägt das fehl, bleibt er `null`.
- `EventDto.bilderOrdnerUrl` ist der Freigabelink des Ordners, sonst die `webUrl`; `bilderOrdnerId` ist die OneDrive-ID.
- Seiten öffnen `freigabeUrl ?? webUrl`. Der **Teilen**-Button (Bilder-Seite je Ordner, Event-Seite neben „Bilder“) teilt den
  Link über `navigator.share` (Abbruch still), sonst in die Zwischenablage mit Hinweis. Ist der Link bekannt, wird sofort
  geteilt (iOS verlangt die Geste); sonst fordert die Seite ihn zuerst per `POST /api/bilder/ordner/:id/freigabe` an.

## Ladezeit: Snapshot der Ordnerliste

Die Ordner live aus OneDrive zu lesen (rund 400 Ordner, seitenweise) dauert. Deshalb speichert jede Live-Antwort die rohe
Liste (`id`, `name`, `webUrl`) als Snapshot in `bilder_ordner_cache` (eine Zeile `liste`, `daten` als JSON-Text, `stand`),
Store `OrdnerCacheStore` in `onedrive.ts`. Event-Verknüpfung (`eventId`) und `freigabeUrl` kommen beim Lesen immer frisch
aus der Datenbank, nicht aus dem Snapshot. Anlegen (Dialog, Event-Ordner) fügt den Ordner dem Snapshot hinzu, Umbenennen
und Löschen des Event-Ordners ändern ihn; ohne Snapshot passiert nichts. Alles andere korrigiert der nächste Live-Abruf.

Die Seite (`useBilderOrdner` in `bilderDaten.ts`) startet zwei Abfragen: `?quelle=cache` (Snapshot, schnell) und live. Gezeigt
wird die Live-Liste, bis dahin der Snapshot; zusätzlich merkt sich der Browser die letzte Liste in `localStorage`
(`c4.bilder.liste`), sodass auch der erste Aufbau sofort Daten hat. Solange die Live-Abfrage läuft, zeigt die Seite
„Wird aktualisiert …“ (bei Snapshot-Daten mit „Stand: dd.mm. HH:mm“); schlägt sie fehl, erscheint ein gelber Hinweis. Nur ohne
jede Daten gibt es den Ladekreis. Nach „Ordner anlegen“ werden beide Abfragen neu geladen.

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
- Spalten `events.bilder_ordner_id`, `events.bilder_ordner_url` (DTO `bilderOrdnerUrl`, `bilderOrdnerId`).

## Verbindung zu OneDrive

Microsoft Graph mit delegiertem Zugriff: Ein privates Microsoft-Konto erlaubt keine App-Anmeldung ohne Person, deshalb hält
die API einen Refresh-Token. Tabelle `onedrive_verbindung` (eine Zeile): Client-ID, Basisordner, Konto, verbunden von/am,
Fehler. **Client-Secret, Refresh-Token, Access-Token und dessen Ablauf liegen im Secrets-Manager-Secret `c4-<env>-onedrive`**
(JSON; Terraform legt es nur leer an, die API schreibt es; Lesen mit 30 s Cache, vor dem Erneuern des Refresh-Tokens immer
frisch gelesen, weil eine andere Lambda-Instanz ihn schon rotiert haben kann). Die gleichnamigen DB-Spalten sind veraltet und
leer (Migration 0280). Secret und Tokens verlassen die API nie. Lokal ohne `ONEDRIVE_SECRET_ARN` liegen sie nur im Speicher.

- Der Access-Token wird kurz vor Ablauf erneuert; der neue Refresh-Token ersetzt immer den alten. Die Job-Aufgabe
  `onedrive.token` (Push-Job, alle 5 Minuten) erneuert höchstens einmal am Tag, damit er nicht durch Inaktivität verfällt.
- Bei `invalid_grant` (z. B. Passwort geändert, Zugriff widerrufen) gilt OneDrive als nicht verbunden; die Seiten zeigen
  das, Admins verbinden neu.
- Code: `packages/api/src/onedrive.ts` (Graph), `onedrive.fake.ts` (Tests).

### Einrichtung (einmalig)

Die App-Registrierung ist nur der Ausweis der C4-App bei Microsoft. Sie muss nicht im Konto liegen, dem der OneDrive gehört;
auf den OneDrive greift C4 erst zu, wenn sich jemand mit diesem Konto in Schritt 4 anmeldet.

0. **Verzeichnis (Entra-Mandant) anlegen, falls das Konto keines hat.** Private Microsoft-Konten (auch in Microsoft Family)
   haben anfangs kein eigenes Verzeichnis. Das Portal meldet dann nach der Anmeldung „Interaktion erforderlich“ mit
   `AADSTS16000 … does not exist in tenant 'Microsoft Services'`. Abhilfe: mit demselben Konto ein kostenloses Azure-Konto
   anlegen (https://azure.microsoft.com/free; Telefonnummer und Kreditkarte nur zur Identitätsprüfung, ohne Upgrade auf
   „Nutzungsbasierte Bezahlung“ fallen keine Kosten an). Dabei entsteht ein „Standardverzeichnis“ mit dem Konto als
   Administrator. Endet später das kostenlose Abonnement, bleiben Verzeichnis und App-Registrierung bestehen (Entra ID Free).
   Kinderkonten einer Family sind für Azure gesperrt.
1. Im [Entra Admin Center](https://entra.microsoft.com) (oder [Azure-Portal](https://portal.azure.com)) anmelden, ggf. oben
   rechts ins Standardverzeichnis wechseln, **Anwendungen → App-Registrierungen → Neue Registrierung**:
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

## PDFs der Protokolle

Dieselbe Verbindung speichert die PDFs abgeschlossener Sitzungsprotokolle: `OneDrive.dateiHochladen(pfad, inhalt, contentType)`
(Graph-Direktupload `PUT /me/drive/root:/<Pfad>:/content`, `conflictBehavior=replace`, höchstens 4 MB; Graph legt fehlende Ordner an).
Der Pfad `Cloud4/Sitzungen/C4/Protokolle/<Jahr>/<Datei>.pdf` (`PROTOKOLL_PFAD`) gilt ab dem Wurzelordner des OneDrive, nicht ab dem
Bilder-Basisordner. Details in [protokolle/ansicht-pdf.md](./protokolle/ansicht-pdf.md#pdf-und-onedrive).

## API

- `GET /api/bilder/ordner` → `{ verbunden, ordner: [{ id, name, webUrl, freigabeUrl, von, bis, eventName, genauigkeit, eventId }], stand, ausCache }`
  (neueste zuerst). Live aus OneDrive (speichert den Snapshot; `stand` = jetzt, `ausCache: false`); mit `?quelle=cache` sofort
  der gespeicherte Snapshot (`ausCache: true`, `stand` ISO oder `null` und `ordner: []` ohne Snapshot).
- `POST /api/bilder/ordner` `{ eventName, von, bis? }` → 201; 409 bei vorhandenem Namen, 503 ohne Verbindung
- `POST /api/bilder/ordner/:id/freigabe` (`bilder:lesen`) → `{ url }` (legt den Link an und cached ihn); 404, wenn die App den Ordner nicht kennt (nicht im Listen-Snapshot und ohne gespeicherten Freigabelink; die Id kommt aus der URL und darf kein beliebiges OneDrive-Element sein), 503 ohne Verbindung
- `POST /api/kalender/events/:id/bilder-ordner` → `{ bilderOrdnerUrl }` (409, wenn schon einer existiert)
- Verbindung (`users:manage`): `GET`/`PUT`/`DELETE /api/bilder/verbindung`, `POST /api/bilder/verbindung/login`
  `{ redirectUri, state }` → `{ url }`, `POST /api/bilder/verbindung/code` `{ code, redirectUri }`

## Datenbank

Migrationen `0104`–`0109` (siehe `datenbank.md`).
