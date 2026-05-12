-- §0 item #4 — tool-call telemetry via the MCP-proxy wrapper.
--
-- Every JSON-RPC message between Claude and @playwright/mcp gets one row
-- here. The sink writes these post-walk from a JSONL log the proxy emits.
-- ARIA snapshots land in aria_snapshot (large, ~10–50 KB each); other
-- response bodies summarize into result_summary so storage stays bounded.
--
-- The per-run metrics roll-up lives on runs.metrics so the dashboard's
-- summary strip is one column read, not an aggregate query.

create table public.run_steps (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid not null references public.runs(id) on delete cascade,
  project_id      text not null,
  step_index      int not null,
  direction       text not null check (direction in ('call', 'result', 'error')),
  tool_name       text,
  args            jsonb,
  result_summary  text,
  aria_snapshot   text,
  screenshot_key  text,
  url_after       text,
  duration_ms     int,
  created_at      timestamptz not null default now()
);

create index run_steps_run_idx on public.run_steps(run_id, step_index);
create index run_steps_project_idx on public.run_steps(project_id, created_at desc);

alter table public.runs add column metrics jsonb;

comment on column public.runs.metrics is
  'Aggregate trajectory metrics derived from run_steps: actual_tool_calls, snapshots, actions, snapshots_per_action, recovery_count, time_to_first_action_ms.';

alter table public.run_steps enable row level security;

create policy run_steps_read on public.run_steps
  for select using (public.is_team_member());
