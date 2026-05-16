-- ─────────────────────────────────────────────────────────────────────────
-- Heartbeat-driven liveness for runs.
--
-- The problem: `runs.status='running'` is a stored fact that can lie. If a
-- dispatcher process dies before the sink writes its `completeRun` update
-- (terminal closed, OOM, crash, manual ctrl-C), the row stays `running`
-- forever. The 2026-05-15 sweep_stuck_runs migration patched the symptom
-- by adding a daemon-driven sweep, but if no daemon is up for that
-- project, the rows never settle. We hit this on rove-dogfood — two walks
-- sat `running` for 35 hours because the project's daemon wasn't running.
--
-- The fix: stop treating `status` as the source of truth. Truth is in
-- timestamps. Effective status is derived from them via a view, so any
-- direct reader (dashboard, CSV export, future webhook) sees consistent
-- state regardless of whether a sweep has run yet. A cron entry can write
-- the derived state back to the column on a cadence so the on-disk row
-- eventually matches.
--
-- Day-one shape:
--   1. `runs.heartbeat_at` — the liveness contract. Any process claiming
--      to be `running` MUST keep this column fresh. Default = now() so
--      newly-inserted rows start alive.
--   2. AFTER INSERT trigger on `run_steps` bumps `runs.heartbeat_at`.
--      The daemon already writes a step per action; no daemon code change
--      needed. Future dispatchers (Operator, Wire-relay) inherit liveness
--      by writing steps. A dispatcher that won't write steps can update
--      `heartbeat_at` directly.
--   3. `effective_run_status(runs)` — pure SQL function deriving the
--      truth from timestamps. No state to be wrong about.
--   4. `runs_with_status` view — every column of runs plus
--      `effective_status`. Dashboard reads switch to the view at their
--      leisure; nothing breaks until they do.
--   5. `sweep_stuck_runs_all()` — project-agnostic version of the
--      existing per-project sweep. Safe to call from pg_cron, a server
--      action on /runs page load, or the daemon. The on-disk `status`
--      eventually catches up with the view.
--
-- Why this won't fight us later:
--   - Heartbeat is the contract, not a particular code path. Any new
--     dispatcher inherits it for free as long as it writes run_steps.
--   - The reap predicate is one column on one table. No state-machine
--     branches to audit.
--   - New terminal states (paused, queued) are untouched by the sweep.
--   - Resuming a failed walk = flip status to running and bump heartbeat.
--     Normal transition, no special case.
--   - Long legitimate steps (>5 min) that don't write run_steps would
--     false-positive. Fix: the daemon writes heartbeat_at = now() every
--     N seconds in addition to per-step. One-line addition; contract
--     unchanged.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. The liveness column.
alter table public.runs
  add column if not exists heartbeat_at timestamptz not null default now();

create index if not exists runs_heartbeat_at_running_idx
  on public.runs (heartbeat_at)
  where status = 'running';

comment on column public.runs.heartbeat_at is
  'Last sign of life from the dispatcher. Bumped by an AFTER INSERT trigger on run_steps (existing daemons inherit this for free) or directly by dispatchers that do not write step rows. The reaper interprets heartbeat_at < now() - 5 min as "process is gone."';

-- 2. Trigger: any run_step insert proves the run is alive.
create or replace function public.bump_run_heartbeat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.runs
  set heartbeat_at = now()
  where id = new.run_id
    and status = 'running';
  return new;
end;
$$;

drop trigger if exists run_steps_bump_heartbeat on public.run_steps;
create trigger run_steps_bump_heartbeat
after insert on public.run_steps
for each row
execute function public.bump_run_heartbeat();

comment on function public.bump_run_heartbeat is
  'AFTER INSERT trigger function for run_steps. Keeps runs.heartbeat_at fresh without requiring dispatchers to know about the column.';

-- 3. Backfill: existing rows. Their effective heartbeat is the most
--    recent of (started_at, last run_step). Without this, every pre-
--    migration row would look like a zombie the moment the view goes
--    live.
update public.runs r
set heartbeat_at = greatest(
  r.started_at,
  coalesce(
    (select max(rs.created_at) from public.run_steps rs where rs.run_id = r.id),
    r.started_at
  ),
  coalesce(r.finished_at, r.started_at)
)
where r.heartbeat_at = r.created_at  -- only rows that still hold the column default
   or r.heartbeat_at is null;

-- 4. Derived status — pure SQL, no stored truth.
create or replace function public.effective_run_status(r public.runs)
returns text
language sql
immutable
as $$
  select case
    when r.finished_at is not null and coalesce(r.exit_code, 0) = 0 and r.status = 'completed'
      then 'completed'
    when r.finished_at is not null
      then 'failed'
    when r.status = 'running' and r.heartbeat_at < now() - interval '5 minutes'
      then 'failed'
    else r.status
  end;
$$;

comment on function public.effective_run_status is
  'Derives truth from timestamps. status=running + stale heartbeat → failed. status=running + fresh heartbeat → running. finished_at set → use exit_code to pick completed/failed.';

-- 5. The view dashboards should read.
create or replace view public.runs_with_status as
select
  r.*,
  public.effective_run_status(r) as effective_status,
  case
    when r.status = 'running'
     and r.heartbeat_at < now() - interval '5 minutes'
    then true else false
  end as is_stale
from public.runs r;

comment on view public.runs_with_status is
  'Runs with an effective_status column derived from heartbeat freshness. Dashboard reads should prefer this view over runs directly so they show truth without waiting for a sweep.';

grant select on public.runs_with_status to authenticated, service_role;

-- 6. Global writeback. Project-agnostic so anything (pg_cron, dashboard
--    server action, daemon, manual ops) can drive it. Safe to run
--    concurrently — the WHERE clause filters to only rows that still
--    need reaping, and the UPDATE is idempotent.
create or replace function public.sweep_stuck_runs_all(
  p_idle_minutes int default 5
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if p_idle_minutes is null or p_idle_minutes < 1 then
    raise exception 'p_idle_minutes must be >= 1';
  end if;

  with updated as (
    update public.runs r
    set status = 'failed',
        finished_at = coalesce(r.finished_at, r.heartbeat_at),
        exit_code = coalesce(r.exit_code, -1),
        summary = coalesce(
          r.summary,
          format(
            'stuck-walk timeout — heartbeat last seen %s minutes ago',
            extract(epoch from (now() - r.heartbeat_at))::int / 60
          )
        )
    where r.status = 'running'
      and r.heartbeat_at < now() - make_interval(mins => p_idle_minutes)
    returning r.id
  )
  select count(*) into v_count from updated;

  return v_count;
end;
$$;

grant execute on function public.sweep_stuck_runs_all(int) to authenticated, service_role;

comment on function public.sweep_stuck_runs_all is
  'Writeback for the heartbeat-derived effective status. Safe to call from pg_cron, a server action, or the daemon. The view shows truth immediately regardless; this function just makes the on-disk runs.status column eventually agree.';
