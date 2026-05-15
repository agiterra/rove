-- Affordance gaps — page-level negative-space wedge.
-- Proposal: docs/plans/affordance-gaps.md
--
-- Each run_steps row may carry an `affordance_gaps` jsonb array. Each
-- element is one missing affordance the persona enumerated at that
-- substantive page:
--
--   [
--     { "kind": "delete",
--       "expected_for": "internal-user managing the property they just created",
--       "severity": "critical",
--       "evidence": "Toolbar shows Edit + Share; no Delete in toolbar or overflow.",
--       "suggested_location": "Toolbar overflow menu, with confirmation"
--     },
--     ...
--   ]
--
-- The companion boolean `affordance_enum_phase` records whether the
-- per-step enumeration phase actually ran (filters substantive vs. transient
-- pages without re-checking the throttle logic in queries).
--
-- The findings table already accepts `agent.affordance_gap.<kind>` ids;
-- no schema change there. The auto-emission path is in the sink layer.

alter table public.run_steps
  add column if not exists affordance_enum_phase boolean not null default false,
  add column if not exists affordance_gaps       jsonb;

-- jsonb_path_ops is the right operator class for "contains" queries that
-- ask "find me rows whose affordance_gaps array contains a gap of kind
-- 'delete'" — the dominant query shape on the /projects/[id]/gaps rollup.
create index if not exists run_steps_affordance_gaps_idx
  on public.run_steps
  using gin (affordance_gaps jsonb_path_ops);

comment on column public.run_steps.affordance_gaps is
  'Array of {kind, expected_for, severity, evidence, suggested_location} objects, per docs/plans/affordance-gaps.md §1.';
comment on column public.run_steps.affordance_enum_phase is
  'True when the per-page affordance enumeration phase ran on this step (substantive page).';
