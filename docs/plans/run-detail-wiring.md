# Plan — Run-detail UI wiring (1-to-1 commitment)

**Status**: Proposed.
**Owner**: Brian.
**Scope**: `/runs/[id]` (canonical) + `/preview/live-walk` (the static reference).
**Why now**: The new UI shipped on branch `live-walk-preview` reads some Supabase data but leaves several fields the old `/runs/[id]` surfaced — `run.plan`, `run.surprises`, `run.metrics`, `run.largest_expectation_gap`, `run.persona_success_confidence`, `run_steps.aria_snapshot` — unrendered. Real-time live-walk behavior (per-step writes, screenshot captures) is also still owed. This plan commits **every** pixel and interaction in the new UI to a data source and a wiring task. No "TBD".

## Rules of engagement

1. **Every UI element gets a data source.** Either a `runs.*` / `run_steps.*` / `findings.*` column, a derived value with a named computation, or an explicit "static / display-only" tag.
2. **Every interaction gets a handler.** Click / tab switch / keyboard → named state setter or named action.
3. **Every "not yet wired" gets a concrete TODO** — what file, what change, what's required upstream (daemon, migration, env var) to unblock it.
4. **No leakage between scopes.** Dashboard-side changes ship in this plan; daemon-side changes are listed under a single "Track B2 commitment" section that contracts with `packages/cli` and gets its own PR series.

## Status legend

- ✅ **Wired** — real data drives the element; works on completed runs today
- 🟡 **Partially wired** — data flows but display is placeholder, or the data exists but the UI hardcodes it
- ❌ **Not wired** — placeholder / hardcoded / dropped, work owed
- 🆕 **New work** — element doesn't exist yet but the plan adds it

---

## 1. Top bar

| Element | Data source | Status | TODO |
|---|---|---|---|
| Rove brand mark (gradient `R` glyph + 'ROVE' wordmark) | Static — `components/app-mark.tsx` reads `/brand/Rove_Icon_NoFill.png` | ✅ | — |
| Breadcrumb "Runs ›" | Static label; links to `/runs?p=<project>` | 🟡 | Add `<Link href="/runs?p=...">` wrapper |
| Breadcrumb run id (short) | `runs.id.slice(0, 8)` | ✅ | — |
| Project pill (`project: tankloop`) | `resolveProjectId(searchParams)` from `lib/project-context.ts` | 🟡 | Click → open `ProjectSwitcher` menu. Replace inline `<span>` with `<ProjectSwitcher size="sm">` from `components/project-switcher.tsx` |
| User pill (`alex`) | `supabase.auth.getUser().user_metadata.user_name`, falls back to `email.split('@')[0]` | ✅ | — |
| Worker status pill (`Worker online`, pulsing dot) | Currently hardcoded `"unknown"` → no pill rendered | ❌ | Query `workers WHERE github_handle = <run.initiator_label>` (or the daemon that wrote the run's most recent step) → render `online` if `last_heartbeat_at > now() - 90s`, `offline` otherwise. New util: `lib/supabase/resolve-run-worker.ts` |
| Click brand mark | `Link href="/runs"` | 🟡 | Wrap in `<Link>` |

## 2. Hero

| Element | Data source | Status | TODO |
|---|---|---|---|
| Eyebrow `RUN · <flow_id> · <persona_id>` | `runs.flow_id`, `runs.persona_id` | ✅ | — |
| NowDoing pill — verb (`Clicking`, `Reading`, `Typing into`, `Navigating to`, `Capturing`) | Derived from latest `run_steps.tool_name` via `humanizeVerb()` in `adapters.ts` | ✅ | — |
| NowDoing pill — target (`"Run walk"`, `/admin/foo`) | Derived from latest `run_steps.url_after` (truncated to 48 chars) | 🟡 | For `browser_click`, prefer extracting the click target from `run_steps.args` (the actual selector / button name) over URL. New: `extractClickTarget(args)` in `adapters.ts` |
| NowDoing pill — timer | `runs.started_at` → `now()` (running) / `runs.finished_at` (done). Computed client-side; ticks via 1Hz interval | 🟡 | Wire 1Hz ticker in `RunDetailLive` for running walks; freeze on terminal status |
| NowDoing pill — sweep animation | `.lw-sweep::after` keyframes in `globals.css` | ✅ | — |
| NowDoing pill — visibility | Only render when `status === "running"` | ✅ | — |
| Headline ("Walking the app" / "Goal reached" / "Goal not reached" / "Walk failed" / "Walk pending") | `runs.status` + `runs.goal_reached` via `buildHeroStatusBits()` | ✅ | — |
| Headline glow (cyan for goal reached, rose for errored) | Same derivation | ✅ | — |
| Subline `Step N of estimated M · 1m 32s elapsed · 3m 28s remaining budget` | `runs.actual_step_count`, `runs.predicted_step_count`, computed elapsed | 🟡 | "Remaining budget" requires `flows.budget_seconds_max` (currently not on the run row). New: join `flows` on `run.flow_id` server-side; expose `budget_seconds_max` on view. Hide subline budget chunk when null. |
| Metric tile — `target URL` | `runs.walked_url` | ✅ | — |
| Metric tile — `persona` | `runs.persona_id` → `prettyPersona(id)` | ✅ | — |
| Metric tile — `flow id` | Currently `runs.id` (wrong); should be `runs.flow_id` | 🟡 | Fix label semantics: this tile shows `runs.flow_id` (the slug); add a fourth row `run id` below with the run uuid short form OR move run-id to footer only (already there) and replace this tile with `started`/`branch` |
| Metric tile — `status` pill | Derived `statusPill` in adapter | ✅ | — |

## 3. Filmstrip

| Element | Data source | Status | TODO |
|---|---|---|---|
| Section header `STEP FILMSTRIP · N STEPS` + counts | `run_steps.length`, status breakdown derived | ✅ | — |
| Tile screenshot | `run_steps.screenshot_key` → signed URL minted server-side (10min TTL) by `signScreenshotUrls()` in `app/runs/[id]/page.tsx`. Falls back to a striped `no screenshot` placeholder. | 🟡 | **Daemon-side write needed** — see Track B2 §11. Until then, every step renders the placeholder. |
| Tile thumbnail (light-theme mock) | `MockThumb` from `components/run-detail/MockThumbs.tsx` (12 hand-drawn SVGs) | ✅ | Only used on `/preview/live-walk`. Real `/runs/[id]` doesn't show mock thumbs. |
| Step number `#04` | `run_steps.step_index` zero-padded | ✅ | — |
| Status dot (cyan/cyan-pulsing/rose) | `run_steps.direction` → `done` / `running` / `errored` via `toStepView()` | ✅ | — |
| Status text (`Complete` / `Running` / `Error`) | Same derivation | ✅ | — |
| Tool name (`browser_click`, etc.) | `run_steps.tool_name` | ✅ | — |
| Duration label (`1.4s` / `live`) | `run_steps.duration_ms` formatted; `"live"` if running | ✅ | — |
| Selected-tile cyan ring | `selectedIndex === step.index` client state | ✅ | — |
| Running-tile glow keyframe | `.lw-tile-running` CSS animation, applied when `step.status === "running"` | ✅ | — |
| Errored-tile rose border | `step.status === "errored"` | ✅ | — |
| "Awaiting next step" dashed placeholder | Rendered when `hero.status === "running"` (filmstrip prop `showAwaitingTile`) | ✅ | — |
| Scroll arrows (left/right) | Local `useRef` + `scrollBy({left: ±320})` | ✅ | — |
| Auto-follow running tile | `stickToRunning` state in `RunDetailLive`; flips false on manual click | ✅ | Add `scrollIntoView({ behavior: "smooth", inline: "center" })` on the running tile when its index changes |
| Filmstrip section "scroll-snap" annotation | Removed in c209a3b | ✅ | — |
| Empty state (no steps) | Renders dashed placeholder with copy "No steps recorded yet" | ✅ | — |

## 4. Tab bar

| Tab | Content source | Status | TODO |
|---|---|---|---|
| Filmstrip (default) | DetailSplit (preview + aria tree) | 🟡 | See §5 |
| Steps | Inline `StepsList` table (in `RunDetailLive.tsx`) | ✅ | — |
| Findings (count chip) | `findings.length` | ✅ | — |
| Reflection | Placeholder `ReflectionPanel` | ❌ | See §7 — wire real reflection content |
| Tab click → switch | `useState<TabId>` in `RunDetailLive` | ✅ | — |
| Active tab cyan underline + glow | `.tab.active::after` CSS in TabBar | ✅ | — |
| Keyboard nav (arrow keys move between tabs, Enter activates) | Not implemented | ❌ | Add `onKeyDown` to TabBar; standard radio-group pattern with `aria-selected` already set |

## 5. Detail split (Filmstrip tab)

### Left preview panel

| Element | Data source | Status | TODO |
|---|---|---|---|
| Caption `step 08 — clicking "Run walk"` | `selectedStep.index`, `selectedStep.toolName`, `selectedStep.url` via `humanVerb()` in DetailSplit | 🟡 | Verb derivation uses URL right now; same fix as §2 NowDoing — prefer click target from `args` |
| Screenshot (16:9, white-bg) | `step.thumb` → `<img>` for signed URL, `<MockThumb>` for preview, striped placeholder otherwise | 🟡 | Same daemon-side block as §3 — Track B2 |
| Inline Tankloop preview (preview route only) | `inlineTankloop` prop. `TankloopPreview` is HTML, not data-driven | ✅ | — |
| Tag pills below (`tool`, `url`, `duration`, `status`) | `step.toolName`, `step.url`, `step.durationLabel`, `step.status` | ✅ | — |
| `selector` tag | Currently hardcoded `button[name="Run walk"]` on preview; not rendered on real `/runs/[id]` | 🟡 | Extract from `run_steps.args.selector` or `.element` for `browser_click`, `browser_type`; new helper in `adapters.ts` |
| `coordinates` tag (preview only) | Static for now | 🟡 | Real `/runs/[id]` should show this when `run_steps.args.x` / `.y` exist on click steps |

### Right accessibility-tree panel

| Element | Data source | Status | TODO |
|---|---|---|---|
| Eyebrow `ACCESSIBILITY TREE` | Static | ✅ | — |
| Tree node rendering (`▼ banner` → indent rails → `link "Runs"`) | Hardcoded sample on preview; **not rendered on real /runs/[id]** | ❌ | Parse `run_steps.aria_snapshot` (Markdown-ish indented role-name text emitted by Playwright MCP). New file: `components/run-detail/parseAriaSnapshot.ts` returning `AriaNode[]`. The tree renders from that array. |
| Highlighted target node (cyan-soft fill) | Currently hardcoded "Run walk" button on preview | ❌ | Highlight the node whose role-name matches the action taken at this step. Derive from `run_steps.args.selector` ↔ aria-snapshot match. If no match found, no highlight. |
| Empty state ("No aria-snapshot captured for this step yet") | Rendered when `step.aria_snapshot` is null | ✅ | — |
| Click a tree node → ? | No-op today | 🟡 | Defer interactivity; tree is read-only at first land |

## 6. Steps tab

| Element | Data source | Status | TODO |
|---|---|---|---|
| Header row (`#`, `TOOL`, `URL`, `DUR`, `STATUS`) | Static | ✅ | — |
| Row cells | Each step's `step_index`, `toolName`, `url`, `durationLabel`, `status` | ✅ | — |
| Selected-row highlight | `selectedIndex` state, cyan-soft tint | ✅ | — |
| Click row → swap to Filmstrip tab + scroll filmstrip to that tile | `onPick(idx)` setter; doesn't actually switch tab today | 🟡 | After `setSelectedIdx(idx)`, also `setTab("filmstrip")` so the user sees their selection in the visual context |

## 7. Reflection tab

Currently a single placeholder paragraph. The OLD `/runs/[id]` rendered three components here that aren't yet wired into the new design.

| Element | Data source | Status | TODO (commits to a new layout for this tab) |
|---|---|---|---|
| Plan summary — "the agent expected to take N steps" | `runs.plan.expected_step_count`, `runs.plan.biggest_worry` | ❌ | New panel: `components/run-detail/Reflection.tsx` reads `view.plan`; renders eyebrow `PRE-WALK PLAN`, headline of the expected step count, the biggest_worry text in italics |
| Plan steps table | `runs.plan.expected_path` (`WalkPlanStep[]`) | ❌ | Table inside Reflection panel: `# / description / expected_affordance` |
| Surprises list | `runs.surprises` (`Surprise[]`) | ❌ | Card list — `kind` badge + `expected` vs `observed` columns + `recovered: yes/no` |
| Reflection text — "largest expectation gap" | `runs.largest_expectation_gap` | ❌ | Paragraph below surprises |
| Reflection numeric — persona success confidence | `runs.persona_success_confidence` (0–1) | ❌ | Big-number tile: `{Math.round(x * 100)}%` + label "agent's self-rated confidence" |
| Metrics strip — actual_tool_calls, snapshots, actions, screenshots, recovery_count, errors, time_to_first_action_ms | `runs.metrics` (`TrajectoryMetrics`) | ❌ | 6-tile strip at top of Reflection tab. Reuse existing `MetricsStrip` component's logic from `app/runs/[id]/trajectory.tsx` but restyled to match the new design |
| "Walk in progress — reflection populates when complete" empty state | Render when `runs.status === "running"` AND `run.plan` is null | ✅ | (already handled, refine copy) |

## 8. Findings stream

| Element | Data source | Status | TODO |
|---|---|---|---|
| Section header `FINDINGS FILED THIS WALK · N` | `findings.length` | ✅ | — |
| "filed in last 92s" / "sorted by severity" subline | Static "sorted by severity" today | 🟡 | When `runs.status === "running"`, render `filed in last Nm Ns` based on age of the most recent finding |
| Card severity bar (left edge, 3px) | `findings.severity` → palette in FindingsStream | ✅ | — |
| Severity badge | Same | ✅ | — |
| Title | `findings.title` | ✅ | — |
| Heuristic chip | `findings.heuristic` | ✅ | — |
| Secondary WCAG/standard chip | Not on real data today; mock had it | ❌ | Parse from `findings.heuristic` — if it contains `:` (`agent.foo:wcag.2.1.1`), split. Or add `findings.standard_ref` column in a later migration. For now, derive: WCAG mapping table in `adapters.ts` keyed by heuristic |
| Thumbnail (110×62) | Currently looks up `run_steps.screenshot_key` for step matching `findings.step_index`; falls back to placeholder | 🟡 | Once `finding_screenshots` is loaded, prefer those (`finding_screenshots.storage_key` → signed URL) over the step's screenshot. New: server-side fetch `finding_screenshots` joined to findings, mint signed URLs, hand to adapter |
| Step reference (`Step 08 →`) | `findings.step_index` | ✅ | — |
| Click card | `findingHref` → `/findings?run=X&open=Y` | ✅ | — |
| Empty state | Render when `findings.length === 0` | ✅ | — |
| Streaming (new finding fades in at top) | Realtime INSERT on `findings` triggers a full re-fetch in `useLiveRun`; no animation yet | 🟡 | Add `framer-motion` `<AnimatePresence>` wrapper OR pure CSS `@keyframes` slide-in. Track new IDs vs prior render; animate only the diff |

## 9. Footer strip

| Element | Data source | Status | TODO |
|---|---|---|---|
| `commit <sha>` | `runs.commit_sha.slice(0, 7)` (null-safe) | ✅ | — |
| `branch <branch>` | `runs.branch` | ✅ | — |
| `daemon <handle>` | `runs.initiator_label` (the daemon's github_handle) | 🟡 | "Daemon" is misleading — `initiator_label` is the **user** who initiated. Rename to `initiated by`. The actual daemon name lives on the `agent_jobs` row that birthed this run, or on `workers` if we can join. New: `workers WHERE id = (SELECT claimed_by FROM agent_jobs WHERE run_id = X)`. For now, label change is sufficient. |
| `run <short>` | `runs.id.slice(0, 8)` | ✅ | — |
| `started <Nm ago>` | `runs.started_at` → `relativeAgo()` | ✅ | — |

## 10. Realtime data flow

`components/run-detail/useLiveRun.ts` subscribes to:

| Channel | Filter | Triggers |
|---|---|---|
| `runs` postgres_changes | `id=eq.${runId}` | Status changes (running → completed / failed), goal_reached, plan / surprises / metrics population, finished_at set |
| `run_steps` postgres_changes | `run_id=eq.${runId}` | Per-step inserts (Track B2 only — currently runs ship rows in bulk at end) |
| `findings` postgres_changes | `run_id=eq.${runId}` | Live finding inserts |

Mechanism:
- `setAuth(session.access_token)` before subscribe ✅
- Catch-up read on `SUBSCRIBED` ✅
- 5s safety-net poll while `status === "running"` ✅
- Full DB re-read on any event → re-build view via adapter ✅

Future optimization (not in scope here): apply Realtime payload deltas in place instead of re-fetching everything. Re-fetch is fine at our row counts.

## 11. Daemon-side commitments (Track B2 — separate PR series)

Lives in `packages/cli`. This plan **contracts** these changes; it does NOT ship them.

| Commitment | File | Contract |
|---|---|---|
| Per-step `run_steps` insert at `tools/call` request time | `packages/cli/bin/playwright-mcp-proxy.mjs` (or equivalent hook in `packages/cli/src/daemon/runner.ts`) | Insert row with `direction='call'`, `tool_name`, `args`, `step_index=<incrementing>`. Initial `screenshot_key=null`. |
| Per-step update on tool response | Same | Update row to `direction='result'` (or `'error'`) with `result_summary`, `aria_snapshot`, `url_after`, `duration_ms` |
| Screenshot upload at capture | Same | On any `browser_take_screenshot` response, upload PNG to `walks/runs/<run_id>/step-<NN>.png` via service-role client; stamp `run_steps.screenshot_key` |
| Finding insert at file-time | `packages/cli/src/sinks/supabase.ts` | When the agent emits a finding (via the existing `<<<FINDINGS_JSON>>>` markers), insert each finding row immediately, not in the post-walk batch |
| `runs.status` transitions | Already exists — daemon writes `running` at start, `completed`/`failed` at end. No change. | ✅ |

Without B2, the dashboard wiring above renders correctly for **completed** walks (the post-walk batch populates all rows) but a **running** walk on `/runs/[id]` will show an empty filmstrip until the daemon's batch sync fires.

## 12. Server-side commitments (this PR series, dashboard-only)

| Item | Owner | File |
|---|---|---|
| Sign screenshot URLs server-side (batch + per-key fallback) | ✅ already shipped | `app/runs/[id]/page.tsx` |
| Mint signed URLs for `finding_screenshots` (separate from step screenshots) | New | Extend `app/runs/[id]/page.tsx` to fetch `finding_screenshots` joined on `findings.id`; sign all keys; pass into adapter as `signedFindingScreenshotUrls` |
| Resolve `current worker` for the run | New | `lib/supabase/resolve-run-worker.ts`: joins `agent_jobs` (claimed_by) → `workers` for status |
| Resolve `flows.budget_seconds_max` for the hero subline | New | Add `flows` join in `app/runs/[id]/page.tsx`; pass into adapter |
| `extractClickTarget(args)` helper | New | `components/run-detail/adapters.ts`; recognizes `browser_click` + `browser_type` arg shapes from `@playwright/mcp` |
| `parseAriaSnapshot(text)` parser | New | `components/run-detail/parseAriaSnapshot.ts`; returns `AriaNode[]` from indented role-name text. Failures: return one root node with the raw text body. |
| `aria-snapshot ↔ click target` matcher | New | `components/run-detail/highlightAriaTarget.ts`; given parsed tree + click args, returns the node id (or null) that should render with `lw-tree-highlight` |
| Reflection panel | New | `components/run-detail/Reflection.tsx`; renders plan / surprises / largest_expectation_gap / persona_success_confidence / metrics |
| MetricsStrip restyle | New | `components/run-detail/MetricsStrip.tsx`; 6 tiles inline, same brand vars |
| Animated finding stream | New | Add `<AnimatePresence>` (or CSS keyframes — pick after install audit) to `FindingsStream` |
| 1Hz timer ticker | New | `RunDetailLive` `useEffect(setInterval(1000))` while `view.hero.status === "running"` |
| Auto-scroll filmstrip to running tile | New | `Filmstrip` ref + `useEffect` watching the running step's index |
| Steps-tab click → switch to Filmstrip tab | One-line change | `RunDetailLive.tsx` `onPick` handler |
| Worker status pill | New | `TopBar` consumes `view.topBar.workerStatus`; `online` / `offline` / `unknown` already typed |
| `initiated by` label change | One-line | `RunFooter` |

## 13. Acceptance criteria

The plan is done when **every** row in §1–§9 above is ✅ (or the daemon-side rows are explicitly deferred under Track B2 with a linked issue), and:

- Opening any completed `kind=flow` run from `/runs` lands on the new design with every panel populated from real data — no placeholder copy where data exists, no dropped fields.
- Realtime: starting a new walk and opening `/runs/[id]` immediately shows the run filled in within seconds of each `run_steps` insert (when B2 lands).
- Aria-snapshot tree renders for at least 90% of real `run_steps.aria_snapshot` payloads. Parser failures fall back to "raw text" view, never throw.
- `kind=change_review` runs still render via the old layout (untouched until a later PR explicitly ports them).
- Keyboard-only walkthrough of `/runs/[id]` reaches every interactive element with visible `focus-rove` rings.

## 14. PR breakdown

To keep diffs reviewable, this lands as ~8 PRs on top of the current `live-walk-preview` branch:

1. **`wire-reflection`** — Reflection tab with plan / surprises / largest_expectation_gap / persona_success_confidence / metrics. Adapter extension + new Reflection component.
2. **`wire-flow-budget`** — server-side `flows` join for `budget_seconds_max`; hero subline shows remaining budget.
3. **`wire-worker-status`** — resolve current worker for the run; top-bar pill goes from `unknown` → `online`/`offline`.
4. **`wire-finding-screenshots`** — `finding_screenshots` signed URLs replace placeholder thumbs in `FindingsStream`.
5. **`wire-aria-tree`** — `parseAriaSnapshot` + `highlightAriaTarget`; DetailSplit a11y panel renders real trees with the click target highlighted.
6. **`wire-step-args`** — `extractClickTarget` + selector/coordinates tags on DetailSplit + accurate NowDoing target.
7. **`wire-ux-polish`** — 1Hz timer ticker, auto-scroll filmstrip, animated finding inserts, Steps→Filmstrip tab switch on row click, keyboard nav on tabs.
8. **`wire-change-review-adopt`** — port the `kind=change_review` branch onto the same Hero/Filmstrip/Detail/Findings shape (the only `change_review`-specific surface stays as `DeltasSection` inside the Reflection tab).

Track B2 (daemon-side) is its own PR series under `packages/cli` and lands independently. Without B2 the wired dashboard renders completed walks perfectly; with B2 it renders live walks just as well.

## 15. What does NOT get wired in this plan

- Hover tooltips for truncated values (defer; tooltip primitive isn't in the codebase yet, would need Track A from `live-walk.md`)
- Lightbox screenshot zoom (defer; the existing `DetailSplit` preview is large enough for now)
- Multi-user "watching the walk together" presence indicators (explicit non-goal in `live-walk.md`)
- Step-level inline expansion in the Steps tab (current row click handles selection; inline expand isn't needed)
- `run_steps.aria_snapshot` parsing for non-Playwright tools — only the Playwright MCP format is supported initially. Other dispatchers' output falls back to raw text.

These are documented here so they don't reappear as "missing" in future audits.
