# Datenbank

Migrationen sind SQL-Dateien in `packages/api/src/db/migrations/`. `pnpm db:migrate` wendet sie in
Namensreihenfolge an und merkt sie in `schema_migrations`. Aurora DSQL erlaubt nur ein DDL-Statement
pro Transaktion, deshalb enthält jede Datei genau ein Statement.

## Rollback mit Down-Dateien

Down-Dateien liegen getrennt in `packages/api/src/db/migrations/down/`:

- Ein Statement: `<migration>.down.sql`, z. B. `0010_foo.down.sql` für `0010_foo.sql`.
- Mehrere Statements: `<migration>.down.1.sql`, `<migration>.down.2.sql`, ... Sie laufen in
  numerischer Reihenfolge, jedes als eigene Abfrage.
- Für die Migrationen 0001 bis 0009 gibt es keine Down-Dateien. Ab 0010 braucht jede Migration eine
  (ein Test in `rollback.test.ts` prüft das). 0010–0023 (Waren) und 0025–0035 (Inventar) löschen ihre Tabellen bzw.
  Indizes; 0036 löscht nur die Startbuchungen „Bestand übernommen“ wieder; 0024 entzieht den Vorstandsposten `waren:verwalten` und `inventar:verwalten` wieder. Rollback-Ziel nur für das
  Inventar: `0024_vorstandsposten_rechte`.
- Die Kalender-Migrationen `0037`–`0070` (Namen `*_kalender_*`, `*_push_*`) sind eine zusammengelegte, lückenlose Fassung
  der früheren Migrationen 0037–0082. `migrations.test.ts` prüft für 0037 und höher: genau ein Statement je Datei, eine
  Down-Datei je Migration, keine Lücken.
- 0073–0075 (Schlüssel) löschen ihre Tabellen bzw. ihren Index, 0076 entzieht den Vorstandsposten
  `schluessel:verwalten` wieder; Rollback-Ziel nur für die Schlüssel: `0072_mitglieder_geburtstag_im_kalender`.
- 0077–0091 (Umfragen, zusammengelegt vor dem Merge): 0077–0082 und 0087–0088 löschen ihre Tabellen, 0083–0085 und 0091
  ihre Indizes, 0086 entzieht den Vorstandsposten `umfragen:verwalten` wieder. 0089–0090 fügen `event_kategorien.dauer`
  und `event_vorlagen.tage` per `ALTER` hinzu; ihre Down-Dateien leeren nur die Werte. Rollback-Ziel nur für die Umfragen:
  `0076_schluessel_vorstandsposten_rechte`.
- 0130–0136 (Schlüssel-Anfragen): 0130 entfernt `mitglieder.wohnheim` wieder, 0131–0133 löschen ihre Tabellen
  (`schluessel_anfragen`, `schluessel_antworten`, `schluessel_planungen`), 0134–0136 ihre Indizes. Rollback-Ziel nur für die
  Anfragen: `0129_privatparty_nachrichten_message_idx`.
- 0137–0140 (Benachrichtigungsverlauf): 0137 löscht die Tabelle `benachrichtigung_verlauf` (mit allen Einträgen), 0138–0140
  ihre Indizes. Rollback-Ziel nur für den Verlauf: `0136_schluessel_planungen_schluessel_idx`.
- 0141–0156 (Finanzen): 0141 löscht den Posten `kassenpruefung` wieder, 0142 entzieht den Posten die vergebenen
  `finanzen:*`-Rechte, 0143–0147 löschen ihre Tabellen (`fin_konten`, `fin_buchungen`, `fin_buchungszeilen`,
  `fin_stueckelung`, `fin_zaehler`), 0148 die Zählerzeile `journal`, 0149 die Grundkonten (`safe`, `bank`, `geldtransit`,
  `eroeffnung`), 0150–0154 ihre Indizes, 0155 ergänzt `fin_buchungen.idempotenz_schluessel` per ALTER (Down leert die Werte), 0156 löscht ihren Index `fin_buchungen_idempotenz_idx`. Rollback-Ziel nur für Finanzen: `0140_benachrichtigung_verlauf_erstellt_idx`.
  `mitWiederholung` (Wiederholung bei DSQL-Konflikten) liegt dafür in `packages/api/src/db/wiederholung.ts` und wird von
  Migration, Rollback und Finanzen-Buchungen genutzt.
- 0092–0096 (Trichter): 0092–0094 löschen ihre Tabellen, 0095–0096 ihre Indizes. Rollback-Ziel nur für den Trichter:
  `0091_umfragen_erstellt_idx`.
- 0098–0100 (Status-Verlauf): 0098 löscht die Tabelle, 0099 den Index, 0100 löscht nur die Startbuchungen ohne Datum
  wieder. Rollback-Ziel nur für den Status-Verlauf: `0097_mitglieder_deaktiviert_am`.
- 0101–0103 (Inventar-Teile) fügen `gegenstaende.teil_von`, `virtuell` und `anzahl_je` per `ALTER` hinzu; ihre Down-Dateien
  leeren nur die Werte. Rollback-Ziel nur für die Teile: `0100_mitglied_status_verlauf_bestand`.
- 0104–0109 (Bilder): 0104 löscht die Tabelle `onedrive_verbindung`, 0108 die Tabelle `bilder_freigaben`, 0109 die Tabelle `bilder_ordner_cache`; 0105–0107 fügen `events.bilder_ordner_id`,
  `events.bilder_ordner_url` und `event_vorlagen.bilder_ordner` per `ALTER` hinzu, ihre Down-Dateien leeren nur die Werte.
  Rollback-Ziel nur für die Bilder: `0103_gegenstaende_anzahl_je`.
- 0110–0113 (Protokolle): 0110 löscht die Tabelle `protokolle`, 0111 den Index `protokolle_event_idx`; 0112 und 0113 fügen
  `event_kategorien.protokoll` und `protokoll_art` per `ALTER` hinzu, die Down-Dateien leeren nur die Werte. Rollback-Ziel nur für die Protokolle:
  `0109_bilder_ordner_cache`.
- 0118–0119 (vCard-Links): 0118 löscht die Tabelle `vcard_tokens`, 0119 ihren Index. Rollback-Ziel nur für die vCards:
  `0117_todos_protokoll_idx`.
- 0120–0129 (Privatpartys): 0120–0124 löschen die Tabellen `privatparty_personen`, `privatpartys`, `privatparty_termine`,
  `privatparty_nachrichten` und `mail_abruf`, 0125–0129 ihre Indizes. Rollback-Ziel nur für die Privatpartys:
  `0119_vcard_tokens_hash_idx`.
- Vor dem ersten Release wurden die Migrationen ab 0010 zusammengelegt: Spalten, die später per `ALTER TABLE … ADD COLUMN`
  dazukamen, stehen jetzt in der `CREATE TABLE` (Aurora DSQL kann `DROP COLUMN` nicht, Down-Dateien solcher Spalten
  könnten nur Werte leeren). Neue Spalten nach einem Release brauchen wieder ein eigenes `ALTER`, dessen Down-Datei die
  Werte auf `NULL` setzt; eine Spalte mit `REFERENCES` per `ALTER` ist in DSQL nicht sicher (deshalb ist z. B.
  `ifcos.typ_id` nur Text, der Bezug zu `ifco_typen` wird in der API geprüft).

Aufruf (braucht `CONFIRM_DB_ROLLBACK=yes`):

```
CONFIRM_DB_ROLLBACK=yes pnpm db:rollback --to 0009_foo   # alles nach 0009_foo zurücknehmen
CONFIRM_DB_ROLLBACK=yes pnpm db:rollback --last 2        # die letzten zwei Migrationen
```

Zurückgenommen wird in umgekehrter Reihenfolge; danach wird die Zeile aus `schema_migrations`
gelöscht. Fehlt für eine dieser Migrationen die Down-Datei, bricht das Skript vor jeder Änderung mit
einer Liste der fehlenden Dateien ab. Ein unbekanntes Ziel ist ein Fehler, nichts zurückzunehmen ist
kein Fehler. Daten der zurückgenommenen Tabellen gehen verloren.

## Deploy-Workflow (nur dev)

Die Eingabe `rollback_to` (z. B. `0009_foo`) nimmt vor dem Migrieren alle Migrationen nach dieser
zurück. Sie funktioniert nur für `dev`; `reset_db` hat Vorrang.

Szenario: Das Skript einer Migration auf dem Feature-Branch wurde nach dem Deploy erneut geändert.
Dann zuerst auf die letzte unveränderte Migration zurückgehen (`rollback_to`, der Branch braucht die
Down-Datei), das Skript anpassen und erneut deployen; die Migration läuft dann mit dem neuen Stand.

## Reset (nur dev)

`pnpm db:reset` löscht alle Tabellen (braucht `CONFIRM_DB_RESET=yes`). Der Deploy-Workflow hat dafür
die Eingabe `reset_db`. Alle Daten gehen verloren.

## Gleichzeitige Zugriffe

Aurora DSQL arbeitet mit optimistischer Nebenläufigkeit: Ändern zwei Transaktionen gleichzeitig dieselben
Zeilen, schlägt eine mit SQLSTATE `40001` (Codes `OC000`/`OC001`) fehl.

- `createDb` (`packages/api/src/db/client.ts`) wiederholt jede Transaktion auf oberster Ebene bei einem
  solchen Konflikt: insgesamt 3 Versuche, Wartezeit ab 100 ms mit Jitter (`transaktionenWiederholen` in
  `db/wiederholung.ts`). Verschachtelte `tx.transaction`-Aufrufe (Savepoints) bleiben unberührt.
- Einzelne Statements außerhalb einer Transaktion werden nicht wiederholt.
- Die Buchung in `finanzen.ts` hat eine eigene, großzügigere Wiederholung (8 Versuche, ab 50 ms, wegen der
  Zählerzeile des Journals). Innerhalb von `mitWiederholung` wird nicht ein zweites Mal wiederholt.
- Die API antwortet bei einem Konflikt, der nach allen Versuchen bleibt, mit 409 „Jemand anderes hat gerade
  dasselbe geändert. Bitte versuch es noch einmal.“ und bei einer Unique- oder Fremdschlüssel-Verletzung
  (`23505`, `23503`) mit 409 „Das passt nicht mehr zum aktuellen Stand. Bitte lade die Seite neu und
  versuch es noch einmal.“ Beides wird weiterhin geloggt. Alles andere bleibt 500.
- **Regel für neuen Code:** In einem Transaktions-Callback nur Datenbankarbeit. Er kann mehrfach laufen;
  S3, Cognito, OneDrive, Mail, Push, `fetch` und das Ändern von Variablen außerhalb des Callbacks gehören
  davor oder danach.
