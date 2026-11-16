# Review und Refactoring

Stand eines Reviews des gesamten Repos vom 10.–12.11.2026 (PR #33). Die Seite hält fest, was geprüft, was behoben und was
bewusst offen gelassen wurde, damit ein späteres Refactoring dort weitermacht und nichts doppelt prüft. Wer einen Punkt aus
[Offen](#offen) erledigt, verschiebt ihn nach [Erledigt](#erledigt) oder löscht ihn.

## Umfang und Methode

Geprüft wurde der Stand von `main` nach #29 (Schlüssel-Anfragen), später zusammengeführt mit #31 (Finanzen Scheibe 0), #34
(Benachrichtigungsverlauf) und #35 (Touch-Targets). **Nicht geprüft:** der Finanzen-Code selbst (`finanzen.ts`,
`shared/finanzen.ts`, Finanzen-Seiten) und der Benachrichtigungsverlauf.

Sieben Bereiche, je ein lesender Durchgang über Code, Tests und die passende Doku-Seite:

1. Sicherheit, Auth, Infrastruktur (Terraform), CI/CD
2. Mitglieder, Posten, Historie, Benachrichtigungen
3. Waren, Inventar, Schlüssel
4. Kalender, Protokolle, Todos
5. Umfragen, Privatpartys mit Party-Mail, Trichter, Bilder
6. Datenbank-Schicht, Migrationen, Teststrategie
7. Web-Frontend übergreifend (Projektregeln, Architektur, Wartbarkeit)

Die Funde der Stufe „hoch“ und die meisten der Stufe „mittel“ wurden vor dem Beheben am Code nachgeprüft. Punkte unter
[Offen](#offen) mit dem Zusatz „(unsicher)“ stammen aus dem Review, sind aber nicht nachgeprüft.

## Geprüft und in Ordnung

Diese Punkte muss ein neues Review nicht wiederholen, solange die genannten Stellen unverändert sind.

- **Auth je Route:** Alle Routen in `app.ts` tragen `auth`, außer den drei bewusst öffentlichen (`/health`,
  `/kalender/feed/:token`, `/vcard/:token/...`). Zusätzlich gilt Default-Deny (siehe Erledigt).
- **Rechte im Frontend:** `can()` aus `auth.tsx` ist der einzige Helfer.
- **SQL:** kein zusammengesetztes SQL außerhalb von Drizzle (einzige `sql`-Stelle: Spaltenreferenz in `protokolle.ts`).
  Zeitstempel durchgehend mit Zeitzone, `numeric` mit Zahl-Mappern.
- **Zeitzonen:** Sommer-/Winterzeit ist für Serien und `berlinZuUtc` durch Tests abgedeckt.
- **Tokens:** Feed-Token haben 256 Bit und liegen nur als Hash in der DB.
- **Protokolle:** Links werden beim Rendern (HTML und PDF) über `SICHERE_LINKS` gefiltert, Bild-URLs nur für den eigenen
  Präfix signiert; kein XSS gefunden.
- **Mail:** keine Header-Injection (nodemailer kodiert).
- **Umfragen:** Auf API-Ebene kein Leck der Anonymität (409 nennt nur eine Anzahl, kein Zeitpunkt in der Ausgabe, kein Logging im
  Stimm-Pfad).
- **dev-Reset:** `reset_db` und `rollback_to` sind im Workflow auf dev begrenzt, die CLIs verlangen `CONFIRM_*=yes`.
- **Projektregeln im Frontend:** kein `NumberInput` außerhalb von `ZahlFeld`, kein `100vh`, keine Sie-Form, keine festen
  Pixelbreiten, keine zu kleinen Eingaben, „IFCO“ korrekt geschrieben; alle `<Table>` haben eine Umschaltung für schmale
  Bildschirme. **Nicht geprüft:** Mitglieder ohne `StatusName` und hart kodierte gegenderte Begriffe (siehe Offen).
- **Transaktionen:** Die 97 `.transaction(`-Aufrufe außerhalb von `finanzen.ts` enthalten keine Aufrufe von S3, Cognito,
  OneDrive, Mail, Push oder `fetch` und verändern keine äußeren Variablen (Suche plus Stichproben, Hilfsfunktionen mit `tx`
  nicht Zeile für Zeile gelesen). Das ist die Voraussetzung für den zentralen Retry.
- **Admins** halten alle Rechte aus `POSTEN_RECHTE` einschließlich `finanzen:*`.
- **Doku gegen Code:** Rechte, Routen und Migrationsnummern in `umfragen.md`, `privatpartys.md`, `trichter.md`, `bilder.md`
  sowie die Regeln in `kalender.md`, `protokolle.md`, `todos.md` (Rechte, Serien, Schichtregeln) stimmen. Die Abweichungen
  stehen unter Erledigt.

## Erledigt

Alles in PR #33. Details stehen auf der jeweiligen Feature-Seite; hier nur, was sich geändert hat.

**Rechte und Zugriff**

- Posten: Besetzen, Besetzung ändern und Reaktivieren verlangen jedes Recht, das der Posten gewährt
  (`postenRechteMuessenBeiDirLiegen` in `routes/posten.ts`). Vorher reichte `posten:bearbeiten`, um sich selbst `users:manage` zu geben.
- Posten: Die Besetzung eines deaktivierten Mitglieds lässt sich beenden.
- Kalender-Feed: 404 für deaktivierte Mitglieder oder ohne `kalender:lesen`.
- Schlüssel: Den ersten Halter trägt nur die Verwaltung ein (API und Oberfläche). Planung ändern prüft wie Planung anlegen.
- Bilder: Freigabe-Links nur für Ordner aus dem Snapshot oder mit vorhandener Freigabe.
- OneDrive: Redirect-URI wird gegen Origin und Pfad geprüft, nicht per Präfix.

**Abläufe**

- Party-Mail: Unlesbare Mails und Mails über 10 MB werden übersprungen und gemeldet; scheitert das Speichern, hält der Abruf
  vor der Mail an und versucht es erneut. Text auf 20000 Zeichen gekürzt, Zukunftsdatum im Header auf jetzt begrenzt,
  Antwortadresse geprüft.
- Privatparty-Umfrage: kein Event für eine abgesagte oder schon zugesagte Anfrage; eine Absage beendet die laufende Umfrage.
- Waren: Inhalt eines Gebindes (Menge, Einheit, Untergebinde) und MHD-Art einer Ware sind gesperrt, sobald es Buchungen gibt.
- Lagerorte: Archivierte IFCOs blockieren Archivieren und Löschen ihres Platzes nicht mehr.
- Umfragen: Terminumfragen sind nie anonym (Schema und Formular); Freitexte anonymer Umfragen nach Text sortiert.
- Trichter: Gleichstand vergleicht gerundete Mengen.
- Protokolle: keine Bild-Keys beim Anlegen.
- Kleinigkeiten: Obergrenze 1.000.000 für Mengen (`anzahlSchema`), vCard-Route fängt kaputte URL-Kodierung ab.

**Gleichzeitige Zugriffe und Fehler**

- Jede Transaktion der obersten Ebene wird bei einem DSQL-Konflikt bis zu dreimal versucht (`transaktionenWiederholen` in
  `db/wiederholung.ts`, eingehängt in `createDb`). Finanzen und Migrationen behalten ihre eigenen Versuche.
- `onError` antwortet bei Konflikten (40001) sowie Unique- und Fremdschlüssel-Verletzungen (23505, 23503) mit 409 und deutscher
  Meldung. Siehe [datenbank.md](./datenbank.md), Abschnitt „Gleichzeitige Zugriffe“.

**Frontend**

- `unwrap` wirft `ApiFehler` mit dem deutschen Fehlertext der API.
- Parallele 401-Antworten teilen sich einen Token-Refresh (`auth.tsx`).
- Umfrage-Formular: Link „Anderen Typ wählen“ bricht auf dem Handy um.

**CI und Infrastruktur**

- `ci.yml` mit `permissions: contents: read`; `deploy-env.yml` führt Lint und Typecheck vor Test und Build aus.
- Das Access-Log des API Gateway schreibt `routeKey` statt des Pfads, damit keine Feed- und vCard-Token im Log stehen.
- Lokale API bindet an `127.0.0.1`.

**Deploy-Härtung** (Branch `infra/deploy-haertung`)

- Deploy-Reihenfolge: `db:migrate` läuft vor dem Apply (Migrationen müssen additiv sein, siehe [datenbank.md](./datenbank.md)),
  dazwischen `terraform plan` und Apply genau dieses Plans statt `-auto-approve`. Ein Rollback-Weg für prod fehlt weiter.
- Prod-Deploy nur für Tags `v*`, deren Commit auf `main` liegt und dessen CI-Job `check` grün ist (Job `pruefen`).
- `db:reset` und `db:rollback` verweigern Datenbanken mit `app_info.env = prod`.
- API Gateway: Throttling (Burst 100, Rate 50). CloudFront: Security-Header-Policy auf allen Behaviors.
- Profilbilder-Bucket: Versionierung, alte Versionen laufen nach 30 Tagen ab.
- Actions auf Commit-SHAs gepinnt, `dependabot.yml` (Actions und npm), informativer Job `audit` (`pnpm audit`).

**Deploy-Rolle und Backups** (Branch `infra/deploy-rolle-backup`)

- Deploy-Rolle: Permissions Boundary `c4-<env>-workload-boundary` für die von ihr angelegten Rollen, `iam:*` auf sich selbst
  verboten, Cross-Environment-Verbot per Tag `Environment`, `backup:*` verboten. Offen bleibt die Branch-Bedingung im `sub`
  (bewusst nicht gesetzt) und dass Cognito/DSQL ohne Tag nicht je Umgebung eingegrenzt sind.
- Backups: AWS Backup für DSQL je Umgebung im Bootstrap (siehe [datenbank.md](./datenbank.md#backups)); Wiederherstellung noch
  nicht getestet.

**Doku**

- `protokolle.md` aufgeteilt (Einstieg plus `protokolle/bausteine.md`, `aktionen.md`, `ansicht-pdf.md`).
- Abschnitte „Invarianten“ und „Dateien“ auf den Feature-Seiten; FIFO-Entnahme, Todo-Erinnerung, Trichter-Grenzen, sichtbare
  Profilfelder und die Reichweite der Umfrage-Anonymität dokumentiert; tote Dateiverweise und Migrationsnummern korrigiert.

**Gleichzeitige Zugriffe (Issue 36)**

- Party-Mail: Lease `mail_abruf.laeuft_bis` verhindert, dass Cron und „Jetzt abrufen“ gleichzeitig laufen.
- OneDrive: `erneuern` teilt eine laufende Token-Erneuerung (Single-Flight) innerhalb einer Lambda-Instanz.

**Entschieden (kein Handlungsbedarf)**

- Adresse, Telefon, E-Mail und Geburtsdatum bleiben für alle mit `mitglieder:lesen` sichtbar (siehe `members.md`).
- Kalender-Abo-Links (Feed-Token) bleiben unbefristet.
- Kein eigener Schutz im GitHub-Environment `prod` gegen Deploys von Branches: Prod wird nur über Tags deployt, andere Tags
  als Releases gibt es nicht. Der Job `pruefen` verlangt ohnehin einen Commit auf `main` mit grünem CI.
- Zwei gleichzeitige Deploys derselben Umgebung verhindert die `concurrency`-Gruppe in `deploy.yml`; ein eigener Schutz für
  Migrationen ist nicht nötig.
- Anonyme Umfragen bekommen keine Mindestgröße des Kreises; `mitglied_sub` je Stimme bleibt in der DB.

**Nach PR #33** (Issue 50)

- Privatparty-Umfrage zieht geänderte Wunschtermine nach (neue Antworten hinzu, entfernte samt Stimmen weg); Umfragetitel „Privatparty: Terminabstimmung“ ohne Anlass (`docs/privatpartys.md`).
- Trichter: Anlegen und Löschen von Durchgängen in abgeschlossenen Jahren ist 400 (`docs/trichter.md`).
- Todos: Überfällige offene Todos werden täglich erinnert (`todo.frist`, Schlüssel je Todo, Tag und Person).
- Kalender: Der Schlüssel von „Fehlende Dienste“ enthält den Beginn (nach dem Verschieben kommt der Hinweis erneut). Der Serien-Job
  markiert den Tag erst nach erfolgreicher Arbeit (die Arbeit ist je Event idempotent).
- Benachrichtigungen: Der Versandschlüssel wird erst nach dem Versand belegt (Abbruch führt höchstens zu einem doppelten Push);
  `push_versand` wird täglich auf 90 Tage gekürzt; der Geburtstags-Job rechnet einmal pro Tag.
- Schlüssel-Planungen verfallen einen Tag nach ihrem Datum (beim Lesen gefiltert, kein Job); eine Übergabe an jemand anderen
  entfernt die früheste aktuelle Planung (`docs/schluessel.md`).
- Waren-Buchungen mit Zukunftsdatum sind 400 (5 Minuten Toleranz; [Issue 40](https://github.com/jSebestyen590/C4/issues/40), `docs/waren.md`).
- Beendete Ausleihen gehen nicht wieder auf (409 bei `PUT` mit Positionen); Rückgabe mit Zukunftsdatum ist 400
  (`docs/inventar.md`).
- Protokoll-Autosave: nach einem Fehler bis zu drei automatische Versuche (2 s, 5 s, 10 s), sichtbar als „Nicht gespeichert.“
  (`useProtokollAutosave.ts`, `protokolle.md`). Der Konflikt-Hinweis (409) nennt, wer zuletzt gespeichert hat.
- Protokolle: Bearbeitungssperre je Tab (Herzschlag 30 s, Ablauf nach 2 Minuten, keine Übernahme); Speichern und Abschließen
  verlangen sie (`protokolle.md`, Migrationen 0163–0165).
- Protokoll abschließen und „Ausführen“ belegen die Version, bevor die Aktionen laufen (`statusBelegen`, `aktionenBelegen`);
  ein paralleler Aufruf ist 409 ([Issue 36](https://github.com/jSebestyen590/C4/issues/36), `protokolle/aktionen.md`).
- `bewegungLoeschen` (`inventar.ts`) lehnt Buchungen eines archivierten Gegenstands ab wie `bewegungBuchen`; die Abfragen der toten Tabelle
  `inventur_knoten` sind entfernt (Tabelle bleibt im Schema).
- Inhaber von `privatpartys:verwalten` außerhalb des Kreises sehen die Privatparty-Umfrage (Liste, Detail), können sie beenden und darin abstimmen.

**Nach PR #33** ([Issue 36](https://github.com/jSebestyen590/C4/issues/36), PR A: Tabelle `sperren`)

- `sperreBeruehren` (`db/sperren.ts`, Migration 0167) vor Prüfen-dann-Einfügen: Ausleihe anlegen/ändern (`gegenstand:<id>`),
  Inventur starten (`lagerort:<id>` für den Lagerort und alle Nachfahren), Aufräumaktion starten (`aufraeumaktion`), Besetzung
  anlegen/ändern (`besetzung:<posten>:<mitglied>`), Umfrage bearbeiten und abstimmen (`umfrage:<id>`).
- Inventur starten lehnt auch eine offene Inventur auf einem über- oder untergeordneten Lagerort ab (409); die Prüfung fehlte.
- Abstimmen prüft den Stimmzettel in der Transaktion noch einmal gegen die aktuellen Optionen (409 bei entfernter Option).
- Kein Wettlauf, nur begründet: `inventurAbschliessen` (beide Aufrufe schreiben dieselbe `inventuren`-Zeile, der Retry sieht
  „abgeschlossen“); `gegenstaende.anzahl` (parallele Buchungen schreiben dieselbe Zeile; höchstens Drift, Vertragstests in Issue 48).

**Nach PR #33** ([Issue 39](https://github.com/jSebestyen590/C4/issues/39))

- Status mit Zukunftsdatum: nicht erreichbar (Routen prüfen, Protokoll-Aktionen nehmen bei künftiger Sitzung heute).
  `statusSetzen` und `speichern` werfen jetzt zusätzlich bei einem künftigen Datum; das stille Ersetzen eines Eintrags vom
  selben Tag durch „Status ändern“ ist gewollt und in `members.md` beschrieben.

**Nach PR #33** ([Issue 51](https://github.com/jSebestyen590/C4/issues/51))

- Doku: „Oberfläche (Details)“ in `waren.md` und `inventar.md` gegen die Komponenten geprüft (Korrektur: Menüs bieten
  „Archivieren“ bzw. „Wiederherstellen“, der Lagerort-Dialog heißt „Lager anlegen“ / „Unterebene anlegen“); Routen-Tabelle
  für Events und Dienste in `kalender.md`; neue Seite `querschnitt.md` (Auth-Modell, Rechteberechnung, Fehler-Mapping,
  DSQL-Wiederholung); `README.md`: User-Pool-ID je Umgebung per Terraform-Output, lokaler Bootstrap-State, OneDrive-Verbindung.

**Issue 48 (Tests und Struktur, Leistung)**

- Migrationstest: prüft jetzt ab 0010 (statt 0037). 0001–0009 sind ausgenommen, weil sie vor der Ein-Statement-Regel
  entstanden (0009 hat zwei Statements, keine Down-Dateien) und vor dem ersten Release zusammengeführt wurden
  (`datenbank.md`).
- Cognito: `konten()`/`rollen()` sind je warmem Container 60 s gecacht; `createUser`, `setGroups`, `setEnabled` und
  `setPreferredUsername` leeren den Cache. Neue Schnittstelle `UserAdminEinzeln` (`konto(sub)`, `rollenVon(kontoName)`).
- Serien: `serienEventsLoeschen` löscht je Chunk (20 Events) in einer Transaktion mit je einer Anweisung pro Tabelle;
  Termine einer Serie entstehen über `serienTermineAnlegen` (Batch-Insert der Tage, eine Transaktion je 40 Events).
- Pool: `max` von 2 auf 4 (Routen fragen per `Promise.all` mehrere Stores parallel ab).

**Ohne Test geblieben**

- Größenprüfung und Überspringen beim Parsen in `partymail.ts` (bräuchte einen IMAP-Client).
- Sperren für Gebinde und MHD-Art sowie die IFCO-Änderung an Lagerorten (liegen im SQL-Store, Tests kennen nur Fakes).
- Feed ohne `kalender:lesen` (heute haben alle Status das Recht), `unwrap`, der geteilte Token-Refresh.
- Im Browser nicht geprüft: 403 der Posten-Sperre und der Hinweis beim ersten Schlüsselhalter (bräuchten einen Account ohne
  Admin-Rechte).

**Absicherung nach außen** (Issue 47, PR 1)

- Default-Deny: Middleware in `createApp` verlangt `auth` außer für `OEFFENTLICH`; Test über alle registrierten Routen
  (`app.test.ts`). Siehe `querschnitt.md`.
- `/health` ist öffentlich ohne DB (`{ ok: true }`); die DB-Prüfung ist das Lambda-Event `{ "c4": "health" }`, das der Deploy aufruft.
- CloudFront-Logs (enthalten Feed- und vCard-Token im Pfad) werden nach 14 Tagen gelöscht, die übrigen Logs nach 90.

## Offen

Als „bewusst nicht umgesetzt“ markierte Punkte sind entschieden und werden nicht angegangen. Alle anderen stehen je
Abschnitt in einem Arbeits-Issue; der Umsetzungsplan (Stand 15.11.2026) steht als Kommentar am Issue.

### 1. Gleichzeitige Zugriffe, die der Retry nicht löst

Arbeits-Issue mit Plan: [Issue 36](https://github.com/jSebestyen590/C4/issues/36). `inventurAbschliessen` und
`gegenstaende.anzahl` sind kein Wettlauf (beide Transaktionen schreiben dieselbe Zeile und kollidieren korrekt) und
entfallen.

Zwei parallele Transaktionen, die beide nur lesen und dann einfügen, lösen keinen Konflikt aus. Abhilfe: `sperreBeruehren`
(Tabelle `sperren`, siehe `docs/datenbank.md`). Alle bekannten Stellen (Ausleihe, Inventur, Aufräumaktion,
Besetzung, Umfrage, Protokoll, Party-Mail-Abruf, OneDrive) sind erledigt (siehe unten).

### 2. Infrastruktur und Deploy

Arbeits-Issue: [Issue 47](https://github.com/jSebestyen590/C4/issues/47) (außer den zurückgestellten Punkten). Dazu gehört
auch, die erste Sicherung und eine Wiederherstellung auf dev zu prüfen.

- **Deploy-Rollback:** Keine Lambda-Versionen (bewusst); Rollback auf prod = älteren Tag `v*` erneut deployen, noch zu
  dokumentieren und auf dev zu üben.
- **Admin-Entzug (bewusst nicht umgesetzt, [Issue 37](https://github.com/jSebestyen590/C4/issues/37)):** Die Gruppe kommt aus
  dem Access-Token (60 Minuten gültig); ein Entzug wirkt erst, wenn er abläuft.
- **MFA (bewusst nicht umgesetzt, [Issue 42](https://github.com/jSebestyen590/C4/issues/42)):** Der Cognito-Pool hat kein MFA.
- **Datenbank-Zugang:** Die Lambda verbindet sich als `admin` (`dsql:DbConnectAdmin`). Spike dazu:
  `plans/finanzen-spike-dsql-rolle.md`.
- **Geheimnisse:** OneDrive-Secret und -Tokens sowie der private VAPID-Schlüssel liegen im Klartext in der DB; die
  Deploy-Rolle darf `secretsmanager:*` auf das Party-Mail-Secret. OneDrive-Scope `Files.ReadWrite` umfasst das ganze Laufwerk (bleibt bewusst so).
- **Uploads:** Ob das Größenlimit in den vorsignierten PUT-URLs greift, ist unklar (unsicher); keine Obergrenze für Bilder je
  Protokoll (bleibt bewusst so).
- **Eingehende Mail (bewusst nicht umgesetzt, [Issue 38](https://github.com/jSebestyen590/C4/issues/38)):** Schutz vor Spam
  ist der Spamfilter des Anbieters (netcup); abgerufen wird nur der Posteingang. Keine eigene SPF/DKIM-Prüfung, keine
  Mengenbegrenzung; ein gefälschtes `In-Reply-To` überschreibt `mail_adresse`.
- **CI:** kein `terraform plan` auf PRs (bewusst nicht umgesetzt).

### 3. Fachliche Punkte

Arbeits-Issue: [Issue 50](https://github.com/jSebestyen590/C4/issues/50) (außer den zurückgestellten Punkten).

- **Protokoll-Autosave:** Bei einem Konflikt (409) verwirft „Neu laden“ den lokalen Stand; ob er stattdessen erhalten bleiben
  soll, ist nicht entschieden. Gleichzeitiges Bearbeiten verhindert die Bearbeitungssperre (`protokolle.md`); ein Konflikt tritt nur
  noch auf, wenn eine Sperre ablief (Tab lange eingefroren oder offline) und jemand anderes inzwischen gespeichert hat.

### 4. Tests und Struktur

Arbeits-Issue: [Issue 48](https://github.com/jSebestyen590/C4/issues/48).

- **Keine Tests gegen echtes SQL (bewusst nicht umgesetzt):** Alle API-Tests laufen gegen Fakes; die Drizzle-Stores werden
  auf dev geprüft. Damit entfällt auch ein Test, der `schema.ts` mit den Migrationen vergleicht.
- **Fremdschlüssel / Unique:** erledigt (PR „Löschen referenzierter Zeilen“): alle Löschrouten prüfen Verweise in der
  Transaktion und lehnen mit 409 und fachlicher Meldung ab (`datenbank.md`, „Fremdschlüssel und Löschen“). Offen: ob DSQL
  Fremdschlüssel erzwingt, ist ungeprüft; Unique-Index nur für `privatpartys.event_id` (0166). Weitere Kandidaten ohne Index:
  `privatpartys.umfrage_id` (nur nicht-eindeutiger Index 0126, `nachUmfrage` nimmt Eindeutigkeit an) und
  `umfrage_termine.event_id`; vorher Duplikate auf dev prüfen.
- **Leistung (Rest):** `userAdmin.konten()`/`rollen()` sind jetzt gecacht, die Routen laden aber noch die ganze Liste für ein
  Mitglied. In den Routen (`routes/`) auf `konto(sub)` / `rollenVon(kontoName)` umstellen (Profil-Routen, Feed, vCard) und
  prüfen, dass `umfrageKontext()` je Request nur einmal läuft. `/umfragen/beendet` ist bereits paginiert.

### 5. Frontend

Arbeits-Issue: [Issue 49](https://github.com/jSebestyen590/C4/issues/49).

- ~~Wiederholungen: Umschaltung Karte/Tabelle, Datumsformate inline, Zod-Fehler je Formular von Hand~~ **erledigt**
  (`KartenOderTabelle`, `datum.ts`, `zodFeldFehler`, siehe `querschnitt.md`). Bewusst nicht umgestellt: Journal und Kontenplan
  (Sticky-Kopf, Gruppen), Bargeld (Matrix statt Liste). Query-Keys von Hand invalidiert und `App.tsx` mit allen Routen in einer
  Datei sind separate Punkte (Issue 49, PR 1 und 4).
- ~~Tests: nichts für `api.ts`, `auth.tsx`, `PullToRefresh`, `ZurueckLink`~~ **erledigt** (Unit-Tests je Datei, `*.test.tsx`). Es bleibt bei Unit-Tests, keine E2E-Tests (Entscheidung in Issue 49).
- PWA: Manifest nur mit 180-px-Icon, ohne `theme_color`; kein Offline-Hinweis.
- ~~Noch zu prüfen: Mitglieder ohne `StatusName` und hart kodierte gegenderte Begriffe~~ **erledigt**: Die @-Erwähnungsliste und die Stichwahl-Beschriftung im Protokoll zeigen Mitglieder jetzt mit `StatusName`; die übrigen Fundstellen waren schon richtig. Die geprüften Gender-Stellen (`Finanzer:in` als Postenname, `Chef:in` als Platzhalter, `Freund:in von X` als Beispiel, „Mitglied“ als Kategorie) sind allgemein gemeint und bleiben.
