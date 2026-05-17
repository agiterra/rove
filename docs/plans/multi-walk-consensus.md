# Multi-walk consensus

**Status:** Plan, awaiting Codex review (2026-05-16).
**Owner:** Alex (Brian's agent).
**Why this exists now:** Today's nine-bug walker-pipeline session (alpha.29 → alpha.37) hardened individual walks, but every single walk is still a roll of the dice. Run 1 of alpha.33 emitted schema-invalid severity and lost the walk. Run 1 of alpha.37 had Sonnet exit silently mid-stream. Walks that worked produced 4 findings each — but ask "is `change.copy_mismatch` on the headline a real bug or one model's bad day?" and we have no way to answer. The CLAUDE.md notes have flagged this for a while: *"Single-walk findings are noisy. Multi-walk consensus is a BACKLOG idea."* It's time.

This plan moves Rove from "Sonnet's opinion on this walk" to "the intersection of N walks' opinions" — the trust substrate every reviewer of Rove's output has implicitly been asking for.

## 1. The Rove premise (so the reviewer reads the plan in the right frame)

Rove is an **agentic UX evaluation platform for the agent-readable web**. It walks a web app as both **human personas** (Nielsen / WCAG 2.2 AA / ISO 9241-110) and **agent personas** (`agent.*` heuristics — semantic HTML, stable selectors, a11y-tree completeness, captcha friendliness, predictable URLs, …). It files **findings**, not pass/fail assertions.

Two assertions Rove is making about the world:

1. **The deterministic-testing market is well-served and ill-suited to what's coming.** Playwright covers script-driven coverage, Applitools covers pixel diff, Cypress covers happy-path integration. None of them answer the question a real user — human OR agent — would ask: "can I actually do the thing I came here to do on this page, without help?" That question is fundamentally non-deterministic. Two humans (or two agents) approach the same flow with different mental models. The right tool for it is non-deterministic too.

2. **The agent half is structurally new and unfilled.** AI agents (Claude computer-use, ChatGPT Operator, browser-use, etc.) will increasingly transact on user behalf. Today's apps were built for humans only. The set of patterns that confuse an agent overlaps with but is not equal to the set that confuses a human: a CSS `hover` revealing a critical menu is fine for a human, invisible to a screen reader, and unreachable for many computer-use agents. An empty `role=alert` element is invisible to a sighted user, screams to a screen reader, and confuses an agent's a11y-tree parsing. Nobody owns the framing "is your app usable by AI agents AND humans?" — Rove's wedge is that framing made operational.

The current product surface (alpha.37):
- CLI runs walks (`rove run` and `rove change-review`), authed via a persistent Chromium profile auto-minted when stale.
- Findings land in Supabase via the supabase sink — `findings`, `finding_screenshots`, `run_steps`, plus a `runs_with_status` view that derives effective status from a heartbeat column.
- The Next.js dashboard (`rove-agiterra.vercel.app`) shows runs, findings, project-wide negative-space rollups, and per-flow / per-run detail. Public read-only "preview" pages exist for agent-walkable visibility.
- The walker dogfoods itself: every meaningful UI change against Rove is followed by a `rove change-review` of Rove. That's the canonical proof the system works — Rove finds real problems in its own dashboard.

What's missing: **a way to tell signal from noise.** Today every finding has equal weight on the dashboard. A model hallucination weighs the same as a thing five consecutive walks all flagged.

## 2. What consensus does

Consensus reframes a finding's confidence as a function of agreement across independent runs, not a function of any single run's authority.

The shape:

- A **consensus group** is N walks of the same flow + persona against the same target URL, dispatched in one CLI invocation.
- Each walk runs independently (full clean-room dispatcher, fresh prompt, no shared state with peers). The agent has no idea other walks exist.
- All N walks tag their `runs.consensus_id` with a shared UUID and their `runs.consensus_n` with the group size.
- After all N complete (or time out), `findings.consensus_count` for each unique `content_hash` is set to the number of walks within the group that filed it.
- The dashboard's `/findings`, `/runs/[id]`, and `/projects/[id]/gaps` views gain a "min consensus" filter chip — default `≥ 2 of N`, so a single noisy walk doesn't pollute the canonical view.

Concretely: run 3 walks of `dashboard.find_and_delete_run` with `first_time_user`. Walk 1 files 5 findings, walk 2 files 3, walk 3 files 4. After consensus aggregation: 2 findings have `consensus_count = 3` (filed by all three walks — high signal), 3 have `consensus_count = 2`, 4 have `consensus_count = 1` (one walk only — low signal). The dashboard chip filters out the `= 1` bucket by default. The customer sees a tight list of things at least two independent walks agreed on, ranked by severity within that.

The substrate already supports this:
- `content_hash` on findings is the dedup primitive (Phase 8). The hash includes `flow_id + heuristic + title-normalized + step_index`. Same finding from different walks → same hash, regardless of agent prose.
- `findings.first_seen_at` / `last_seen_at` are already tracked for lifecycle (silenced/filed/fixed).
- The dashboard's `/findings` page already groups visually by content_hash for the "is this still happening?" view.

Consensus is the missing aggregation column on top of that.

## 3. Plan — concrete shape

### 3a. Schema (one migration)

```sql
-- 20260517000000_consensus.sql
alter table public.runs
  add column if not exists consensus_id uuid,
  add column if not exists consensus_n int;

create index if not exists runs_consensus_id_idx
  on public.runs (consensus_id)
  where consensus_id is not null;

alter table public.findings
  add column if not exists consensus_count int not null default 1;

create index if not exists findings_content_hash_consensus_idx
  on public.findings (project_id, content_hash, consensus_count desc);

comment on column public.runs.consensus_id is
  'Shared UUID tying together the N runs in a consensus group. NULL on stand-alone walks.';
comment on column public.findings.consensus_count is
  'Number of runs in this finding''s consensus group that filed the same content_hash. 1 = this run alone. The dashboard filters consensus_count >= 2 by default.';
```

### 3b. CLI — new command

```
rove run-consensus
  --flow <id>
  --persona <id>
  --n <int default 3>
  --target-url <url>
  --max-budget-usd <n>      # per-walk cap
  --timeout-seconds <n>     # per-walk timeout
  --sinks <ids>             # same as `rove run`
  --no-auth | --auth-agent  # same as `rove run`
```

Behavior:

1. Mint a `consensus_id` UUID.
2. Dispatch N walks in parallel via `Promise.allSettled`. Each gets a unique `run_id` but the shared `consensus_id` + `consensus_n`.
3. Sinks run per-walk as today (writes findings, screenshots, run_steps).
4. After all N settle, run a one-shot post-aggregation pass:
   - For every unique `content_hash` in the group, update `findings.consensus_count` for every row in the group with that hash.
   - This is a single SQL call per `consensus_id`: `update findings set consensus_count = (select count(*) from findings f2 where f2.consensus_id_via_runs = group_id and f2.content_hash = findings.content_hash) where findings.run_id in (group)`.
   - Implemented as a Postgres function `aggregate_consensus(p_consensus_id uuid)` so the CLI is a one-liner.
5. CLI prints a per-walk summary + a final consensus rollup: `"3 walks · 12 unique findings · 4 with consensus 3/3 · 5 with consensus 2/3 · 3 with consensus 1/3"`.

Per-walk dispatch reuses the existing `runRunCommand` plumbing. New code is mostly:
- The parallel orchestrator (~40 LOC).
- The consensus_id stamping into createRun.
- The aggregation RPC call.
- The CLI shape (commander option block + the action).

### 3c. Sink change — stamp consensus_id on `runs.createRun`

Tiny edit: `completeRun` already accepts a long option bag. Extend with `consensus_id` + `consensus_n` flowing through `SinkInput`. `createRun` writes both.

### 3d. Dashboard — three additions

1. **`<ConsensusChip n=3 of=3 />`** component beside every finding in `/findings`, `/runs/[id]/findings`, `/projects/[id]/gaps`. Compact pill: `3/3` (filled, accent green), `2/3` (filled, neutral), `1/3` (outline, faint). Tooltip: "Filed by 3 of 3 walks in consensus group `<short id>`."
2. **Min-consensus filter** on `/findings`: a `?min=2` searchParam. Default value: 2 if any finding in the scope has `consensus_count > 1`, else 1 (so stand-alone walks aren't hidden when there are no consensus groups yet).
3. **Per-run consensus block** on `/runs/[id]` — when the run has a `consensus_id`: a small section listing the other runs in the group with their finding counts, so the reviewer can pivot between the peer walks. Same heartbeat-driven `runs_with_status` view; no new query layer.

### 3e. Defaults + edge cases

- **N default = 3.** Odd numbers feel right (2 is "agree or disagree"; 3 lets a finding be 2/3 = "leans signal" or 1/3 = "noise").
- **Failed walks in the group.** If a walk fails before producing findings (parser error, timeout, exit code), the group's effective N is reduced (e.g. 2 of 3 walks succeeded → consensus is computed over the 2 that worked, denominator = 2 not 3). `runs.consensus_n` stays at the originally-requested N for the record; the aggregation function reads which rows have `findings.run_id` present.
- **Cost.** N walks = N times the dispatcher cost. 3-walk consensus at $3 budget per walk = $9 per consensus group. Operator-controlled via `--n` and `--max-budget-usd`. We can default to N=2 for daemon-driven walks and N=3 for explicit `run-consensus` invocations.
- **Time.** N walks in parallel = same wall-clock as one walk (assuming the dispatcher and the target can handle concurrency). For Sonnet, parallelism is fine. For the target URL, three browser-driven walks against the same dashboard should be fine for any real app.
- **Cross-consensus dedup.** Existing content_hash lifecycle keeps working — a finding seen in a later consensus group with the same hash is still recognized as "this issue, again." Consensus_count is per-group; the lifecycle column (`status`) is across-time.

## 4. Open questions for Codex (the part I want pushback on)

I am not asking for plan approval. I am asking for an adversarial read of both the consensus design AND the broader Rove framing, with these specific questions:

### 4a. On the consensus design

- **Is N=3 the right ergonomic default?** Or does the cost ($9/group at $3/walk) push too many users to N=1 in practice, hollowing the consensus value? Should daemon-driven walks ALWAYS be consensus by default (N=2), making N=1 the exception?
- **Is `content_hash` actually stable enough across independent walks to be the consensus key?** It's a hash of `flow_id + heuristic + title-normalized + step_index`. Two walks of the same flow at the same target file `change.copy_mismatch` at step_index=2 with titles `"Subtitle inverts priority"` and `"Headline copy disagrees with default tab"`. Same finding, different titles, same hash? No — the title diverges so the hash diverges. We need a stronger consensus key. Options: (a) hash `flow_id + heuristic + step_index` only (drops title); (b) keep title-aware hash and accept that consensus only catches the EXACT duplicate, missing semantic dup; (c) introduce an embedding-distance step (cosine on `title + description`) — but that's a 10x increase in pipeline complexity and adds an inference dependency. Which is the right trade?
- **The per-page `affordance_gap.*` heuristic family poisons consensus harder than `nielsen-*` does.** A walk visits 4 pages, files 12 gap findings. The next walk visits 5 pages, files 14 gap findings. The intersection by hash is whatever overlapped exactly. Consensus on this family is going to look mathematically lower than on the `change.*` family even when the underlying judgment is strong. Should `affordance_gap.*` use a different aggregation rule (e.g. "at least one walk in the group flagged the same `kind` at the same `url_pattern`" rather than full content_hash equality)?
- **Is there a perversity where consensus could mask real bugs by demanding agreement?** A subtle UX problem only one of three Sonnet runs catches — under default `min=2`, it disappears. Should we surface a "rare finds" lane separately (consensus_count = 1 but step_index in the substantive walk path) so genuine outliers don't get filtered into invisibility?

### 4b. On Rove's premise itself

- **Is the "non-deterministic UI/UX testing for the agent era" framing tight?** Or is the wedge actually narrower — "agent-readiness audit" alone — and we're overstretching by also claiming the human side? Pixel-diff and Playwright already serve the human side adequately; insisting Rove also covers it might dilute the message.
- **Is the value generated *per walk* enough to justify the cost?** At $1-3 per change-review walk (and $9 per consensus group), what's the customer's TODO inflow rate that this competes against? If a team ships 50 PRs/week, are they paying $450 in walks? Is that ROI obvious? Where's the inflection where the cost stops feeling like "find bugs" and starts feeling like "noise tax"?
- **Why isn't this a feature inside Vercel, Playwright, or GitHub instead of a standalone product?** Vercel ships Lighthouse on every preview deploy. Playwright is building agent-driven testing primitives. GitHub Actions has Dependabot, CodeQL, Copilot review. Each of these could absorb the "agent-readiness check" wedge. What's Rove's structural defensibility — distribution, depth, or model-agnosticism? Or are we counting on the per-PR change-review surface being a hard-to-replicate cognitive operation rather than a feature any of them could ship in a quarter?
- **The two-sided framing depends on agents mattering enough to operators.** Today, agent-driven traffic to a typical SaaS app is a rounding error. Rove's bet is that flips. What's the actual leading indicator that justifies building for this NOW rather than 12 months in? If agent traffic stays a rounding error, does Rove pivot to just the human-side rubric, or is the agent side load-bearing for the whole product story?
- **The negative-space thesis (`docs/theses/negative-space.md`) is the single sharpest idea in the project.** Is it strong enough to be the headline framing on the marketing page someday — "Rove finds what builders couldn't see" — or is it too abstract for the actual buyer (an EM or staff-eng deciding to add a tool)? Is there a more concrete, more buyer-aware framing that doesn't betray the thesis?

### 4c. On the immediate sequence

After consensus lands, what's the right next item? Candidates I considered and rejected for "next":

- **Project-level archetype configurator UI** (BACKLOG) — small, valuable when there's a real reason to want per-project overrides. Not yet.
- **Wire-sink-relay** (BACKLOG, parked) — security-debt cleanup. Blocked on Fondant sign-off; not a customer-visible improvement.
- **Cross-walk finding lifecycle dashboard** — "what's gotten better/worse across runs" — strong, but needs more runs in the system first. Post-consensus.
- **CI integration** (no existing plan) — wire `rove change-review` into a GitHub Action so PRs get auto-walked. Probably the biggest distribution moment in the next 4 weeks but requires GH App work that's bigger than consensus.

My read is consensus first, then CI integration as the obvious next-after-that. Codex — disagree?

---

**Implementation plan for consensus, if Codex's review surfaces no blockers:**

1. Migration `20260517000000_consensus.sql` — column adds + indexes + comment. 15 min.
2. `packages/cli/src/commands/run-consensus.ts` — orchestrator. 1 hr.
3. `packages/cli/src/cli.ts` — `commander` registration. 15 min.
4. `packages/cli/src/supabase/store.ts` — `consensusId` + `consensusN` flowing through `createRun`. 15 min.
5. `apps/dashboard/components/ConsensusChip.tsx` — visual chip. 30 min.
6. `apps/dashboard/app/findings/page.tsx` — `?min=2` filter + chip column. 30 min.
7. `apps/dashboard/app/runs/[id]/parts.tsx` — peer-runs section. 30 min.
8. `apps/dashboard/app/projects/[id]/gaps/page.tsx` — same filter + chip. 30 min.
9. Dogfood: `rove run-consensus --flow dashboard.find_and_delete_run --persona first_time_user --n 3` against the deployed dashboard. Verify the chip renders and the filter works. 30 min.
10. Bump alpha.38, commit, tag, push. 10 min.

Total: ~4 hours focused work. No new dependencies. No infra changes. No parked-Wire blockers.
