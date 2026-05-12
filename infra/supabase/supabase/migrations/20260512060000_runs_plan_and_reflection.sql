-- §0 item #2 — pre-walk plan + post-walk reflection + surprises.
--
-- Scalar columns (`predicted_step_count`, `actual_step_count`,
-- `largest_expectation_gap`, `persona_success_confidence`) are surfaced for
-- queryable trends and dashboard tiles. Structured artifacts (`plan`,
-- `surprises`) live in jsonb because their shape is the agent's responsibility
-- and the dashboard renders them as-is.
--
-- All fields are nullable. Walks predating this migration render an empty
-- state on the run detail page; nothing is backfilled.

alter table public.runs
  add column plan                       jsonb,
  add column surprises                  jsonb,
  add column predicted_step_count       int,
  add column actual_step_count          int,
  add column largest_expectation_gap    text,
  add column persona_success_confidence numeric(3, 2);

comment on column public.runs.plan is
  'Walk plan authored by the agent BEFORE any browser call (Phase A).';
comment on column public.runs.surprises is
  'Mid-walk divergences from the plan (Phase D). One row per divergence.';
comment on column public.runs.persona_success_confidence is
  'Adversarially-elicited 0.0-1.0 probability another user of this persona succeeds.';
