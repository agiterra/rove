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

### Next sprint

**Start here**: [`docs/proposals/_sprint.md`](proposals/_sprint.md) — Monday-morning entry point with build order, migration sequence, file checklist, sprint-level DoD. Estimated 6 days. Walker-audited at `docs/audits/2026-05-14-sprint-plan-walker-audit.md`.

- **📜 [On Negative Space — Alex's thesis](theses/negative-space.md)** — Read first. Framing for the entire sprint. Codified pre-ship check at [`.claude/rules/pre-ship-check.md`](../.claude/rules/pre-ship-check.md).
- **Day 1 — [Finding-lifecycle substrate](proposals/finding-lifecycle-substrate.md)** — Silence/un-silence + send-to-GitHub-issue + trend chart + empty/loading/error state primitives. Both downstream proposals consume this. ~1 day.
- **Days 2-3 — [Affordance gaps (page-level wedge)](proposals/affordance-gaps.md)** — `agent.affordance_gap.{create|read|update|delete|undo|recover|navigate|status|confirm|save_state|empty|error}`. Per-substantive-page enumeration in the walk prompt, auto-finding emission, new `/projects/[id]/gaps` route, dogfood flow `dashboard-find-and-delete-run`. The most direct counter-attack on agent-built apps that ship with backend-complete / UI-incomplete pathology. **~2 days with substrate shared.**
- **Days 4-5 — [Plan-vs-reality (journey-level wedge)](proposals/expectation-match.md)** — `agent.expectation_match.{route|affordance|copy|step_count|friction|archetype}`. Capture the agent's prior plan before the first tool call; per-step verdict against reality; archetype configurator on `/projects/[id]`; dogfood flow `dashboard-setup-new-project`. **~2 days with substrate shared.**
- **Day 5.5 — Add `browser_press_key` to the accessibility + agent persona toolset** — Built-in `accessibility` persona claims keyboard-only but uses `browser_click`; this corrects that lie. Adversarial-by-nature, not convenience-by-nature: the only unused Playwright tool that makes walks *more* likely to find UX failures. Flow YAML grows `expected_keyboard_navigation`. ~half-day.
- **Day 6 — Native browser dialogs as first-class run artifacts** — Proxy intercepts `page.on("dialog", …)`, files findings per persona-policy (`perceive_and_act` for humans, `perceive_blind` for agents), surfaces a filmstrip chip + reflection-tab surprise category. Flow YAML grows `expectations.native_dialog`. ~half-day.

**Sprint total**: ~6 days. **Audit findings closed by these docs**: F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12, F13, F14. (Original audit at `docs/audits/2026-05-14-sprint-plan-walker-audit.md`.)

### Backlog

- **Retire the install-bundled service-role key by routing sink writes through Wire** — Today (2026-05-14, alpha.15) the `/api/install/exchange` response ships the `ROVE_SUPABASE_SERVICE_ROLE_KEY` to every worker so the existing sink path (`getSupabaseClient`) just works. That regresses what `docs/plans/worker-tokens.md` was built to prevent: anyone who captures the 5-min install code now has 5 minutes to grab a service-role key, much bigger blast radius than just a worker JWT. Proper fix is the Wire-sink-relay proposal in `docs/proposals/wire-sink-relay.md`: worker emits `rove.sink.*` events to a local Wire instance → federated to a dashboard-side Wire peer → relay consumer with service-role does the actual Supabase writes. No Wire code changes needed. Sent to Fondant (Tim's agent) for review on 2026-05-14. **Do not ship this install flow to operators outside Agiterra until Wire-relay lands.**
- **Workspace-less walk execution for daemons installed via `/setup`** — Dogfooding the install flow on 2026-05-14 exposed that the daemon-spawned `rove run` subprocess calls `resolveWorkspace()` → `loadRoveConfig()`, which walks up from `/` (launchd's cwd) and throws because there's no `rove.config.ts` (and no repo checkout exists — that's the whole point of one-paste install). Three pieces needed to fully close the loop: (1) `flows.yaml_body text` column so the flow spec lives in supabase, not just on disk; (2) `parseFlowFile` + sync writes the YAML body; (3) `rove run` accepts a `--project-id` flag and fetches flow+persona from supabase when no local workspace is found (synthesize a temp workspace at `~/.rove/run/<runId>/`). Personas are already shipped in `BUILT_IN_PERSONAS` in the CLI tarball; only flows need the fetch path. Daemon-spawn args in `walk.ts` also need `--project-id` and the right `cwd`. Until this lands, `/setup` installs work end-to-end (daemon comes online, claims jobs) but the spawned walk subprocess fails with "No rove.config found from /" — captured in finding `agent_jobs.id=9ebef158-b230-4f78-9fc4-2849668af031` error column. Plan-sized work, ~1-2 hours.
- **Richer page titles for agent navigation context** — Walk 3 surfaced `<title>Sign in · Rove</title>` as too thin for an agent verifying it landed on the right surface. Cheap fix per route; nicer to do as a general pass. Phase D-2 polish, not urgent.
- **Public/read-only path for unauthenticated agents** — surfaced by our own dogfood walk on 2026-05-14: an `agent` persona that lands on `/` gets redirected to `/signin` and stops. The `agent.captcha_friendly` rubric flags this as critical and `agent.predictable_urls` as minor. Phase D-2 question — when we have an external consumer, we'll want some surface (a docs page, a sample report, a public "what is Rove" route) that an agent can read without auth. Don't fix in alpha; revisit when the first external project lands. Findings IDs: `01c36645` (CRITICAL), `71305040` (MINOR), run `6499a26f-26f1-4870-829e-14ee9ba0d791`.
- ~~**Web-driven local worker install**~~ — shipped (PRs #8 #14 #15 #16 #17 #21 + this session's fixes). Dogfooded 2026-05-14: `/setup` mints code → installer runs → daemon registers + claims jobs. Walk-subprocess gap is now its own backlog item above.
- ~~**Per-worker JWT auth**~~ — shipped (`apps/dashboard/lib/auth/mint-worker-token.ts`, `worker_tokens` table, `is_worker_jwt()` + `jwt_*()` helpers, RPCs gated to `authenticated`).
- ~~**Named workers**~~ — shipped 2026-05-13 in PRs #1–#5 + step-6 docs. See [`docs/walkers.md`](walkers.md) for usage; [`docs/plans/named-workers.md`](plans/named-workers.md) for the design rationale.
- _(add new items above this line)_

## Ideas / maybe-someday

- _(speculative stuff that may never get built — fine to delete without acting)_
