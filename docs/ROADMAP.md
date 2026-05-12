# Rove Roadmap

Single source of truth for what's done, what's in flight, what's next. Updated as we ship.

## Where we are (2026-05-12)

**Alpha is live**: the loop end-to-end works in production.

- ✅ Repo extracted from tankloop (`agiterra/tankloop` → `agiterra/rove`).
- ✅ Renamed packages to `@agiterra/rove-*` (GitHub Packages requires scope = org).
- ✅ Published `@agiterra/rove-core@0.0.0-alpha.4` + `@agiterra/rove-cli@0.0.0-alpha.4` to GitHub Packages.
- ✅ Dashboard at `https://rove-agiterra.vercel.app`, auto-deploys from main.
- ✅ Hosted Supabase project (`tceosllezmydpouvfuzf`), multi-project tenancy via `project_id` (Phase C-lite).
- ✅ Tankloop is Rove customer #1 (`pnpm add -D @agiterra/rove-cli` + `rove.config.ts`).
- ✅ Phase D — agent-readiness rubric: 3 agent personas, 10 named `agent.*` heuristics, prompt branches on `persona.category`, dashboard filters via `lens=agent|human|both`.
- ✅ Dogfood proven: Claude computer-use agent persona walked the dashboard and surfaced 5 real findings; pushed 4 fixes; re-walk dropped to 3 (1 expected + 2 deeper-quality nits).

## What's next, ranked

### Quick wins (each ≤ 1 hour)

- [ ] Fix the 2 remaining agent findings from the dogfood re-walk:
  - Wrap the signin page's emoji hints in a `<ul role="list">` with `<li role="listitem">` (currently bare divs → `agent.accessibility_tree_completeness`).
  - Add per-route `<meta description>` (extend the `metadata` exports) → `agent.titles_and_meta`.
- [ ] Add a `LICENSE` file (currently `UNLICENSED`). Decide license at Phase E; for alpha, "All rights reserved" + `UNLICENSED` is fine to keep, just document the choice.
- [ ] Add a `CONTRIBUTING.md` pointing at `.agent-rules/` and `TEAM-SETUP.md`.

### Phase D-2 — agent-readiness scorecard view (~1 day)

A per-flow 0–10 agent-readiness score, surfaced as:

- A score badge on each flow card in `/flows`.
- A dedicated tab on `/flows/[id]` with: current score, score-over-time chart, per-heuristic breakdown, "regressed since last walk" callout.
- The score derivation: weighted sum of `agent.*` finding severities across the last N walks, normalized to 0–10. Critical=−3, major=−2, minor=−1, nit=−0.25; start at 10.

### Phase E — Auto-walk on PR (~2 days)

Webhook from agiterra/<consumer-repo> → Rove → on `pull_request` opened/synced, compute which flows are affected (by mapping changed files to flow `affects:` globs), wait for the Vercel preview URL to be ready, queue walks against it, post a single PR comment with results.

This is the bigger product moment. "Did your PR regress agent-readiness?" is the question that turns a one-shot eval into a continuous one.

### Phase F — Phase D2 properly multi-tenant (~3-5 days)

Today: anyone in `team_members` sees every project's data. Fine for two projects; uncomfortable for ten. Real fix:

- `workspaces` table + `workspace_members` table.
- Per-project membership, RLS gating per-workspace.
- Workspace switcher with permission gating, not just URL params.

Do this when the third consumer asks.

### Phase G — Marketing surface (when there's something to market)

- Public landing page (separate from the dashboard).
- `docs.rove.dev` (or whatever domain) with the install story, persona authoring guide, agent-readiness rubric reference.
- Demo video.
- Public npm registry (not GH Packages) once we go public.
- HN / Twitter launch.

Don't do this before there's a paying user or a strong second-team adopter.

## Known caveats

- **Dashboard is single-tenant per Vercel deployment.** One deployment shows whatever `project_id` the URL `?p=…` / cookie / `ROVE_DEFAULT_PROJECT_ID` resolves to. Multi-tenant routing is Phase F.
- **`team_members` is global, not per-project.** Adding a teammate gives them visibility on every project's findings. Acceptable for the current trusted-org scope.
- **`rove auth-setup`** still has TankLoop-shaped assumptions (`/auth/login` URL hardcoded). Project-agnostic auth setup is on the list when a non-tankloop consumer needs it.
- **Daemon update**: consumers need to manually `pnpm add -D @agiterra/rove-cli@<v>` to pick up CLI releases. No auto-update mechanism. Fine for alpha.
- **GH Issues sink**: only files static labels (`area:*`, `type:*`, `agentic-evaluator`). Per-flow / per-persona labels are rendered into the issue body, not added as labels (avoid `gh issue create` failing on missing label). Acceptable forever, probably.

## Tankloop-specific cleanup (separate PR on tankloop)

The eval code is still in `agiterra/tankloop`'s tree at `apps/eval-dashboard/`, `apps/tankloop-eval/`, `packages/agentic-ux-evaluator-core/`, `infra/supabase/eval/`. Tankloop now consumes `@agiterra/rove-cli` via npm, so the in-tree copies can be deleted.

Tracking PR title: `chore(eval): remove in-tree eval, lift-and-shift to @agiterra/rove-cli complete`

Don't do this until everyone on the tankloop side has stopped running the old `tankloop-eval daemon` and switched to `rove daemon`.

## Decisions deferred

- **Domain**. We're alpha; using Vercel's free `*.vercel.app` URL. Pick a real domain when we go public.
- **Pricing**. Free for OSS? Per-workspace? Decide before Phase G.
- **Open source the dashboard?** Open-sourcing the dashboard while keeping the SaaS hosted gives credibility (Supabase pattern). Counter: slows iteration. Decide before Phase G.
- **Authentication for the daemon**. Today: service-role key. Future: per-device JWT scoped to `daemon:claim` + `daemon:write-jobs`. Land when a real security boundary needs it (i.e. external customer, not just team).
