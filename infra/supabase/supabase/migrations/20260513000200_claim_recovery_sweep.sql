-- Recovery sweep — releases jobs whose claiming worker has stopped
-- heartbeating, returning them to the `pending` pool so another worker
-- can pick them up. Every daemon invokes this on its loop interval
-- (~30s); the first daemon to grab eligible rows wins, subsequent
-- invocations are cheap no-ops.
--
-- Scoped to the calling daemon's project_id on both the outer UPDATE and
-- the inner workers lookup so a misconfigured daemon configured with
-- another project's worker id cannot reach across tenancy. Service-role
-- bypasses RLS — the explicit predicates are what enforce tenancy here.
--
-- 90s threshold is intentionally three heartbeat ticks (15s × 6) to
-- tolerate transient network glitches.
--
-- The recovery sweep is the ONLY status-mutating writer to agent_jobs
-- permitted to bypass the (claimed_by_worker_id = :self AND
-- status = :expected_prior) ownership predicate — by definition it
-- operates on jobs whose worker is no longer alive.

create or replace function public.recover_stale_claims(p_project_id text)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  update public.agent_jobs j
     set status               = 'pending',
         claimed_by_worker_id = null,
         claimed_by           = null,
         claimed_at           = null,
         recovery_count       = recovery_count + 1,
         last_recovered_at    = now()
   where j.project_id = p_project_id
     and j.status in ('claimed','running')
     and exists (
       select 1
         from public.workers w
        where w.id          = j.claimed_by_worker_id
          and w.project_id  = p_project_id
          and (w.last_heartbeat_at is null
               or w.last_heartbeat_at < now() - interval '90 seconds')
     );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.recover_stale_claims(text) from public;
grant execute on function public.recover_stale_claims(text) to service_role;
