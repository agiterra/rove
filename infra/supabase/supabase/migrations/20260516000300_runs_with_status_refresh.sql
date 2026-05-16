-- Refresh `runs_with_status` so it picks up `runs.error_message`.
--
-- A Postgres view defined with `select r.*` materializes the column list
-- at creation time — later `alter table add column` does not extend the
-- view. Drop and recreate.

drop view if exists public.runs_with_status;

create view public.runs_with_status
  with (security_invoker = true)
as
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
