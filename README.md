# C4

React (Vite) SPA under `/app`, single-Lambda TypeScript API (Hono) under `/api`, Cognito auth,
Aurora DSQL database and S3 static hosting behind CloudFront. Infrastructure is Terraform; two
environments (`dev`, `prod`) live in one AWS account (`189575358537`, `eu-central-1`).

```
packages/shared   zod schemas, roles/permissions (used by api + web)
packages/api      Hono app, Lambda handler, local server, DSQL access, SQL migrations
packages/web      Vite + React + React Router + TanStack Query
infra/bootstrap   state bucket + GitHub OIDC roles (state in the bucket under bootstrap/)
infra/modules/app everything one environment needs
infra/envs/{dev,prod}   environment roots (own state each)
infra/local-db    throwaway per-developer DSQL cluster
```

## Local checks (no AWS needed)

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Browser E2E tests (Playwright, against dev or the local stack, not part of CI): `pnpm e2e`; setup in [docs/e2e.md](docs/e2e.md).

## First-time AWS setup

1. Export credentials for account `189575358537`. The AWS CLI and `infra/envs/*` use the default credentials chain (e.g.
   `AWS_PROFILE=C4`); `infra/bootstrap` has the profile `C4` hard-coded in its provider (`aws sso login --profile C4`).
2. **Bootstrap** (once): `cd infra/bootstrap`, comment out the `backend "s3"` block (the bucket doesn't
   exist yet), `terraform init && terraform apply`, restore the block, then `terraform init -migrate-state`.
   From then on the bootstrap state lives in the state bucket under `bootstrap/` (versioned).
3. **Build the Lambda**: `pnpm build`
4. **Dev without custom domain first** (avoids waiting for DNS):
   `cd infra/envs/dev && terraform init && terraform apply -var 'domain_name='`
5. **Custom domain** (`dev.c4-leipzig.de`, prod `www.c4-leipzig.de`), DNS stays at netcup:
   1. `terraform apply -target=module.app.aws_acm_certificate.this` and read `acm_validation_records`.
   2. Create those CNAME records at netcup, then run a full `terraform apply`
      (it waits until ACM validated the certificate).
   3. Add a CNAME `dev` / `www` -> `cloudfront_domain` (output `app`).
   4. For the bare domain `c4-leipzig.de`, configure a redirect to `https://www.c4-leipzig.de` in the
      netcup webspace (CloudFront cannot be an apex CNAME target at netcup).
6. **Publish the web build and migrate** (CI does this on a push to `main` for dev and on a `v*` tag for prod):
   see `.github/workflows/deploy-env.yml`.
7. **Fill the Party-Mail secret** (Privatpartys): Terraform creates `c4-<env>-partymail` empty. In the AWS console open
   Secrets Manager, the secret, "Retrieve secret value" / "Edit", tab "Plaintext", and enter:

   ```json
   {
     "adresse": "party@example.de",
     "absenderName": "C4 Party-Mail",
     "benutzer": "party@example.de",
     "passwort": "...",
     "imapHost": "imap.example.de",
     "imapPort": 993,
     "imapTls": true,
     "smtpHost": "smtp.example.de",
     "smtpPort": 465,
     "smtpSecure": true,
     "ordnerEingang": "INBOX",
     "ordnerGesendet": "Sent"
   }
   ```

   `ordnerEingang` / `ordnerGesendet` must match the mailbox's real folder names (some hosts use `INBOX` and
   `INBOX.Sent`); if a folder is wrong, the Privatpartys page shows the available folders in the error. The first
   successful fetch only records the mailbox position and imports nothing older. Give the right "Privatpartys
   verwalten" to the responsible Posten (admins have it automatically).

8. **Fill the SumUp secret** (card revenue, Finanzen): Terraform creates `c4-<env>-sumup` empty. Enter as plaintext:

   ```json
   {
     "apiKey": "sup_sk_...",
     "merchantCode": "MXXXXXXX",
     "abDatum": "2027-01-01"
   }
   ```

   `merchantCode` is optional (otherwise read from `GET /v0.1/me`). `abDatum` is the first day to import: `2027-01-01`
   on prod; earlier transactions are never fetched. The hourly job `{"c4":"sumup-job"}` then fills the check list on
   `/finanzen/sumup`; to run it once right away:
   `AWS_PROFILE=C4 aws lambda invoke --function-name c4-<env>-api --payload '{"c4":"sumup-job"}' --cli-binary-format raw-in-base64-out /dev/stdout`
   (or "Jetzt abrufen" on the page). See `docs/finanzen.md` ("SumUp").

9. **First admin user** (self sign-up is disabled). The user pool differs per environment: read its id with
   `cd infra/envs/<env> && terraform output app` (field `user_pool_id`, `<env>` = `dev` or `prod`) and use it below.

   ```bash
   aws cognito-idp admin-create-user --user-pool-id <user_pool_id> --username leonard \
     --user-attributes Name=email,Value=leonard@c4-leipzig.de Name=email_verified,Value=true
   aws cognito-idp admin-add-user-to-group --user-pool-id <user_pool_id> --username leonard --group-name admin
   ```

   The CLI username is only an internal id (it must not look like an email). On first login you sign in with
   the email and the temporary password, then pick your login name on the "Choose your username" page; after
   that you can sign in with either. Further users (invited by email only) and group changes: Admin page.

10. **Connect OneDrive** (event photo folders and the PDFs of the Sitzungsprotokolle; optional until needed): register the
    app at Microsoft, then save client id, secret and base folder in the app under Bilder -> Einrichtung and sign in with
    the OneDrive account. The full procedure is in [docs/bilder.md](docs/bilder.md#einrichtung-einmalig); it is done per
    environment in the app, nothing for it lives in Terraform.

### GitHub setup

The deploy roles trust the repository's OIDC `sub` claim, which uses immutable ids
(`repo:jSebestyen590@26395410/C4@1395447517:environment:<env>`). The value is the `github_repo` variable in
`infra/bootstrap`; a different repo (or a repo transfer) needs its own `sub` (print it with a debug step
in the workflow). Re-apply `infra/bootstrap` after changing it.

**Re-apply `infra/bootstrap` once before deploying the notification feature** (Web Push): the deploy roles
need the new `scheduler:*` permission for the EventBridge schedule `c4-<env>-push-job` (every 5 minutes,
see `docs/benachrichtigungen.md`). Without it the Terraform apply of the environment fails.

**Re-apply `infra/bootstrap` once before deploying the Party-Mail** (Privatpartys): the deploy roles need
`secretsmanager:*` on `c4-<env>-*` for the secret `c4-<env>-partymail`. Terraform creates that secret empty and
the schedule `c4-<env>-mail-job` (every 2 minutes). Fill the secret as described in step 7 of the first-time setup;
until then the Party-Mail is off and the app says so.

**Re-apply `infra/bootstrap` once before deploying Finanzen Scheibe 5** (GoBD): the deploy roles need `cloudtrail:*` on
`c4-<env>-*` for the trail `c4-<env>-trail`, and the permissions boundary needs `s3:GetObjectVersion` and
`s3:ListBucketVersions` on `c4-<env>-*` (the API reads all versions of the Finanzarchiv for "Kette prüfen").
Without it the Terraform apply of the environment fails (see `docs/finanzen.md`, "CloudTrail").

See `docs/privatpartys.md`.

### Bootstrap: Rechte der Deploy-Rolle und Backups

`infra/bootstrap` enthält neben State-Bucket und OIDC-Rollen:

- **Permissions Boundary** `c4-<env>-workload-boundary` je Umgebung. Die Deploy-Rolle darf Rollen `c4-<env>-*` nur mit dieser
  Boundary anlegen oder ändern (`iam:CreateRole`, `PutRolePolicy`, `AttachRolePolicy`, `PutRolePermissionsBoundary`);
  `DeleteRolePermissionsBoundary` ist verboten. Die Boundary erlaubt nur, was Lambda- und Scheduler-Rolle brauchen
  (Logs, DSQL-Connect, S3 der Umgebung, Lambda-Invoke, Secret lesen, Cognito-Admin) und verbietet `iam:*`. Ändert sich eine
  Rollen-Policy in `infra/modules/app`, muss die Boundary mitgezogen werden.
- **Explizite Verbote** für die Deploy-Rolle: `iam:*` auf sich selbst, Cognito/DSQL/CloudFront/API Gateway/ACM an Ressourcen mit
  dem Tag `Environment` der anderen Umgebung (Leitplanke: ohne Tag greift das Verbot nicht), `backup:*` und `backup-storage:*`.
- **Backups** mit AWS Backup (Vault `c4-<env>-backup`, Plan `c4-<env>`, Rolle `c4backup-<env>-service` außerhalb des Präfixes
  `c4-<env>-*`, damit die Deploy-Rolle sie nicht ändern kann). Die Vault-Policy verbietet den Deploy-Rollen, Wiederherstellungspunkte
  zu löschen. Zeitpläne und Aufbewahrung: [docs/datenbank.md](docs/datenbank.md#backups).

**Änderungen am Bootstrap (Owner):** Der State liegt im State-Bucket unter `bootstrap/terraform.tfstate` (versioniert,
verschlüsselt; die Deploy-Rollen kommen nicht heran). Ablauf aus jedem Checkout:

1. `aws sso login --profile C4`
2. `cd infra/bootstrap && terraform init` (einmal je Checkout; holt den State aus S3, kein lokaler State mehr)
3. `terraform plan`, prüfen, dann `terraform apply`. Das Lockfile im Bucket (`use_lockfile`) verhindert zwei gleichzeitige Läufe.

Ist der State kaputt (z. B. abgebrochener Lauf), liegt jede frühere Fassung als Objekt-Version im Bucket
(`aws s3api list-object-versions --bucket c4-terraform-state-189575358537 --prefix bootstrap/`); eine alte Version
zurückkopieren, dann `terraform plan`. Ein hängendes Lock löst `terraform force-unlock <id>`.

**Reihenfolge beim Anwenden (Owner):**

1. `aws sso login --profile C4`
2. In AWS Backup (eu-central-1) unter Einstellungen / Service-Opt-in den Ressourcentyp „Aurora DSQL“ aktivieren, falls noch
   nicht geschehen (bewusst nicht in Terraform, sonst übernähme es die Einstellung des ganzen Accounts).
3. `cd infra/bootstrap && terraform apply`; im Plan prüfen, dass nur die erwarteten Ressourcen dazukommen oder sich ändern
   (Boundaries, Deploy-Policies, Backup-Vaults/-Pläne/-Rollen/-Selektionen).
4. Sofort danach dev von diesem Branch deployen: Das Modul setzt die Boundary an den Rollen. Bis dahin scheitert ein Deploy,
   der Rollen-Policies ändert.
5. In AWS Backup prüfen, dass nach dem nächsten täglichen Lauf ein Wiederherstellungspunkt für den dev-Cluster erscheint.
6. Prod folgt mit dem nächsten Release.

**Wiederherstellen (noch nicht getestet):** Eine Wiederherstellung über AWS Backup erzeugt einen **neuen** DSQL-Cluster. Die App
muss danach auf ihn zeigen (Cluster-Endpunkt in `DSQL_ENDPOINT` der Lambda bzw. im Terraform-State); das ist nicht automatisiert.

Create the GitHub Environments `dev` and `prod` (add required reviewers on `prod`). A push to `main`
deploys **dev**; pushing a tag `v*` (e.g. `git tag v1.0.0 && git push origin v1.0.0`) deploys **prod**
(after the `prod` environment approval). `workflow_dispatch` can deploy either env manually. The
deploy roles come from `infra/bootstrap`.

Deploy order (`deploy-env.yml`): lint, typecheck, test, build, `terraform init`, read the current outputs,
**migrate the database first** (only if the environment already has a database), `terraform plan`, then
`terraform apply` of that plan, publish the web build, smoke test (`curl /api/health` for reachability, then `aws lambda invoke` with `{"c4":"health"}` for the database check; the step fails on `FunctionError`). A first-ever deploy has no database yet
and migrates after the apply. Because the old Lambda keeps running against the new schema for a moment,
migrations must stay additive (see `docs/datenbank.md`).

Prod gate (`deploy.yml`, job `pruefen`): a prod deploy fails unless the commit is contained in `main` and
the CI job `check` succeeded for it. Only tags `v*` trigger prod, and the `prod` environment only
accepts `main` and `v*` tags and waits for the repo owner's approval (Actions → "Review deployments").
Dev deploys are unrestricted.

`pnpm db:migrate` writes `app_info.env` when `C4_ENV` is set (the workflow passes the environment name).
`pnpm db:reset` and `pnpm db:rollback` refuse to run against a database marked `prod`.

## Local development

```bash
pnpm db:up     # personal DSQL cluster c4-local-<you>, writes packages/api/.env.local, migrates + seeds
pnpm dev       # Vite on :5173 (proxy /api -> :3000) + API on :3000
pnpm db:down   # destroys the cluster
```

Login uses the **dev** Cognito pool (localhost callback is allowed there). Needs your AWS credentials
(IAM token for DSQL, Cognito admin calls) and an applied `infra/envs/dev`.

To run the local web and API against the **dev** resources instead (dev database, buckets, secrets),
run `pnpm dev:env` once, then `pnpm dev`. It copies the env vars of the `c4-dev-api` Lambda into
`packages/api/.env.local` and dev's `config.json`, overwriting a `db:up` setup. Code changes then need no
deploy; only new migrations or secrets do. `pnpm db:migrate` would now migrate the dev database, so
deploy the branch instead when it adds migrations. Migrations, secrets and infra are shared by dev and
every local stack, so only one branch with such changes should be deployed to dev at a time.

Several sessions can run side by side: set `WEB_PORT` (5173-5182, allowed as Cognito callback and CORS
origin on dev) and `API_PORT`, e.g. `WEB_PORT=5174 API_PORT=3001 pnpm dev`. `.claude/launch.json` has
the slots `dev-1` ... `dev-9` for this; `web`/`api` use the default ports 5173/3000.

## Notes

- **Budget tag**: after the first deploy, activate the `Environment` cost allocation tag once in the AWS
  Billing console (Cost allocation tags; it can take up to 24h to show up). Until then the per-env
  budgets see no cost.

- DSQL: foreign keys are supported (a conflicting concurrent change fails the transaction), no sequences, `CREATE INDEX ASYNC`, one DDL statement per transaction.
  Migrations are plain SQL files in `packages/api/src/db/migrations` (one DDL statement per file).
  DSQL cannot `SET NOT NULL` on an existing column, so declare constraints when creating the table.
  `pnpm db:reset` (needs `CONFIRM_DB_RESET=yes`) drops every table; the Deploy workflow's `reset_db`
  input does the same for dev before migrating. Both lose all data.
  `pnpm db:rollback --to <migration>` (or `--last N`; needs `CONFIRM_DB_ROLLBACK=yes`) undoes the
  migrations applied after that one, using the down files in `packages/api/src/db/migrations/down/`
  (`<name>.down.sql`, or `<name>.down.1.sql`, `<name>.down.2.sql`, ... for several statements). It
  fails without changes if a down file is missing. The Deploy workflow's `rollback_to` input does this
  for dev before migrating. See `docs/datenbank.md`.
- The Lambda connects as the DSQL `admin` role; a least-privilege DB role is a follow-up.
- SPA config (`/app/config.json`) is written by Terraform, so one build serves all environments.
- Cognito's default email sender is limited (~50 mails/day); switch to SES when needed.
