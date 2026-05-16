-- ─────────────────────────────────────────────────────────────────────────
-- runs.error_message — a dedicated column for "why did this fail?"
--
-- Until now, `runs.summary` carried two unrelated things:
--   - On a successful walk: the agent's prose summary.
--   - On a failed walk (sink errors, dispatcher non-zero exit, stuck-walk
--     sweep): a system-generated failure reason, written by `failRun` or
--     `sweep_stuck_runs_all`.
--
-- That overload meant any future code asking "why did this fail?" had to
-- inspect `status` first and treat `summary` differently in each case.
-- It also meant we couldn't surface BOTH the agent's prose AND the
-- failure reason for a partially-completed walk.
--
-- The column is text + nullable. Empty/null = no system error to report.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.runs
  add column if not exists error_message text;

comment on column public.runs.error_message is
  'System-generated reason for runs.status=''failed''. Populated by failRun (dispatcher exit, parse error), the supabase sink (screenshot/finding upload errors), and sweep_stuck_runs_all (heartbeat timeout). Distinct from summary which is the agent''s own prose. NULL means no system error to report.';

-- Recreate the sweep to write the reason into error_message. Summary
-- still receives a fallback so existing UI that displays summary keeps
-- showing the reason — remove that fallback once UI switches over.
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
        ),
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
