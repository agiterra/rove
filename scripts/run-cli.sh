#!/usr/bin/env bash
# Thin wrapper around bin/rove.js. Does two friendly things:
#
#   1. Strips a leading `--` if present — pnpm-trained users tend to
#      write `pnpm cli -- run …` (npm style) and Commander then
#      interprets the literal `--` as a stop-options marker.
#
#   2. Auto-sources Supabase creds so `pnpm daemon` / `pnpm cli …`
#      "just work" without manual `set -a && source …` in this repo.
#      Precedence:
#        a. workspace-root `.env.rove` (canonical, per TEAM-SETUP.md)
#        b. `apps/dashboard/.env.local` (this repo's dashboard env;
#           aliased into the ROVE_* names the CLI expects)
#
# Both files are gitignored.
set -e

[ "$1" = "--" ] && shift

if [ -f ".env.rove" ]; then
  set -a
  # shellcheck disable=SC1091
  source ".env.rove"
  set +a
elif [ -f "apps/dashboard/.env.local" ]; then
  set -a
  # shellcheck disable=SC1091
  source "apps/dashboard/.env.local"
  set +a
  # Dashboard env uses NEXT_PUBLIC_SUPABASE_URL and
  # EVAL_SUPABASE_SERVICE_ROLE_KEY; alias them into the canonical
  # ROVE_* names the CLI reads from process.env.
  : "${ROVE_SUPABASE_URL:=${NEXT_PUBLIC_SUPABASE_URL:-}}"
  : "${ROVE_SUPABASE_SERVICE_ROLE_KEY:=${EVAL_SUPABASE_SERVICE_ROLE_KEY:-}}"
  export ROVE_SUPABASE_URL ROVE_SUPABASE_SERVICE_ROLE_KEY
fi

exec node packages/cli/bin/rove.js "$@"
