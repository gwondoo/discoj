#!/bin/sh
# Never recreate a running temporary tunnel: its public hostname would change.
set -eu
cd "$(dirname "$0")/.."
node activity/scripts/sync-live.mjs
docker compose -f compose.activity.yaml up -d --no-recreate
