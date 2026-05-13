-- Worker RPCs — step 2 of docs/plans/worker-tokens.md (v2).
--
-- Introduces the closed write surface that worker JWTs use to mutate
-- their own state and job records. No table-level UPDATE is granted to
-- `authenticated`; all worker writes go through these SECURITY DEFINER
-- RPCs.
--
-- This migration ships:
--   1. Six new worker RPCs — the only columns each touches are the ones
--      a daemon legitimately needs:
--        - worker_heartbeat()                → last_heartbeat_at on own row
--        - worker_mark_stopped()             → stopped_at on own row
--        - worker_release_my_claims()        → returns claimed/running jobs to pending
--        - job_mark_running(p_job_id)        → claimed → running (own jobs only)
--        - job_mark_completed(p_job_id, …)   → running → completed (own jobs only)
--        - job_mark_failed(p_job_id, …)      → running → failed (own jobs only)
--   2. Caller-auth tightening on the two pre-existing write functions
--      (`claim_next_job` and `recover_stale_claims`) so that worker JWTs
--      can call them while revocation is still enforced. Both are
--      redefined as CREATE OR REPLACE with the preamble prepended.
--   3. Grants: authenticated + service_role on all eight functions
--      (six new, two redefined).
--
-- Non-goals (deferred to step 3):
--   - No daemon code changes. Service-role daemons keep working unchanged.
--   - No new table-level UPDATE grants on `workers` or `agent_jobs`.

-- ── worker_heartbeat ─────────────────────────────────────────────────────────
--
-- Intentionally worker-only — service-role callers have direct UPDATE
-- access and should use it. This is the only RPC whose preamble raises on
-- service_role rather than allowing it through; see the plan for rationale.

create or replace function public.worker_heartbeat()
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if public.is_worker_jwt() then
    if not public.jwt_is_valid_worker_token() then
      raise exception 'worker token rejected' using errcode = '42501';
    end if;
    update public.workers
       set last_heartbeat_at = now()
     where id = public.jwt_worker_id();
  elsif auth.role() = 'service_role' then
    -- Service-role callers must specify worker_id elsewhere; this RPC is
    -- worker-self-only.
    raise exception 'worker_heartbeat is not callable by service_role; use direct UPDATE';
  else
    raise exception 'worker_heartbeat: caller must be a worker JWT' using errcode = '42501';
  end if;
end;
$$;

-- ── worker_mark_stopped ──────────────────────────────────────────────────────
--
-- Daemon calls before graceful exit to set stopped_at. Service-role is
-- permitted (dashboard can administratively stop a worker).

create or replace function public.worker_mark_stopped()
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if public.is_worker_jwt() then
    if not public.jwt_is_valid_worker_token() then
      raise exception 'worker token rejected' using errcode = '42501';
    end if;
  elsif auth.role() <> 'service_role' then
    raise exception 'worker_mark_stopped: caller must be a worker JWT or service_role'
      using errcode = '42501';
  end if;
  update public.workers
     set stopped_at = now()
   where id = public.jwt_worker_id();
end;
$$;

-- ── worker_release_my_claims ─────────────────────────────────────────────────
--
-- Releases all claimed/running jobs owned by the calling worker back to
-- pending. Daemon calls during graceful shutdown. Returns the count of
-- rows released so the caller can log it.

create or replace function public.worker_release_my_claims()
  returns int
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_n int;
begin
  if public.is_worker_jwt() then
    if not public.jwt_is_valid_worker_token() then
      raise exception 'worker token rejected' using errcode = '42501';
    end if;
  elsif auth.role() <> 'service_role' then
    raise exception 'worker_release_my_claims: caller must be a worker JWT or service_role'
      using errcode = '42501';
  end if;
  update public.agent_jobs
     set status               = 'pending',
         claimed_by_worker_id = null,
         claimed_by           = null,
         claimed_at           = null
   where project_id           = public.jwt_project_id()
     and claimed_by_worker_id = public.jwt_worker_id()
     and status               in ('claimed', 'running');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ── job_mark_running ─────────────────────────────────────────────────────────
--
-- Transitions a claimed job to running. Enforces the ownership predicate
-- (claimed_by_worker_id = jwt_worker_id AND project_id = jwt_project_id
-- AND status = 'claimed') so a recovered daemon's stale write is a no-op
-- (returns false) rather than an error.

create or replace function public.job_mark_running(p_job_id uuid)
  returns boolean
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_n int;
begin
  if public.is_worker_jwt() then
    if not public.jwt_is_valid_worker_token() then
      raise exception 'worker token rejected' using errcode = '42501';
    end if;
  elsif auth.role() <> 'service_role' then
    raise exception 'job_mark_running: caller must be a worker JWT or service_role'
      using errcode = '42501';
  end if;
  update public.agent_jobs
     set status = 'running'
   where id                   = p_job_id
     and project_id           = public.jwt_project_id()
     and claimed_by_worker_id = public.jwt_worker_id()
     and status               = 'claimed';
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

-- ── job_mark_completed ───────────────────────────────────────────────────────
--
-- Transitions a running job to completed and records the result payload.
-- Same ownership predicate; prior status must be 'running'.

create or replace function public.job_mark_completed(p_job_id uuid, p_result jsonb)
  returns boolean
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_n int;
begin
  if public.is_worker_jwt() then
    if not public.jwt_is_valid_worker_token() then
      raise exception 'worker token rejected' using errcode = '42501';
    end if;
  elsif auth.role() <> 'service_role' then
    raise exception 'job_mark_completed: caller must be a worker JWT or service_role'
      using errcode = '42501';
  end if;
  update public.agent_jobs
     set status      = 'completed',
         result      = p_result,
         finished_at = now()
   where id                   = p_job_id
     and project_id           = public.jwt_project_id()
     and claimed_by_worker_id = public.jwt_worker_id()
     and status               = 'running';
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

-- ── job_mark_failed ──────────────────────────────────────────────────────────
--
-- Transitions a running job to failed and records the error message.
-- Same ownership predicate; prior status must be 'running'.

create or replace function public.job_mark_failed(p_job_id uuid, p_error text)
  returns boolean
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_n int;
begin
  if public.is_worker_jwt() then
    if not public.jwt_is_valid_worker_token() then
      raise exception 'worker token rejected' using errcode = '42501';
    end if;
  elsif auth.role() <> 'service_role' then
    raise exception 'job_mark_failed: caller must be a worker JWT or service_role'
      using errcode = '42501';
  end if;
  update public.agent_jobs
     set status      = 'failed',
         error       = p_error,
         finished_at = now()
   where id                   = p_job_id
     and project_id           = public.jwt_project_id()
     and claimed_by_worker_id = public.jwt_worker_id()
     and status               = 'running';
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

-- ── Grants for the six new RPCs ──────────────────────────────────────────────

revoke all on function public.worker_heartbeat()               from public;
revoke all on function public.worker_mark_stopped()            from public;
revoke all on function public.worker_release_my_claims()       from public;
revoke all on function public.job_mark_running(uuid)           from public;
revoke all on function public.job_mark_completed(uuid, jsonb)  from public;
revoke all on function public.job_mark_failed(uuid, text)      from public;

grant execute on function public.worker_heartbeat()               to authenticated, service_role;
grant execute on function public.worker_mark_stopped()            to authenticated, service_role;
grant execute on function public.worker_release_my_claims()       to authenticated, service_role;
grant execute on function public.job_mark_running(uuid)           to authenticated, service_role;
grant execute on function public.job_mark_completed(uuid, jsonb)  to authenticated, service_role;
grant execute on function public.job_mark_failed(uuid, text)      to authenticated, service_role;

-- ── claim_next_job (redefined with caller-auth tightening) ──────────────────
--
-- Original body preserved from 20260513000000_named_workers.sql and
-- 20260513000100_claim_next_job_setof.sql. Preamble prepended so:
--   • Worker JWTs are validated (revocation + token-kind check) and the
--     supplied p_worker_id must match the JWT's worker_id claim.
--   • Service-role still bypasses freely.
--   • Any other caller is rejected.
-- Grant extended to `authenticated` so worker JWTs can call this.

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
  -- ── caller-auth preamble ──────────────────────────────────────────────────
  if public.is_worker_jwt() then
    if not public.jwt_is_valid_worker_token() then
      raise exception 'worker token rejected' using errcode = '42501';
    end if;
    if p_worker_id <> public.jwt_worker_id() then
      raise exception 'token worker_id does not match p_worker_id' using errcode = '42501';
    end if;
  elsif auth.role() <> 'service_role' then
    raise exception 'claim_next_job: caller must be a worker JWT or service_role'
      using errcode = '42501';
  end if;
  -- ── original body ─────────────────────────────────────────────────────────

  select * into v_worker
    from public.workers
   where id = p_worker_id
     and disabled_at is null
     and stopped_at is null
   for update;

  if not found then
    return;
  end if;

  -- Heartbeat side-effect on every claim attempt; supplements (does not
  -- replace) the daemon's fixed-interval timer.
  update public.workers
     set last_heartbeat_at = now()
   where id = p_worker_id;

  -- Derive the legacy claimed_by (auth.users.id) from worker ownership so
  -- the dashboard's existing attribution UI keeps working during the
  -- transition. Dedicated workers without a github_handle leave claimed_by
  -- null.
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
     -- Preserve existing user-pin semantics: a job with assigned_to set
     -- may only be claimed by the worker whose owner is that auth user.
     -- Dedicated workers without an owner cannot claim assigned_to-pinned
     -- jobs.
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
         -- transitional dual-write; step 4 retires the legacy column
         claimed_by           = v_auth_user,
         claimed_at           = now()
   where id = v_job.id
   returning * into v_job;

  return next v_job;
end;
$$;

revoke all on function public.claim_next_job(uuid) from public;
grant execute on function public.claim_next_job(uuid) to authenticated, service_role;

-- ── recover_stale_claims (redefined with caller-auth tightening) ─────────────
--
-- Original body preserved from 20260513000200_claim_recovery_sweep.sql.
-- Preamble prepended so:
--   • Worker JWTs are validated (revocation check) and the supplied
--     p_project_id must match the JWT's project_id claim — a misconfigured
--     daemon cannot sweep another project's stale jobs.
--   • Service-role still bypasses freely.
--   • Any other caller is rejected.
-- Grant extended to `authenticated`.

create or replace function public.recover_stale_claims(p_project_id text)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  -- ── caller-auth preamble ──────────────────────────────────────────────────
  if public.is_worker_jwt() then
    if not public.jwt_is_valid_worker_token() then
      raise exception 'worker token rejected' using errcode = '42501';
    end if;
    if p_project_id <> public.jwt_project_id() then
      raise exception 'token project_id does not match p_project_id' using errcode = '42501';
    end if;
  elsif auth.role() <> 'service_role' then
    raise exception 'recover_stale_claims: caller must be a worker JWT or service_role'
      using errcode = '42501';
  end if;
  -- ── original body ─────────────────────────────────────────────────────────

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
grant execute on function public.recover_stale_claims(text) to authenticated, service_role;
