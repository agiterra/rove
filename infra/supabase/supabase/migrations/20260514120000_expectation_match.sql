-- ─────────────────────────────────────────────────────────────────────────
-- Expectation-match — externalize the agent's prior plan + per-step verdict.
--
-- The wedge: every walker agent forms a prior plan (expected route shape,
-- expected affordances, anticipated friction) before any tool call. Today
-- that plan dies in the agent's first turn. This migration adds:
--
--   1. runs.prior_plan jsonb               — the structured plan captured
--                                            BEFORE the first browser_navigate.
--   2. runs.prior_plan_captured_at         — timestamp the plan was frozen.
--   3. run_steps.plan_delta jsonb          — per-step verdict against the plan:
--                                            match | extension | surprise | deviation.
--   4. run_steps_plan_delta_verdict_idx    — expression index on verdict for
--                                            fast filmstrip filtering ("only
--                                            show me the deviations").
--   5. projects.prior_archetype text       — per-project archetype prior the
--                                            walker uses when no flow-level
--                                            override applies. NULL → "auto".
--
-- See: docs/plans/expectation-match.md
--
-- Idempotent: add-if-missing.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.runs
  add column if not exists prior_plan jsonb,
  add column if not exists prior_plan_captured_at timestamptz;

comment on column public.runs.prior_plan is
  'Walker''s frozen prior plan captured before the first browser_navigate. Shape: archetype_assumed, expected_route_pattern[], expected_step_count, expected_affordances_by_route, anticipated_friction[], affordance_assumptions[]. See expectation-match proposal.';

comment on column public.runs.prior_plan_captured_at is
  'Timestamp the prior plan was frozen. Diverges from runs.started_at when the walker authored the plan inline before navigating.';

alter table public.run_steps
  add column if not exists plan_delta jsonb;

comment on column public.run_steps.plan_delta is
  'Per-step verdict against the walker''s prior plan. Shape: { verdict: "match"|"extension"|"surprise"|"deviation", what_revised?: string, revised_plan_diff?: object }. Every deviation auto-files an agent.expectation_match.* finding.';

create index if not exists run_steps_plan_delta_verdict_idx
  on public.run_steps ((plan_delta ->> 'verdict'));

alter table public.projects
  add column if not exists prior_archetype text;

comment on column public.projects.prior_archetype is
  'Default archetype prior for walks against this project. One of: shopify-style-commerce | doordash-style-aggregator | single-restaurant-direct | saas-dashboard | marketplace | auto. NULL is treated as "auto".';
