#!/usr/bin/env bash
# Creates your personal DSQL cluster, writes packages/api/.env.local, migrates and seeds it.
set -euo pipefail
cd "$(dirname "$0")"
DEV="${C4_DEVELOPER:-$(whoami | tr -cd 'a-z0-9')}"
terraform init -input=false >/dev/null
terraform apply -input=false -auto-approve -var "developer=$DEV"
ENDPOINT="$(terraform output -raw dsql_endpoint)"

# Cognito settings come from the dev environment (looked up read-only).
ENV_DIR=../envs/dev
APP_JSON="$(cd $ENV_DIR && terraform init -input=false >/dev/null && terraform output -json app)"
field() { python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])" <<<"$APP_JSON"; }
USER_POOL_ID="$(field user_pool_id)"
CLIENT_ID="$(field client_id)"
mkdir -p ../../packages/web/public
cat > ../../packages/web/public/config.json <<WEBCONF
{ "region": "eu-central-1", "userPoolId": "$USER_POOL_ID", "clientId": "$CLIENT_ID", "cognitoDomain": "$(field cognito_domain)" }
WEBCONF

cat > ../../packages/api/.env.local <<ENVFILE
AWS_REGION=eu-central-1
DSQL_ENDPOINT=$ENDPOINT
USER_POOL_ID=$USER_POOL_ID
CLIENT_ID=$CLIENT_ID
ENVFILE
echo "Wrote packages/api/.env.local"
cd ../..
pnpm db:migrate
pnpm db:seed
