# Plan — Live Walk (and the UI Rove deserves)

**Status**: ✅ **Shipped 2026-05-14** (alpha.11 Track B2 + alpha.12 MCP-proxy race fix). Dashboard wiring AND daemon-side both shipped. Evidence: `liveStepWrites` plumbed through `claude-code-cli.ts → playwright-mcp-proxy.mjs`; per-step row inserts/PATCHes; screenshot streaming to the `walks` bucket; dashboard filmstrip auto-updates via Supabase Realtime on `agent_jobs` + `run_steps` channels. Original "Wired vs owed" section below now reads as historical.
**Owner**: Brian.
**Why now**: Today a walk goes silent for 2–5 minutes and then dumps 51 findings at once. Step events, screenshots, and aria snapshots all exist in the daemon — they just don't reach the dashboard until the walk completes. Surfacing them live turns the run page from a post-mortem into a live trace and gives Rove its first credible "marketing artifact." Equally important, it forces us to fix the dashboard's UX before we ask anyone outside Agiterra to look at it.

## The meta-principle this plan exists to enforce

> **Agents are excellent at shipping features and terrible at shipping the UI/UX those features deserve.** Rove exists *precisely* to catch this gap — the whole point of the two-sided readiness wedge is that "the data path works" is not the same as "a human (or another agent) can actually use it." If we ship a live-walk pipeline with a static, ad-hoc dashboard wrapper, we have dogfooded the failure mode our product is supposed to expose.

Every PR in this plan ships **paired** with the UI that surfaces its data. No PR may merge with a "UI polish follow-up TBD" note. The acceptance gate at the bottom is a real visual review, not a checkbox.

## Goal

When a user clicks **Run walk** from a flow detail page, the run detail page (`/runs/[id]`) becomes a live workspace they want to watch:

- A filmstrip of thumbnails grows in real time, one tile per Playwright step, captured from the actual browser the daemon is driving.
- Each tile shows step number, tool name, status (running / done / errored), elapsed time, and the URL after the step.
- Clicking a tile zooms the screenshot into a lightbox with the aria-snapshot, tool args, and result on the side.
- A live "currently doing" indicator at the top describes what the agent is reading / clicking / submitting *right now*.
- Findings stream in as the agent files them — not in a final dump.
- The page is visually distinctive: brand-aware, motion-aware, dense without being noisy. It's something you'd take a screen recording of and share.

When the walk finishes the same page becomes the post-mortem, with no jarring layout shift — same filmstrip, same lightbox, just frozen.

## Non-goals

- **Streaming agent text / inner monologue.** The Agent SDK migration will unlock this; not in scope here. We're surfacing tool calls + screenshots + aria, which is enough to make the walk legible.
- **Replay scrubbing past walks "like a video".** Once the walk finishes, the filmstrip is a static index of the same data. We're not building a timeline scrubber with VHS controls.
- **Dashboard-wide redesign.** Track A fixes the foundation so all pages benefit, but we are not touching `/flows`, `/findings` table layout, or the wizard flows beyond the typography/component primitives.
- **A real-time multi-user "watching the walk together" experience.** Realtime subscriptions naturally support it, but we won't add presence indicators / cursor sharing.

## Dependencies

- None blocking. Worker-tokens, install-flow, and the install-code sweep all shipped. The only infra we need is a column add on `run_steps` (for the per-step screenshot path) and Supabase Storage uploads inside the daemon, both of which extend existing patterns.

## Wired vs owed (as of branch `live-walk-preview`)

A single PR (`live-walk-preview`) carries every visual + dashboard-side piece needed to call `/runs/[id]` "live-walk-shaped". The remaining work is **daemon-side** — code in `packages/cli/src/daemon/runner.ts` and the MCP proxy — and is intentionally not part of this branch since it changes the actual walk runtime and warrants targeted review.

**Shipped on `live-walk-preview`:**

- `.stitch/DESIGN.md` — Rove's brand-as-constraints doc.
- `components/run-detail/` — parameterized React port of the Claude Design handoff: `Hero`, `Filmstrip`, `TabBar`, `DetailSplit`, `TankloopPreview` (preview only), `FindingsStream`, `RunFooter`, `TopBar`, `MockThumbs` (12 light-theme SVG mock screenshots), `NowDoingPill`.
- `components/run-detail/types.ts` + `adapters.ts` — view-model decoupling from raw Supabase rows. `buildRunDetailView(run, steps, findings, signedScreenshotUrls?)` normalizes status, derives NowDoing from the latest step, resolves screenshots to signed-URL / placeholder.
- `components/run-detail/RunDetailLive.tsx` — client wrapper: tab state, selected-step state, auto-follow-the-running-tile until user picks manually, deep-links to `/findings?run=X&open=Y`.
- `components/run-detail/useLiveRun.ts` — Realtime subscription on `runs` + `run_steps` + `findings` filtered by `run_id`. `setAuth` before subscribe, catch-up read on `SUBSCRIBED`, 5s safety-net poll while `status === "running"`.
- `app/runs/[id]/page.tsx` — server reads + signed URL minting (service-role, batch, 10-min TTL, graceful fallback) + render `<RunDetailLive>`. `kind === "change_review"` keeps its existing components untouched.
- `/preview/live-walk` — same components, fed by `buildMockRunDetailView()`. Stays as the visual reference target.
- `globals.css` — hero glow layers, indent-rail aria-tree connectors, `.tk-*` Tankloop preview styles, four new keyframes, reduced-motion fallbacks.

**Still owed (separate PRs):**

- **Track B2** — daemon-side per-step writes. The MCP proxy needs an explicit live-write mode: pass `run_id` / `project_id` / auth config into the proxy, insert a `run_steps` row at each `tools/call` request (`direction='call'`), maintain `jsonrpc id → row id`, and update that row on response. Today the dashboard only sees rows after the daemon's post-walk batch sync, so an in-progress walk on `/runs/[id]` will look mostly empty until the daemon settles.
- **Track B2 (continued)** — screenshot uploads at capture time. Playwright MCP writes screenshots into its `--output-dir`; the proxy should read the local file after a `browser_take_screenshot` response, upload it, and populate `run_steps.screenshot_key`. Do not assume the response contains PNG bytes.
- **aria-snapshot parser.** `run_steps.aria_snapshot` is captured but unparsed. The `DetailSplit` a11y tree panel currently shows "No aria-snapshot captured for this step yet" for every real-data step.
- **Worker-status pill in `TopBar`** — hard-coded to `unknown` for real `/runs/[id]`. This needs a run↔job/worker identity link first (`agent_jobs.claimed_by_worker_id → workers.id` is valid, but there is no run→job link today); after that the dashboard can show online/offline.
- **Completed-walk hero variant tweaks** — outcome glow (cyan for goal reached, rose for not reached) is wired; needs visual review on real completed runs.
- **`change_review` adoption.** This branch leaves `kind === "change_review"` on the old layout intact. A later PR ports it to the new components.

## How this is structured

Five tracks. **Track A lands first** because it pays off across the whole plan and the whole dashboard. Tracks B / C / D run in roughly parallel and each lands a PR pair (data + UI). Track E is the closeout that forbids regressions.

| Track | Lands | Purpose |
| --- | --- | --- |
| A — Design foundation | First, gating the rest | Reusable primitives + typography scale + focus / motion / a11y baseline |
| B — Live data plumbing | Parallel to C / D | DB column + daemon-side live writes + screenshot streaming |
| C — Live-walk components | Parallel to B / D | Filmstrip, step row, lightbox, "currently doing" pill, finding stream |
| D — Run-detail rewrite | After A; needs B + C | The new `/runs/[id]` page that integrates everything |
| E — Closeout / a11y / motion | Last | Focus rings, keyboard nav, reduced-motion, screen-reader pass |

The plan totals ~14 PRs. The minimum to call "live walk shipped" is **A1, A2, B1, B2, B3, C1, C2, C3, D1, E1** — ten PRs. The rest (A3, C4, D2, E2) are visual quality improvements that the meta-principle says we are not allowed to defer to "phase 2."

---

## Track A — Design Foundation (lands first)

The Explore agent surveyed the current dashboard and the findings are summarized as:
> *Strong CSS foundations (semantic vars, aurora gradient, kinetic-hover), scattered UI components, arbitrary font sizes proliferate, table headers inconsistent across pages, no focus states, hardcoded status colors, no skeletons or shared button/badge primitives.*

We close that gap **before** building feature UI on top of it. Otherwise we paint mud.

### A1 — Typography + spacing + radii + motion scale (CSS vars + tailwind config)

- Add to `apps/dashboard/app/globals.css` a typed scale: `--text-eyebrow`, `--text-caption`, `--text-body`, `--text-lead`, `--text-h3`, `--text-h2`, `--text-h1`, `--text-display`. Each pairs `font-size` + `line-height` + `letter-spacing` + `font-weight`. Replace the literal `text-[10px]` / `text-[11px]` / `text-[40px]` smatter on `runs/[id]` + `findings` + `workers` pages first (those are the most-used surfaces).
- Add `--space-{1..8}`, `--radius-{sm,md,lg,xl}`, `--shadow-{soft,raised,glow-cyan}`. Replace ad-hoc Tailwind opacity-suffix tricks (`/40`, `/60`) with a real surface token set.
- Add `--motion-{instant,fast,base,slow}` for transition durations and a `--ease-rove` cubic-bezier we use everywhere.
- Define a single `:focus-visible` ring utility (`.focus-rove`) — outline-offset, 2px cyan ring, no layout shift. **Required on every interactive element from this PR forward.**
- Add a `prefers-reduced-motion: reduce` block that suppresses `kinetic-hover` and any new motion utilities we add.

Visual deliverable: a screenshot of `/runs/[id]` before and after, demonstrating consistent type hierarchy.

### A2 — Reusable primitives (Button, Badge, Pill, Skeleton, EmptyState canon, Tabs)

A small `apps/dashboard/components/ui/` directory. **No shadcn** — we keep ownership of the primitives; we're a UI quality company. Each primitive is < 100 lines, no dependencies beyond `clsx`, `lucide-react`, and our own tokens.

- `Button` (variants: primary / secondary / ghost / destructive; sizes: sm / md; loading state with spinner; `asChild`-style `<Link>` polymorphism via `as` prop)
- `Badge` and `Pill` (severity / status / count variants — both derive colors from `--color-severity-*` and `--color-accent-*`; replace the per-page inlined `SeverityBadge` / `StatusBadge` / `StatusPill`)
- `Skeleton` (lines + blocks; pulsing animation that respects reduced motion)
- `EmptyState` (canonicalize the existing one in `page-header.tsx`; standardize the `icon + headline + subline + action` layout)
- `Tabs` (used by the new run detail page to switch between filmstrip / step list / findings views)
- `Tooltip` (thin wrapper over a portal; for truncated cells, filmstrip step labels, and aria-snapshot peeks)

Migration: replace every inlined primitive in `findings/`, `runs/`, `workers/`, `setup/`. The diff per page should be ~20–40 lines removed, ~5 lines added.

Visual deliverable: side-by-side of each existing page with the inlined-primitive vs primitive-component version. They should look identical (or better — focus states + reduced-motion behavior + truncation handling).

### A3 — Lightbox + aria-snapshot tree renderer

These are new primitives the live-walk work needs but no other page does, so they live in `components/ui/` next to Track A2.

- `Lightbox` — full-screen image modal with prev/next + escape-to-close + click-outside-to-dismiss + zoom-to-fit / 1:1 toggle. Keyboard-driven first (arrows / esc), pointer second. Used by `LiveFilmstrip` and the existing `FindingDrawer`.
- `AriaSnapshot` — renders the `aria_snapshot` text (a serialized accessibility tree) as a collapsible tree. Each node has its role, name, value. Hover highlights the corresponding portion of the screenshot if both are present (stretch).

A3 is *not* strictly required to ship live walk, but it is required to ship live walk **as something a person wants to look at**. Treat it as load-bearing for the meta-principle.

---

## Track B — Live data plumbing

### B1 — `run_steps` schema update + storage upload helper

The current schema already has `run_steps.screenshot_key` and `direction in ('call','result','error')`. Do **not** add parallel `screenshot_path` / `status` columns unless a later migration explicitly replaces the existing model.

This track adds a small storage helper that uploads a single screenshot from the MCP output directory to Supabase Storage and returns the `screenshot_key` path. Re-used by B2 and the post-walk reconciliation path.

### B2 — daemon-side per-step writes (replace the post-walk batch)

Today the MCP proxy at `packages/cli/bin/playwright-mcp-proxy.mjs` tees JSON-RPC traffic to a local `trajectory.jsonl`, and the sink at `packages/cli/src/sinks/supabase.ts` parses + inserts after the walk finishes. We flip the order:

- The proxy gets a Supabase write hook. On each `tools/call` request / response pair:
  - Insert a new `run_steps` row with `direction = 'call'` at request time.
  - Store `jsonrpc id → step row id` so the response updates the correct row.
  - On response, update it to `direction = 'result'` / `'error'` with `result_summary`, `aria_snapshot` when the response includes one, `duration_ms`, and `url_after`.
  - For `browser_take_screenshot` responses, read the screenshot from MCP `--output-dir`, upload it to Supabase Storage, and stamp `run_steps.screenshot_key`.
  - This requires the proxy to receive `run_id`, `project_id`, and write credentials/config explicitly; the current proxy only tees JSON-RPC frames to a local file.
- The local `trajectory.jsonl` write stays as a debugging fallback and as the source of truth if the daemon ever runs offline.
- The post-walk parse-and-batch path becomes a reconciliation pass: on walk completion, the sink reads `trajectory.jsonl` and `upsert`s any steps the live pipeline missed (network blip safety net).

### B3 — finding stream

Findings already land in the `findings` table at walk-end. Move the insert to happen *as the agent emits each finding* (the `<<<FINDINGS_JSON>>>` markers can be incrementally parsed by streaming `claude --print` stdout). One row per finding, inserted immediately. The dashboard's existing findings subscription picks them up.

---

## Track C — Live-walk components

These are new components that consume the data B writes. They live in `apps/dashboard/components/live-walk/`.

### C1 — `LiveFilmstrip`

A horizontal scrollable strip of step tiles. Each tile is the thumbnail (240×135ish) plus a step number, tool name, and status dot (running / done / errored). New tiles fade-in and slide left as they arrive. The currently-running tile pulses. Clicking opens the lightbox (Track A3) on that step. Keyboard: arrow keys move through the strip; enter opens lightbox.

Default state when there are no steps yet: a Skeleton row of 6 tiles. Empty state when the walk has finished and no steps recorded: `EmptyState` with a "this walk had no observable steps — check the run log" copy.

### C2 — `LiveStepList`

The dense vertical alternative to the filmstrip. One row per step: status icon, step #, tool name + args, URL after, duration. Click expands inline to show aria-snapshot tree (Track A3) + raw result JSON. Tab switching between filmstrip and list is built into the run detail page (Track D).

### C3 — `NowDoing` indicator

A small pill near the top of the run detail page that describes the agent's current action in natural language. Source: the latest in-flight `run_steps` call row (`direction = 'call'`) before its matching `result` / `error` reconciliation; there is no `run_steps.status` column. Examples: `Reading the page at /admin/scheduling`, `Clicking "Create job"`, `Filling form field "Customer email"`. The mapping from tool name → human description is a small lookup table.

When the walk completes, the pill collapses into a static `Walk completed in X minutes (Y steps)` summary.

### C4 — `FindingsStream`

Replaces the inline findings section on the run page. Each new finding fades in at the top with its severity badge, title, heuristic, and a thumbnail of any screenshot. Hovering reveals the description preview. Clicking opens the existing FindingDrawer (now using A3's Lightbox internally).

This one is sometimes considered "nice to have" — it isn't. A 3-minute walk that surfaces 12 findings batched at minute 3 vs streaming-as-found is the difference between an exciting product and an opaque one.

---

## Track D — Run-detail rewrite

### D1 — new `/runs/[id]` page composed from C1–C4

A fresh `apps/dashboard/app/runs/[id]/page.tsx` that integrates the new components and keeps the existing hero / plan / reflection sections. Layout in three zones:

```
┌────────────────────────────────────────────────────────────┐
│  Hero: goal · persona · target · status · NowDoing pill    │  ← C3
├────────────────────────────────────────────────────────────┤
│  Filmstrip (default tab) | List | Findings | Reflection    │  ← Tabs
├────────────────────────────────────────────────────────────┤
│  Selected tab content                                       │
│   - Filmstrip view → C1 + lightbox on click                 │
│   - List view → C2 with inline expansion                    │
│   - Findings view → C4                                      │
│   - Reflection view → unchanged hero/plan/reflection sections│
└────────────────────────────────────────────────────────────┘
```

Realtime subscriptions: one on `run_steps WHERE run_id = X`, one on `findings WHERE run_id = X`, one on `runs WHERE id = X` (for terminal-state transitions). All three follow the existing `lib/authoring/wait-for-job.ts` pattern (set realtime auth → subscribe → catch-up read on subscribe → resolve on terminal state).

### D2 — `/runs` list page upgrade

Less important, but the new design system makes the runs list look out of date. Update the runs list to use the new `Badge` / `Pill` primitives and the new typography scale. Add a tiny live-progress sparkline column for any run with `status = 'running'` (step-count + elapsed time, updates via realtime).

---

## Track E — Closeout / a11y / motion

This is the meta-principle made concrete. The plan does not merge its last PR until every item below is true.

### E1 — Required at merge

- [ ] Every interactive element in every page modified by this plan has a visible `:focus-visible` ring using `.focus-rove`.
- [ ] Tab order on `/runs/[id]` is sensible: hero → tabs → tab content → footer. No focus traps.
- [ ] Keyboard-only walkthrough of `/runs/[id]` (no pointer) reaches every action.
- [ ] All new motion respects `prefers-reduced-motion: reduce`.
- [ ] No hardcoded hex / rgb in any new component (must use CSS vars from A1).
- [ ] No `text-[Npx]` arbitrary literals in any new component (must use scale tokens).
- [ ] Filmstrip + lightbox + step list + finding stream pass axe-core's automated a11y pass with zero violations.
- [ ] Each PR description includes a screenshot or short screen recording of the changed UI on `rove-agiterra.vercel.app` preview.

### E2 — Polish before declaring done

- [ ] Loading states everywhere a fetch can block (no blank flashes).
- [ ] Empty states everywhere a list can be empty (uses canonical `EmptyState`).
- [ ] All long text truncates with tooltip (Track A2's `Tooltip`), never overflows.
- [ ] No layout shift when a new step arrives in the filmstrip — the strip grows, the page doesn't jump.
- [ ] Dark theme works (we're dark by default; verify the new tokens render in light theme too even if light theme isn't shipped yet).

---

## Acceptance criteria

We have shipped live walk **only when** all of the following are true:

1. A teammate (not Brian) clicks **Run walk** on a flow and, **within 5 seconds**, sees the filmstrip start populating.
2. They can watch the agent's progress at step granularity without refreshing.
3. They can click a filmstrip tile and see the screenshot full-sized with the aria-snapshot and tool result beside it, without leaving the page.
4. Findings appear in the page as they're filed, not in a batch.
5. The page works fully via keyboard (no pointer required).
6. The page is something the team would *send a screen recording of* in a sales / hiring / fundraising conversation. If we wouldn't share it, we haven't finished it.

The meta-principle test: if a teammate's first reaction to the new run page is "this looks like a real product," we won. If it's "looks like Claude built it in two hours," we owe Track E another pass.
