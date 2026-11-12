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
  `/kalender/feed/:token`, `/vcard/:token/...`). Per Skript geprüft; ein Default-Deny fehlt aber (siehe Offen).
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
  (`postenRechteMuessenBeiDirLiegen` in `app.ts`). Vorher reichte `posten:bearbeiten`, um sich selbst `users:manage` zu geben.
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

**Doku**

- `protokolle.md` aufgeteilt (Einstieg plus `protokolle/bausteine.md`, `aktionen.md`, `ansicht-pdf.md`).
- Abschnitte „Invarianten“ und „Dateien“ auf den Feature-Seiten; FIFO-Entnahme, Todo-Erinnerung, Trichter-Grenzen, sichtbare
  Profilfelder und die Reichweite der Umfrage-Anonymität dokumentiert; tote Dateiverweise und Migrationsnummern korrigiert.

**Entschieden (kein Handlungsbedarf)**

- Adresse, Telefon, E-Mail und Geburtsdatum bleiben für alle mit `mitglieder:lesen` sichtbar (siehe `members.md`).

**Ohne Test geblieben**

- Größenprüfung und Überspringen beim Parsen in `partymail.ts` (bräuchte einen IMAP-Client).
- Sperren für Gebinde und MHD-Art sowie die IFCO-Änderung an Lagerorten (liegen im SQL-Store, Tests kennen nur Fakes).
- Feed ohne `kalender:lesen` (heute haben alle Status das Recht), `unwrap`, der geteilte Token-Refresh.
- Im Browser nicht geprüft: 403 der Posten-Sperre und der Hinweis beim ersten Schlüsselhalter (bräuchten einen Account ohne
  Admin-Rechte).

## Offen

Als „zurückgestellt“ markierte Punkte sind vorerst nicht geplant und nur als GitHub-Issue festgehalten; alle anderen sollen
angegangen werden.

### 1. Gleichzeitige Zugriffe, die der Retry nicht löst

**Zurückgestellt**, dokumentiert in [Issue 36](https://github.com/jSebestyen590/C4/issues/36).

Zwei parallele Transaktionen, die beide nur lesen und dann einfügen, lösen keinen Konflikt aus. Abhilfe je Stelle: in der
Transaktion eine gemeinsame Zeile anfassen (z. B. `aktualisiert_am` des Gegenstands oder Lagerorts) oder ein Unique-Index.

| Stelle                                                  | Folge                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `ausleiheAnlegen`, `positionenPruefen` (`inventar.ts`)  | derselbe Gegenstand wird doppelt verliehen                                                 |
| Inventur starten (`waren.ts`)                           | zwei offene Inventuren je Lagerort; auch Eltern- und Kind-Lagerort gleichzeitig            |
| Aufräumaktion starten (`inventar.ts`)                   | zwei offene Aufräumaktionen                                                                |
| `besetzungAnlegen` (`posten.ts`)                        | überlappende Besetzungen einer Person                                                      |
| `inventurAbschliessen` (`waren.ts`)                     | Korrekturen doppelt gebucht (unsicher)                                                     |
| Protokoll abschließen, „Ausführen“ (`app.ts`)           | Aktionen (Event, Einladungen) doppelt, weil sie vor dem versionsgeprüften Schreiben laufen |
| Umfrage bearbeiten während einer Stimmabgabe (`app.ts`) | Stimme behält eine entfernte Option (unsicher)                                             |
| Party-Mail: Cron und „Jetzt abrufen“ gleichzeitig       | Fehler im Abrufstatus; leere Anfrage wird inzwischen weggeräumt                            |
| OneDrive `erneuern` ohne Sperre, 6 parallele Worker     | Refresh-Token-Rotation kann einen Aufruf scheitern lassen (unsicher)                       |
| `gegenstaende.anzahl` (`bewegungBuchen`)                | handgeführter Zähler ohne Abgleich gegen die Bewegungen                                    |

### 2. Infrastruktur und Deploy

- **Deploy-Rolle (hoch):** `infra/bootstrap/main.tf` gibt `iam:*` auf `role/c4-<env>-*` (trifft die Rolle selbst) und
  `cognito-idp:*`, `dsql:*`, `cloudfront:*` auf alle Ressourcen des Accounts; die dev-Rolle kann prod ändern. Das
  OIDC-Vertrauen prüft nur das Environment, nicht den Branch. Abhilfe: Permissions Boundary, Eingrenzung per Tag oder Name,
  Branch-Bedingung im `sub`. Das Bootstrap wird lokal mit dem Profil `C4` angewendet, der State liegt lokal.
- **Deploy-Reihenfolge:** `terraform apply` (neue Lambda) läuft vor `db:migrate`. Kein Rollback-Weg für prod (keine
  Lambda-Versionen, `rollback_to` nur dev), `-auto-approve` ohne Plan, kein Zwang zu grünem CI oder Tag auf `main`.
- **Migrationen:** kein Schutz gegen zwei gleichzeitige Läufe (kein `concurrency` im Workflow, keine Sperrzeile).
- **Admin-Entzug (zurückgestellt, [Issue 37](https://github.com/jSebestyen590/C4/issues/37)):** Die Gruppe kommt aus dem Access-Token (60 Minuten gültig); `setGroups` meldet niemanden ab.
- **Absicherung nach außen:** kein Throttling am API Gateway, keine Security-Header (CloudFront), `/health` fragt die DB ab,
  kein MFA im Cognito-Pool, kein Default-Deny für `auth` in `app.ts`.
- **Datenbank-Zugang:** Die Lambda verbindet sich als `admin` (`dsql:DbConnectAdmin`). Spike dazu:
  `plans/finanzen-spike-dsql-rolle.md`.
- **Geheimnisse:** OneDrive-Secret und -Tokens sowie der private VAPID-Schlüssel liegen im Klartext in der DB; die
  Deploy-Rolle darf `secretsmanager:*` auf das Party-Mail-Secret. OneDrive-Scope `Files.ReadWrite` umfasst das ganze Laufwerk.
- **Logs:** CloudFront-Logs enthalten weiterhin die Token-URLs (90 Tage). Feed-Token laufen nie ab.
- **Backups:** DSQL-Backups für prod sind in Terraform nicht konfiguriert (unsicher, ob anderswo); Bucket-Versionierung der
  Profilbilder ist aus.
- **Uploads:** Ob das Größenlimit in den vorsignierten PUT-URLs greift, ist unklar (unsicher); keine Obergrenze für Bilder je
  Protokoll.
- **Eingehende Mail (zurückgestellt, [Issue 38](https://github.com/jSebestyen590/C4/issues/38)):** keine SPF/DKIM- oder Spam-Prüfung; jede Mail erzeugt eine Anfrage und einen Push. Ein gefälschtes
  `In-Reply-To` überschreibt `mail_adresse`.
- **CI:** Actions auf Major-Tags statt SHAs, kein Dependabot oder `pnpm audit`, kein `terraform plan` auf PRs.
- **Lokal:** `pnpm db:reset` nutzt den Endpoint aus der Umgebung; mit prod-Zugangsdaten träfe es prod.

### 3. Fachliche Punkte, die eine Entscheidung brauchen

- **Status mit Zukunftsdatum (zurückgestellt, [Issue 39](https://github.com/jSebestyen590/C4/issues/39)):** `statusAbgleichen` nimmt den jüngsten Eintrag ohne Vergleich mit heute; über einen
  Protokoll-Abschluss könnte ein künftiges Datum hineinkommen (unsicher). `statusSetzen` überschreibt einen Eintrag vom selben
  Tag still, die Route antwortet dafür mit 409.
- **Schlüssel-Planungen** laufen nie ab; eine veraltete Planung zeigt ihren Empfänger weiter als erwarteten Halter. Eine
  Übergabe an jemand anderen entfernt sie nicht.
- **Ausleihen:** `ausleiheAktualisieren` nimmt Positionen für eine beendete Ausleihe an und öffnet sie damit wieder; Rückgabe
  ohne Prüfung auf Zukunftsdatum.
- **Buchungen mit Zukunftsdatum (zurückgestellt, [Issue 40](https://github.com/jSebestyen590/C4/issues/40))** zählen im Bestand, aber nicht im FIFO-Plan „jetzt“. `bewegungLoeschen` prüft `archiviert`
  nicht. Die Tabelle `inventur_knoten` ist tot, wird aber noch abgefragt.
- **Todos:** Überfällige Todos werden nie erinnert.
- **Kalender:** „Fehlende Dienste“ wird nach dem Verschieben eines Events nicht erneut gesendet (Schlüssel ohne Beginn). Der
  Serien-Job belegt den Tag vor der Arbeit; bei einem Lambda-Timeout fällt der Tag aus.
- **Protokoll-Autosave:** kein erneuter Versuch nach einem Fehler; ein Konflikt verwirft den lokalen Stand, ohne Hinweis, wer
  mitschreibt.
- **Privatpartys:** Werden Wunschtermine nach dem Anlegen der Umfrage geändert, bleiben die Optionen alt. Der Anlass steht im
  Umfragetitel und in der Push-Nachricht für alle Status.
- **Umfragen:** keine Mindestgröße des Kreises bei anonymen Umfragen; `mitglied_sub` je Stimme in der DB. Inhaber von
  `privatpartys:verwalten` außerhalb des Kreises bekommen 404 auf die Privatparty-Umfrage (unsicher).
- **Trichter:** Einträge lassen sich in abgeschlossene Jahre zurückdatieren.
- **Benachrichtigungen:** Der Versandschlüssel wird vor dem Senden belegt (bei Abbruch geht der Push verloren);
  `push_versand` wird nie aufgeräumt; der Geburtstags-Job rechnet ab 09:00 alle 5 Minuten alle Empfänger neu.

### 4. Tests und Struktur

- **Keine Tests gegen echtes SQL:** Alle API-Tests laufen gegen Fakes; die Drizzle-Stores laufen erst auf dev. Vorschlag: PGlite
  mit den echten Migrationen und Vertragstests, die Fake und Store gegen dasselbe Interface prüfen.
- **Schema gegen Migrationen:** `schema.ts` und die SQL-Dateien werden von Hand synchron gehalten, kein Test vergleicht sie.
  Der Migrationstest prüft erst ab 0037.
- **`app.ts`** (rund 5800 Zeilen, alle Routen) und `app.test.ts` (rund 10000 Zeilen): aufteilen in Sub-Router je Feature.
- **Fremdschlüssel:** kein `ON DELETE`; Löschen referenzierter Zeilen endet jetzt als 409 statt 500, aber ohne fachliche
  Meldung. Nur wenige Unique-Constraints, obwohl der Code an Stellen Eindeutigkeit annimmt.
- **Leistung:** Mehrere Routen laden für ein Mitglied die ganze Cognito-Liste (auch die öffentliche vCard-Route und der
  Feed über `userAdmin.rollen()`); `ladeKontext` der Umfragen ruft `ListUsers` je Request; `/umfragen/beendet` scannt alle
  beendeten Umfragen; Serien-Operationen schreiben je Event einzeln; Pool mit `max: 2`.

### 5. Frontend

- Kein globales `MutationCache.onError` und kein Standard-`staleTime`; einzelne Mutationen zeigen bei Fehlern nichts
  (`protokollDaten.ts`, `todoDaten.tsx`, `RollenAnzeige.tsx`, `StatusAnzeige.tsx`, `MitgliedEinladen.tsx`,
  `StatusEintragModal.tsx`; unsicher, ob die Aufrufer es abfangen).
- Nach einem gescheiterten Token-Refresh folgt kein Logout oder Redirect.
- Wiederholungen: Umschaltung Karte/Tabelle an etwa 13 Stellen, Datumsformate mehrfach inline, Zod-Fehler je Formular von
  Hand, Query-Keys von Hand invalidiert. `App.tsx` mit allen Routen in einer Datei.
- Tests: nichts für `api.ts`, `auth.tsx`, `PullToRefresh`, `ZurueckLink`; ein einziger Komponententest; keine E2E-Tests.
- PWA: Manifest nur mit 180-px-Icon, ohne `theme_color`; kein Offline-Hinweis.
- **Noch zu prüfen:** Mitglieder ohne `StatusName` und hart kodierte gegenderte Begriffe (die Suche im Review schlug fehl).

### 6. Doku

- Die Abschnitte „Oberfläche (Details)“ in `waren.md` und `inventar.md` sind nicht gegen die Komponenten geprüft.
- `kalender.md` hat keine Routen-Tabelle für Events und Dienste.
- Eine Seite für Querschnittsthemen fehlt (Auth-Modell, Rechteberechnung, Fehler-Mapping).
- `README.md`: Schritt 8 nennt eine User-Pool-ID ohne Umgebung; der lokale Bootstrap-State und die OneDrive-Verbindung sind
  nicht erwähnt.
