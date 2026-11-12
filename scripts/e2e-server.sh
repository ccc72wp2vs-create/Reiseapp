#!/usr/bin/env bash
# Starts an isolated production preview for Playwright:
#  fresh local D1 (migrated) in .wrangler/e2e → build → vite preview (Worker + assets in workerd)
set -euo pipefail
cd "$(dirname "$0")/.."
export TRAVIO_PERSIST=.wrangler/e2e
rm -rf "$TRAVIO_PERSIST"
if [ ! -f .dev.vars ]; then
  printf "APP_ENV=development\nSETUP_TOKEN=e2e-setup-token-0123456789\n" > .dev.vars
fi
npx wrangler d1 migrations apply DB --local --persist-to "$TRAVIO_PERSIST" > /dev/null
npx vite build > /dev/null
exec npx vite preview --port 4173 --strictPort
