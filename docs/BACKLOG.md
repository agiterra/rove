# Backlog

Single source of truth for **features and ideas not yet started**. If Brian asks "what do we have for features on our list," look here.

## How to use this file

- **One bullet per item.** Free-form. No required schema, no labels, no estimates.
- **Add to the top.** Newest at top so the most recent thinking is visible first.
- **Cross out when done** (`~~strikethrough~~`) and leave for one week, then delete.
- **Promote to an issue** when work actually starts: `gh issue create -R agiterra/rove -t "feat: …" -l area:dashboard,type:feature`. Then delete the bullet here.
- **In-flight work lives in GitHub Issues**, not here. This file is the staging area before an issue exists.
- **Phase-level planning lives in `docs/ROADMAP.md`**, not here.

## Features

- **Web-driven local worker install** — `/setup` page + one-paste install one-liner + macOS launchd auto-start + `rove://` recovery handler. Plan: [`docs/plans/install-flow.md`](plans/install-flow.md). Blocked on worker-tokens.
- **Per-worker JWT auth** (path B before the dashboard install flow) — replace the daemon's service-role key with a per-worker JWT minted by the dashboard, so the install one-liner can hand out a credential that's safe to leak. Plan: [`docs/plans/worker-tokens.md`](plans/worker-tokens.md). Blocks the dashboard install flow.
- ~~**Named workers**~~ — shipped 2026-05-13 in PRs #1–#5 + step-6 docs. See [`docs/walkers.md`](walkers.md) for usage; [`docs/plans/named-workers.md`](plans/named-workers.md) for the design rationale.
- _(add new items above this line)_

## Ideas / maybe-someday

- _(speculative stuff that may never get built — fine to delete without acting)_
