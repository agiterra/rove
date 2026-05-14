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
| Breadcrumb "Runs ›" | `Link href="/runs?p=<project>"` in `TopBar` — project pulled from `view.topBar.project`. | ✅ | — |
| Breadcrumb run id (short) | `runs.id.slice(0, 8)` | ✅ | — |
| Secondary breadcrumb row (`← all runs`) | `Link href="/runs?p=<project>"` in `RunDetailLive.BreadcrumbRow`. | ✅ | — |
| Project pill (`project: tankloop`) | `ProjectSwitcher` (server) rendered by `app/runs/[id]/page.tsx` + `app/preview/live-walk/page.tsx`; passed through `RunDetailLive` / `PreviewLiveWalk` → `TopBar` as a `projectSwitcher` children prop so it stays a server component even inside the client tree. | ✅ | — |
| User pill (`alex`) | `supabase.auth.getUser().user_metadata.user_name`, falls back to `email.split('@')[0]` | ✅ | — |
| Worker status pill (`Worker online`, pulsing dot) | `lib/supabase/resolve-run-worker.ts` queries `agent_jobs WHERE result->>'run_id' = <runId> AND kind='walk'`, takes the most recently claimed row, then reads `workers.last_heartbeat_at / stopped_at / disabled_at`. Online when heartbeat < 90s and not shut down. `unknown` when no matching job (local `rove run`). | ✅ | — |
| Click brand mark | `Link href="/runs?p=<project>"` wrap in `TopBar`. | ✅ | — |

## 2. Hero

| Element | Data source | Status | TODO |
|---|---|---|---|
| Eyebrow `RUN · <flow_id> · <persona_id>` | `runs.flow_id`, `runs.persona_id` | ✅ | — |
| NowDoing pill — verb (`Clicking`, `Reading`, `Typing into`, `Navigating to`, `Capturing`) | Derived from latest `run_steps.tool_name` via `humanizeVerb()` in `adapters.ts` | ✅ | — |
| NowDoing pill — target (`"Run walk"`, `/admin/foo`) | `deriveNowDoingTarget(step)` in `adapters.ts`: prefers `step.actionTarget.element`, falls back to `step.actionTarget.target`, falls back to `shortTarget(step.url)`. `extractActionTarget(tool_name, args)` recognizes Playwright MCP `target`/`ref`/`selector` + `element`. | ✅ | — |
| NowDoing pill — timer | `runs.started_at` → `now()` (running) / `runs.finished_at` (done). 1Hz `useTickingView` in `RunDetailLive` recomputes the hero `elapsedLabel` + `timerLabel` while `hero.finishedAtMs == null`. Timer rendered with `aria-hidden`; verb + target are the live region. | ✅ | — |
| NowDoing pill — sweep animation | `.lw-sweep::after` keyframes in `globals.css` | ✅ | — |
| NowDoing pill — visibility | Only render when `status === "running"` | ✅ | — |
| Hero aurora / streak / edge layers | Static CSS (`.lw-hero-*` in `globals.css`) with intensity from `view.hero.status` | ✅ | Preserve reduced-motion fallback and avoid adding data dependencies |
| Headline ("Walking the app" / "Goal reached" / "Goal not reached" / "Walk failed" / "Walk pending") | `runs.status` + `runs.goal_reached` via `buildHeroStatusBits()` | ✅ | — |
| Headline glow (cyan for goal reached, rose for errored) | Same derivation | ✅ | — |
| Subline `Step N of estimated M · 1m 32s elapsed · 3m 28s remaining budget` | `runs.actual_step_count`/`run_steps.length`, `runs.predicted_step_count`, computed elapsed, and `flows.budget.max_seconds` (read server-side from a separate `flows` query in `app/runs/[id]/page.tsx`). `computeRemainingLabel` returns the MM:SS remaining only while running; ticker recomputes every second. | ✅ | — |
| Metric tile — `target URL` | `runs.walked_url` | ✅ | — |
| Metric tile — `persona` | `runs.persona_id` → `prettyPersona(id)` | ✅ | — |
| Metric tile — `flow id` | `runs.flow_id` (the slug) — display already correct, eyebrow + tile both render the slug. Run-uuid short form lives in the footer. | ✅ | — |
| Metric tile — `status` pill | Derived `statusPill` in adapter | ✅ | — |
| Metric tile icons | Static inline SVGs in `Hero.tsx` | ✅ | Keep display-only; no data source |

## 3. Filmstrip

| Element | Data source | Status | TODO |
|---|---|---|---|
| Section header `STEP FILMSTRIP · N STEPS` + counts | `run_steps.length`, status breakdown derived | ✅ | — |
| Tile screenshot | `run_steps.screenshot_key` → signed URL minted server-side (10min TTL) by `signScreenshotUrls()` in `app/runs/[id]/page.tsx`. The MCP proxy now uploads each `browser_take_screenshot` result to the walks bucket in real time and stamps the row (Track B2). Falls back to a striped placeholder when neither finding nor step screenshot is present. | ✅ | — |
| Tile thumbnail (light-theme mock) | `MockThumb` from `components/run-detail/MockThumbs.tsx` (12 hand-drawn SVGs) | ✅ | Only used on `/preview/live-walk`. Real `/runs/[id]` doesn't show mock thumbs. |
| Step number `#04` | `run_steps.step_index` zero-padded | ✅ | — |
| Status dot (cyan/cyan-pulsing/rose) | `run_steps.direction` → `done` / `running` / `errored` via `toStepView()` | ✅ | — |
| Status text (`Complete` / `Running` / `Error`) | Same derivation | ✅ | — |
| Tool name (`browser_click`, etc.) | `run_steps.tool_name` | ✅ | — |
| Duration label (`1.4s` / `live`) | `run_steps.duration_ms` formatted; `"live"` if running | ✅ | — |
| Tile ARIA label + `aria-current` | `step.index`, `step.toolName`, `step.status`, `selectedIndex === step.index` | ✅ | Preserve while adding auto-scroll |
| Selected-tile cyan ring | `selectedIndex === step.index` client state | ✅ | Preserve `.focus-rove` on the tile button |
| Running-tile glow keyframe | `.lw-tile-running` CSS animation, applied when `step.status === "running"` | ✅ | Preserve reduced-motion suppression in `globals.css` |
| Errored-tile rose border | `step.status === "errored"` | ✅ | — |
| "Awaiting next step" dashed placeholder | Rendered when `hero.status === "running"` (filmstrip prop `showAwaitingTile`) | ✅ | — |
| Scroll arrows (left/right) | Local `useRef` + `scrollBy({left: ±320})`; static icon-only buttons | ✅ | Preserve `aria-label`, `.focus-rove`, and keyboard activation |
| Auto-follow running tile | `stickToRunning` state in `RunDetailLive`; on top of that, `Filmstrip` itself calls `scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" })` on the running tile whenever its index changes. | ✅ | — |
| Filmstrip section "scroll-snap" annotation | Removed in c209a3b | ✅ | — |
| Empty state (no steps) | Renders dashed placeholder with copy "No steps recorded yet" | ✅ | — |

## 4. Tab bar

| Tab | Content source | Status | TODO |
|---|---|---|---|
| Filmstrip (default) | DetailSplit (preview + aria tree) | ✅ | — |
| Steps | Inline `StepsList` table (in `RunDetailLive.tsx`) | ✅ | — |
| Findings (count chip) | `findings.length` | ✅ | — |
| Reflection | `Reflection` reads `view.reflection` (plan / surprises / gap / confidence / metrics) | ✅ | — |
| Tab click → switch | `useState<TabId>` in `RunDetailLive` | ✅ | — |
| Active tab cyan underline + glow | `.tab.active::after` CSS in TabBar | ✅ | — |
| Keyboard nav (arrow keys move between tabs, Enter activates) | `TabBar.handleKey`: Left/Right cycles, Home/End jumps to ends; auto-activates + refocuses the new tab. | ✅ | — |

## 5. Detail split (Filmstrip tab)

### Left preview panel

| Element | Data source | Status | TODO |
|---|---|---|---|
| Caption `step 08 — clicking "Run walk"` | `selectedStep.index`, `selectedStep.toolName`. On the live route the verb-only caption renders (no `liveTarget`); the preview route passes the mock `liveTarget`. NowDoing target lives in the hero pill (wired via `extractActionTarget`); duplicating it in the caption is preview-only. | ✅ | — |
| Screenshot (16:9, white-bg) | `step.thumb` → `<img>` for signed URL, `<MockThumb>` for preview, striped placeholder otherwise. Track B2 proxy now stamps `screenshot_key` in real time. | ✅ | — |
| No selected step empty state | `selectedStep === null` | ✅ | Keep copy static; this is reached when there are no step rows |
| Inline Tankloop preview (preview route only) | `inlineTankloop` prop. `TankloopPreview` is static HTML/CSS, not data-driven | ✅ | Preview-only fixture; see §15 for explicit non-wiring scope |
| Preview cursor overlay (preview route only) | Static `PreviewCursor` SVG | ✅ | Preview-only fixture; no real-data wiring |
| Tag pills below (`tool`, `url`, `duration`, `status`) | `step.toolName`, `step.url`, `step.durationLabel`, `step.status` | ✅ | — |
| `target` tag | `step.actionTarget.target` — extracted from `args.target`/`args.ref`/`args.selector` via `extractActionTarget`. | ✅ | — |
| `element` tag | `step.actionTarget.element` — extracted from `args.element`. Rendered only when present. | ✅ | — |
| `coordinates` tag | Not supported for normal `browser_click` / `browser_type` rows | ❌ | Do not wire for normal click/type steps. Only render for future low-level mouse tools that actually carry `x`/`y`. |

### Right accessibility-tree panel

| Element | Data source | Status | TODO |
|---|---|---|---|
| Eyebrow `ACCESSIBILITY TREE` | Static | ✅ | — |
| Tree node rendering (`▼ banner` → indent rails → `link "Runs"`) | `parseAriaSnapshot(step.ariaSnapshot)` → `AriaNode[]`; rendered by `ParsedTree` in `DetailSplit`. Parser falls back to raw-text node on failure. | ✅ | — |
| Highlighted target node (cyan-soft fill + pulse) | `highlightAriaTarget(parsed, step.actionTarget)` matches by `[ref=…]` first, accessible-name second. | ✅ | Nearest-preceding-snapshot lookup for action rows is owed when daemon-side per-step writes land (Track B2). |
| Empty state ("No aria-snapshot captured for this step yet") | Rendered when `step.ariaSnapshot` is null after `StepView` grows the field | ✅ | — |
| Indent rails + highlight animation | Static CSS `.lw-rail*`, `.lw-tree-highlight` | ✅ | Preserve reduced-motion suppression |
| Click a tree node → ? | No-op today | 🟡 | Defer interactivity; tree is read-only at first land |

## 6. Steps tab

| Element | Data source | Status | TODO |
|---|---|---|---|
| Header row (`#`, `TOOL`, `URL`, `DUR`, `STATUS`) | Static | ✅ | — |
| Row cells | Each step's `step_index`, `toolName`, `url`, `durationLabel`, `status` | ✅ | — |
| Selected-row highlight | `selectedIndex` state, cyan-soft tint | ✅ | — |
| Click row → swap to Filmstrip tab + scroll filmstrip to that tile | `onPickStep` in `RunDetailLive` sets `selectedIdx` and switches `tab` to `filmstrip`. Filmstrip auto-scroll is wired in §3. | ✅ | — |
| Empty state (no steps) | `view.steps.length === 0`; static copy | ✅ | Preserve dashed container and copy |
| Row focus treatment | Each row is its own `<button>` with `display: grid` + `grid-template-columns`; `.focus-rove` produces a visible focus ring. (Previous `display: contents` button had no box to receive the ring.) | ✅ | — |

## 7. Reflection tab

Currently a single placeholder paragraph. The OLD `/runs/[id]` rendered three components here that aren't yet wired into the new design.

| Element | Data source | Status | TODO (commits to a new layout for this tab) |
|---|---|---|---|
| Plan summary — "the agent expected to take N steps" | `runs.plan.expected_step_count`, `runs.plan.biggest_worry` | ✅ | `PlanPanel` in `components/run-detail/Reflection.parts.tsx` |
| Plan steps table | `runs.plan.expected_path` (`WalkPlanStep[]`) | ✅ | `PlanTable` inside `PlanPanel` |
| Surprises list | `runs.surprises` (`Surprise[]`) | ✅ | `SurprisesPanel` — kind badge + step ref + expected/observed columns + recovered pill |
| Reflection text — "largest expectation gap" | `runs.largest_expectation_gap` | ✅ | Rendered inside `ReflectionPanel` |
| Reflection numeric — persona success confidence | `runs.persona_success_confidence` (0–1) | ✅ | `ConfidenceTile` — big number + progress bar, tone tiers at 0.7 / 0.4 |
| Metrics strip | `runs.metrics` (`TrajectoryMetrics` jsonb) | ✅ | `MetricsStrip` — 8 tiles across 2 rows: tool calls / actions / snapshots / screenshots / snaps-per-action / recoveries / errors / time-to-first-action |
| "Walk in progress — reflection populates when complete" empty state | Render when `view.reflection.hasContent === false` | ✅ | `EmptyState` in `Reflection.tsx`; copy varies by runStatus (running / pending / done-with-no-data) |

## 8. Findings stream

| Element | Data source | Status | TODO |
|---|---|---|---|
| Section header `FINDINGS FILED THIS WALK · N` | `findings.length` | ✅ | — |
| "filed in last 92s" / "sorted by severity" subline | `useSubline` in `FindingsStream`: for running walks with a known `lastFiledAt`, renders `filed in last Nm Ss`, ticks every 30s. Otherwise `sorted by severity`. | ✅ | — |
| Card severity bar (left edge, 3px) | `findings.severity` → palette in FindingsStream | ✅ | — |
| Severity badge | Same | ✅ | — |
| Title | `findings.title` | ✅ | — |
| Heuristic chip | `findings.heuristic` | ✅ | — |
| Secondary WCAG/standard chip | No stored source today | ❌ | Either add `findings.standard_ref` in a later migration or add optional `secondaryStandardChip` as a documented display-only inference from a fixed local mapping. Do not imply `findings.heuristic` parsing is authoritative. |
| Thumbnail (110×62) | `finding_screenshots.storage_key` (first ordinal) → signed walks-bucket URL when present; falls back to step screenshot, then to placeholder | ✅ | — |
| Step reference (`Step 08 →`) | `findings.step_index` | ✅ | — |
| Click card | `findingHref` → `/findings?run=X&open=Y`; falls back to static `<article>` when no href | ✅ | Preserve `.focus-rove` only on link-rendered cards; no fake click target for static articles |
| Card hover/focus motion | `.kinetic-hover` + `.focus-rove` | ✅ | Preserve reduced-motion behavior |
| Empty state | Render when `findings.length === 0` | ✅ | — |
| Streaming (new finding fades in at top) | Pure-CSS `lw-finding-enter` keyframe; `useNewIds` tracks first-render baseline vs subsequent renders and adds the class only to ids that weren't there before. Reduced-motion suppresses. | ✅ | — |

## 9. Footer strip

| Element | Data source | Status | TODO |
|---|---|---|---|
| `commit <sha>` | `runs.commit_sha.slice(0, 7)` (null-safe) | ✅ | — |
| `branch <branch>` | `runs.branch` | ✅ | — |
| `initiated by <handle>` | `runs.initiator_label` (requester / best-effort initiator label). Renamed from `daemon` because we don't yet have a run↔worker link to claim actual daemon attribution. | ✅ | — |
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
| Run/job/worker identity | `packages/cli/src/commands/run.ts`, `packages/cli/src/daemon/handlers/walk.ts`, migrations | Make queued walks use a daemon-known run id (or persist `runs.agent_job_id`) so `/runs/[id]` can resolve the worker and the queued job can deep-link to the run while it is still running. |
| Per-step `run_steps` insert at `tools/call` request time | ✅ shipped | `playwright-mcp-proxy.mjs` accepts `--live-run-id`/`--live-project-id` + `ROVE_SUPABASE_*` env, maintains a jsonrpc-id → row-id map, POSTs `run_steps` with `direction='call'` on each request. |
| Per-step update on tool response | ✅ shipped | Proxy PATCHes the row with `direction='result'`/`'error'`, `result_summary`, `aria_snapshot` (snapshot tools only), `url_after` (navigate), `duration_ms`. |
| Screenshot upload at capture | ✅ shipped | After a successful `browser_take_screenshot`, the proxy reads the newest file from `--live-screenshots-dir`, uploads it to `walks/runs/<run_id>/step-<NN>.png` via the Storage REST API, then PATCHes `screenshot_key`. Graceful drain on child exit. |
| Finding insert at file-time | `packages/cli/src/commands/run.ts` + dispatcher stdout streaming + reusable Supabase sink helper | Today findings are parsed only after the dispatcher exits. Streaming requires an incremental stdout parser upstream of `routeToSinks`; the sink can expose/reuse `insertFinding`, but it is not the hook point by itself. |
| `runs.status` transitions | `commands/run.ts` pre-creates the row with `status='running'` (Track B2). The supabase sink patches to `completed`/`failed` at end. Queued walks expose their run id via `agent_jobs.result.run_id` as before — the dashboard reads it via `resolveRunWorkerStatus`. | ✅ | — |

Without B2, the dashboard wiring above renders correctly for **completed** walks (the post-walk batch populates all rows) but a **running** walk on `/runs/[id]` will show an empty filmstrip until the daemon's batch sync fires.

## 12. Server-side commitments (this PR series, dashboard-only)

| Item | Owner | File |
|---|---|---|
| Sign screenshot URLs server-side (batch + per-key fallback) | ✅ already shipped | `app/runs/[id]/page.tsx` |
| Mint signed URLs for `finding_screenshots` (separate from step screenshots) | ✅ shipped | `app/runs/[id]/page.tsx → signFirstFindingScreenshots()` fetches first-ordinal storage_key per finding, signs in `walks` bucket, passes `signedFindingScreenshotUrls` (Record<findingId, url>) to the adapter. |
| Extend run-detail view model | ✅ shipped | `components/run-detail/types.ts` + `adapters.ts`; plan / surprises / metrics / gap / confidence (§7), step args + actionTarget (§5), aria snapshot (§5), finding screenshot URLs (§8), flow budget (§2), worker status (§1) all flow through. |
| Resolve `current worker` for the run | ✅ shipped | `lib/supabase/resolve-run-worker.ts` joins through `agent_jobs.result->>run_id` (no schema change needed). Returns `online`/`offline`/`unknown`. |
| Persist and resolve flow budget | ✅ shipped | Migration `20260514000000_flows_budget.sql` adds `flows.budget jsonb`. `parseFlowFile` extracts `budget.max_steps`/`budget.max_seconds` from YAML; CLI store writes via `upsertFlowWithYaml` (sync-authoritative) and conditionally via `upsertFlow` (sink-path never clobbers a synced value). Dashboard server reads `flows.budget`, hands `flowBudgetSecondsMax` to the adapter. |
| `extractActionTarget(toolName, args)` helper | ✅ shipped | `components/run-detail/adapters.ts`; recognizes Playwright MCP `target` / `ref` / `selector` + `element` for action tools; `url` for navigation. |
| `parseAriaSnapshot(text)` parser | ✅ shipped | `components/run-detail/parseAriaSnapshot.ts`; returns `AriaNode[]` from Playwright MCP YAML-like role/name/ref text. Failures return a single raw-text node. |
| `aria-snapshot ↔ action target` matcher | ✅ shipped | `components/run-detail/highlightAriaTarget.ts`; ref-first, name-fallback. |
| Reflection panel | ✅ shipped | `components/run-detail/Reflection.tsx` + `Reflection.parts.tsx`; renders plan / surprises / largest_expectation_gap / persona_success_confidence / metrics |
| MetricsStrip restyle | ✅ shipped | `MetricsStrip` inside `Reflection.parts.tsx`; renders all 8 trajectory metrics in a 2-row 4-col grid (no "6 tiles" misclaim) |
| Animated finding stream | ✅ shipped | Pure-CSS `lw-finding-enter` keyframe; new-id diff tracked in `FindingsStream.useNewIds`. |
| 1Hz timer ticker | ✅ shipped | `useTickingView` in `RunDetailLive` (and mirrored in `PreviewLiveWalk`); ticks while `hero.finishedAtMs == null` |
| Auto-scroll filmstrip to running tile | ✅ shipped | `Filmstrip` keeps a `runningTileRef` and runs `scrollIntoView` in a `useEffect` keyed on the running index. |
| Steps-tab click → switch to Filmstrip tab | ✅ shipped | `RunDetailLive.tsx` `onPickStep` now calls `setTab("filmstrip")` |
| Worker status pill | ✅ shipped | Page passes resolver result to adapter; `TopBar` already consumed `view.topBar.workerStatus`. |
| `initiated by` label change | ✅ shipped | `RunFooter` |

## 13. Acceptance criteria

The plan is done when **every** row in §1–§9 above is ✅ (or the daemon-side rows are explicitly deferred under Track B2 with a linked issue), and:

- Opening any completed `kind=flow` run from `/runs` lands on the new design with every panel populated from real data — no placeholder copy where data exists, no dropped fields.
- Realtime: starting a new walk and opening `/runs/[id]` immediately shows the run filled in within seconds of each `run_steps` insert (when B2 lands).
- Aria-snapshot tree renders for at least 90% of real `run_steps.aria_snapshot` payloads. Parser failures fall back to "raw text" view, never throw.
- `kind=change_review` runs still render via the old layout (untouched until a later PR explicitly ports them).
- Keyboard-only walkthrough of `/runs/[id]` reaches every interactive element with visible `focus-rove` rings.
- Motion audit passes with `prefers-reduced-motion: reduce`: NowDoing sweep, running tile glow, tree highlight pulse, and kinetic finding-card hover all suppress nonessential motion.

## 14. PR breakdown

To keep diffs reviewable, this lands as dashboard PRs plus a separate Track B2 daemon/runtime series:

1. **`wire-view-model-fields`** — extend `RunDetailView` / adapter with plan, surprises, metrics, step args, result summary, aria snapshot, and finding screenshot URL slots.
2. **`wire-reflection`** — Reflection tab with plan / surprises / largest_expectation_gap / persona_success_confidence / metrics.
3. **`wire-finding-screenshots`** — `finding_screenshots` signed URLs replace placeholder thumbs in `FindingsStream`.
4. **`wire-step-args`** — `extractActionTarget` + `target` / `element` tags on DetailSplit + accurate NowDoing target.
5. **`wire-aria-tree`** — `parseAriaSnapshot` + `highlightAriaTarget`; depends on `wire-step-args`.
6. **`wire-a11y-polish`** — keyboard nav on tabs, Steps→Filmstrip tab switch on row click, focus-ring verification for `display: contents` rows, reduced-motion audit.
7. **`wire-motion-polish`** — 1Hz visual timer ticker outside the live region, auto-scroll filmstrip, animated finding inserts.
8. **`persist-flow-budget`** ✅ shipped — migration + parser + sync update for YAML `budget.max_seconds`; hero subline shows remaining budget.
9. **`link-runs-to-workers`** — Track B2 schema/runtime contract that records which `agent_jobs` / `workers` row produced a run.
10. **`wire-worker-status`** — dashboard resolver/pill using the explicit run↔worker link.

`change_review` adoption is explicitly out of this PR breakdown. It conflicts with §13's acceptance criterion and belongs in a later design migration.

Track B2 (daemon-side) is its own PR series under `packages/cli` and lands independently. Without B2 the wired dashboard renders completed walks with the data that exists today, but worker attribution, live per-step inserts, screenshot-at-capture, and streamed findings remain blocked by Track B2.

## 15. What does NOT get wired in this plan

- Hover tooltips for truncated values (defer; tooltip primitive isn't in the codebase yet, would need Track A from `live-walk.md`)
- Lightbox screenshot zoom (defer; the existing `DetailSplit` preview is large enough for now)
- Multi-user "watching the walk together" presence indicators (explicit non-goal in `live-walk.md`)
- Step-level inline expansion in the Steps tab (current row click handles selection; inline expand isn't needed)
- `run_steps.aria_snapshot` parsing for non-Playwright tools — only the Playwright MCP format is supported initially. Other dispatchers' output falls back to raw text.
- Real-data wiring for `/preview/live-walk` fixtures — `TankloopPreview`, `PreviewCursor`, and the 12 `MockThumb` SVGs are static review assets by design.
- `kind=change_review` adoption — old layout stays in place until a separate plan ports it.

These are documented here so they don't reappear as "missing" in future audits.
