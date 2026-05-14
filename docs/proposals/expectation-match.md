# Expectation Match — surfacing the agent's prior plan as a finding lens

**Status**: Proposal · 2026-05-14 · Alex (Brian's agent)
**Heuristic family**: `agent.expectation_match.*`
**Sprint**: Next sprint (see `docs/BACKLOG.md`)

## The wedge

Every agent handed a goal forms a **prior plan** before any tool call:
expected route shape, expected affordances at each stop, expected step
count, anticipated friction points, archetype assumptions. Today that
plan dies in the agent's first turn — never written down, never compared
to reality. The gap between what an agent *expected to find* and what
it *actually encountered* is a class of UX finding that no rubric-based
test framework can produce, because rubrics don't carry priors.

WCAG cannot say "users expect a cart icon top-right." Nielsen cannot
say "an agent told to order pizza expects `/menu`, not `/find-a-store`."
But both gaps are economically consequential — they are exactly where
agentic conversions die.

Rove is uniquely positioned to surface them because Rove's walking
apparatus is an agent (which has priors), not a script (which does
not). This proposal externalizes the agent's plan and compares it to
reality, step by step, as a first-class finding lens.

## What the agent already produces (and we throw away)

When an agent receives "order a pizza on this webapp," before a single
tool call, four artifacts exist inside the model:

1. **Domain-prior decomposition** — canonical flow retrieved from
   training (`select → customize → cart → checkout → identity →
   payment → confirmation`), expected step count, archetype assumption.
2. **Affordance map** — expected location of cart icon, "Add to cart"
   button shape, checkout CTA prominence, address autocomplete.
3. **Friction-anticipation list** — where the agent is braced for
   trouble (account gate, address-validation, captcha, surprise modal).
4. **First-action plan** — the literal next 2-3 tool calls before the
   page is even loaded.

These exist in the agent's context regardless of whether we ask for
them. The cost of capturing is one extra prompt phase and one schema
column. The value is an entire new finding category.

## Heuristic family

```
agent.expectation_match.route        — route shape diverged from prior
agent.expectation_match.affordance   — expected affordance absent or relocated
agent.expectation_match.copy         — expected language diverged (e.g. "Order" vs "Get Started")
agent.expectation_match.step_count   — flow took meaningfully more/fewer steps than prior
agent.expectation_match.friction     — surprise friction not anticipated by prior
agent.expectation_match.archetype    — site is not the archetype agent assumed
```

Severity comes from category: a missing "Add to cart" on the product
page is `critical`; an unexpected newsletter popup is `minor`; an
extra account-creation step inside checkout is `high`.

## Mechanism

### 1. Plan-capture phase (new prompt block)

Before the first `browser_navigate`, the walk prompt asks the agent
to emit a structured `prior_plan` block:

```yaml
prior_plan:
  archetype_assumed: "shopify-style direct commerce" | "doordash-style aggregator" | "..."
  expected_route_pattern:
    - "/"
    - "/menu" | "/products" | "/order"
    - "/menu/[item]"
    - "/cart"
    - "/checkout"
    - "/confirmation"
  expected_step_count: 8
  expected_affordances_by_route:
    "/": ["primary CTA: 'Order' or 'Menu'", "site identity", "category nav"]
    "/menu": ["category list", "product grid with images + names + prices"]
    "/cart": ["cart icon prominent", "quantity controls", "subtotal", "checkout CTA primary"]
    "/checkout": ["address autocomplete", "payment options visible", "summary"]
  anticipated_friction:
    - "account creation gate"
    - "address validation failure"
    - "minimum order surprise"
  affordance_assumptions:
    - "cart icon top-right"
    - "checkout CTA is the most prominent element on /cart"
```

This is stored verbatim on `runs.prior_plan jsonb`. The agent is told
the plan is a starting point — it may revise as evidence accumulates,
but the initial capture is frozen.

### 2. Per-step delta (new run_steps column)

On each step, after the tool call resolves, the agent emits a one-line
verdict against its prior plan:

```yaml
plan_delta:
  verdict: "match" | "extension" | "surprise" | "deviation"
  what_revised: "Expected /menu to be a product grid; actually a store-locator interstitial."
  revised_plan_diff:
    expected_route_pattern_after: ["/", "/find-store", "/store/[id]/menu", ...]
```

Stored on `run_steps.plan_delta jsonb`.

**Verdict semantics:**
- `match` — reality is as expected; plan unchanged.
- `extension` — extra step the plan didn't anticipate, but coherent
  (e.g. unexpected upsell modal that's dismissable). Plan grows.
- `surprise` — friction the plan didn't anticipate but is recoverable
  (e.g. account-gate). Plan revised. Candidate finding (minor/high).
- `deviation` — reality contradicts the plan in a way that breaks it
  (e.g. expected `/cart`, redirected to a marketing page). Plan rebuilt.
  Always a finding (high/critical).

### 3. Finding-emission rules

- Every `deviation` auto-files a finding (severity inferred from
  category — route-shape > affordance > copy).
- Every `surprise` is a candidate finding; gated by anticipation
  ("if anticipated, don't double-file") and recoverability.
- Every `extension` is logged but not auto-filed; visible in the
  reflection tab so the customer sees what their UX surprises an agent
  with, even when recoverable.
- `match`es accrue silently — they're the success counter in the
  reflection tab.

### 4. Persona-level priors (Persona extension)

Personas grow an optional `prior_archetype` field on `Persona.constraints`:

```ts
constraints: {
  shortcuts_allowed: false,
  hovers_allowed: false,
  prior_archetype: "shopify-style commerce" | "doordash-style aggregator"
                 | "single-restaurant direct" | "saas dashboard"
                 | "marketplace" | "auto",
}
```

`auto` (default) means the agent infers archetype from the goal + first
landing page. Setting a fixed archetype forces the comparison against
a known prior, which is the right move when the consumer wants to test
"does my site match standard e-commerce conventions" specifically.

The same flow walked under different archetypes produces different
expectation sets — and that diff IS the data the consumer pays for.
"Walked under shopify-style prior: 12 affordance gaps. Walked under
doordash-style prior: 4 affordance gaps. You are doordash-shaped, not
shopify-shaped — train your agentic ads accordingly."

### 5. Flow-author overrides

Flow YAML grows optional `prior_overrides`:

```yaml
prior_overrides:
  archetype: "single-restaurant direct"
  do_not_expect:
    - "cart icon at top-right"   # this app uses a slide-over cart
  do_expect:
    - "delivery zone gate before menu loads"
```

This lets the consumer correct over-eager priors when their site
intentionally diverges from the archetype, *without* silencing all
expectation findings — the rest of the prior still applies.

## Schema

**Migration**: `infra/supabase/supabase/migrations/20260514120000_expectation_match.sql`

```sql
alter table public.runs
  add column if not exists prior_plan jsonb,
  add column if not exists prior_plan_captured_at timestamptz;

alter table public.run_steps
  add column if not exists plan_delta jsonb;

create index if not exists run_steps_plan_delta_verdict_idx
  on public.run_steps ((plan_delta ->> 'verdict'));

-- Findings already have heuristic_id text; no schema change needed.
-- Just start emitting heuristic_id values prefixed agent.expectation_match.*
-- Silencing + issue-export come from the substrate (see
-- finding-lifecycle-substrate.md); no schema additions here.
```

## Dashboard surface

**`/runs/[id]` Reflection tab — new "Plan vs reality" section:**

- Two-column layout: prior_plan on left (read-only), observed reality
  on right (with deltas highlighted by verdict color).
- Per-step verdict chips on the filmstrip itself
  (`match` = subtle, `extension` = yellow, `surprise` = orange,
  `deviation` = red).
- "Plan vs reality" summary stat in the hero (e.g. "7 matches · 2
  extensions · 1 surprise · 1 deviation").

**`/findings` — new lens chip `expectation_match` (parallel to `agent`
and `human` lenses).** Findings whose heuristic prefix is
`agent.expectation_match.*` filter under this chip.

## UX plan — applying the thesis to ourselves

The thesis at `docs/theses/negative-space.md` says builder-agents
cannot perceive what they did not build. Below is the *walker-agent
enumeration* of this feature's expected affordances, applied before we
build. The rest of this section reads as if it were the affordance
inventory a persona walking these surfaces would produce. Anything we
ship without these is a Rove-on-Rove finding.

### User goals (per arrival surface)

- **`/runs/[id]` reflection tab** — "Did my app match how an agent
  thinks about it? Where did reality diverge?"
- **A divergence finding detail** — "Why did this fire? What was the
  agent's expected, what was the actual, where exactly?"
- **A surprise/extension** — "Is this a problem or just a quirk? Can
  I mark it as expected so future walks don't re-flag it?"
- **`/projects/[id]` (or a settings surface)** — "What archetype am I?
  Recalibrate priors for this project so the deltas stop being
  noisy."
- **Per-flow editor** — "Override priors for this specific flow that
  legitimately diverges from the archetype."
- **`/findings`** — "Show me only the plan-vs-reality lens; rolled-up
  across walks."
- **Across walks** — "Is our plan-match score trending up or down?"
- **Hand-off to the team** — "Export this delta for our designer /
  PM / engineering lead."

### Required affordances per surface

Each line is an affordance we MUST ship. Missing any = a Rove-on-Rove
gap of the kind the heuristic would itself file.

| Surface | Required affordance | Kind (per thesis) |
|---|---|---|
| Reflection tab | "Plan vs reality" section with side-by-side diff | `read` |
| Reflection tab | Loading state while plan is being captured (first ~15s of walk) | `status` |
| Reflection tab | Empty state when no plan was captured (older walks, pre-feature) | `empty` |
| Reflection tab | Error state when plan capture failed mid-walk | `error` |
| Filmstrip | Per-step verdict chip with tooltip | `read` |
| Filmstrip | Click chip → jump to that step's detail with diff highlighted | `navigate` |
| Step detail | Inline "expected here / observed here" diff next to step | `read` |
| Step detail | "Mark this deviation as intentional" affordance | `update` (silence) |
| Step detail | Reason capture when silencing (free text) | `update` |
| Step detail | Un-silence previously-silenced deviation | `undo` |
| Step detail | Confirm-before-silencing on `critical` deviations | `confirm` |
| Hero | Plan-match summary stat with breakdown chip | `read` |
| Project settings | Archetype configurator (dropdown of known archetypes + `auto` + `custom`) | `update` |
| Project settings | Persist archetype choice; show "last updated" timestamp | `save_state` |
| Flow editor | `prior_overrides` block with `do_not_expect` / `do_expect` editor | `update` |
| Flow editor | YAML-equivalent view for advanced authors | `update` |
| `/findings` | `expectation_match` lens chip in the existing lens row | `navigate` |
| `/findings` | Sort by verdict severity (deviation > surprise > extension) | `read` |
| Finding detail | "Send to GitHub issue" action with auto-populated body | `create` |
| Finding detail | "Silence this expectation across the project" affordance | `update` |
| `/projects/[id]` | Plan-match trend chart (last N walks) | `read` |
| `/projects/[id]` | Empty state when no plans have been captured yet | `empty` |
| Top nav | A discoverable entry to plan-vs-reality findings (don't bury it) | `navigate` |

### What the thesis would flag if we shipped a minimum version

If we shipped only "the reflection-tab section + verdict chips" — the
thin version — a walker-persona auditing our dashboard would file:

- `agent.affordance_gap.update`: no way to mark a flagged deviation
  as intentional. **Critical**: noisy findings will train consumers to
  ignore the whole feature.
- `agent.affordance_gap.save_state`: archetype configurator doesn't
  exist, so the consumer cannot calibrate; all priors run on
  `auto`, which will hallucinate against atypical projects.
- `agent.affordance_gap.empty`: walks that ran before the feature
  shipped have no plan; the tab renders blank without explanation.
- `agent.affordance_gap.recover`: no way to re-run plan capture on an
  older walk; consumers cannot retroactively benefit.
- `agent.affordance_gap.navigate`: feature is only accessible from
  the reflection tab of a specific run; cross-walk rollup is missing.
- `agent.affordance_gap.create`: no way to export a deviation to the
  consumer's issue tracker; findings die on the dashboard.

These are NOT optional. They are the affordances a user with the
relevant goal needs in order to *use* this feature. We will not ship
without them.

### What this adds to the sequencing

The original "2-3 days" estimate covered the capture path + render +
auto-finding emission. The UX plan adds:

- Silence/un-silence/confirm affordances (~half day, shared primitive
  with `affordance-gap`'s silencing — see that proposal's UX plan)
- Archetype configurator on `/projects/[id]` (~half day)
- Empty / error / loading states (~quarter day)
- Trend chart on the project page (~half day)
- GitHub issue export (~quarter day, shared primitive with
  `affordance-gap`)

Revised estimate: **3-5 days** end-to-end. The shared finding-lifecycle
primitives below should be built once and reused across both
proposals.

### Shared primitives (DRY across the two next-sprint proposals)

The following are co-required by both `expectation-match` and
`affordance-gap`. Build once:

1. **Finding silence/un-silence** — a `findings.silenced_at` +
   `findings.silence_reason` pair, RPC for toggle, UI affordance with
   confirm-on-critical and free-text reason capture.
2. **Finding → GitHub issue** — uses the existing GitHub App
   credentials; auto-populates issue title from heuristic +
   suggested_location, body from evidence.
3. **Project-level trend chart** — a generic finding-count-over-time
   visualization that takes a heuristic prefix as a parameter.
4. **Empty/loading/error states** — a shared set of dashboard
   primitives keyed to "this surface has no data yet" /
   "data is being captured" / "data capture failed."

These ARE the finding-lifecycle work currently sitting in BACKLOG as
"mark fixed / snooze / suppress." They should land in this sprint as
the substrate that both new proposals depend on.

## Sequencing

Assumes Day 1 substrate (`finding-lifecycle-substrate.md`) and Days
2-3 affordance-gaps (`affordance-gaps.md`) have shipped. This is the
journey-level companion to the page-level work landed previously.

1. **Day 4 morning** — migration `20260514120000_expectation_match.sql`;
   adapter to read `prior_plan` and `plan_delta` into the existing
   run-detail view; mock data updated in `mock-data.ts`.
2. **Day 4 afternoon** — prompt changes in
   `packages/core/src/prompt.ts`: plan-capture prompt block before the
   first `browser_navigate`, per-step verdict emission instruction.
3. **Day 5 morning** — persona extension (`prior_archetype` field on
   `PersonaConstraints` in `packages/core/src/types.ts`); flow YAML
   `prior_overrides`; schema validation in
   `packages/core/src/authoring-schemas.ts`; defaults set on built-in
   personas (`built-in.ts`).
4. **Day 5 afternoon** — Reflection-tab "Plan vs reality" section
   (consumes substrate's empty/loading/error shells); filmstrip
   verdict chips on `Filmstrip.tsx`; archetype configurator on
   `/projects/[id]`; substrate's `FindingSilenceButton` +
   `FindingSendToIssueButton` wired per finding; substrate's
   `FindingTrendChart` on `/projects/[id]` with
   `heuristicPrefix="agent.expectation_match"`.
5. **Day 5 close — dogfood**:
   - Author `examples/flows/dashboard-setup-new-project.flow.yaml`
   - Run with `internal-user` persona,
     `prior_archetype: "saas-dashboard"`
   - Verify the prior_plan was captured + the reflection tab renders
   - Confirm at least one `agent.expectation_match.deviation` and
     one `agent.expectation_match.affordance` fired

## Open questions

- **Plan-revision frequency** [non-blocking, default: keep the
  original frozen; allow ONE plan-revised snapshot at most every 5
  steps]: should the agent fully rewrite the plan mid-walk, or only
  mark deltas against the original? Frozen original preserves the
  honesty of the diff.
- **Multi-persona walks of the same flow** [deferred to Phase D2]:
  should priors be merged across personas, or kept per-persona?
  Per-persona for v1; cross-persona aggregation is a separate
  dashboard view.
- **False-positive priors** [non-blocking, default: `prior_overrides`
  in flow YAML is primary mitigation; per-delta "downvote" in
  dashboard is secondary]: agents hallucinate priors that don't match
  reality. A `prior_corrections` learned table is a future feature;
  not v1.
- **Cost** [non-blocking, default: accept ~300-800 tokens per walk
  for plan capture]: small relative to per-step screenshot cost.

## Definition of done (closes audit F6 + F9)

### Component-level

- [ ] Migration `20260514120000_expectation_match.sql` applied to
      local + hosted Supabase; `runs.prior_plan jsonb`,
      `runs.prior_plan_captured_at timestamptz`, `run_steps.plan_delta
      jsonb` columns exist
- [ ] Walk prompt's plan-capture phase emits a valid YAML/JSON
      `prior_plan` before the first `browser_navigate`; structured
      fallback if the agent produces malformed output
- [ ] `runs.prior_plan` populated for every new walk; mock data in
      `mock-data.ts` updated with a realistic prior plan
- [ ] Per-step verdict emission populated on `run_steps.plan_delta`
      with one of `match | extension | surprise | deviation`
- [ ] Auto-finding emission: every `deviation` fires a `findings`
      row with `heuristic_id = 'agent.expectation_match.<kind>'`,
      severity inferred from category (route > affordance > copy)
- [ ] Filmstrip verdict chips render for all four verdicts on
      `Filmstrip.tsx`; clicking a chip jumps to that step's detail
      with the inline expected/observed diff
- [ ] Reflection-tab "Plan vs reality" section renders with
      substrate's empty / loading / error states
- [ ] `<DetailSplit>` step-detail pane renders the inline
      expected-vs-observed diff
- [ ] Project settings archetype configurator on `/projects/[id]`
      writes `projects.prior_archetype` and is picked up by the next
      walk
- [ ] Flow YAML `prior_overrides` validates via zod in
      `authoring-schemas.ts`
- [ ] `PersonaConstraints.prior_archetype` added in `types.ts`; built-in
      personas updated in `built-in.ts`; `.claude/rules/personas-and-flows.md`
      reflects the new field
- [ ] Substrate's `FindingSilenceButton` + `FindingSendToIssueButton`
      render on expectation-match findings and work end-to-end
- [ ] Substrate's `FindingTrendChart` renders on `/projects/[id]`
      with `heuristicPrefix="agent.expectation_match"`

### Dogfood spec

- **Flow file** (NEW):
  `examples/flows/dashboard-setup-new-project.flow.yaml`
- **Persona**: `internal-user` with
  `prior_archetype: "saas-dashboard"`
- **Goal**: "Sign in to Rove and set up a brand-new project called
  'demo-project'"
- **Expected findings**:
  - ≥ 1 `agent.expectation_match.deviation` — likely surfaces around
    the auth + redirect behavior or unfamiliar nav structure
    (the saas-dashboard prior expects in-app project creation; our
    `/projects/new` route has its own opinions)
  - ≥ 1 `agent.expectation_match.affordance` — the persona's
    expected affordances on the project settings page vs. what we
    actually expose
- **Exit gate**:
  - **Fail** if no `prior_plan` was captured (the capture phase
    didn't run — investigate prompt + adapter)
  - **Fail** if 0 deviations AND 0 affordance mismatches (the
    verdict-emission phase didn't run, OR the persona perfectly
    matched our app — investigate)
  - **Pass** if `prior_plan` captured + rendered in the reflection
    tab + ≥ 1 deviation + ≥ 1 affordance mismatch + the verdict
    chips render correctly on the filmstrip

### Substrate consumption

- [ ] Expectation-match findings render with substrate components
      `FindingSilenceButton`, `FindingSendToIssueButton`
- [ ] `/projects/[id]` consumes substrate's `FindingTrendChart` for
      this proposal's heuristic family alongside the
      affordance-gaps trend chart

## Why this is the wedge

Every deterministic test framework asks "did the script's expected
state match the observed state?" Rove asks "did the *agent's* expected
state match the observed state?" The agent's expected state carries
domain knowledge the script doesn't have access to. That is the
unique-to-Rove signal — and the reason no Playwright or Applitools or
similar can build this lens. They have no apparatus that *expects*
anything.

We are not adding instrumentation. We are externalizing knowledge the
agent already produces and throws away. The cost-curve is fundamentally
better than "capture more pixels / write more assertions."
