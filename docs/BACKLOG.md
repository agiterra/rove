# Master plan

**The single source of truth for Rove's state of play.** What's been shipped, what's open, where every supporting plan lives. Updated as we ship.

If Brian asks "where are we" or "what's our list," this is the file.

## How to use this file

- **Add to the top of the right section.** Newest at top.
- When something ships, move it to **Shipped** and link to verifying evidence (commit, route, migration filename).
- **Phase-level horizon** (Phase A/B/C/D/E arc) lives in [`ROADMAP.md`](ROADMAP.md). Day-to-day tracking lives here.
- **Detailed plan / proposal docs** live in [`plans/`](plans/) — each item below that has a plan links to it.
- **Theses** (philosophical framing) live in [`theses/`](theses/).
- **Audits** (walker audits of our own work) live in [`audits/`](audits/).
- **UI sketches** (pre-build mockups) live in [`ui/`](ui/) — historical for already-shipped UI.
- **Reviews** (occasional product-direction passes) live in [`reviews/`](reviews/).

Verification discipline: when claiming something is shipped, name the evidence path (commit, file, migration, route). Don't just say "yes."

---

## 📍 Where we are right now (2026-05-15)

- **Current published version**: `0.0.0-alpha.18` (verify with `git tag -l 'v*' | tail`).
- **Dashboard**: auto-deploys from `main` → `https://rove-agiterra.vercel.app`.
- **Public landing live** at `/`; deeper surfaces still auth-walled via Supabase + GitHub OAuth.
- **Authenticated dogfood walks**: live. Walker session minted via `POST /api/agent-session` → consumed by `POST /api/agent-session/consume` → cookies persist in `~/.rove/user-data-dispatcher`.
- **Active wedges**: affordance-gaps + expectation-match + native-dialogs + browser_press_key all wired through walker → MCP proxy → sink → dashboard. Validated end-to-end by run `849bc08b` (filed `agent.affordance_gap.navigate` + captured `prior_plan`).

---

## Open

### In flight / next up

*(None right now. Pick from Open below or start something new.)*

### Open

- **Project-level archetype configurator UI on `/projects/[id]/page.tsx`** — Migration `20260514120000_expectation_match.sql` already adds `projects.prior_archetype text`. The expectation-match wedge consumes this from persona-constraint defaults + flow YAML `prior_overrides`; the only missing piece is a UI on a `/projects/[id]/page.tsx` (the route doesn't exist yet — there's `/projects/new` and `/projects/[id]/gaps`, no overview). Half-day of work: server component + select form + server action that writes `projects.prior_archetype`. Defer until we have a real reason to want per-project overrides distinct from per-flow ones.

- **Retire the install-bundled service-role key by routing sink writes through Wire** — Today (alpha.15+) the `/api/install/exchange` response ships `ROVE_SUPABASE_SERVICE_ROLE_KEY` to every worker so the existing sink path just works. That partially regresses what [`plans/worker-tokens.md`](plans/worker-tokens.md) was built to prevent: anyone who captures the 5-min install code now has 5 minutes to grab a service-role key, a much bigger blast radius than a worker JWT. Proper fix is [`plans/wire-sink-relay.md`](plans/wire-sink-relay.md): worker emits `rove.sink.*` events to a local Wire instance → federated to a dashboard-side Wire peer → relay consumer with service-role does the actual Supabase writes. Zero Wire-core changes. Sent to Fondant (Tim's agent) and signed off. **Do not ship the install flow to operators outside Agiterra until Wire-relay lands.** ~7-8 hours of focused work.

- **Agent-API over Wire (input plane)** — Today there's no path for an external agent (e.g. Tim's Fondant) to author a flow and dispatch a walk without sitting at the dashboard. Sketched plan at [`plans/agent-api-over-wire.md`](plans/agent-api-over-wire.md): extend the sink-relay's Wire deployment with `rove.author.*` + `rove.walks.queue` topics, peer-pubkey-bound agent grants, an `@agiterra/rove-mcp` server that fronts the Wire publisher with normal MCP tools (`rove.create_flow`, `rove.run_flow`, `rove.get_findings`). Same auth substrate as sink-relay; service-role stays in the relay-integration only. Draft v1 needs Fondant sign-off before any code lands. Blocks on sink-relay v3 landing first. ~10 hours after that.

- **Stuck-walk timeout in the daemon recovery sweep** — No watchdog marks a run failed when `run_steps` stop arriving. Manual `PATCH /runs/<id>` cleanup was required repeatedly during 2026-05-14 dogfood (runs `869e5c94`, `fa69057b`, `19e55a15`, `1bd4df73`). The existing `recoverStaleClaims` sweep handles job-side recovery only, not run-side. A 5-minute "no new step → mark failed" check in the daemon's 30s sweep closes this. ~30 min.

- **Public read-only "preview" pages for findings / flows / run-detail** — The public `/` landing is in place. Going deeper without auth (so agent walkers can validate dashboard *surfaces* beyond the landing) needs `/preview/findings`, `/preview/flow`, `/preview/run-detail` backed by static fixtures. Right long-term architecture (Phase D-2 framing); not blocking dogfood since authenticated-walker path now exists. ~half-day.

- **Push-to-GitHub-issue flow exercised end-to-end** — Substrate ships `<FindingSendToIssueButton>` + the `apps/dashboard/lib/findings/send-to-issue.ts` server action, but the path hasn't actually been clicked through against a real consumer-repo issue. Half day to walk through + add a per-project repo-binding setting.

### Ideas / maybe-someday

- _(Speculative — fine to delete without acting. Add ideas above this line.)_

---

## ✅ Shipped

Each entry names verifying evidence (commit, file path, migration filename) so anyone re-reading this file can confirm.

### 2026-05-15

- ✅ **Authenticated agent walks via Supabase admin session mint** (`53f3aa1`) — Codex-architected. New `POST /api/agent-session` (bearer-secret-gated, mints a real Supabase session for the walker user via admin auth API) + `POST /api/agent-session/consume` (sets the session cookies inside the Playwright browser context) + CLI subcommand `rove dashboard-auth-setup` + `rove run --auth-agent` flag. Walker reaches authenticated dashboard surfaces using a real `team_members`-bound session, never a service-role key in the browser. Walker user: `rove-walker@agiterra.io` (auth.users.id `07696891-915e-4f26-b4d2-be55cc9fc32b`, team_members.id `f87921f0-3cee-4bb2-823b-806e59e8ba1b`). Vercel env: `ROVE_AGENT_SESSION_SECRET` + `ROVE_AGENT_SESSION_USER_ID` set.

- ✅ **Public landing at `/`** (`a81bfeb`) — Previously `/` did `redirect("/runs")` → unauth'd visitors (including agent walkers) bounced through `/signin`. Now `app/page.tsx` is a server component that redirects authed users to `/runs` but renders a substantive public landing for everyone else: hero, how-it-works cards (Two-sided readiness / Negative-space findings / Plan vs reality), Explore links to `/preview/live-walk` and `/signin`. Middleware allows `path === "/"`. Closes the `agent.captcha_friendly` finding that prior walks filed.

- ✅ **Dispatcher persists findings on non-zero exit** (`a531c74`) — Multiple walks (`6f2a122c`, `fa69057b`, `19e55a15`) were emitting valid `<<<FINDINGS_JSON>>>` payloads but exiting with code 1 — old dispatcher returned immediately and threw the findings away. Now parses stdout first, only fails hard when BOTH exit-code is bad AND no findings recoverable. When findings exist with non-zero exit, log a warning and route them through the sink.

### 2026-05-14

- ✅ **Daemon polling fallback** ([`alpha.18`](https://github.com/agiterra/rove/releases/tag/v0.0.0-alpha.18)) (`063f2ca`) — Daemon was claiming only via realtime push. When the Supabase realtime channel flapped (`CHANNEL_ERROR` loop, observed in prod logs), inserted `agent_jobs` rows sat in `pending` forever and only got drained on daemon restart. New 20s `setInterval` calls `drainAll()` unconditionally as safety net; existing `busy` guard prevents overlap with realtime-triggered drains.

- ✅ **Negative-space wedge sprint** ([`alpha.17`](https://github.com/agiterra/rove/releases/tag/v0.0.0-alpha.17)) — Six items, ~6 days of work compressed into one session via orchestrated subagents. Sprint index at [`plans/_sprint.md`](plans/_sprint.md). End-to-end validation: run `849bc08b` (rove.setup_new_project) filed `agent.affordance_gap.navigate` AND captured `prior_plan` with archetype + route pattern + friction + assumptions populated. Sub-items:
  - 📜 [On Negative Space — Alex's thesis](theses/negative-space.md) + codified pre-ship check at [`.claude/rules/pre-ship-check.md`](../.claude/rules/pre-ship-check.md)
  - [Finding-lifecycle substrate](plans/finding-lifecycle-substrate.md) — `findings.silenced_at` columns + `toggle_finding_silence` RPC + 6 React components (FindingSilenceButton, FindingSendToIssueButton, FindingTrendChart, FindingEmptyState, FindingLoading, FindingError) + `send-to-issue.ts` server action
  - [Affordance gaps](plans/affordance-gaps.md) — `agent.affordance_gap.{create|read|update|delete|undo|recover|navigate|status|confirm|save_state|empty|error}`, per-substantive-page enumeration in walk prompt, MCP-proxy substantive-page detection, `/projects/[id]/gaps` rollup route, dogfood flow `dashboard-find-and-delete-run`
  - [Plan-vs-reality](plans/expectation-match.md) — `agent.expectation_match.{route|affordance|copy|step_count|friction|archetype}`, prior-plan capture phase, per-step verdict chips, Reflection-tab "Plan vs reality" section, dogfood flow `dashboard-setup-new-project`
  - `browser_press_key` for accessibility + agent personas + `expected_keyboard_navigation` flow field
  - Native browser dialogs as first-class run artifacts — MCP proxy `Modal state` interceptor + `Persona.constraints.native_dialog_policy` + filmstrip dialog chip + `run_steps.dialog_payload` jsonb
  - Walker audit at [`audits/2026-05-14-sprint-plan-walker-audit.md`](audits/2026-05-14-sprint-plan-walker-audit.md) — 14 findings, all closed by the sprint docs

- ✅ **Sink emits `affordance_gaps` + `prior_plan`** (`eb92047`) — `findingsPayloadSchema` extended with `affordance_gaps[]` + `prior_plan`; supabase sink iterates gaps into `findings` rows with `heuristic_id = agent.affordance_gap.<kind>`; `completeRun` writes `runs.prior_plan` + `prior_plan_captured_at`. Required for the wedges to produce data.

- ✅ **Web-driven local worker install** ([`plans/install-flow.md`](plans/install-flow.md)) — `/setup` mint flow + `POST /api/install/exchange` + bash installer + `~/.rove/` LaunchAgent + `rove://` AppleScript handler. Progressive alphas .13 through .16 of fixes (rove.config skip when `--project-id`, claude CLI absolute-path resolution, etc.). Dogfooded 2026-05-14.

- ✅ **Workspace-less walk execution** — `flows.yaml_body text` column (migration `20260514030000`), `projects` table (migration `20260514040000`), `rove run --project-id` flag, `resolveSyntheticWorkspace()` that fetches flow YAML from Supabase and synthesizes a temp workspace at `~/.rove/run/<runId>/`. Lets daemons installed via `/setup` (no repo checkout) execute walks.

- ✅ **Richer page titles for agent navigation context** — Verified 15 of 15 dashboard pages now export `metadata.title` (via `grep "export const metadata" apps/dashboard/app/`). Closes the `agent.titles_and_meta` follow-up.

- ✅ **Live walk** ([`plans/live-walk.md`](plans/live-walk.md)) — Track B2 alpha.11/.12: live per-step writes via the MCP proxy + screenshot streaming to the `walks` bucket + dashboard Supabase Realtime subscription. The dashboard's filmstrip lights up as steps land.

- ✅ **Run-detail UI wiring** ([`plans/run-detail-wiring.md`](plans/run-detail-wiring.md)) — `/runs/[id]` fully wired: filmstrip, detail-split, hero, reflection, findings stream, now-doing pill, tab bar, step artifacts, affordance inventory, negative-space section, plan-vs-reality, verdict chips. 20+ components under `apps/dashboard/components/run-detail/`. Three rows explicitly deferred: coordinates tag, click-tree-node interactivity, secondary WCAG chip.

### 2026-05-13

- ✅ **Per-worker JWT auth** ([`plans/worker-tokens.md`](plans/worker-tokens.md)) — `worker_tokens` table (migration `20260513000400`), `is_worker_jwt()` + `jwt_*()` helpers, `apps/dashboard/lib/auth/mint-worker-token.ts`, RPCs gated to `authenticated`, `ROVE_WORKER_TOKEN_FILE` env var. **Caveat**: alpha.15 install flow currently ships service-role to workers alongside the JWT as a transitional concession — full hardening blocks on [Wire-sink-relay](plans/wire-sink-relay.md) landing.

- ✅ **Named workers** ([`plans/named-workers.md`](plans/named-workers.md)) — `workers` table (migration `20260513000000`), `claim_next_job` RPC (`setof` correction in v6 via `20260513000100`), recovery sweep, capability routing (`manual`, `localhost`, `webhook`). End-user docs at [`docs/walkers.md`](walkers.md).

---

## Where supporting documents live

| Folder | Purpose | Contents |
|---|---|---|
| [`plans/`](plans/) | Detailed implementation specs | install-flow, live-walk, named-workers, run-detail-wiring, worker-tokens, _sprint, affordance-gaps, expectation-match, finding-lifecycle-substrate, wire-sink-relay |
| [`theses/`](theses/) | Philosophical framing | negative-space |
| [`audits/`](audits/) | Walker audits of our own work | 2026-05-14 sprint-plan walker audit |
| [`ui/`](ui/) | UI sketches (mostly historical) | 00 visual-system-lift, 01 goal-reached, 02 plan-and-reflection, 04 trajectory, 05 change-review-walk, 06 run-detail-page-v1 |
| [`reviews/`](reviews/) | Periodic product-direction passes | 2026-05-12 walk-model-and-roadmap-review |
| [`ROADMAP.md`](ROADMAP.md) | Phase-level arc (A/B/C/D/E) | high-level horizon view |
| [`walkers.md`](walkers.md) | End-user docs for named workers | how to install + run a worker |
| [`INSTALL.md`](INSTALL.md) | Abbreviated install reference | quick-start for new consumers |
