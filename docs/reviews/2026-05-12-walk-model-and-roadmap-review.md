# Rove review — walk model, scorecard, lifecycle, isolation

**Date:** 2026-05-12 (revised same day with deeper research)
**Scope:** Product direction review against the current codebase, then a deeper second pass on whether the current approach is on the right tree.
**Grounded in:** `packages/core/src/{types,prompt,parse-findings,personas/built-in}.ts`, CLI run pipeline (`packages/cli/src/commands/run.ts`, `daemon/{runner,handlers/walk}.ts`, `dispatchers/claude-code-cli.ts`, `sinks/supabase.ts`), dashboard (`/findings`, `/runs`, `/flows/[flowId]`, `daemon-status-pill`), Supabase schema (`20260507000000_eval_core.sql`, `20260511210000_agent_jobs.sql`, `20260512040000_project_id.sql`). Sections 10–13 added on revision, grounded in 2026 research on agent benchmarks, calibration, and the emerging agent-readable web (WebMCP, llms.txt, Cloudflare Agent Readiness).

> **If you only read one part of this doc, read §0 (canonical plan) and §16 (change-review walk).** Everything else is rationale and supporting detail.

---

## 0) Canonical positioning and plan (decided 2026-05-12)

**Lead positioning (for now): Rove is the independent product reviewer for AI-built apps.** It catches when your builder agent's code compiles and its tests pass, but the product is wrong — navigation users wouldn't expect, success states that aren't visible, primary actions that aren't primary, pages that don't match the rest of the product. Walks every changed page as a goal-seeking user and reports coherence, navigation, and intent failures.

The broader "agentic UX evaluation platform" / two-sided-readiness story stays available as the platform underneath this pitch, but it does not lead. Agent-readability heuristics, perception-mode walks, protocol scanners — all of those become *features* of the reviewer, not the headline.

This decision supersedes every priority list below (§1, §13, §15.6, §16.5). Read them as the reasoning that led here; do not execute against them.

### Canonical execution order

| # | Item | Why this slot | Source section |
|---|---|---|---|
| 1 | `goal_reached` on every walk | Day-one work, biggest leverage, catches the navigation-maze. Nothing else delivers without this. | §15.2, §15.6 #1 |
| 2 | Pre-walk plan + post-walk reflection (adversarially phrased) | Plan-vs-actual is the comparison axis the entire product trends on. Phrased as bug-hunt per the calibration paper. | §2, §3, §11.4 |
| 3 | Clean-room walk isolation for evaluator personas | The reviewer cannot share the builder agent's session memory, source-read access, or CLAUDE.md context. Failing this poisons every (B)-side finding. | §8, §16.5 #1 |
| 4 | Tool-call telemetry via MCP wrapper, persisted to `run_steps` | Wrap the MCP server so every browser tool call is logged. Derives `actual_steps`, `dead_clicks`, `recovery_count`, ARIA-snapshot-per-step. Foundation for #5 and #6. Budget one real engineer-week. | §11.3, §15.6 #2 |
| 5 | Change-review walk v1 — `kind: change_review`, reference routes, local design contract, `change.*` findings | This is the (B) product. Ships behind a feature flag and gets dogfooded on Rove itself before any external promise. | §16.1–§16.4 |
| 6 | Run detail page with side-by-side ARIA + screenshot per step, plan-vs-actual, change deltas | The single screen that proves the pitch. Built on #4 and #5. | §4, §11.1, §15.5 |
| 7 | `flow.*` + `change.*` finding categories in the prompt | Replaces page-local heuristics with flow-level and change-level ones. One prompt edit; depends on #1/#2 producing the inputs. | §15.4, §16.3 |
| 8 | Lifecycle / recurrence controls + GH issue linking | Only useful once findings are measurements (#4) not opinions. Schema is mostly there. | §6 |
| 9 | Dual scorecard — `human_usability` + `agent_readiness` | Both fall out of `run_steps`. Don't ship before #4–#7. | §5, §15.6 #9 |
| 10 | Protocol-layer scanner (llms.txt, robots, schema.org, MCP cards, WebMCP discovery) | Pulled lower under (B). Adds an (A)-side dimension; ships as a tab on the run detail page when (B) is solid. | §12 |
| 11 | Queue / daemon visibility (`/jobs` page) | Tactical, low coupling to the product story. Ship whenever it hurts. | §7 |
| 12 | Real-agent runs (browser-use shellout, eventually Claude computer-use API) | An (A)-side measurement upgrade. Useful, not lead-pitch material. Defer until the (B) wedge is paying for itself. | §11 |

### Open design notes (do not skip when implementing)

- **`run_steps` parsing strategy: wrap MCP, don't parse stdout.** Claude `--print` mode emits prose with tool calls interleaved; parsing that reliably is brittle. The cleaner approach is a thin MCP proxy that fronts `@playwright/mcp`, logs every `tools/call` request and response, and writes them to a structured per-run log file the sink reads after the walk completes. Single file, ~150 lines, works for any dispatcher including future real-agent runtimes.
- **Local design contract is the most fragile piece.** §16.2's "LLM infers a contract from N reference routes" is an LLM opinion stacked on another LLM opinion. Ship it behind a feature flag, dogfood on Rove's own dashboard, and validate by running it against known-good and known-bad change sets before promising it externally.
- **Change-detection input.** The change-review walk needs to know what changed. v1: `git diff --name-only main...HEAD` mapped to routes via a simple config (`routesFromFiles` glob → route templates in `rove.config.ts`). Vercel preview URL goes in `target_url`. v2: trust the PR's changed-files list directly.
- **Cost model.** A ~30-step walk with snapshots + screenshots costs roughly $0.30–$1.00 in Claude tokens. 6 personas × 10 flows per PR = $20–$60/PR. Worth knowing before promising "auto-walk every PR." Per-flow change-review walks (only changed surfaces) are the natural cost-controlled unit and align with the (B) positioning.
- **Stale-flow problem.** As the app evolves, flow YAMLs drift. The change-review walk inherently handles this (it judges the changed surface, not a pre-recorded path), which is another argument for leading with (B) over scripted flow walks.

---

## 1) Highest-value additions, ranked _(SUPERSEDED by §0)_

Ordered by impact-per-day, with dependencies called out:

1. **Run detail page (`/runs/[id]`)** — biggest leverage per hour. Right now `/runs` is a flat list with no destination; clicking the finding count deep-links to `/findings?run=…` (`apps/dashboard/app/runs/page.tsx:108`). Without a run page, you can't see the walked URL, the agent's summary, the full trajectory, or stdout. Almost every other feature depends on having a place to show per-run evidence.
2. **Walk-time enrichment: pre-walk plan + post-walk reflection** (see §2). Cheap to add — a prompt + schema change — but it transforms the product from "agent files bugs" to "agent reports surprises." This is the wedge.
3. **Finding lifecycle controls** (§6). Server actions on `findings.status` + an `events` table. The schema already has `status`, `content_hash`, `resolved_at`, `first_seen_at`, `last_seen_at` (`20260507000000_eval_core.sql:103-118`) and dedup is already wired in `SupabaseSink.insertFinding` (`sinks/supabase.ts:138-167`). You're 60% there; the missing piece is mutation UI + "reappeared after fixed" detection.
4. **Agent-readiness scorecard** (§5). Worth doing *after* lifecycle, because score quality depends on `dismissed`/`fixed` filtering. Otherwise you score against noise. Per ROADMAP the design is right ("weighted sum, normalized to 0–10"), but don't ship it without lifecycle state.
5. **Queue/daemon visibility page** (§7). The pieces exist (`agent_jobs`, `daemon_heartbeats`, the header pill at `components/daemon-status-pill.tsx`). Surface them properly on a `/jobs` page so a stale walk doesn't silently sit in `claimed`.
6. **Walk isolation hardening** (§8). Less visible but a real correctness issue — agent personas walking via the operator's `claude` CLI in `cwd: ws.rootDir` (`dispatchers/claude-code-cli.ts:88-92`) can read project source. That breaks the "black-box UX" premise.
7. **Cross-walk comparison** (Phase E adjacent): "same flow, same persona, last walk vs this walk — what changed?" — depends on lifecycle + run detail. Defer.

Don't start anything else until 1–3 ship.

---

## 2) What's missing from the walk model

Yes to almost all the bullets in the brief — and they're the wedge, not nice-to-haves. Currently `buildWalkPrompt` (`packages/core/src/prompt.ts:58-181`) asks the agent to walk, file findings, and stop. There is no notion of *expectation*, *plan*, *surprise*, or *recovery*. That's exactly what separates Rove ("an agent's UX report") from Playwright codegen ("an agent's test script").

Concretely, add three new walk-time phases:

- **Pre-walk plan** (before opening the browser): the agent emits, given only the goal + persona + entry route, (a) what it expects the path to look like (3–7 steps), (b) expected step count and rough time, (c) what affordance it expects to find first, (d) what its single biggest worry is for this persona. This becomes a *prediction artifact* the walk is judged against. Critically: the agent must commit to this *before* any browser tool calls, so it's not retrofitted to look correct.
- **In-walk surprise log**: the agent records moments where reality diverged from the plan — "expected a 'Create job' primary button, found nothing primary; had to open a kebab menu." Each entry has a type (`unexpected_detour`, `affordance_missing`, `ambiguous_label`, `hesitation`, `recovery`, `dead_end`), the step it happened on, what was expected, what was found, and whether the agent recovered.
- **Post-walk reflection**: did you reach the goal? How many steps actually vs predicted? What was the largest gap between expectation and reality? Confidence (0–1) that another user of this persona would succeed.

This makes findings vastly more actionable. "Missing label on Save" is a Playwright fix. "I expected the next step after submitting the form to land me on the new record's detail page; instead it dumped me back to an empty list" is a UX finding no deterministic tool can produce.

It also gives a comparison axis over time: predicted vs actual step count, surprise count, recovery count. Those trend lines are the product.

One caveat: agent personas should not predict the same way humans do — their plan is "what affordances do I need" (semantic anchor expectations: "I expect a button named 'Create'"), not "what would I click visually." The prompt should branch on `persona.category` the same way the rubric already does at `packages/core/src/prompt.ts:123`.

---

## 3) Concrete schema / prompt / data-model changes

### `packages/core/src/types.ts` — extend `findingsPayloadSchema`

```ts
export const walkPlanSchema = z.object({
  expected_path: z.array(z.object({
    step: z.number().int().nonnegative(),
    description: z.string(),                    // "click 'Create job' on toolbar"
    expected_affordance: z.string().optional(), // "button name='Create job'"
  })),
  expected_step_count: z.number().int().positive(),
  expected_minutes: z.number().positive().optional(),
  biggest_worry: z.string().optional(),
  authored_before_browser_open: z.literal(true),
});

export const SURPRISE_KINDS = [
  "unexpected_detour", "affordance_missing", "ambiguous_label",
  "hesitation", "recovery", "dead_end", "expectation_mismatch",
] as const;
export const surpriseSchema = z.object({
  kind: z.enum(SURPRISE_KINDS),
  step_index: z.number().int().nonnegative(),
  expected: z.string(),
  observed: z.string(),
  recovered: z.boolean(),
  recovery_cost_steps: z.number().int().nonnegative().optional(),
  related_finding_id: z.string().optional(),    // links to a Finding
});

export const reflectionSchema = z.object({
  goal_reached: z.boolean(),
  actual_step_count: z.number().int().nonnegative(),
  largest_expectation_gap: z.string().optional(),
  confidence_persona_would_succeed: z.number().min(0).max(1),
});

// extend findingsPayloadSchema
plan: walkPlanSchema.optional(),
surprises: z.array(surpriseSchema).default([]),
reflection: reflectionSchema.optional(),
```

### `packages/core/src/prompt.ts`

Add a "Phase A: write down your plan" block before the existing "Steps" section, with the explicit instruction not to call any browser tool until the plan JSON has been written to a sentinel block. Easiest implementation: a second JSON marker pair (`<<<WALK_PLAN_JSON>>>` … `<<<END_WALK_PLAN_JSON>>>`) emitted before any tool call, then the existing findings block at the end. `parseFindings` (`packages/core/src/parse-findings.ts:22-58`) gains a sibling `parseWalkPlan` extractor; both write into the same payload at sink time. Don't push the plan into prose — make it structured so it's diffable.

### Surprises vs findings

Surprises aren't always findings (sometimes the agent recovers gracefully and there's nothing to fix), but a surprise *with* `recovered=false` or with a related `expectation_mismatch` should auto-promote into a finding. Keep them as separate columns; let the dashboard cross-reference.

### Supabase migration (additive, non-breaking)

```sql
alter table public.runs add column
  plan jsonb,
  reflection jsonb,
  predicted_step_count int,
  actual_step_count int,
  goal_reached boolean;

create table public.walk_surprises (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs(id) on delete cascade,
  project_id text not null,
  kind text not null,
  step_index int not null,
  expected text not null,
  observed text not null,
  recovered boolean not null,
  recovery_cost_steps int,
  related_finding_id uuid references public.findings(id) on delete set null,
  created_at timestamptz not null default now()
);
create index walk_surprises_run_idx on public.walk_surprises(run_id);
create index walk_surprises_project_idx on public.walk_surprises(project_id, created_at desc);
```

### Sink change

`SupabaseSink.route` (`packages/cli/src/sinks/supabase.ts:68-131`) writes `runs.plan/reflection/...` from the payload and inserts surprises after findings (so `related_finding_id` can resolve).

---

## 4) Run detail page — best first version

Single page, server-rendered, at `/runs/[id]`. Don't ship anything beyond this list for v1:

- **Header**: flow id, persona (with category icon), dispatcher, started/finished, duration, status pill, branch + SHA, walked URL.
- **Outcome strip**: goal reached ✓/✗, predicted vs actual step count (delta arrow), finding counts by severity, surprise count.
- **Agent summary** (the existing `runs.summary` paragraph — currently written but never displayed anywhere in the dashboard).
- **Plan vs actual** table: 2 columns side-by-side. Row N expected step, row N "what actually happened" derived from surprises whose `step_index = N`, blank if no divergence. This is the most distinctive piece of the UI — it visualizes the wedge.
- **Surprises list**: chronological, with severity-ish coloring (`recovered=false` red, `recovered=true` amber). Each item links to a finding when one exists.
- **Findings list**: existing finding rows scoped to this run; clicking opens the drawer (`apps/dashboard/app/findings/drawer.tsx`).
- **Artifacts**: link to `raw_stdout_storage_key` (column already exists at `20260507000000_eval_core.sql:65`; currently nothing populates or links it — fix that or remove the column). Screenshot grid, deduped from finding_screenshots.

Don't ship: timeline scrubber, video replay, per-step screenshot capture beyond what the agent already does, cost/token breakdown. Those are nice but they're week-three problems.

---

## 5) Agent-readiness scorecard — simple but useful

The ROADMAP sketch ("critical=−3, major=−2, minor=−1, nit=−0.25; start at 10") is fine as a v1 but it's wrong in one way: it scores noise — every walk a few new nits appear and the score drifts. Adjustments:

- **Score the *open* state, not the run output.** Compute over `findings` where `status in ('new','filed')` AND `heuristic like 'agent.%'`, scoped to the most recent walk per `(flow_id, persona_id)` over the past N days. Don't sum every walk ever — that double-counts recurring findings.
- **Per-heuristic sub-scores**: each of the 10 `agent.*` heuristics gets its own 0–10 column. The overall score is the min (or a weighted average, but min is easier to defend in alpha: "your weakest heuristic *is* your readiness"). Per-heuristic visibility is what makes the score actionable — "you regressed on `agent.feedback_announced`" is a fix; "your score dropped" isn't.
- **Coverage indicator**: don't show a high score for a flow that has only been walked by one agent persona once. Show a "coverage" badge separately — "3 of 3 agent personas, last 7 days" — so a 9/10 over-thin-evidence reads as 9/10 (low-confidence).
- **Trend line**: store a `flow_agent_score_snapshots` table or compute on-the-fly from existing data. On-the-fly is fine in alpha; rows are small.

What it deliberately doesn't do: weight by traffic, factor in human findings, attempt cross-app benchmarks. Those dilute the signal.

---

## 6) Finding lifecycle

The schema already supports `new | filed | dismissed | fixed` (`20260507000000_eval_core.sql:103-104`), `first_seen_at`, `last_seen_at`, `content_hash` for dedup, and `SupabaseSink.insertFinding` already touches `last_seen_at` on a dedup hit (`packages/cli/src/sinks/supabase.ts:163-167`). What's missing:

- **UI**: in `FindingDrawer` add: Dismiss / Mark fixed / Reopen / Link GH issue / Unlink. Server actions on the dashboard, writing via `createServiceRoleSupabase()`.
- **Recurrence detection**: when a new walk produces a finding with the same `content_hash` as a row in `status='fixed'`, flip that row back to `new` and record a `regressed_at` timestamp. Add column `regressed_at timestamptz` and a `regression_count int default 0`. Surface a "🔁 returned" badge in `/findings`. This is the question users want answered: *did the fix actually fix it?*
- **History trail**: a single `finding_events` table — append-only — with `(finding_id, project_id, kind, actor, note, created_at)` where `kind in ('seen', 'dismissed', 'fixed', 'reopened', 'regressed', 'linked_issue', 'unlinked_issue', 'commented')`. Render as a timeline in the drawer. Avoids fighting Supabase realtime for live updates; trivial to query.
- **GH issue linking**: already partially wired — `findings.github_issue_url` and the `GitHubIssuesSink` exist. Add manual "Link existing issue" so a user can paste a URL post-hoc (the dedup-from-CLI path doesn't cover that case).
- **Dismissal scoping**: dismiss should set `status='dismissed'` AND insert a dedup-suppression record keyed by `content_hash` so the *next walk's* same finding doesn't immediately reappear as `new`. Right now the dedup logic in `SupabaseStore.findExistingByContentHash` only links to `filed` priors; replicate that for `dismissed`. One small column on findings: `dismissed_until timestamptz` for time-bounded dismissals ("not in alpha — revisit in 30 days").

Don't build: severity overrides, custom statuses, finding assignment to users. All Phase 3+ noise.

---

## 7) Queue / daemon visibility

The data exists: `agent_jobs` (`20260511210000_agent_jobs.sql:21-45`) with `status in (pending|claimed|running|completed|failed|cancelled)`, `daemon_heartbeats`, the green/red pill in the header. The gap is a destination page.

Ship a `/jobs` page with:

- **Online daemons** strip: each `daemon_heartbeats` row with last-seen age, claim mode, hostname, version. Red ring when `last_seen_at` > 2 min. Reuses logic from `components/daemon-status-pill.tsx:30-31`.
- **Active queue** table: jobs where `status in ('pending','claimed','running')`, with kind, requested_by, project, age, and a stale-warning flag (claimed > 10 min and still no `finished_at` = probably zombied; pending > 5 min with no daemon online = will time out).
- **Recent history**: last 50 `completed | failed | cancelled` jobs with error / result.

Two small schema additions:
- `agent_jobs.heartbeat_at timestamptz` — daemons update this while running, so the UI can show "stalled" without guessing from age alone. The walk handler subprocess (`packages/cli/src/daemon/handlers/walk.ts:53-100`) can `update agent_jobs set heartbeat_at = now()` on stdout activity.
- A `cancel` server action: `update agent_jobs set status='cancelled'` when pending; for running jobs flag a cancel request that the daemon polls. The daemon currently only listens for INSERT events (`packages/cli/src/daemon/runner.ts:55-71`), so you'd also need an UPDATE subscription or a periodic poll. Polling is fine.

Explicitly do not build: a hosted runner, cloud-side dispatch, multi-daemon load balancing, per-job logs streaming. The pull model is the right model in alpha; visibility is the missing piece, not control.

---

## 8) Safety / isolation when spawning local coding-agent sessions

This is the most important concern in the review and it's *under-handled* today. The current dispatcher (`packages/cli/src/dispatchers/claude-code-cli.ts:88-92`) spawns `claude --print --dangerously-skip-permissions <prompt>` with `cwd: input.cwd ?? process.cwd()` and `env: process.env`. That means:

- The agent inherits the operator's full shell env, including any API keys present.
- `cwd` is the consumer repo root. Without explicit tool restrictions, the agent could run Read/Grep/Bash against the source it's supposed to be evaluating black-box.
- The prompt currently *suggests* the agent reference flow files at `flow.filePath` (`packages/core/src/prompt.ts:92`) — a path *inside the project*. For a human persona that's fine context; for an agent persona it's a leak: "you're supposed to be a fresh agent with no knowledge of the codebase, but here's the project's flow spec referencing internal route IDs."
- Claude Code may load a project's CLAUDE.md, recent sessions, and MCP servers from the operator's machine. Memory and prior session context will absolutely color the walk.

Concrete mitigations (in order):

1. **Agent personas walk in a clean `cwd`** — a temp dir with no source. Pass the flow goal, entry route, target URL, and the rubric *inline in the prompt*, never as a filesystem reference. `run.ts:107-111` is where to thread this. Keep `cwd: ws.rootDir` only for human personas (and even that is questionable).
2. **`--strict-mcp-config` + minimal MCP allowlist** for agent personas. Today `--strict-mcp-config` is only set when `userDataDirPath` is provided (`dispatchers/claude-code-cli.ts:80-83`). Always set it for agent walks and ship a config that allowlists only `mcp__playwright__browser_*` tools, so the agent can't `Read`/`Grep`/`Bash` the project's source.
3. **Strip CLAUDE.md / AGENTS.md / .claude / .agent-rules** from the temp `cwd`. Equivalently, set `--no-project-context` if Claude Code supports it; if not, the empty cwd is sufficient.
4. **Env scrubbing for agent runs**: pass an explicit env subset (`PATH`, `HOME`, the `ROVE_*` and `PLAYWRIGHT_*` it needs) rather than `...process.env`. Today an `OPENAI_API_KEY` or repo-specific `DATABASE_URL` would be visible to the agent process.
5. **"You have no prior knowledge" prompt directive** for agent personas. Add to `buildAgentRubric()` (`packages/core/src/prompt.ts:203-238`): "You are a fresh agent with no access to this app's source. Do not infer behavior from filenames, URLs, or repo structure. If the only way to find an action is to read source, that itself is a finding (`agent.semantic_html` / `agent.predictable_urls`)."
6. **Document the constraint in the persona definition** (`packages/core/src/personas/built-in.ts:208-258`): explicitly state in `promptAddendum` for each agent persona, "You have not seen this app's source. You have no memory of prior visits."

Realistic-blackbox preservation requires both prompt + sandbox-level enforcement. Don't trust just the prompt — Claude Code will happily Read a file it can see, even if you asked it not to.

---

## 9) What to explicitly NOT build yet

- **PR-triggered auto-walks** (Phase E in the ROADMAP). Tempting, but until lifecycle + scorecard + isolation are solid, every PR comment is "here are 7 nits that might be noise." Wait.
- **Public marketing surface, custom domain, OSS launch.** ROADMAP already defers this — keep it deferred.
- **Per-project / per-workspace auth boundaries** (Phase F). Real customers need this; the two internal projects don't. Don't pay the RLS-rewrite cost yet.
- **Hosted runner / Rove-owned compute.** The pull-based daemon model is the right shape. A hosted runner adds billing, queue infra, sandbox security, all before the product is good.
- **Cost / budget enforcement UI.** `max_budget_usd` is already plumbed (`packages/cli/src/daemon/handlers/walk.ts:48-50`); don't add a UI for it. Reads as "ops product" rather than "UX product."
- **Visual diff / screenshot regression.** Applitools owns this and it's deterministic — the opposite of the wedge.
- **A "Rove suggests these fixes" feature.** Tempting LLM bling. The findings *are* the artifact; rewriting them as patches makes Rove a code-assistant adjacency, not a UX tool. Skip.
- **A custom heuristic authoring UI.** Heuristics live in `prompt.ts`. They should change when the team learns something, in a PR, not in the dashboard. Premature flexibility.
- **Notifications / Slack / email.** Every product builds these. Don't until at least three users say they need them.
- **Replay / video capture of walks.** Big lift, marginal value in alpha. The plan + surprises + screenshots are already a richer artifact than a video.

---

## TL;DR (initial pass)

The shortest path to a product that feels like *Rove* and not "another QA tool" is:

1. Ship the **pre-walk plan + surprise log + reflection** (§2/§3).
2. Ship the **run detail page** that shows them (§4).
3. Ship the **lifecycle + recurrence model** (§6).

Those three together create the comparison-over-time signal that nothing else in the testing market produces. Everything else — scorecard, queue visibility, PR walks — is downstream of those.

**Caveat added in the deeper pass:** these are right *if* the foundation is right. The next sections argue parts of the foundation are not, and that fixing them first changes what 1–3 should even look like.

---

# Deeper pass — bridging human and agent perception

This part of the doc is written from inside the agent. Brian asked: *"You understand how you receive information, I do not. Bridge the gap."* So this section is honest about how I actually consume a webpage, where the current Rove model imagines instead of measures, and what would actually move the product.

## 10) Where Rove is barking up the wrong tree

I'll name the four things I think are wrong, in order of how load-bearing they are. None of this invalidates the *vision* — two-sided readiness is a real, defensible category. What's wrong is the current implementation strategy underneath the vision.

### 10.1 Agent personas, as currently designed, are LLMs role-playing other LLMs

`packages/core/src/personas/built-in.ts:208-258` defines three "agent personas" — `claude_browser_agent`, `chatgpt_browser_agent`, `playwright_codegen_agent` — and `buildWalkPrompt` (`packages/core/src/prompt.ts:81-87`) injects their `promptAddendum` so the *same* Claude (the operator's local CLI) walks the app while *imagining* it's Claude computer-use, then Operator, then Playwright codegen.

This is performative simulation, not measurement. There's a 2026 paper directly relevant: *Agentic Uncertainty Reveals Agentic Overconfidence* found that frontier models predicted 73% success when actual success was 35% — agents systematically misjudge their own behavior by ~40 percentage points. So an LLM predicting what *another* LLM would struggle with on a UI is, in expectation, more wrong than right. The three agent personas in Rove today produce findings that are ~95% correlated because the same model is generating them; the persona prompt addendum is a costume, not a different brain.

Two consequences:
- **The agent findings are LLM opinions, not measurements.** "This selector is unstable" from an LLM looking at one DOM snapshot is a guess. To *know* a selector is unstable you'd render the page twice (different viewports, different states) and diff. To *know* hover-only menus break Claude-computer-use, you'd run actual Claude-computer-use and see if it gets stuck.
- **You cannot honestly differentiate the personas.** Today three "different agent runtimes" file similar findings because there's only one agent generating them. If a customer asked "does my app work for ChatGPT Operator?" the right answer requires running Operator. The current honest answer is "an LLM thinks it might struggle."

### 10.2 No success/failure measurement — the only number that actually matters

OSWorld and WebArena both score one thing: did the agent reach the goal? Claude Sonnet 4.6 hits 72.5% on OSWorld; GPT-5.4 hits 75%. That ~25% failure rate is what the industry actually cares about because it's the gap between "agents can do this" and "agents reliably do this."

Rove's pipeline (`packages/cli/src/commands/run.ts:128-151`) parses findings and writes them to a sink. It never asks the agent "did you accomplish the goal? In how many steps? What was your success criterion?" The `runs.summary` paragraph (`infra/supabase/supabase/migrations/20260507000000_eval_core.sql:64`) is free-text and not displayed anywhere in the dashboard. So the only number trending over time is finding count — which is *correlated with effort*, not *with whether the app works for agents*.

If Phase D-2's scorecard (ROADMAP) drops in without this, the score is "the LLM is less bothered today than yesterday." That isn't an agent-readiness metric — it's an agent-mood metric.

### 10.3 The agent-readiness rubric ignores the protocol layer that real agents check

The 10 `agent.*` heuristics in `prompt.ts:203-238` are all about HTML/ARIA semantics. They're sensible, but they're an *old* model of what makes a site agent-friendly. In Feb 2026 Google + Microsoft shipped the **WebMCP** community spec — `navigator.modelContext.registerTool()` — a JS API for sites to expose tool contracts directly to agents. Cloudflare's **Agent Readiness score** (blog post live) measures discoverability (`robots.txt`, `sitemap.xml`, `llms.txt`), bot access (Web Bot Auth, AI bot rules), capabilities (API catalogs, MCP server cards, agent skills indexes), and emerging commerce protocols (x402). Cloudflare's data: only 4% of sites declare AI usage preferences via Content Signals; 3.9% support Markdown content negotiation; ~10% of sites have llms.txt.

Rove measures zero of this. The agent-ready web is shifting from "can an agent click through your UI?" to "does your site expose itself to agents as a first-class consumer?" — and Rove is on the first side of that shift. The 10 heuristics are still useful for the legacy UI-driven path (which will be the majority of sites for years), but if Phase D-2 ships a scorecard that ignores WebMCP, llms.txt, and structured data, Cloudflare's free score is more relevant than Rove's paid one.

### 10.4 "Two-sided readiness" frames Rove as parallel rubrics; the actual wedge is parallel *perception*

The current framing is: humans get Nielsen/WCAG, agents get `agent.*`, file findings on both. That's a parallel-rubrics product. The interesting thing — the thing nothing else measures — is the *perception gap itself*. I (an LLM) cannot see your page's spatial hierarchy unless you encode it semantically. You (a human) cannot see what gets dropped from the accessibility tree. *That mismatch* is the unique signal Rove can capture. The current rubric design doesn't even try.

This isn't barking up the wrong tree exactly; it's barking up a shorter branch of the right tree.

## 11) The massive unlock — measure, don't opine; show the gap, don't infer it

Three things, in dependency order. If we did just the first one, Rove would already differ from every other tool in the space.

### 11.1 Show the user what the agent sees — literally

This is the cheapest, biggest unlock. Right now no one in the testing market visualizes the agent's perception. Everyone shows humans what humans already see (screenshots, DOM inspector). Nobody shows the human what the *agent* sees.

Concretely: for each step of a walk, capture *both*:
- the screenshot (what humans see), and
- the ARIA snapshot — the structured-text accessibility tree that Playwright MCP's `browser_snapshot` already returns and that *is the actual input the LLM agent reasons over*.

Render them side-by-side on the run detail page. Human on the left; agent on the right. Annotate the agent view with what's *missing* relative to the human view: visually-present elements that don't appear in the accessibility tree, elements present but unnamed, elements named ambiguously ("button" with no name vs. another "button" with no name on the same page).

That single screen is the bridge. The first time a designer sees their app's homepage rendered as an ARIA tree and notices that their hero CTA is just `button` with no accessible name — they get it. The "agent's blind spots" become inarguably visible.

Why this matters for the wedge: every other tool either tests like a human (visual, deterministic) or like a robot (DOM selectors, scripts). Rove can be the first tool that says "here is your app from the agent's seat." That's a category-defining UI, not a feature.

Implementation cost: low. Playwright MCP's `browser_snapshot` already returns the YAML-like ARIA tree. Currently Rove discards this after the agent uses it. Persist it per step into a new `run_steps` table (or as a JSONB array on `runs`). Render it. The expensive part is the side-by-side UX — that's a week of work, max.

### 11.2 Replace simulated personas with real perception modes

Stop having one LLM pretend to be three other LLMs. Instead, change *what input the LLM gets*. Define three walk modes that produce honestly different agent behavior:

- **`mode=aria-only`** — the agent gets ARIA snapshots only, no screenshots. This is the closest honest analogue to "screen-reader-class agent" or "DOM-bound agent." If something only exists in pixels, this run will fail to find it.
- **`mode=vision-only`** — the agent gets `browser_take_screenshot` only, no `browser_snapshot`. Closest analogue to OpenAI Operator / Anthropic computer-use on visual input. Will trip on anti-bot interstitials and dense UIs.
- **`mode=hybrid`** — both, current behavior. Closest to capable real-world agents.

Now you have *real* axes of variation, not costumes. The findings differ because the *input* differs. If `aria-only` fails to find the "Create job" button and `vision-only` finds it instantly, you've measured an actual `agent.accessibility_tree_completeness` violation — not opined one.

The "agent persona" abstraction at `packages/core/src/personas/built-in.ts:208-258` can stay, but reframe it: a persona's `agent_runtime` field maps to a perception mode, not a costume. `claude_computer_use` → vision-primary; `chatgpt_operator` → vision; `playwright_codegen` → DOM-primary. The dispatcher (`packages/cli/src/dispatchers/claude-code-cli.ts`) wires the right MCP tool subset based on the mode — strict-MCP-config allowlisting `browser_snapshot` only for ARIA mode, `browser_take_screenshot` + `browser_click_at_coords` only for vision mode.

This is also what enables the side-by-side visualization above. The ARIA mode IS the agent view; the vision mode IS the human view as captured by an agent. The wedge is the diff between their trajectories.

### 11.3 Measure trajectories, not opinions

Replace ~80% of the `agent.*` heuristic rubric with telemetry derived from the agent's actual tool calls during the walk. The dispatcher already captures stdout (`packages/cli/src/dispatchers/claude-code-cli.ts:100-105`). Parse the tool call sequence and compute:

| Metric | What it measures | Maps to which heuristic |
| --- | --- | --- |
| `goal_reached` | did the agent declare success? | the only number that matters |
| `actual_steps` | tool calls made | trajectory efficiency |
| `snapshots_per_action` | how many `browser_snapshot`s per `browser_click` | poor `accessibility_tree_completeness` if high |
| `selector_retries` | clicks that elicited no expected state change, followed by re-snapshot+re-click | poor `stable_selectors` |
| `state_inference_lag` | tool calls between an action and the agent confirming the resulting state | poor `feedback_announced` |
| `dead_clicks` | clicks producing no DOM change (per pre/post snapshot diff) | `visual_only_state` |
| `recovery_count` | backtracks (navigate-back, undo) | overall flow friction |
| `time_to_first_meaningful_action` | wall time from page load to first non-snapshot tool call | discoverability cost |

These are numbers. They trend cleanly. They explain *why* the score moved. They are the OSWorld/WebArena school of measurement, applied to a single app under test rather than a leaderboard.

The existing `agent.*` heuristics don't disappear — they become *labels* a finding can carry. The agent's free-text findings still arrive via JSON. But the *score* is the telemetry, not the find-count. Findings explain; metrics decide.

Concrete schema (extends the v1 in §3):

```sql
create table public.run_steps (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid not null references public.runs(id) on delete cascade,
  project_id      text not null,
  step_index      int not null,
  -- The tool call the agent made at this step.
  tool_name       text not null,         -- 'browser_snapshot' | 'browser_click' | ...
  tool_args       jsonb,
  -- Captured environment at this step.
  aria_snapshot   text,                  -- the YAML ARIA tree returned by browser_snapshot
  screenshot_key  text,                  -- storage key when a screenshot was captured
  url_after       text,
  duration_ms     int not null,
  -- Derived classifiers (filled by post-walk analyzer, not the agent).
  classified_as   text,                  -- 'productive' | 'retry' | 'recovery' | 'dead_click'
  created_at      timestamptz not null default now()
);
create index run_steps_run_idx on public.run_steps(run_id, step_index);

-- Per-run aggregates so the dashboard doesn't recompute every page load.
alter table public.runs add column metrics jsonb;
-- shape: { goal_reached, actual_steps, snapshots_per_action,
--          selector_retries, state_inference_lag_p50_ms, dead_clicks,
--          recovery_count, time_to_first_meaningful_action_ms,
--          mode: 'aria-only'|'vision-only'|'hybrid' }
```

### 11.4 Use adversarial framing for any LLM judgment that remains

For the parts of the walk where an LLM still has to make a call (the post-walk reflection in §2; surprise classification; "explain why this finding matters"), use *adversarial framing*. The same 2026 paper found this improved calibration of frontier models by 28–35%. Practically: don't ask "did the walk go well?" or "rate your confidence." Ask "search this trajectory for places this app would break for a different agent. Find the failure modes. Rank by likelihood." The agent's own confidence is uninformative; its bug-finding pose is. Update the rubric blocks in `packages/core/src/prompt.ts:186-238` to be phrased as bug-hunts, not assessments.

## 12) The protocol-layer scanner — cheap, immediately competitive

Independent of the trajectory work above, ship a static scanner that fetches the target URL and scores the agent-protocol surface. This is hours-of-work cheap and directly answers the question Cloudflare is currently the only one answering well.

Checks (mostly HTTP fetches + small parsers):

1. `/robots.txt` present, has AI-agent-specific directives (`User-agent: GPTBot`, etc.) — flag aggressive blocks.
2. `/sitemap.xml` present and parseable.
3. `/llms.txt` present, parseable, links resolve. Same for `/llms-full.txt`.
4. `Content-Type` negotiation: does `Accept: text/markdown` get a Markdown response on key routes?
5. **Schema.org / JSON-LD** structured data present on the homepage and key routes (`Organization`, `WebSite`, `BreadcrumbList`, route-appropriate types). Use a JSON-LD parser; check schema validity.
6. **OpenGraph + meta description** completeness (overlaps with the existing `agent.titles_and_meta` heuristic but turn it into a measurement, not an opinion).
7. **WebMCP discovery**: detect `navigator.modelContext.registerTool` usage. Hard to do statically (it's runtime JS); a heuristic is "does this page load any script that imports a `model-context` shim?" Mark as future-work for now; the spec is still preview.
8. **MCP server cards** (`/.well-known/mcp.json` or similar) — emerging convention; check the well-known path.
9. **AI bot auth signals**: Cloudflare's Web Bot Auth headers if present.
10. **Open API discoverability**: `/openapi.json`, `/swagger.json`, `/.well-known/api-catalog`.

Score each as pass/fail/n-a, surface in a new `/protocol` tab on the flow detail page or as a per-route view. This is the layer Cloudflare scores at scale — Rove scores it *per flow* and ties failures to *measured* trajectory friction. That ties §11.3 and §12 together: "your llms.txt is missing AND your hybrid agent walks take 2.3× as many tool calls as the baseline" is a story Cloudflare can't tell.

Implementation: a new sink (`packages/cli/src/sinks/protocol.ts`) or a pre-walk step that runs alongside the dispatcher. Stores into a new `protocol_checks` table. Maybe 200 lines including tests.

## 13) Revised priority order _(SUPERSEDED by §0)_

If you only had four engineer-weeks before you next showed Rove to anyone outside the team, my ranked sequence becomes:

1. **Run detail page that shows ARIA-snapshot-per-step alongside screenshots** (§11.1). The unique visualization. Hardest single piece is the layout; the data is already in stdout, just discarded. This is the demo moment.
2. **`run_steps` table + trajectory parser** (§11.3). Persist what the agent actually did. From it, derive `goal_reached`, `actual_steps`, `dead_clicks`. Even *without* the side-by-side viz, having goal-reached as a trended number changes the product's center of gravity from "find count" to "agent succeeds."
3. **Perception-mode walks** (§11.2). Replace persona costumes with `mode=aria-only` vs `mode=vision-only`. This is what makes the side-by-side comparison meaningful. Strictly speaking #3 enables #1; doing them together is fine.
4. **Pre-walk plan + surprises + reflection** (the original §2–§3) — *but* phrased adversarially (§11.4). Still high-value, especially the plan-vs-actual diff. Drops the original §2's "rate your confidence 0–1" — that's the uninformative signal the calibration paper specifically flagged.
5. **Protocol-layer scanner** (§12). Maybe a week. Immediately re-positions Rove against Cloudflare's Agent Readiness as the deeper, per-flow version.
6. **Lifecycle / recurrence** (original §6). Still valuable but only useful if findings are honest measurements (#1–#3) rather than performative ones — otherwise you're tracking the recurrence of LLM moods.
7. **Scorecard** (original §5). Don't ship until #1–#5 are in. With telemetry-driven scoring it becomes a real metric instead of a heuristic count.
8. **Queue/daemon visibility** (original §7). Tactical; ship whenever.
9. **Walk isolation hardening** (original §8). Still required; the §11.2 perception-mode work touches `--strict-mcp-config` anyway.

The original §1–§9 advice isn't wrong, it's just *downstream of having a real measurement layer*. Build the measurement layer first.

## 14) On the vision itself

The vision — "two-sided readiness, the agent-readable web is real, no one else owns this framing" — is correct and defensible. The vision is *not* the problem. The problem is that the current implementation expresses the vision through LLM role-play, which is the cheapest way to ship something that *looks like* the vision but cannot empirically defend itself. The shift the deeper pass argues for is: **stop expressing the vision through opinions; express it through measurements you couldn't fake if you tried.**

The phrase Brian used was the right one: bridge the gap between human and agent perception. The bridge is not a clever rubric. The bridge is two side-by-side renderings of the same app — one in pixels, one in ARIA — with the agent's actual click trail superimposed on both. That is the screen no one else is building. Build that.

---

## 15) The other half of the wedge — agents AS UX subjects, not just agents as test targets

The earlier §10–§14 over-indexed on one half of "two-sided readiness": *can agents use your app?* That half is real and worth measuring. But it shadowed the half that's arguably the bigger commercial story and the more defensible category: **using agents as non-deterministic UX subjects to find flow-level failures that scripted tests cannot.** Brian's correction is the right one and this section is the revision.

### 15.1 What scripted tests can't see, and what agents can

A team can have 100% Playwright pass-rate on an app where every button works, every page renders, every form submits 200 — and the actual user goal is unreachable because the navigation is a maze, or because submitting the form bounces you to a list that doesn't contain what you just created, or because the success state is invisible (no toast, no focus shift, no URL change), so the user keeps clicking thinking nothing happened. None of that is detectable by an assertion-based framework. Playwright will tell you `await page.click('button[name=Submit]')` worked; it will not tell you the user can't tell whether anything was created.

The actual gap in the testing market: **goal-oriented, non-deterministic usability evaluation at CI speed.** Real usability research catches these things, but it costs $50k and three weeks. Deterministic E2E tests catch none of these. The middle is empty, and an LLM walking a flow as a "novice first-time user" trying to *accomplish a goal* fills it directly.

That's the actual product. The agent-readiness rubric is one feature; agents-as-usability-subjects is the platform.

### 15.2 What the navigation-maze example reveals

Brian's example — buttons that go page → page → page → back, all individually working, none of which gets you to the goal — exposes that the existing Rove rubric (Nielsen, WCAG, ISO + `agent.*`) is *page-local*. Nielsen heuristics evaluate one screen at a time. WCAG checks contrast and labels. The maze is a *flow-level* failure, invisible at the page level. Every page passes; the journey fails.

What measures that? The same trajectory telemetry I proposed for the agent half (§11.3), but reinterpreted for the human-persona case:

- **`goal_reached = false` with `findings_count = 0`** is the maze signature. Every page is fine; the user never arrives. This is the *single most diagnostic* signal Rove could produce and it requires only that we ask the agent "did you accomplish the goal?" at the end of the walk.
- **`actual_steps >> expected_steps`** is the "I'm wandering" signal. The pre-walk plan from the original §2 — "I expect this to take 4 clicks" — vs. the actual 14-click trajectory exposes the maze even when the agent eventually arrives.
- **`recovery_count`** (navigate-back, undo, retry) measures user frustration. A novice persona that hit "back" 5 times during a single flow is filing a usability finding without needing words.
- **`dead_clicks`** (click → no observable state change) measures Brian's exact case: buttons that "work" but produce no feedback the user can perceive. This is the most common real usability bug nobody's testing for.

The §11.3 metrics table is therefore the *unification point* of the two-sided wedge — the same numbers measure *agent friction* when the persona is an agent and *human confusion* when the persona is a human stand-in. Same telemetry pipeline; different interpretation. That's the architecturally satisfying version of "two-sided readiness."

### 15.3 What §10 got partially wrong

Section 10.1 argued that LLM persona simulation is performative and epistemically suspect. That critique holds for the *agent* personas (Claude predicting Claude-computer-use — comparing one unknown to another), but it overreaches for the *human* personas. Heuristic walkthrough by domain experts pretending to be users is a 30-year-old, accepted usability research method. An LLM playing "novice first-time user" is the cheap, scalable continuation of that lineage. It is *also* simulation, but it's simulation against a well-understood human-side baseline — not LLM-on-LLM introspection.

So the corrected position is:
- **Agent personas** (where the simulator and the simulated are both LLMs): replace simulation with measurement. Run real perception modes, real agent runtimes; the LLM's opinion of another LLM isn't load-bearing. (§11.1–§11.3 still holds.)
- **Human personas** (where an LLM plays a confused human): simulation is appropriate *and* unique to Rove. Real human usability testing is too expensive to do every PR; Playwright tests can't reproduce confusion; LLM personas plausibly bridge that gap. (Validation comes from measurable trajectory signals, not from heuristic-violation count.)

The honest reframe of §10.1: simulation isn't the problem; using simulated outputs as the *only* signal is. Pair the LLM personas with trajectory telemetry and the simulation becomes evidence rather than opinion.

### 15.4 What changes in the rubric

The human-persona rubric block (`packages/core/src/prompt.ts:186-194`) is too page-local. It's Nielsen/WCAG/ISO — all single-screen heuristics. Add a *flow-level* category that maps to the failure modes scripted tests can't catch:

- **`flow.goal_unreachable`** — the agent could not accomplish the stated goal within the budget, despite every individual page rendering and every button working.
- **`flow.invisible_success`** — the agent submitted/completed an action but could not verify success from the UI (no toast, no URL change, no focus shift, no new record visible in a list).
- **`flow.navigation_maze`** — the agent's path was significantly longer than its pre-walk expectation, and most extra steps were exploratory navigation (page-A → page-B → back → page-C → back).
- **`flow.dead_end_recovery`** — the agent reached a state where the next correct action was not obvious, and either guessed wrong or backtracked.
- **`flow.path_inconsistency`** — the path required to accomplish the goal contradicted the entry-route context (clicked "Create job" → ended on a settings page).
- **`flow.affordance_camouflage`** — the primary action for the goal was visually de-emphasized relative to non-primary actions (a finding the agent can articulate but only when comparing the expected first action vs. what visually presented as primary).

These aren't novel heuristics — they're old usability sins. The novelty is *measuring them by walking, not by inspecting*. Each maps to one or more telemetry signals from §11.3, so a `flow.goal_unreachable` finding is auto-attached when `goal_reached=false`, and a `flow.invisible_success` is auto-promoted when `state_inference_lag` exceeds N seconds (or when the agent emits a surprise of kind `expectation_mismatch` after a "submit"-class action).

### 15.5 The differentiated demo, recast

The single screen that proves Rove's category — both halves — is now:

> A flow detail page where I can see, in one view, that `flow.checkout.add_card` has been walked 6 times today by 6 personas, and the novice end-user took 14 clicks (predicted 5) and gave up at step 12, the mobile field tech reached the goal in 7 but with 3 dead-clicks, the Claude-computer-use agent reached the goal in 4 but had to take 11 ARIA snapshots between actions (suggesting the a11y tree is incomplete), and the keyboard-only user hit a focus trap on the modal close button. Below that: the timeline of each walk, with the ARIA-tree side-by-side with the screenshot at every step.

Nothing else in the testing market produces that screen. Playwright doesn't (single deterministic path). Applitools doesn't (visual diff, no goals). Cloudflare doesn't (static protocol score, no flows). Usability research doesn't (annual, slow, expensive). UserTesting.com doesn't (humans, not agents, no agent-side coverage). That screen *is* the product.

### 15.6 Re-revised priority order _(SUPERSEDED by §0)_

With both halves of the wedge in view, priorities sharpen:

1. **`goal_reached` on every walk + pre-walk plan + post-walk reflection** (combines original §2 with §11.3's success-as-the-metric insight). One field on the JSON output, one new column on `runs`, one line on the dashboard. Day-one work. Without this, the navigation-maze problem stays invisible no matter what else ships.
2. **`run_steps` table + trajectory parser** (§11.3, unchanged). Persist what the persona — human OR agent — actually did. Derive `actual_steps`, `dead_clicks`, `recovery_count`. These power both halves.
3. **Flow-level finding categories** (§15.4). One prompt update, one heuristic-set extension. Turns the rubric from page-local to flow-level — closes the navigation-maze gap directly.
4. **Run detail page with side-by-side ARIA + screenshot per step** (§11.1, still the demo moment, but now framed as showing the *trajectory* including human-persona dead-clicks, not just agent perception). The single-screen pitch in §15.5 is built here.
5. **Perception-mode walks** (§11.2). Replace agent persona costumes with `mode=aria-only` vs `mode=vision-only`. Becomes the diagnostic for *why* an agent persona failed where a human persona succeeded.
6. **Adversarial-framed reflection** (§11.4). Replaces "rate your confidence" with "find the failure modes" — calibration research is clear this is the better prompt regardless of human or agent persona.
7. **Protocol-layer scanner** (§12). Still cheap, still differentiates against Cloudflare. Now lower priority than the human-UX trajectory work because the trajectory work is the bigger commercial wedge.
8. **Lifecycle / recurrence** (original §6). Same as before; valuable once findings are measurements, not opinions.
9. **Scorecard** (original §5). Now scores *both* `agent_readiness` (telemetry-driven) and `human_usability` (goal-reached × steps-over-budget × dead-clicks × recovery-count). Two scores per flow. Both fall out of the same `run_steps` data.
10. **Queue/daemon visibility** (original §7). Tactical.
11. **Isolation hardening** (original §8). Still required.

### 15.7 The corrected one-liner for what Rove is

Not "an agentic UX evaluation platform for the agent-readable web." That's accurate but it leads people to think "agent-readiness" is the whole pitch. A sharper version:

> **Rove uses LLMs to walk your app as the users you'd otherwise pay for — confused novices, mobile thumbs, screen-reader users, *and* the AI agents that will increasingly act on their behalf. It measures whether each of them can actually accomplish their goal, where they got stuck, and what they noticed. Findings are the qualitative part; trajectories are the quantitative part. PR automation comes later, after on-demand reviews are trustworthy.**

The "both halves of the wedge" is in there: every persona is a goal-pursuing subject; agents are one *category* of persona, not the whole point. That framing scales — every time a new agent runtime ships (Operator, Claude-for-Chrome, browser-use), it's a new persona category, not a product pivot.

---

## 16) The app-development gap — independent review, not self-authored tests

The strongest app-development use case is not "can an agent generate Playwright tests?" It is the opposite: **can an independent evaluator catch the places where the builder agent's interpretation of the product was wrong?**

A coding agent can build a new route, wire it to exactly the place it inferred it should go, then write a test that proves that interpretation works. The test passes because the test and implementation share the same mistaken mental model. That catches code consistency, not product correctness.

Rove's job in app development should be:

- Builder agent: implements the requested feature.
- Unit/E2E tests: prove code-level behavior and expected assertions.
- Rove evaluator: walks the app as a goal-seeking user or agent and asks whether the result matches the product's navigational, visual, and workflow expectations.

That is a different class of review. Rove should not ask "does this route render?" It should ask:

> Given the goal, where would a real user expect this to live, what would they expect to happen next, and did the app violate that expectation?

### 16.1 Change Review Walk

Add a dedicated walk mode for new or changed UI:

```yaml
kind: change_review
goal: "Create a new client"
changed_routes:
  - "/clients/new"
reference_routes:
  - "/clients"
  - "/clients/:id"
  - "/dashboard"
persona_id: "first_time_internal_user"
```

The evaluator first inspects the reference routes, then evaluates the changed route. This is not visual regression and not pixel diff. It is product coherence review.

The output should answer:

- Can the persona accomplish the stated goal?
- Did the changed route appear where the persona expected it?
- Did the route send the persona somewhere surprising?
- Did success produce an observable confirmation?
- Did the page fit the app's existing layout, density, copy, and interaction patterns?
- Did the primary action look primary?
- Did the page introduce a style or workflow pattern that feels generated rather than native to the product?

### 16.2 Local Design Contract

Before judging a new page, Rove should infer a small "local design contract" from nearby pages. This gives the evaluator product context without reading source code or hard-coding a design system.

Example contract:

```json
{
  "section": "clients",
  "reference_routes": ["/clients", "/clients/:id"],
  "expected_navigation": ["Clients", "New client", "Client detail"],
  "layout_pattern": "app shell with left nav, compact page header, content below",
  "primary_action_pattern": "top-right filled button",
  "form_pattern": "labeled inputs in compact vertical groups",
  "success_pattern": "toast plus redirect to created record or visible new list row",
  "tone": "plain operational copy",
  "density": "dashboard-dense, not marketing-spacious"
}
```

Then the changed route is evaluated against that contract:

```json
{
  "route": "/clients/new",
  "deltas": [
    {
      "kind": "navigation_mismatch",
      "expected": "Client creation reachable from Clients",
      "observed": "The route was only discoverable through Settings > Accounts"
    },
    {
      "kind": "design_incoherence",
      "expected": "Compact app-shell form matching existing client pages",
      "observed": "Centered marketing-style card with oversized hero text"
    },
    {
      "kind": "invisible_success",
      "expected": "Toast or redirect to created client",
      "observed": "Submit returned to the list with no visible confirmation"
    }
  ]
}
```

### 16.3 New finding categories for change review

Add these alongside the flow-level categories in §15.4:

- **`change.navigation_mismatch`** — the new route/action is reachable, but not from where users would expect based on the surrounding product.
- **`change.intent_mismatch`** — the implementation satisfies a plausible interpretation of the request, but not the product/user intent implied by the flow.
- **`change.design_incoherence`** — the page's layout, density, hierarchy, or component choices diverge from nearby product surfaces.
- **`change.pattern_drift`** — the page introduces a new interaction pattern where the app already has a clear local convention.
- **`change.primary_action_confusion`** — the main action exists but is visually or semantically subordinate to lower-priority actions.
- **`change.copy_mismatch`** — labels or terminology diverge from the surrounding product vocabulary.

These should be findings only when they materially affect comprehension, goal completion, or product coherence. A new page may be visually different and still better; Rove should report the delta and the likely impact, not enforce sameness for its own sake.

### 16.4 Why this matters

This is the missing reviewer in agentic app development. A builder agent can make code and tests agree with each other. Rove should make the product prove itself to an independent goal-seeking subject.

The key artifact is:

> "The route works, and the generated test passes, but a first-time internal user expected client creation under Clients, not Settings. The page also breaks the local form pattern, hides the save action below the fold, and provides no observable success confirmation."

That finding cannot come from unit tests. It cannot come from a selector-level E2E test unless a human already knew the failure. It comes from walking the product as a user with expectations.

### 16.5 Priority impact _(SUPERSEDED by §0)_

This changes the near-term plan slightly:

1. **Clean-room walk isolation** — the reviewer must not share the builder agent's source context or prior session memory.
2. **`goal_reached` + pre-walk expectation + post-walk reflection** — needed to detect the builder/test shared-interpretation problem.
3. **Change Review Walk v1** — reference routes, local design contract, changed route evaluation, and coherence deltas.
4. **`run_steps` table + trajectory parser** — turns the change review from opinion into measured path, recovery, and dead-click data.
5. **Run detail page** — shows goal, expected path, actual path, design contract, deltas, screenshots, and ARIA snapshots.
6. **Flow/change-level finding categories** — `flow.*` and `change.*`.
7. **Lifecycle / recurrence**.
8. **Scorecard**.
9. **Queue/daemon visibility**.

Automated PR comments should still wait. First make on-demand change review credible, then wire it into PRs.

---

## 17) UX/UI discipline — don't let the dashboard regress under a measurement plan

Honest read of the plan above: most items specify *data shapes* (schemas, prompt blocks, telemetry fields) and only sketch *user surfaces*. For a product that exists to catch UX failures, that's the highest-stakes place to skimp. Cobbler's children is a credibility problem here, not a stylistic one — every prospect will, fairly, judge Rove by how Rove's own dashboard feels.

### 17.1 Standing rule

**Every item in §0 gets a UI sketch before engineering starts.** Even a five-line markdown wireframe ("hero row: ✓ goal reached · 7 steps (predicted 5) · 1 dead-click · 0 findings; below: timeline component") is enough to force the question "what does the user see?" before "what does the database look like?" Without that step, the dashboard accretes data dumps instead of designed surfaces.

The existing dashboard conventions are already in `.claude/rules/dashboard.md` and `apps/dashboard/app/globals.css` — brand gradient (`--color-brand-cyan` / `--color-brand-navy`), `.surface` panel pattern, severity color tokens, page-header eyebrow + title + description, `FilterChip` and `EmptyState` from `components/page-header.tsx`. New surfaces extend these, never invent a parallel system.

### 17.2 Dogfood rule — Rove walks Rove

Every PR to `apps/dashboard/` runs the change-review walk against the Vercel preview deployment, using a `first_time_internal_user` persona, before merge. If Rove cannot produce a useful finding on its own UI changes, the product is not ready to sell to anyone else. This is the cheapest, sharpest quality bar available and it doubles as a marketing artifact ("here's Rove's change-review report on its own dashboard PR").

Operationally: a single GitHub Action that calls `rove run --kind change_review --target-url $VERCEL_PREVIEW_URL` and posts the result as a PR comment. Don't auto-block merge yet; just surface.

### 17.3 Per-item UX shape notes (anchored to §0's execution order)

Numbered to match the canonical table in §0.

1. **`goal_reached`** — not just a column. On `/runs`, a prominent ✓/✗ icon with success-rate context ("7 of 9 walks reached goal this week"). On the run detail hero, a single oversized status line ("Goal reached in 7 of an expected 5 steps."). On `/flows/[id]`, a sparkline trending goal-reached-% over time alongside the existing finding-count trend.

2. **Pre-walk plan + reflection** — this is the differentiated UI moment, not a JSON pretty-printer. A two-column timeline: *expected step N* on the left, *actual step N* on the right, joined with a connector colored green (match) / amber (diverged but recovered) / red (diverged, did not recover). Surprises pin to the right column at their step index. Sketch it out before writing the schema queries; the data layout follows from the UI.

3. **Clean-room walk isolation** — no UI surface; infra only. Skip.

4. **Tool-call telemetry + `run_steps`** — the highest-risk surface to get wrong. The trap is "render the 200-row tool-call table." The right shape is a vertical timeline: one row per *agent action* (not per tool call), with the ARIA snapshot expandable in-line, the screenshot inline-thumb, the URL on the right edge, dead-clicks and retries badged. Aggregate metrics (snapshots-per-action, total dead clicks, recovery count) sit in a header strip; details collapse below. Build the timeline component once; reuse for both walk types.

5. **Change-review walk** — split-pane: left = local design contract (compact JSON with "inferred from /clients, /clients/:id" pill), right = the changed route's evaluation (delta list grouped by `change.*` kind, each delta with expected/observed/why-it-matters). Above both, an inline image strip showing reference-route thumbnails next to the changed-route thumbnail so the coherence story is visual, not just textual.

6. **Run detail page** — the demo screen (§15.5). Three regions: (a) hero with goal/persona/step-budget/outcome, (b) the plan-vs-actual timeline from #2, (c) findings list scoped to this run using the existing `FindingDrawer`. Per-step expansion exposes the screenshot + ARIA tree side-by-side from #4. One page, scrolls vertically; no tabs.

7. **`flow.*` / `change.*` categories** — affects the existing `/findings` table and drawer. Each new category gets an icon and a one-line description shown in the filter chip and the drawer. The drawer for a `flow.goal_unreachable` finding shows the full trajectory inline, not just title + description — because the trajectory *is* the evidence for that category of finding.

8. **Lifecycle + recurrence** — already partially designed in original §6. Add: status pills are clickable + change-state in place (Dismiss / Fixed / Reopen). History trail renders as a vertical timeline below the finding description, not a separate tab. A "🔁 returned" badge is loud and red on the row.

9. **Dual scorecard** — resist the temptation to render two big gauges. Each flow card on `/flows` gets two small score chips (`🧑 7.2` / `🤖 8.5`), each linking to its own per-heuristic breakdown. The breakdown view is a single column of sub-scores with their measured backing signals listed beneath ("`agent.feedback_announced` — 6.0 — based on 4 dead-clicks across 3 walks"). Score with provenance, not score in isolation.

10. **Protocol scanner** — new tab on the run detail page or a per-target view at `/protocol`. Tabular: check name, pass/fail/n-a, what was found, remedy. Keep it boring; the surface is meant to be a reference, not a hero.

11. **Queue/daemon visibility (`/jobs`)** — three vertical strips: online daemons, active queue, recent history. Stale-job warnings as banner. Don't over-design; this is an ops page, not a hero.

### 17.4 Process commitments

- **Before engineering item N**, drop a markdown wireframe in `docs/ui/<item>.md`. Five lines is enough. PR review checks it exists.
- **Every new dashboard surface** uses the existing `.surface` / brand-gradient / `PageHeader` / `EmptyState` / `FilterChip` primitives. New primitives only land via a separate "design system extension" PR, not slipped into a feature PR.
- **No exposed JSON-as-UI.** If a piece of data is going on the dashboard, it has a real component, not `<pre>{JSON.stringify(...)}</pre>`.
- **Rove walks Rove on every dashboard PR** (per §17.2). Don't merge UI changes that Rove flags without an explicit acknowledge-and-ignore in the PR.

### 17.5 The cobbler's children honesty

If, three months from now, a prospect demos Rove and the dashboard itself has a `flow.invisible_success` (submit a flow, no toast, no confirmation), a `change.primary_action_camouflage` (the "Run walk" button is buried), or a `flow.goal_unreachable` (you can't tell from the home screen how to start), the demo is over. Apply Rove to itself, and never ship a measurement surface without designing the surface first.

---

## Sources used in the deeper pass

- [Cloudflare — Introducing the Agent Readiness score](https://blog.cloudflare.com/agent-readiness/) — protocol-layer scoring model and adoption statistics.
- [Agentic Uncertainty Reveals Agentic Overconfidence (arXiv 2602.06948)](https://arxiv.org/html/2602.06948) — calibration measurements on frontier models; adversarial framing technique.
- [How AI Agents Actually See the Web — Medium / Pavel.automation](https://medium.com/@pavel.automation/how-ai-agents-actually-see-the-web-ab139f60a58d) — perception modes and failure surfaces (vision vs ARIA vs hybrid).
- [WebMCP draft spec (webmachinelearning.github.io)](https://webmachinelearning.github.io/webmcp/) — `navigator.modelContext.registerTool` API; tool contracts as the agent-ready web layer.
- [Google AI introduces WebMCP — MarkTechPost coverage](https://www.marktechpost.com/2026/02/14/google-ai-introduces-the-webmcp-to-enable-direct-and-structured-website-interactions-for-new-ai-agents/) — Feb 2026 announcement, Google + Microsoft co-development.
- [WebArena Verified (OpenReview)](https://openreview.net/forum?id=CSIo4D7xBG) — task-success-as-evaluation philosophy and benchmark-design pitfalls.
- [OSWorld benchmark results 2026 — Coasty](https://coasty.ai/blog/osworld-benchmark-results-2026-computer-use-ranked) — Claude Sonnet 4.6 at 72.5% and GPT-5.4 at 75% success on real-world agent tasks.
- [llms.txt explained May 2026 — Codersera](https://codersera.com/blog/llms-txt-complete-guide-2026/) — current adoption (~10% of sites) and the protocol's actual reach.
- [browser-use library — telemetry docs](https://docs.browser-use.com/development/monitoring/telemetry) — a real open-source agent runtime with PostHog telemetry; viable to plug into Rove for honest agent runs.
- [LangChain — Trajectory evals](https://docs.langchain.com/langsmith/trajectory-evals) — the industry-standard frame for evaluating sequences of agent tool calls.
