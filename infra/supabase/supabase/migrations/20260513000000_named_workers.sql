-- Named workers — step 1 of docs/plans/named-workers.md (v5).
--
-- Introduces:
--   1. `workers` table — first-class identity for daemons.
--   2. New columns on `agent_jobs` for capability routing + recovery
--      bookkeeping. Step 1 does not yet route by capability; the columns
--      sit unused until step 2.
--   3. `claim_next_job(p_worker_id)` — atomic claim primitive using
--      `SELECT ... FOR UPDATE SKIP LOCKED`. Replaces the
--      `UPDATE WHERE status='pending'` race.
--   4. Replacement of `daemon_heartbeats` with a `security_invoker = true`
--      compatibility view backed by `workers`. The dashboard's existing
--      reads keep working unchanged until step 4 swaps them to read
--      `workers` directly and drops the view.
--   5. Realtime publication update (drop daemon_heartbeats, add workers).
--
-- Non-goals (per the plan; reproduced here as guardrails for anyone
-- editing this file):
--   - No cloud walker / Vercel Sandbox path.
--   - No tunnel infrastructure (ngrok / Cloudflare / Tailscale).
--   - No Anthropic API key path. Daemons walk via the user's local
--     Claude Code session.

-- ── workers table ────────────────────────────────────────────────────────────

create table public.workers (
  id                uuid        primary key default gen_random_uuid(),
  project_id        text        not null,
  name              text        not null,
  kind              text        not null
                      check (kind in ('laptop','dedicated','cloud')),
  github_handle     text,
  capabilities      jsonb       not null default '{}'::jsonb,
  last_heartbeat_at timestamptz,
  -- Clean shutdown timestamp; cleared on next start.
  stopped_at        timestamptz,
  -- Administrative soft-disable; survives restart. Daemon refuses to
  -- start while this is non-null.
  disabled_at       timestamptz,
  created_at        timestamptz not null default now(),
  unique (project_id, name)
);

create index workers_eligible_idx
  on public.workers (project_id, last_heartbeat_at desc)
  where disabled_at is null and stopped_at is null;

-- Same pattern as agent_jobs / runs / findings: read is gated by
-- is_team_member(); writes are service-role only.
alter table public.workers enable row level security;

create policy workers_read
  on public.workers
  for select
  using (public.is_team_member());

-- ── agent_jobs new columns + claimable index ─────────────────────────────────

alter table public.agent_jobs
  add column required_capability  text
       check (required_capability is null
              or required_capability in ('webhook','manual','localhost')),
  add column preferred_worker     text,
  add column claimed_by_worker_id uuid references public.workers(id),
  add column recovery_count       int not null default 0,
  add column last_recovered_at    timestamptz;

create index agent_jobs_claimable_idx
  on public.agent_jobs
       (project_id, required_capability, preferred_worker, priority desc, created_at)
  where status = 'pending';

-- ── backfill workers from daemon_heartbeats ──────────────────────────────────
--
-- daemon_heartbeats columns: user_id, daemon_name, hostname, version,
-- claim_mode, last_seen_at, project_id. github_handle is recovered via
-- team_members (which maps supabase auth user → github handle).
insert into public.workers
  (project_id, name, kind, github_handle, capabilities, last_heartbeat_at)
select dh.project_id,
       coalesce(dh.daemon_name, 'legacy-' || left(dh.user_id::text, 8)),
       'laptop',
       tm.github_handle,
       '{"manual": true, "localhost": true}'::jsonb,
       dh.last_seen_at
  from public.daemon_heartbeats dh
  left join public.team_members tm
    on tm.supabase_user_id = dh.user_id
 where not exists (
   select 1 from public.workers w
    where w.project_id = dh.project_id
      and w.name = coalesce(dh.daemon_name,
                            'legacy-' || left(dh.user_id::text, 8))
 );

-- ── realtime publication swap ────────────────────────────────────────────────

alter publication supabase_realtime drop table public.daemon_heartbeats;
-- workers is added after the table is created (it is, above), so do it now.
alter publication supabase_realtime add table public.workers;

-- ── drop daemon_heartbeats table, expose compat view ─────────────────────────
--
-- security_invoker = true is required so the authenticated dashboard read
-- runs RLS against `workers` as the calling user (going through
-- is_team_member()). A default view would run as the view owner and bypass
-- RLS, leaking workers across projects.
--
-- The WHERE clause hides cleanly-stopped and admin-disabled workers so the
-- pill's "online" semantics keep matching the old behavior (a row in
-- daemon_heartbeats meant "a daemon that's still considered alive").

drop table public.daemon_heartbeats;

create view public.daemon_heartbeats
  with (security_invoker = true) as
select w.id                as user_id,
       w.name              as daemon_name,
       null::text          as hostname,
       null::text          as version,
       'standard'::text    as claim_mode,
       w.last_heartbeat_at as last_seen_at,
       w.project_id        as project_id
  from public.workers w
 where w.disabled_at is null
   and w.stopped_at is null;

grant select on public.daemon_heartbeats to authenticated;

-- ── claim_next_job ───────────────────────────────────────────────────────────
--
-- Atomic "pick one eligible pending job and claim it" primitive. Replaces
-- the multi-daemon race on `UPDATE WHERE status='pending'` with
-- `SELECT FOR UPDATE SKIP LOCKED` — no double-claim possible regardless of
-- how many daemons call this concurrently.
--
-- Step 1: capability filtering is permissive (workers default to
-- {manual: true, localhost: true}; jobs default required_capability=null
-- which passes any worker). Step 2 starts setting required_capability on
-- jobs to activate routing.

-- Returns SETOF (not a scalar composite) so PostgREST marshals "no
-- claim" as an empty array. A function declared `RETURNS agent_jobs`
-- that returns NULL would marshal to an all-null object via PostgREST,
-- and callers cannot tell that apart from a real row. SETOF + LIMIT 1
-- avoids that trap.
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
-- Granted to service_role only. Daemons currently authenticate with the
-- service-role key. Do NOT grant to `authenticated` — this is
-- SECURITY DEFINER and performs no caller authorization, so an
-- authenticated user could otherwise claim any worker's jobs by guessing
-- a UUID. When daemons move to per-worker JWTs (deferred decision in
-- docs/ROADMAP.md), add a caller-auth check inside the function before
-- granting execute to a new role.
grant execute on function public.claim_next_job(uuid) to service_role;
