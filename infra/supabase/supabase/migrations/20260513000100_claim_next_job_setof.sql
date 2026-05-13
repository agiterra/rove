-- Fix: claim_next_job declared as `returns agent_jobs` (scalar composite).
-- PostgREST marshals a NULL composite return as `{id: null, kind: null, ...}`
-- (an object with all-null fields), which client code cannot distinguish
-- from a real row. The daemon then "dispatched" against a null job in a
-- tight loop.
--
-- Redefine as `returns setof agent_jobs` + `limit 1` so PostgREST returns
-- either `[]` or `[{row}]`. The empty-array case is unambiguous.
--
-- This migration's content mirrors the corrected definition already
-- present in 20260513000000_named_workers.sql — running this on a fresh
-- install is a no-op redefine. It exists so existing databases that
-- applied the v1 (scalar composite) definition converge to the corrected
-- shape.

drop function if exists public.claim_next_job(uuid);

create or replace function public.claim_next_job(p_worker_id uuid)
returns setof public.agent_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker     public.workers;
  v_job        public.agent_jobs;
  v_auth_user  uuid;
begin
  select * into v_worker
    from public.workers
   where id = p_worker_id
     and disabled_at is null
     and stopped_at is null
   for update;

  if not found then
    return;
  end if;

  update public.workers
     set last_heartbeat_at = now()
   where id = p_worker_id;

  select tm.supabase_user_id
    into v_auth_user
    from public.team_members tm
   where tm.github_handle = v_worker.github_handle
   limit 1;

  select * into v_job
    from public.agent_jobs j
   where j.project_id = v_worker.project_id
     and j.status = 'pending'
     and (j.required_capability is null
          or v_worker.capabilities ? j.required_capability)
     and (j.preferred_worker is null
          or j.preferred_worker = v_worker.name)
     and (j.assigned_to is null
          or (v_auth_user is not null and j.assigned_to = v_auth_user))
   order by (j.preferred_worker = v_worker.name) desc nulls last,
            j.priority desc,
            j.created_at asc
   for update skip locked
   limit 1;

  if not found then
    return;
  end if;

  update public.agent_jobs
     set status               = 'claimed',
         claimed_by_worker_id = p_worker_id,
         claimed_by           = v_auth_user,
         claimed_at           = now()
   where id = v_job.id
   returning * into v_job;

  return next v_job;
end;
$$;

revoke all on function public.claim_next_job(uuid) from public;
grant execute on function public.claim_next_job(uuid) to service_role;
