#!/usr/bin/env bash
# Run on the instance, from any directory, after .env exists in the repo root.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

if [[ ! -f .env ]]; then
  echo "Missing .env. Copy .env.example and fill the same values as your laptop." >&2
  exit 1
fi

if [[ -d .git ]]; then
  git pull --ff-only
fi

npm ci
npm run build

if pm2 describe travelhues-api >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi

pm2 save
echo "API is up. Check with: curl -s http://127.0.0.1:4000/"
