# C4

React (Vite) SPA under `/app`, single-Lambda TypeScript API (Hono) under `/api`, Cognito auth,
Aurora DSQL database and S3 static hosting behind CloudFront. Infrastructure is Terraform; two
environments (`dev`, `prod`) live in one AWS account (`189575358537`, `eu-central-1`).

```
packages/shared   zod schemas, roles/permissions (used by api + web)
packages/api      Hono app, Lambda handler, local server, DSQL access, SQL migrations
packages/web      Vite + React + React Router + TanStack Query
infra/bootstrap   state bucket + GitHub OIDC roles (run once)
infra/modules/app everything one environment needs
infra/envs/{dev,prod}   environment roots (own state each)
infra/local-db    throwaway per-developer DSQL cluster
```

## Local checks (no AWS needed)

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## First-time AWS setup

1. Export credentials for account `189575358537`.
2. **Bootstrap** (once): `cd infra/bootstrap && terraform init && terraform apply`
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
7. **First admin user** (self sign-up is disabled):
   ```bash
   aws cognito-idp admin-create-user --user-pool-id eu-central-1_gmPabN3Yu --username leonard \
     --user-attributes Name=email,Value=leonard@c4-leipzig.de Name=email_verified,Value=true
   aws cognito-idp admin-add-user-to-group --user-pool-id eu-central-1_gmPabN3Yu --username leonard --group-name admin
   ```
   The CLI username is only an internal id (it must not look like an email). On first login you sign in with
   the email and the temporary password, then pick your login name on the "Choose your username" page; after
   that you can sign in with either. Further users (invited by email only) and group changes: Admin page.

### GitHub setup

The deploy roles trust the repository's OIDC `sub` claim, which uses immutable ids
(`repo:jSebestyen590@26395410/C4@1395447517:environment:<env>`). The value is the `github_repo` variable in
`infra/bootstrap`; a different repo (or a repo transfer) needs its own `sub` (print it with a debug step
in the workflow). Re-apply `infra/bootstrap` after changing it.

Create the GitHub Environments `dev` and `prod` (add required reviewers on `prod`). A push to `main`
deploys **dev**; pushing a tag `v*` (e.g. `git tag v1.0.0 && git push origin v1.0.0`) deploys **prod**
(after the `prod` environment approval). `workflow_dispatch` can deploy either env manually. The
deploy roles come from `infra/bootstrap`.

## Local development

```bash
pnpm db:up     # personal DSQL cluster c4-local-<you>, writes packages/api/.env.local, migrates + seeds
pnpm dev       # Vite on :5173 (proxy /api -> :3000) + API on :3000
pnpm db:down   # destroys the cluster
```

Login uses the **dev** Cognito pool (localhost callback is allowed there). Needs your AWS credentials
(IAM token for DSQL, Cognito admin calls) and an applied `infra/envs/dev`.

## Notes

- **Budget tag**: after the first deploy, activate the `Environment` cost allocation tag once in the AWS
  Billing console (Cost allocation tags; it can take up to 24h to show up). Until then the per-env
  budgets see no cost.

- DSQL: foreign keys are supported (a conflicting concurrent change fails the transaction), no sequences, `CREATE INDEX ASYNC`, one DDL statement per transaction.
  Migrations are plain SQL files in `packages/api/src/db/migrations` (one DDL statement per file).
  DSQL cannot `SET NOT NULL` on an existing column, so declare constraints when creating the table.
  `pnpm db:reset` (needs `CONFIRM_DB_RESET=yes`) drops every table; the Deploy workflow's `reset_db`
  input does the same for dev before migrating. Both lose all data.
- The Lambda connects as the DSQL `admin` role; a least-privilege DB role is a follow-up.
- SPA config (`/app/config.json`) is written by Terraform, so one build serves all environments.
- Cognito's default email sender is limited (~50 mails/day); switch to SES when needed.
