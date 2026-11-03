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
- 0092–0096 (Trichter): 0092–0094 löschen ihre Tabellen, 0095–0096 ihre Indizes. Rollback-Ziel nur für den Trichter:
  `0091_umfragen_erstellt_idx`.
- 0098–0100 (Status-Verlauf): 0098 löscht die Tabelle, 0099 den Index, 0100 löscht nur die Startbuchungen ohne Datum
  wieder. Rollback-Ziel nur für den Status-Verlauf: `0097_mitglieder_deaktiviert_am`.
- 0101–0103 (Inventar-Teile) fügen `gegenstaende.teil_von`, `virtuell` und `anzahl_je` per `ALTER` hinzu; ihre Down-Dateien
  leeren nur die Werte. Rollback-Ziel nur für die Teile: `0100_mitglied_status_verlauf_bestand`.
- 0104–0108 (Bilder): 0104 löscht die Tabelle `onedrive_verbindung`, 0108 die Tabelle `bilder_freigaben`; 0105–0107 fügen `events.bilder_ordner_id`,
  `events.bilder_ordner_url` und `event_vorlagen.bilder_ordner` per `ALTER` hinzu, ihre Down-Dateien leeren nur die Werte.
  Rollback-Ziel nur für die Bilder: `0103_gegenstaende_anzahl_je`.
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
