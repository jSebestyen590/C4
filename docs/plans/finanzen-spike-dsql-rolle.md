# Spike: Eigene DSQL-Rolle für die Finanz-Journaltabellen

## Entscheidung (11.11.2026)

**Keine eigene DB-Rolle für das Journal.** Gründe:

- Ziel der GoBD ist Erkennbarkeit, nicht Unmöglichkeit; die Hash-Kette macht Änderungen sichtbar.
- Die Rolle schützt nicht gegen `admin` (CI/Migrationen) und damit nicht gegen den eigentlichen
  Angreifer oder Fehler im Betrieb.
- Dauerhafter Aufwand: jede neue Tabelle braucht ein `GRANT`, zwei Verbindungsarten, ARN je Umgebung.

Stattdessen: API nur mit INSERT (keine Update-/Delete-Routen), abgesichert durch den Test
`packages/api/src/finanzenNurInsert.test.ts`; Hash-Kette; der tägliche Export des Kopf-Hashs in
S3 Object Lock wird vor den Stichtag 01.01.2027 gezogen (Scheibe 4 statt 5).

Die Analyse unten bleibt als Referenz, falls die Entscheidung neu bewertet wird.

## Frage

Kann die API (Lambda, pg + drizzle, Aurora DSQL) als eigene DB-Rolle laufen, die auf `fin_buchungen`,
`fin_buchungszeilen`, `fin_stueckelung` nur `SELECT`/`INSERT` hat, auf allen anderen Tabellen
volle Rechte (`fin_zaehler`: + `UPDATE`, `fin_konten`: `SELECT`/`INSERT`/`UPDATE`)? Mit
`CREATE ROLE ... WITH LOGIN`, `AWS IAM GRANT` und `dsql:DbConnect` statt `dsql:DbConnectAdmin`.

## Vorgehen

Der Praxistest auf dev wurde nicht durchgeführt (SSO für Profil `C4` abgelaufen); es wurde nichts
verändert. Die Analyse stützt sich auf die AWS-Doku.

## Ergebnis (nur Doku, nicht praktisch bestätigt)

Dokumentiert und vorgesehen:

- `CREATE ROLE x WITH LOGIN;` als `admin`, dann `AWS IAM GRANT x TO 'arn:aws:iam::<acct>:role/<name>';`
  (Zuordnung sichtbar in `sys.iam_pg_role_mappings`; Rückbau mit `AWS IAM REVOKE x FROM '<arn>'`).
- IAM-Aktion `dsql:DbConnect` auf den Cluster-ARN; Token mit `getDbConnectAuthToken()`, Datenbank-User
  = Rollenname.
- `GRANT USAGE ON SCHEMA ...` und `GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA ... TO x`
  stehen im Doku-Beispiel, `GRANT ... ON ALL TABLES` ist also unterstützt (für ein
  nutzer-angelegtes Schema; für `public` ungeprüft).
- Rechteänderungen wirken ab der nächsten Transaktion.

Unklar / zu testen (genau das sollte der Praxistest klären):

- SQLSTATE bei `UPDATE`/`DELETE` ohne Recht (PostgreSQL: `42501 insufficient_privilege`).
- Ob `ALTER DEFAULT PRIVILEGES` in DSQL unterstützt ist (in der Doku nicht erwähnt; im Zweifel
  nein, dann braucht jede neue Tabelle ein explizites `GRANT`).
- Ob `SELECT ... FOR UPDATE`/`UPDATE ... RETURNING` zusätzliche Rechte brauchen (PG: `FOR UPDATE`
  braucht `UPDATE`-Recht, auf Journaltabellen also nicht nutzbar; `RETURNING` braucht `SELECT`).
- Ob die Rolle in `public` Tabellen nutzen darf. DSQL-Doku empfiehlt: Admin verwaltet `public`,
  Nicht-Admins arbeiten in eigenen Schemas. Tabellen in `public` sind per `GRANT` aber nutzbar.
- Ob drizzle (Katalogabfragen, `schema_migrations`) mit der Rolle zurechtkommt. Die API migriert
  nicht selbst (Migration läuft in CI als admin), Laufzeit-Queries sind normale DML.

## Was eine Umstellung bräuchte

1. Migrationen (je Statement eine Datei):
   - `CREATE ROLE c4_api WITH LOGIN`
   - `AWS IAM GRANT c4_api TO '<ARN der Lambda-Rolle>'`
   - `GRANT USAGE ON SCHEMA public TO c4_api`
   - `GRANT SELECT, INSERT, UPDATE, DELETE ON <tabelle> TO c4_api` je bestehender Tabelle (rund 140
     Migrationen; Liste aus `schema.ts`) oder `ON ALL TABLES IN SCHEMA public`, danach
     `REVOKE UPDATE, DELETE` auf den drei Journaltabellen
   - `GRANT SELECT, INSERT` auf Journaltabellen, `SELECT, INSERT, UPDATE` auf `fin_konten`/`fin_zaehler`
2. **ARN je Umgebung:** Migrationen sind reines SQL, der ARN (`arn:aws:iam::<acct>:role/c4-dev-api` bzw.
   `c4-prod-api`) ist aber umgebungsabhängig. Optionen: (a) Platzhalter `${API_ROLE_ARN}` in
   `migrate.ts` ersetzen (Wert aus Terraform-Output/Workflow-Env), (b) `AWS IAM GRANT` nicht als
   Migration, sondern als idempotenter Schritt im Deploy (`migrate-cli`), (c) ARN-Muster
   aus `sts get-caller-identity` ableiten. Empfehlung (a)/(b), nicht hartkodieren.
3. Terraform (`infra/modules/app/main.tf`): `dsql:DbConnectAdmin` -> `dsql:DbConnect` für die
   API-Rolle. Die CI/Migrationsrolle behält `DbConnectAdmin`.
4. `client.ts`: `user: 'c4_api'`, `signer.getDbConnectAuthToken()`. Migrations-CLI bleibt auf admin.
5. Default Privileges: falls `ALTER DEFAULT PRIVILEGES` fehlt, jede neue Tabelle per Migration
   `GRANT` geben; das als Migrationsregel und Test absichern (Test: jede Tabelle in `schema.ts`
   hat ein Grant), sonst läuft die API bei neuen Tabellen in `42501`.
6. Rollback: `client.ts` und Terraform zurück auf admin/`DbConnectAdmin` (sofort wirksam, Rolle
   kann bleiben); optional `AWS IAM REVOKE`, `DROP ROLE` nach `REVOKE` aller Rechte.

## Risiken

- Der Schutz gilt nur gegen Fehler oder Kompromittierung der API. `admin` (CI/Migrationen) kann
  weiterhin alles, die Journaltabellen sind also nicht manipulationssicher (dafür: Hashkette,
  S3-Object-Lock-Anker laut Finanzen-Plan).
- Pflege-Aufwand: jede künftige Tabelle braucht ein `GRANT`, sonst Laufzeitfehler erst nach Deploy.
- Zwei Verbindungsarten (admin für Migration, `c4_api` für Laufzeit) und ARN je Umgebung.
- Lokale Entwicklung (Postgres in Docker) kennt `AWS IAM GRANT` nicht; Migrationen müssen dort
  übersprungen oder anders abgebildet werden.
- Praxistest steht noch aus; Annahmen oben (SQLSTATE, Default Privileges) sind ungeprüft.
