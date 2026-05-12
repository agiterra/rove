-- §0 item #5 — change-review walk. Walks a changed route under a local
-- design contract inferred from reference routes; reports coherence,
-- intent, and navigation deltas. The runs.kind column discriminates;
-- changed_routes / reference_routes / design_contract / deltas hold the
-- per-walk data. Findings carry heuristic='change.<kind>' so the existing
-- dedup + GH-issue pipeline works unchanged.
--
-- All fields are nullable / default to the flow shape; existing rows
-- continue to render as flow runs.

alter table public.runs
  add column kind             text not null default 'flow',
  add column changed_routes   jsonb,
  add column reference_routes jsonb,
  add column design_contract  jsonb,
  add column deltas           jsonb;

alter table public.runs
  add constraint runs_kind_check
  check (kind in ('flow', 'change_review'));

comment on column public.runs.kind is
  'Walk kind. flow = standard persona walk of a flow. change_review = walk a changed route under a local design contract.';
comment on column public.runs.changed_routes is
  'Array of routes the reviewer evaluated (the surface under review).';
comment on column public.runs.reference_routes is
  'Array of neighboring routes the reviewer inspected to infer the design contract.';
comment on column public.runs.design_contract is
  'Local design pattern inferred from reference_routes — used as the baseline the changed route is judged against.';
comment on column public.runs.deltas is
  'Array of { kind, expected, observed, why_it_matters, step_index? } entries — one per material divergence.';

create index runs_kind_idx on public.runs(project_id, kind, started_at desc);
