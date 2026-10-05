#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
DEV="${C4_DEVELOPER:-$(whoami | tr -cd 'a-z0-9')}"
terraform destroy -input=false -auto-approve -var "developer=$DEV"
rm -f ../../packages/api/.env.local
