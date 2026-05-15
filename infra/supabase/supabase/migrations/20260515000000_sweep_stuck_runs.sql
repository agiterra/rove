-- Stuck-walk timeout — runs left in `running` when run_step inserts have
-- stopped arriving never settle to a terminal state on their own. The
-- existing daemon `recover_stale_claims` sweep handles agent_jobs only;
-- this is the runs-row equivalent.
--
-- Called from the daemon's 30s sweep alongside recover_stale_claims.
-- SECURITY DEFINER so worker-token mode (whose JWT can't UPDATE runs
-- directly) can still drive it.

create or replace function public.sweep_stuck_runs(
  p_project_id text,
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

  with stuck as (
    select r.id
    from public.runs r
    where r.project_id = p_project_id
      and r.status = 'running'
      and r.started_at < now() - make_interval(mins => p_idle_minutes)
      and not exists (
        select 1
        from public.run_steps rs
        where rs.run_id = r.id
          and rs.created_at >= now() - make_interval(mins => p_idle_minutes)
      )
  ),
  updated as (
    update public.runs r
    set status = 'failed',
        finished_at = now(),
        exit_code = coalesce(r.exit_code, -1),
        summary = coalesce(
          r.summary,
          format(
            'stuck-walk timeout — no run_step activity for %s minute%s',
            p_idle_minutes,
            case when p_idle_minutes = 1 then '' else 's' end
          )
        )
    where r.id in (select id from stuck)
    returning r.id
  )
  select count(*) into v_count from updated;

  return v_count;
end;
$$;

grant execute on function public.sweep_stuck_runs(text, int) to authenticated;
