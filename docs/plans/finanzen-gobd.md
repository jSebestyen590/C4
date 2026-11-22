# Finanzen Scheibe 5: GoBD-Abschluss

Rahmen: [finanzen.md](./finanzen.md) („Scheibe 5“). Doku: [../finanzen.md](../finanzen.md) (Journal, Hash-Kette,
Kette prüfen, Belege → Archiv/Täglicher Export, Datenbankrolle). Arbeitsseiten **desktop first** („Bedienung“ im
Rahmenplan), am Handy ohne horizontales Scrollen.

**Nicht auf dev ausliefern.** Nach der Umsetzung: Commit, Push und PR ja, aber **kein**
`gh workflow run deploy.yml` und kein Merge (der Nutzer testet auf dev erst die Protokoll-Session). Browser-Check
nur lokal, falls `packages/api/.env.local` existiert (`pnpm db:up`); sonst überspringen und im PR vermerken.

## Entscheidungen (mit dem Nutzer geklärt, 22.11.2026)

| Thema           | Entscheidung                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| Festschreibung  | Manuell durch `finanzen:verwalten`, Monat für Monat der Reihe nach; Push-Erinnerung ab dem 10. des Folgemonats |
| Storno          | Storno-Datum muss in einem offenen Monat liegen; der festgeschriebene Monat bleibt unverändert                  |
| CloudTrail      | In Scheibe 5; Bootstrap-Terraform wendet der Nutzer vorher von Hand an                                          |
| Datenexport     | ZIP mit CSV-Dateien + `index.xml` (Beschreibungsstandard GDPdU) + `beschreibung.txt`                            |
| Mail            | Keine (kein SES); Push und Anzeige in der App                                                                   |

Weitere Festlegungen (vom Planer, ohne Rückfrage):

- **Buchungsdatum bei fachlichen Quellen:** Freie Buchung, Umbuchung und Storno: Datum in festgeschriebenem Monat →
  400. Beleg, Erstattung, Zählung, Kassenabrechnung: liegt das fachliche Datum (Beleg-/Bezahl-/Eventdatum) in einem
  festgeschriebenen Monat, bucht die API mit dem **ersten offenen Tag** als Buchungsdatum; Beleg-, Bezahl- und
  Eventdatum bleiben unverändert gespeichert. Die Seiten zeigen das vor dem Buchen an („Der Monat 01/2027 ist
  festgeschrieben, gebucht wird mit Datum 01.02.2027.“).
- **Erster festschreibbarer Monat:** Monat der frühesten Buchung (ohne Buchungen: nichts festschreibbar). Nur ganz
  vergangene Monate (vor dem aktuellen Monat in Europe/Berlin). Leere Monate dazwischen werden ebenfalls festgeschrieben.
- **Hinweise vor der Festschreibung** (blockieren nicht, Bestätigung nötig): Beleg-Entwürfe/Einreichungen mit
  Belegdatum im Monat; Events im Monat mit Kassenzählung ohne Abrechnung. Weitere nur, wenn ohne neuen Store-Code billig.
- Festschreibung kann **nicht** zurückgenommen werden (keine Route, Tabelle nur INSERT).

## Phase 1: Festschreibung (shared, DB, API)

**Tabelle** `fin_festschreibungen` (nur INSERT; in `finanzenNurInsert.test.ts` als `finFestschreibungen` /
`fin_festschreibungen` eintragen):
`id text PK`, `monat date` (Erster des Monats), `bis_seq bigint` (höchste `seq` beim Festschreiben, auch Buchungen
späterer Monate), `kopf_hash text` (Hash bei `bis_seq`), `anzahl integer` (Buchungen mit Datum im Monat),
`export_schluessel text`, `festgeschrieben_von text` (sub), `festgeschrieben_am timestamptz`.
Migrationen (je ein Statement, Down-Dateien in `db/migrations/down/`): `0245_fin_festschreibungen.sql`,
`0246_fin_festschreibungen_monat_idx.sql` (eindeutig auf `monat`, Muster 0236/0238). Drizzle in `db/schema.ts`.

**Shared** (`packages/shared/src/finanzenAbschluss.ts`, mit Unit-Tests):
- `festgeschriebenBis(monate: string[]): string | null` (letzter Tag des letzten Monats, `JJJJ-MM-TT`)
- `ersterOffenerTag(festBis)`, `naechsterFestschreibbarerMonat({ letzterFest, fruehesteBuchung, heuteBerlin })`
- `buchungsdatumFuer(gewuenscht, festBis, verschiebbar)` → `{ datum, verschoben }` oder Fehlermeldung
- DTOs/Schemas: `FestschreibungDto`, `FestschreibungsUebersichtDto` (`festgeschriebenBis`, `ersterOffenerTag`,
  `naechsterMonat`, `hinweise[]`, `liste[]`), Body `{ monat, idempotenzSchluessel }`.

**Sperre im Journal:** `einfuegen(tx, entwurf)` in `api/src/finanzen.ts` (~618, einzige Insert-Stelle; Aufrufer:
`buchenTx` 697, Storno 745, Zählung 821, Kassenabrechnung 1181, `finanzenBelege.ts` 701 Beleg und 921 Erstattung)
liest in der Transaktion `max(monat)` aus `fin_festschreibungen` und wendet `buchungsdatumFuer` an. Neues Feld
`BuchungsEntwurf.datumVerschiebbar?: boolean` (true bei Beleg, Erstattung, Zählung, Kassenabrechnung). Fehler als
`BuchungUngueltig` (→ 400): „Der Monat MM/JJJJ ist festgeschrieben. Buche mit einem Datum ab TT.MM.JJJJ.“ Die Fakes
(`finanzen.fake.ts`, `finanzenBelege.fake.ts`) spiegeln das. Wo Beleg/Erstattung das gebuchte Datum zurückgeben,
liefert die Antwort das tatsächliche Buchungsdatum.

**Nebenläufigkeit:** Festschreiben läuft in `mitWiederholung` in einer Transaktion, die die Zählerzeile
`fin_zaehler` `journal` liest und (mit gleichem Wert) schreibt, damit DSQL eine parallele Buchung oder zweite
Festschreibung mit 40001 abbricht. Eindeutiger Index auf `monat` fängt Doppelte zusätzlich.

**Ablauf `POST /api/finanzen/festschreibungen`** (`finanzen:verwalten`, Idempotenz wie beim Buchen):
1. `monat` muss `naechsterFestschreibbarerMonat` sein (sonst 409 „Als Nächstes ist MM/JJJJ dran.“).
2. Kette laden (`kettenDaten`), `pruefeKette`; bei Fehlern 409 „Die Kette hat Fehler, Festschreibung nicht möglich.“
3. Archiv schreiben: `festschreibung/<JJJJ-MM>.jsonl` (alle Buchungen mit Datum im Monat, Zeilenformat wie täglicher
   Export) und `festschreibung/<JJJJ-MM>.json` (`{ monat, bis_seq, kopf_hash, anzahl, erstellt_am }`). Ohne Bucket 503
   wie beim Export.
4. Zeile in `fin_festschreibungen` einfügen.
5. Push (best effort) an `mitgliederMitRecht(deps, 'finanzen:pruefen')`, Art `finanzen.festgeschrieben`
   (in `BENACHRICHTIGUNGS_ARTEN` + Label): Titel „Monat MM/JJJJ festgeschrieben“, Text „Kopf-Hash: <erste 16 Zeichen>…,
   Nr. bis <bis_seq>“, URL `/app/finanzen/festschreibung`.

**`GET /api/finanzen/festschreibungen`** (`finanzen:lesen`): Übersicht inkl. Hinweise für den nächsten Monat;
von den Buchungs-/Beleg-/Kassenseiten für Datumsgrenzen und Hinweise genutzt.

**Erinnerung:** Im täglichen Job (`finanzExport`, Zweig `finanz-export`) nach dem Export: Ist heute ≥ 10. und der
Vormonat (oder früher) noch festschreibbar, Push an `finanzen:verwalten`, Art `finanzen.festschreibung_faellig`,
`dedupeSchluessel` `festschreibung-faellig:<JJJJ-MM>:<KW>` (einmal je Woche). Dafür bekommt der Job in
`bootstrap.ts` (~132) `benachrichtigungen`, `posten`, `userAdmin`.

Tests: Shared-Funktionen; Routen in `routes/finanzen.test.ts` (Reihenfolge, Monat im laufenden Monat, Doppelt,
Rechte, Sperre für freie Buchung/Storno, Verschiebung bei Beleg und Kassenabrechnung, Push-Empfänger); Job-Test.

## Phase 2: Kette prüfen gegen das Archiv

`Finanzarchiv` (`api/src/finanzarchiv.ts`) bekommt `versionenAuflisten(prefix)` (`ListObjectVersions`, Schlüssel +
VersionId + Anzahl), `lesen(schluessel, versionId?)` (Text) und `dateiPruefsumme(schluessel)` (`HeadObject` mit
`ChecksumMode: 'ENABLED'` → `ChecksumSHA256` base64). Fake in `test/appTestHelfer.ts` (~828) erweitern,
`finanzarchivNichtEingerichtet` ebenso.

Reine Prüfung in shared (`pruefeArchiv(db: KettenBuchung[], archiv)`), Ein-/Ausgabe in der Route
`GET /api/finanzen/kette` (`routes/finanzen.ts` 945):
- `export/*.jsonl` und `festschreibung/*.jsonl` parsen → je `seq`: Hash, `prev_hash` und kanonische Buchung müssen
  mit der Datenbank übereinstimmen (Fehler `archiv_abweichung`); `seq` im Archiv, aber nicht in der DB →
  `archiv_fehlt_in_db`. Buchungen nach dem letzten Export sind kein Fehler, nur `nichtExportiert: n`.
- `anker/*.json` und `festschreibung/*.json`: DB-Hash bei `bis_seq` = `kopf_hash` (Fehler `anker`).
- Mehr als eine Version eines Export-/Anker-Objekts → Fehler `archiv_ueberschrieben` (alle Versionen prüfen).
- Jede Beleg-Datei der Kette: Prüfsumme in S3 = `sha256` (Fehler `beleg_datei`, auch wenn sie fehlt).
- S3 parallel mit Begrenzung (z. B. 16 gleichzeitig).
`KettenFehlerArt` und `KETTEN_FEHLER_LABELS` erweitern; `KettenErgebnisDto` bekommt
`archiv: { exporte, anker, festschreibungen, belegdateien, nichtExportiert, eingerichtet }`. Ohne Bucket:
`archiv.eingerichtet = false`, nur DB-Prüfung wie bisher.

Tests: Fake-Archiv mit manipulierter Exportzeile, abweichendem Anker, zweiter Version, falscher Beleg-Prüfsumme.

## Phase 3: Datenexport fürs Finanzamt

`POST /api/finanzen/datenexporte` (`finanzen:pruefen` **oder** `finanzen:verwalten`), Body `{ von, bis }`
(Datum, Standard auf der Seite: Vorjahr). Erzeugt ein ZIP (neue Abhängigkeit `fflate` in `packages/api`, kein
ZIP-Code von Hand), legt es unter `datenexport/<JJJJ-MM-TT-HHmmss>-<von>-<bis>.zip` ins Archiv, trägt eine Zeile in
`fin_datenexporte` ein (nur INSERT, NurInsert-Test; Migration `0247_fin_datenexporte.sql`: `id`, `von`, `bis`,
`schluessel`, `sha256`, `erstellt_von`, `erstellt_am`) und gibt `{ id, url }` (Presigned GET) zurück.
`GET /api/finanzen/datenexporte` listet frühere Exporte mit frischer URL. (Kein Direkt-Download: API Gateway
begrenzt Antworten auf 6 MB.)

Inhalt (Hilfen als reine Funktionen in `packages/shared/src/finanzenDatenexport.ts` mit Tests: CSV nach RFC 4180,
Trenner `;`, UTF-8, CRLF; Beträge `1234,56`; Datum `TT.MM.JJJJ`):
`konten.csv`, `buchungen.csv` (inkl. `seq`, Hashes, Storno-Bezug, Quelle), `buchungszeilen.csv`, `stueckelung.csv`,
`belege.csv`, `belegposten.csv`, `rechnungssteller.csv`, `festschreibungen.csv`; `index.xml` nach GDPdU-DTD
(`gdpdu-01-08-2002.dtd`, je Tabelle `URL`, `Name`, `Description`, `UTF8`, `DecimalSymbol` `,`,
`DigitGroupingSymbol` `.`, Spalten mit `Numeric`/`AlphaNumeric`/`Date`, Primär-/Fremdschlüssel); `beschreibung.txt`
(Zeitraum, Erstellt von/am, Spaltenbedeutung, Hinweis auf Hash-Kette und Python-Snippet aus der Doku). Buchungen
nach Buchungsdatum im Zeitraum; Konten und Rechnungssteller vollständig. Belegdateien nicht im ZIP (`belege.csv`
nennt `sha256` und Archivschlüssel).

## Phase 4: Web

- **`/finanzen/festschreibung`** (neue Seite, Route in `web/src/routes/finanzenRouten.tsx`, Kachel in
  `pages/FinanzenPage.tsx`, sichtbar mit `finanzen:lesen`): oben „Festgeschrieben bis 31.01.2027“; Karte für den
  nächsten Monat mit Hinweisen und Knopf „Monat 02/2027 festschreiben“ (nur `finanzen:verwalten`), Bestätigungs-Modal
  („Danach kannst du keine Buchung mit Datum im Februar 2027 mehr anlegen. Das lässt sich nicht rückgängig machen.“);
  Liste aller Festschreibungen (Monat, Anzahl, Nr. bis, Kopf-Hash mit `HashAnzeige`, von `StatusName`, am).
  Tabelle ab `sm`, Karten darunter.
- **FinanzenPage:** Hinweis für `finanzen:verwalten`, wenn ein Monat fällig ist (ab dem 10. des Folgemonats).
- **Datumsgrenzen:** Freie Buchung, Umbuchung, Storno: Datumsfeld mit `minDate` = erster offener Tag, Hinweistext.
  Beleg, Erstattung, Kassenabrechnung: Hinweis „gebucht wird mit Datum …“, wenn verschoben wird.
- **`/finanzen/kette`** (`FinanzenKettePage.tsx`): Abschnitt „Archiv“ mit den Zählern, „nicht eingerichtet“-Hinweis,
  Fehler mit neuen Labels.
- **`/finanzen/datenexport`** (Kachel bei `finanzen:pruefen` oder `finanzen:verwalten`): Von/Bis (Standard Vorjahr),
  „Export erstellen“, Liste früherer Exporte mit Download-Link.
- Hilfetexte in `packages/web/src/finanzenHilfe.ts` (Bereiche `festschreibung`, `datenexport`, `kette` ergänzen),
  Labels der Push-Arten in der Einstellungsseite (dort, wo `belege.eingereicht` sein Label hat).

## Phase 5: Infrastruktur

- **Bootstrap** (`infra/bootstrap/main.tf`, Nutzer wendet von Hand an, im PR deutlich vermerken):
  Deploy-Rolle `cloudtrail:*` auf `arn:aws:cloudtrail:<region>:<account>:trail/c4-<env>-*` (plus
  `cloudtrail:DescribeTrails`/`ListTrails`/`GetTrail*` wo ohne Ressourcen-ARN nötig); Permissions Boundary um
  `s3:GetObjectVersion`, `s3:ListBucketVersions` auf `c4-<env>-*` erweitern.
- **App-Modul** (`infra/modules/app/main.tf`): Lambda-Policy fürs Finanzarchiv um `s3:GetObjectVersion`,
  `s3:ListBucketVersions` ergänzen (kein Delete, kein Bypass). Neuer Bucket `${local.name}-cloudtrail-<account>`
  mit Object Lock, Versionierung, Public Access Block, gleiche Retention-Variablen wie das Finanzarchiv, Bucket-Policy
  für `cloudtrail.amazonaws.com` (`GetBucketAcl`, `PutObject` mit `bucket-owner-full-control`, `aws:SourceArn`).
  `aws_cloudtrail` `${local.name}-trail`: Single-Region, `enable_log_file_validation = true`, Datenereignisse
  (Write) auf dem Finanzarchiv-Bucket; Verwaltungsereignisse (Write) **nur in prod** (Variable
  `cloudtrail_verwaltungsereignisse`, dev `false`), weil dev und prod im selben Konto liegen und nur der erste Trail
  kostenlos ist.
- `terraform fmt`/`validate` im tester.

## Phase 6: Doku

- `docs/finanzen.md`: neue Abschnitte „Festschreibung“, „Datenexport“, „CloudTrail“; „Kette prüfen“ um den
  Archivabgleich ergänzen (Satz „kommt mit Scheibe 5“ ersetzen); Rechte-Tabelle (`finanzen:verwalten`
  Festschreibung, `finanzen:pruefen` Datenexport); Seiten- und API-Tabelle; Datenbankrolle (neue Protokolltabellen);
  Überblick/Stand. Abschnitt **„Verfahrensdokumentation“** fertigstellen: Gliederung nach GoBD (allgemeine
  Beschreibung, Anwenderdokumentation, technische Systemdokumentation, Betriebsdokumentation, internes
  Kontrollsystem) mit Verweisen auf die Abschnitte, dazu Zuständigkeiten (Posten), Aufbewahrung (10 Jahre, Object
  Lock), Änderungsprozess (PR, CI, Freigabe prod-Deploy), Datensicherung (DSQL-Backups, Archiv).
- `docs/plans/finanzen.md`: Stand-Zeile 5 auf „umgesetzt (PR #…)“, Scheibe-5-Abschnitt mit Verweis auf diese Datei.
- `docs/refactoring.md` nur, falls Punkte erledigt werden.

## Verifikation

- tester: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `terraform fmt -check` + `validate` (ohne Backend).
- Lokaler Browser-Check nur mit `packages/api/.env.local`: Festschreibung am Desktop (1440×900, einmal nur Tastatur),
  dann 375×812; Kette prüfen; Datenexport; freie Buchung mit Datum im festgeschriebenen Monat → Fehlermeldung.
- **Kein Deploy auf dev** in dieser Umsetzung. Der Nutzer stößt den Deploy später selbst an; dann auf dev:
  Bootstrap-Apply prüfen, Monat festschreiben, „Kette prüfen“ nach absichtlicher Manipulation (Rahmenplan, Verifikation).
