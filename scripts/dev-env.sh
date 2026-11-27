#!/usr/bin/env bash
# Points the local stack (`pnpm dev`) at the dev environment: copies the env vars of the dev Lambda
# (DSQL cluster, buckets, secret ARNs, Cognito) into packages/api/.env.local and the SPA config of
# dev into packages/web/public/config.json. Overwrites both files (e.g. a personal `pnpm db:up` setup).
set -euo pipefail
cd "$(dirname "$0")/.."
export AWS_PROFILE="${AWS_PROFILE:-C4}"

aws lambda get-function-configuration --function-name c4-dev-api --query Environment.Variables --output json |
  python3 -c "import json,sys; print('AWS_REGION=eu-central-1'); [print(f'{k}={v}') for k,v in sorted(json.load(sys.stdin).items())]" \
    >packages/api/.env.local

mkdir -p packages/web/public
curl -fsS https://dev.c4-leipzig.de/app/config.json -o packages/web/public/config.json

echo "Wrote packages/api/.env.local and packages/web/public/config.json (dev). Start with: pnpm dev"
echo "Careful: 'pnpm db:migrate' now migrates the dev database."
