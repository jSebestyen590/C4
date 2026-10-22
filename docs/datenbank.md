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
  (ein Test in `rollback.test.ts` prüft das); 0010–0024 (Waren) und 0025–0031 (Inventar) löschen ihre
  Tabellen bzw. Indizes, 0024 entzieht den Vorstandsposten `waren:verwalten` wieder, 0031 entzieht ihnen
  `inventar:verwalten`. Rollback-Ziel nur für das Inventar: `0024_vorstandsposten_waren`. 0032 (`lagerorte.art`) kann die Spalte nicht entfernen, weil
  Aurora DSQL `ALTER TABLE … DROP COLUMN` nicht unterstützt; die Down-Datei setzt `art` auf `NULL` zurück (die Spalte bleibt, erneutes Migrieren ist
  wegen `ADD COLUMN IF NOT EXISTS` unproblematisch).
  0033 (`ifco_typen`) löscht die Tabelle. 0034 (`ifcos.typ_id`), 0035 (`lagerorte.ifco_hoehe_cm`) und 0036 (`lagerorte.ifco_stellflaechen`)
  können ihre Spalte aus demselben Grund nicht entfernen; die Down-Dateien setzen die Werte auf `NULL`. `ifcos.typ_id` ist nur Text ohne
  Fremdschlüssel (eine Spalte mit `REFERENCES` per `ALTER` ist in DSQL nicht sicher), der Bezug zu `ifco_typen` wird in der API geprüft.
  0037 (`ausleihe_positionen.ganze_ifco`) und 0038 (`ausleihen.organisiert_von`) legen ebenfalls nur Spalten an; die Down-Dateien setzen die Werte auf
  `NULL`. `organisiert_von` ist die Cognito-`sub` ohne Fremdschlüssel, die API prüft, dass sie zu einem Mitglied gehört.

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
