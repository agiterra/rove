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

**Migration**: `infra/supabase/supabase/migrations/<timestamp>_expectation_match.sql`

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

## Sequencing

1. **Day 1 morning** — migration + adapter to read `prior_plan` and
   `plan_delta` into the existing run-detail view; mock data first.
2. **Day 1 afternoon** — prompt changes in `packages/core/src/prompt.ts`:
   plan-capture prompt block + per-step verdict emission instruction.
3. **Day 2 morning** — persona extension (`prior_archetype`), flow YAML
   `prior_overrides`, schema validation in `authoring-schemas.ts`.
4. **Day 2 afternoon** — Reflection tab "Plan vs reality" section +
   filmstrip verdict chips + `expectation_match` finding lens.
5. **Day 3** — dogfood on Rove's own dashboard with a "find the workers
   page" flow + a "set up a new project" flow; iterate on the verdict
   prompt language until the deltas are useful (not noisy).

## Open questions

- **Plan-revision frequency**: should the agent be allowed to fully
  rewrite the plan mid-walk, or only mark deltas against the original?
  Recommendation: keep the original frozen (so deltas accumulate),
  allow a single "plan-revised" snapshot at most every 5 steps.
- **Multi-persona walks of the same flow**: should priors be merged
  across personas (showing where every archetype agreed reality
  diverged) or kept per-persona? Recommendation: per-persona for v1;
  cross-persona aggregation is a Phase D2 dashboard view.
- **False-positive priors**: agents will hallucinate priors that don't
  match the consumer's reality even when reality is fine. Mitigation:
  the `prior_overrides` flow field, plus a "downvote this expectation"
  affordance on each delta in the dashboard that updates a
  `prior_corrections` table for future walks.
- **Cost**: capturing the plan adds ~300-800 tokens to every walk.
  Worth it. Stays small relative to per-step screenshot cost.

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
