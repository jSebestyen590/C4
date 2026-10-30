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
  Down-Datei je Migration, keine Lücken. Die Down-Dateien der alten Namen (z. B. `0037_dienstformen.down.sql`) bleiben
  vorerst in `down/`, damit ein Rollback auf einer Umgebung mit den alten Namen (`0036_gegenstand_bewegungen_bestand`)
  noch funktioniert; sie werden nach dem Dev-Rollback gelöscht.
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
