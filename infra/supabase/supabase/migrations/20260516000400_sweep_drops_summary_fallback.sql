-- The /runs/[id] hero now surfaces runs.error_message directly. The
-- summary-fallback in sweep_stuck_runs_all was a transition aid so
-- existing UI that displayed only `summary` kept showing the reason —
-- with the run-detail hero updated, summary stays canonical for "agent
-- prose" and error_message is canonical for "system failure reason."

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
        error_message = coalesce(
          r.error_message,
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
