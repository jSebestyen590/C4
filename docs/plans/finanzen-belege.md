# Finanzen Scheibe 4a: Belege – Umsetzungsplan

Rahmen: [finanzen.md](./finanzen.md) (Architektur, Bedienung, Scheibe 4). Diese Datei ist der
vollständige Plan für die Umsetzungs-Session; sie enthält alle mit dem Nutzer geklärten Entscheidungen
(18.11.2026). Nach dem Merge den Stand in `docs/plans/finanzen.md` nachtragen und diese Datei als
erledigt markieren.

Scheibe 4 ist geteilt: **4a** (dieser Plan, muss zum 01.01.2027 laufen) und **4b** (später, eigener
Plan): Einreichen durch Mitglieder am Handy mit Push, Posten mit Lager-Ware + Gebinde + Pfand,
Zuordnung Warengruppe → Kategorie, „Einlagern" je Beleg.

## Entscheidungen (geklärt)

| Thema               | Entscheidung                                                                                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schnitt             | 4a: Rechnungssteller, Kategorie-Posten, Zahlweg bar/Bank/Auslage, Datei-Archiv mit Object Lock, Datei-Hash in der Kette, täglicher Anker-Export, offene Auslagen + Sammelerstattung. Rest → 4b. |
| Rabatt              | **Entfällt.** Preise werden so getippt, wie sie auf dem Beleg stehen.                                                                                                                         |
| Belegnummer         | `B-JJJJ-NNNN`, lückenlos je Jahr, vergeben beim Buchen (Jahr = Zeitpunkt des Buchens, nicht Belegdatum). Entwürfe haben keine Nummer. Zähler in `fin_zaehler`, Name `beleg:JJJJ`.             |
| Vorsteuer           | **Merkmal an der Zeile**: Aufwandszeile brutto mit `steuer_art = 'vorsteuer'`, `netto_cent`/`steuer_cent`/`steuersatz` an der Zeile (bestehende Validierung in `shared/src/finanzen.ts` ~301). Kein Vorsteuer-Konto. |
| Richtung            | Ein Beleg ist eine **Ausgabe**. Gutschriften (z. B. Pfandrückgabe auf dem Metro-Bon) sind negative Posten. Einnahmen ohne Rechnung laufen wie bisher über Kasse oder freie Buchung.            |
| Zahlweg Bank        | Bucht vor Scheibe 6 direkt gegen das Konto `bank` zum Bezahldatum. Scheibe 6 ordnet den Bankumsatz später dem Beleg zu, ohne neue Buchung.                                                     |
| Zahlweg bar         | Abgang aus einem Safe-Fach mit Stückelung (Wechselgeld = Zugänge in derselben Stückelung, Summe = Betrag).                                                                                     |
| Zahlweg Auslage     | Bucht gegen neues Durchlaufkonto `auslagen` („Auslagen Mitglieder"); Mitglied am Beleg. Offen bis zur Sammelerstattung.                                                                        |
| Buchungsdatum       | bar/Bank: Bezahldatum. Auslage: Belegdatum (Aufwand), die Erstattung bucht zu ihrem eigenen Datum; Bezahldatum des Belegs = Datum der Erstattung (abgeleitet, nicht gespeichert).               |
| Datei               | Pflicht, außer **Eigenbeleg** (dann Begründung Pflicht). Original wird unverändert archiviert (keine Kompression). PDF, JPEG, PNG, HEIC; max. 20 MB.                                            |
| Archiv              | Neuer Bucket `c4-<env>-finanzarchiv-<acct>` mit Object Lock; Upload direkt dorthin unter `belege/<sha256>.<ext>` (gleiche Datei = gleicher Schlüssel = Dublettenhinweis). Verworfene Entwürfe hinterlassen die Datei; das ist gewollt. |
| Datei-Hash          | Browser berechnet SHA-256 (WebCrypto); Presigned PUT mit `ChecksumSHA256`, S3 prüft ihn. Der Hash geht in den Buchungs-Hash.                                                                  |
| Netto-Belege        | Posten netto; Korrektur je Steuersatz (Netto und Steuer) bis ±10 ct, damit die Summen dem Beleg entsprechen.                                                                                   |
| Steuer-Rundung      | Steuer je Steuersatz auf die Summe der Gruppe gerechnet (wie Kassenbons), nicht je Posten.                                                                                                     |
| Rechte              | Lesen `finanzen:lesen`; Entwürfe, Buchen, Erstattung, Rechnungssteller anlegen/ändern `finanzen:buchen`. `belege:einreichen` existiert schon, wird erst in 4b genutzt.                          |
| Korrektur           | Gebuchter Beleg ist unveränderlich. Storno über die Buchung (Journal, bestehend); „Als Entwurf kopieren" legt einen neuen Entwurf mit denselben Daten und derselben Datei an.                    |
| Rechnungssteller    | Stammdaten: Name, archiviert. Vorbelegung im Formular: zuletzt verwendeter. Kein Rabatt, keine Standard-Kategorie.                                                                             |
| Steuersatz-Vorschlag| Aus `fin_konten.steuersatz_standard` der gewählten Kategorie (`waren.steuersatz_standard` gibt es nicht).                                                                                      |

## Fachlicher Ablauf

1. Finanzer:in öffnet „Belege" → „Neuer Beleg": Datei ziehen/wählen (Handy: Kamera über
   `<input accept="image/*,application/pdf" capture>`), Datei wird sofort hochgeladen, Entwurf
   gespeichert.
2. Desktop: Datei links (PDF per `<iframe>`/`<object>`, Bild mit Zoom), Maske rechts: Rechnungssteller
   (suchbar, neu anlegbar inline), Belegdatum, Brutto/Netto, Posten-Tabelle (Kategorie suchbar,
   Freitext, Anzahl, Einzelpreis, Steuersatz; Enter = nächste Zeile), Summen je Steuersatz live,
   ggf. Korrekturfelder (Netto), Zahlweg + Bezahldatum (+ Fach/Stückelung bzw. Mitglied).
3. Entwurf wird automatisch gespeichert (debounced) und warnt beim Verlassen mit ungespeicherten
   Änderungen.
4. „Buchen": Zusammenfassung (Nummer wird vergeben, Zeilen, Zahlweg, Summe), Plausibilitätswarnungen
   bestätigen (Datum in der Zukunft, gleiche Datei schon gebucht, gleicher Rechnungssteller + Datum +
   Summe schon gebucht, hoher Betrag > 500 €, `saldoWarnungen`), dann Buchung.
5. Auslagen: Seite „Offene Auslagen" je Mitglied (Summe, Belege). Mehrere Belege eines Mitglieds
   auswählen → Sammelerstattung bar (Safe-Fach + Stückelung) oder Bank → eine Buchung
   `auslagen` an Safe-Fach/Bank.

## Datenmodell (Migrationen ab `0197`, je ein Statement + `down/`, Indizes `ASYNC` in eigener Datei)

- `fin_rechnungssteller` (änderbar): `id`, `name` (unique, case-insensitiv prüfen in der API), `archiviert`.
- `fin_beleg_entwuerfe` (änderbar, löschbar): `id`, `daten jsonb` (Formularzustand, Typ in shared),
  `datei_sha256`, `datei_schluessel`, `datei_typ`, `datei_name`, `erstellt_von`, `erstellt_am`,
  `geaendert_am`.
- `fin_belege` (**insert-only**): `id`, `nummer` (unique), `rechnungssteller_id`, `belegdatum`,
  `modus` (`brutto` | `netto`), `zahlweg` (`bar` | `bank` | `auslage`), `bezahldatum` (null bei
  Auslage), `mitglied_id` (nur Auslage), `eigenbeleg_begruendung`, `datei_sha256`,
  `datei_schluessel`, `datei_typ`, `datei_name`, `summe_cent`, `buchung_id`, `idempotenz_schluessel`
  (unique), `erstellt_von`, `erstellt_am`.
- `fin_belegposten` (**insert-only**): `beleg_id`, `pos`, `kategorie_id` (nur Konten der Art
  `aufwand`), `text`, `anzahl_milli integer` (Tausendstel, für 1,5 kg), `einzelpreis_cent`,
  `steuersatz` (Basispunkte), `betrag_cent`.
- `fin_beleg_korrekturen` (**insert-only**, nur Netto): `beleg_id`, `steuersatz`, `netto_cent`, `steuer_cent`.
- `fin_erstattungen` (**insert-only**): `id`, `mitglied_id`, `datum`, `zahlweg` (`bar` | `bank`),
  `summe_cent`, `buchung_id`, `idempotenz_schluessel`, `erstellt_von`, `erstellt_am`.
- `fin_erstattung_belege` (**insert-only**): `erstattung_id`, `beleg_id` (nicht unique, siehe unten).
- `fin_exporte` (**insert-only**): `id`, `datum`, `von_seq`, `bis_seq`, `kopf_hash`, `schluessel`,
  `erstellt_am`.
- Seed (Muster `0149_fin_grundkonten.sql`, `ON CONFLICT (id) DO NOTHING`): Konto `auslagen`,
  „Auslagen Mitglieder", Art `durchlauf`.
- Neue `quelle_typ`: `beleg`, `erstattung` (`QUELLE_TYPEN` + `QUELLE_TYP_LABELS`, nicht in
  `MANUELLE_QUELLE_TYPEN`).
- Alle insert-only Tabellen in `finanzenNurInsert.test.ts` in `TABELLEN` und `SQL_TABELLEN` eintragen;
  Entwürfe und Rechnungssteller nicht.
- Storniert-Status eines Belegs/einer Erstattung wird aus `fin_buchungen.storno_von` abgeleitet.
  Eine stornierte Erstattung macht ihre Belege wieder offen (Abfrage berücksichtigt das; die
  Unique-Bedingung auf `beleg_id` deshalb nicht in `fin_erstattung_belege`, sondern Prüfung in der
  API unter Sperre `sperren`-Muster, Schlüssel `erstattung:<mitglied_id>`).

## Reine Logik (`packages/shared/src/belege.ts`, mit Unit-Tests)

- Typen `BelegEntwurfDaten`, `BelegPosten`, `Zahlweg`, `BelegModus`; Steuersätze-Konstante
  `STEUERSAETZE = [1900, 700, 0]`.
- `belegBerechnen(daten)` → `{ postenBetraege, jeSteuersatz: {satz, netto, steuer, brutto}[], summe,
  fehler[] }`: Brutto: Steuer je Gruppe = brutto − round(brutto / (1+satz)); Netto: Steuer =
  round(netto × satz) + Korrekturen; Korrektur > 10 ct → Fehler.
- `belegBuchungszeilen(beleg, gegenkonto)` → Journalzeilen: je (Kategorie, Steuersatz) eine
  Aufwandszeile brutto mit `vorsteuer`-Merkmalen (Steuer der Gruppe anteilig auf die Kategorien,
  Rest-Cent auf die größte), Gegenzeile auf Fach/Bank/`auslagen`. Summe 0.
- `belegNummer(jahr, n)` → `B-2027-0001`.
- `belegPruefen(daten)` → Feldfehler (Rechnungssteller, Datum, ≥1 Posten, Datei oder Begründung,
  Zahlweg-Pflichtfelder, Stückelung = Betrag).
- `offeneAuslagen(belege, erstattungen, stornierte)` → je Mitglied.
- Hash: `HashBuchung` bekommt `belege: { sha256: string }[]` (sortiert); `kanonisch()` gibt es
  schon aus (`belege: []`). **Test: Buchung ohne Beleg hat denselben Hash wie vorher** (bestehende
  Kette bleibt gültig). `verifiziereKette` lädt die Datei-Hashes der Beleg-Buchungen mit.

## API (`packages/api/src/finanzenBelege.ts` + Routen in `routes/finanzen.ts`)

- Store-Erweiterung in `FinanzenStore` + `finanzen.fake.ts`, Buchen nach Muster
  `kasseAbrechnen` (`finanzen.ts` ~1076–1181): Idempotenz-Lookup in der Transaktion, Zähler
  `beleg:JJJJ` hochzählen, `fin_belege` + Posten + Korrekturen + Buchung in **einer** Transaktion,
  Entwurf im selben Schritt löschen, Retry über bestehende Logik.
- Routen:
  - `GET/POST/PATCH /finanzen/rechnungssteller`
  - `GET /finanzen/belege` (Filter: Status entwurf/gebucht/storniert, Rechnungssteller, Zeitraum,
    Zahlweg, Mitglied), `GET /finanzen/belege/:id` (gebucht, mit Posten, Datei-URL, Buchung,
    Erstattung)
  - `POST /finanzen/beleg-entwuerfe`, `GET/PUT/DELETE /finanzen/beleg-entwuerfe/:id`,
    `POST /finanzen/beleg-entwuerfe/:id/buchen` (Body: Idempotenz-Schlüssel, bestätigte Warnungen),
    `POST /finanzen/belege/:id/kopieren` (→ neuer Entwurf)
  - `POST /finanzen/beleg-dateien/upload` (Body: sha256 hex, Größe, Typ, Name → Presigned PUT mit
    `ChecksumSHA256`, Schlüssel `belege/<sha256>.<ext>`; Antwort enthält `schonGebucht` als
    Dublettenhinweis)
  - `GET /finanzen/auslagen` (offen je Mitglied), `POST /finanzen/erstattungen`
- Datei-Modul `packages/api/src/finanzarchiv.ts` nach Muster `protokollbilder.ts`: `uploadVorbereiten`,
  `anzeigeUrl` (Presigned GET 3600 s), `exportSchreiben(schluessel, inhalt)`. Konfig
  `FINANZARCHIV_BUCKET` in `config.ts`, verdrahtet in `bootstrap.ts`. **Prüfen:** Presigned PUT mit
  `ChecksumSHA256` (SDK v3: Checksum als signierter Header, ggf. `unhoistableHeaders`); der Browser
  sendet `x-amz-checksum-sha256` (Base64) und `Content-Type`.
- Täglicher Export: neuer Zweig `event.c4 === 'finanz-export'` in `lambda.ts`, Job aus
  `createProduction()`. Schreibt `export/<JJJJ-MM-TT>.jsonl` (alle Buchungen mit Zeilen,
  Stückelung, Beleg-Hashes seit `bis_seq` des letzten Exports, kanonisch serialisiert) und
  `anker/<JJJJ-MM-TT>.json` (`{bis_seq, kopf_hash, erstellt_am}`), dann Zeile in `fin_exporte`.
  Keine neuen Buchungen → nur Anker. Test in `lambda.test.ts` + Job-Test mit Fakes.

## Infra (`infra/modules/app/main.tf`)

- Bucket `finanzarchiv` mit `object_lock_enabled = true`, Versioning, Public-Access-Block, CORS (PUT
  vom App-Origin, Header `content-type`, `x-amz-checksum-sha256`), Default-Retention per Variable:
  prod `COMPLIANCE` 10 Jahre, dev `GOVERNANCE` 1 Tag (`variables.tf` + `envs/*/main.tf`). Kein
  Lifecycle-Löschen.
- Lambda-IAM: `s3:PutObject`, `s3:GetObject`, `s3:ListBucket` auf den Bucket, **kein** Delete, kein
  `BypassGovernanceRetention`. Env `FINANZARCHIV_BUCKET`.
- Schedule `finanz_export` täglich 03:00 Europe/Berlin (`cron(0 3 * * ? *)`, Zeitzone), Input
  `{c4="finanz-export"}`, Muster `push_job`.
- Bootstrap braucht keinen Apply (Deploy-Rolle hat `s3:*` auf `c4-<env>-*`, Scheduler gibt es schon).

## Web (desktop first, außer Upload am Handy)

- Routen in `routes/finanzenRouten.tsx`, Hub-Kacheln in `FinanzenPage.tsx`, Keys in `finanzenDaten.ts`:
  - `/finanzen/belege` – Liste (Tabelle ab `sm`, Karten darunter), Filter, „Neuer Beleg",
    Entwürfe oben.
  - `/finanzen/belege/neu`, `/finanzen/belege/entwurf/:id` – Erfassung (`FinanzenBelegPage.tsx`,
    Formlogik rein in `belegFormular.ts` mit Tests). Datei links / Maske rechts ab `lg`, darunter
    gestapelt. Tastaturführung nach `FinanzenBuchenPage.tsx` (`data-nav`), Kategorie und
    Rechnungssteller `Select searchable` (`kontoOptionen`), Beträge getippt mit Komma, Stückelung
    wie Bargeld-Seiten, Mitglied-Auswahl „username (Vorname Nachname)".
  - `/finanzen/belege/:id` – gebuchter Beleg (Datei, Posten, Summen, Link zur Buchung, Erstattung,
    „Als Entwurf kopieren").
  - `/finanzen/auslagen` – offene Auslagen je Mitglied (`StatusName`), Auswahl → Sammelerstattung
    mit Zusammenfassung.
  - Rechnungssteller verwalten: kleine Liste mit Inline-Anlegen/Umbenennen/Archivieren auf
    `/finanzen/rechnungssteller`.
- Upload-Komponente `BelegDatei.tsx`: Datei wählen/ziehen, SHA-256 per `crypto.subtle`, Upload-URL
  holen, PUT, Fortschritt, Vorschau; Dublettenhinweis anzeigen.
- `finanzenHilfe.ts`: Texte zu Brutto/Netto, Korrektur, Eigenbeleg, Auslage, Bezahldatum, Zahlweg,
  Belegnummer.
- Journal-Detail: Link zum Beleg bzw. zur Erstattung bei `quelle_typ` beleg/erstattung.

## Tests

- `shared/src/belege.test.ts`: Brutto/Netto, gemischte Steuersätze, Rundung, Korrektur-Grenze,
  negative Posten, Zeilen gehen auf, Nummernformat, offene Auslagen inkl. stornierter Erstattung.
- `shared/src/finanzen.test.ts`: Hash ohne Belege unverändert; mit Beleg-Hash anders und
  reihenfolgeunabhängig.
- `routes/finanzen.test.ts`: Entwurf CRUD, Buchen (Nummer lückenlos, Jahreswechsel, Idempotenz,
  Rechte, Pflichtfelder), Auslage + Erstattung, doppelte Erstattung abgelehnt, Upload-Route.
- `finanzenNurInsert.test.ts` um neue Tabellen erweitert; Export-Job- und `lambda.test.ts`-Test.

## Doku (im selben PR)

- `docs/finanzen.md`: neuer Abschnitt „Belege" (Ablauf, Zahlwege, Auslagen, Archiv, Export), Seiten-
  und API-Liste, Überblick-Abschnittsliste.
- `docs/datenbank.md`: neue Tabellen.
- `docs/plans/finanzen.md`: Scheibe 4 in 4a/4b aufteilen, Rabatt streichen, `waren.steuersatz_standard`
  korrigieren (gibt es nicht; Vorschlag aus Kategorie), Stand-Tabelle.

## Phasen (je ein frischer `implementer`)

1. Shared-Logik + Hash, Migrationen, Store/Fake, Routen, Archiv-Modul, Export-Job, Infra, Tests.
2. Web (Seiten, Upload, Hilfe-Texte), mit den in Phase 1 entstandenen Typen/Routen im Prompt.
3. Doku.

## Verifikation

- `tester`: `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- Deploy auf dev, `browser-check` je Ablauf nacheinander: „Beleg bar mit Stückelung buchen"
  (Desktop 1440×900, einmal nur Tastatur), „Netto-Beleg mit Korrektur", „Auslage + Sammelerstattung",
  „Beleg am Handy hochladen" (375×812). Danach „Kette prüfen" grün.
- Auf dev per AWS CLI (`AWS_PROFILE=C4`) prüfen: Object Lock am Bucket aktiv, Löschen einer
  Beleg-Datei schlägt fehl, Export-Lambda manuell ausgelöst schreibt `export/` und `anker/`.
