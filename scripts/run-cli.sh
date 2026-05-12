#!/usr/bin/env bash
# Thin wrapper around bin/rove.js that strips a leading `--` if present —
# pnpm-trained users tend to write `pnpm cli -- run …` (npm style) and
# Commander then interprets the literal `--` as a stop-options marker.
# This lets both `pnpm cli run …` and `pnpm cli -- run …` work the same.
set -e
[ "$1" = "--" ] && shift
exec node packages/cli/bin/rove.js "$@"
