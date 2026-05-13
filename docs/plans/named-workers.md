# Plan — Named Workers

**Status**: Proposed, not started. v5 — incorporates four rounds of Codex review.
**Owner**: Brian.
**Why now**: Today a walk only happens when somebody's daemon is running. The team has no shared awareness of *which* machines are claiming *which* jobs. Phase E (auto-walk on PR) cannot ship until this is solved, because a webhook firing at 3 AM cannot depend on a developer's laptop being open.

## v5 changes (responses to fourth Codex review)

1. **`markRunning` no longer references a nonexistent `started_at` column.** `agent_jobs` has `claimed_at` and `finished_at` only. The status change is the signal; no extra timestamp is needed for the running transition.
2. **`claim_next_job` preserves `assigned_to` semantics.** v4 silently dropped the existing user-pin behavior. v5 adds `(j.assigned_to is null or j.assigned_to = v_auth_user)` to the claim filter so jobs explicitly pinned to an operator continue to flow only to *that* operator's worker. `preferred_worker` and `assigned_to` coexist during the alpha; a future migration may collapse them, but not in this plan.
3. **`claim_next_job` is granted to `service_role` only.** v4's `grant execute ... to authenticated` was too broad — the function is `SECURITY DEFINER` and performs no caller authorization, so any authenticated user could have claimed any worker's jobs by guessing UUIDs. Daemons use service-role today; adding authenticated-caller authorization is a future hardening if/when daemons get worker-scoped JWTs (per the deferred-decisions section of `docs/ROADMAP.md`).
4. **Graceful shutdown release clears both `claimed_by_worker_id` and legacy `claimed_by`, and is project-scoped.** v4's shutdown UPDATE left stale `claimed_by` values dangling on released jobs and didn't filter by `project_id`. v5 fixes both, matching the recovery sweep's discipline.
5. **`workers` RLS shown explicitly.** v3/v4 said "follows the `is_team_member()` pattern" but never wrote the SQL. With the compat view declared `security_invoker = true`, a missing read policy on `workers` would make the dashboard read return zero rows. v5 includes the `alter table … enable row level security` + read policy in the migration block.
6. **Claim ordering preserves the existing `priority desc, created_at` semantics.** Spotted while fixing #2: the current claim path uses index `agent_jobs_pending_idx (status, priority desc, created_at)`. v5's `claim_next_job` keeps that ordering as the tiebreaker after `preferred_worker` match, so jobs whose creators set a non-default priority continue to win.

## v4 changes (responses to third Codex review)

1. **Lifecycle column corrected.** `agent_jobs` uses a single `finished_at` for both completion and failure — there is no `completed_at` / `failed_at`. SQL examples now set `finished_at = now()` regardless of outcome.
2. **`claim_next_job` also writes legacy `claimed_by`.** Dashboard reads `claimed_by` (an `auth.users` UUID) for job attribution. The function now derives the auth user from `worker.github_handle → team_members.supabase_user_id` and populates `claimed_by` alongside `claimed_by_worker_id`. Dedicated workers without a github_handle leave `claimed_by` null — the dashboard's existing "(no owner)" display absorbs that case until step 4 swaps reads to `claimed_by_worker_id`.
3. **`markRunning` also needs the ownership predicate.** Generalized the v3 rule: *every* status-mutating UPDATE to `agent_jobs` (running, completed, failed, any future status) must include `where claimed_by_worker_id = :self and status = :expectedPriorStatus`. Otherwise a recovered-then-zombied daemon can overwrite the new claimer's progress.
4. **Recovery sweep is project-scoped.** v3's sweep was global — service-role bypasses RLS, so any daemon could recover any project's jobs. v4 filters `agent_jobs.project_id = :daemon_project_id` and joins `workers` on `project_id` explicitly. Tenancy discipline restored.
5. **Compat view runs with `security_invoker = true`.** Postgres views default to *owner's* permissions, which would bypass RLS on the underlying `workers` table. v4 declares the view with security-invoker semantics so the authenticated dashboard read still goes through `is_team_member()`. Explicit GRANT to `authenticated` added.

## v3 changes (responses to second Codex review)

1. **Heartbeat is now fixed-interval, not idle-only.** v2's "heartbeat rides along on claim attempts" was a bug — a healthy walk that runs longer than 90s would have its claim recovered out from under it. v3 specifies a dedicated 15s timer that runs concurrently with dispatcher subprocesses for the daemon's entire lifetime.
2. **Late-completion guard is now a conditional UPDATE, not a TS check.** Stale writes are prevented by `where id = :jobId and claimed_by_worker_id = :self and status = 'running'`, with 0-row-affected meaning "your claim was recovered; discard."
3. **Backfill SQL corrected.** v2 referenced a `dh.github_handle` column that does not exist. Real columns are `user_id, daemon_name, hostname, version, claim_mode, last_seen_at, project_id`. Backfill now uses `daemon_name` as the worker name and joins `team_members` on `supabase_user_id` to recover the GitHub handle.
4. **Compatibility view bridges the schema swap.** Step 1 cannot drop `daemon_heartbeats` while the dashboard still reads it. v3 introduces a compatibility VIEW in step 1 (real table dropped, view exposes `workers` with the old column names) and drops the view in step 4 when the dashboard reads are updated.
5. **`SECURITY DEFINER` hardening.** `claim_next_job` gets `set search_path = public, pg_temp` and explicit `revoke ... from public` / `grant execute ... to authenticated, service_role`. Standard Postgres definer hygiene.
6. **Realtime publication updated.** Dropping `daemon_heartbeats` requires removing it from the `supabase_realtime` publication. The new `workers` table is added to the publication so the dashboard's "Workers: N online" header chip updates live.

## v2 changes (responses to first Codex review)

1. **Dropped `claim_priority` entirely.** Priority is unenforceable with the current "every daemon issues `UPDATE WHERE status='pending'`" race. Routing is now driven *only* by capability eligibility: laptops do not advertise the `webhook` capability, so dedicated workers win webhook jobs by being the only eligible workers. No race, no priority sort required.
2. **Renamed `required_kind` → `required_capability`.** The old name collided with `worker.kind` (`laptop`/`dedicated`/`cloud`). New name matches the capability set (`webhook` / `manual` / `localhost`) and gets a CHECK constraint.
3. **Replaced the row-level claim race with `SELECT ... FOR UPDATE SKIP LOCKED` inside a Postgres function.** Single atomic primitive, no double-claim possible, no extra reconciliation needed.
4. **Made stuck-claim recovery explicit.** v1 hand-waved it as "exists in spirit." It does not. Added a recovery sweep, the schema fields needed to track it, and explicit handling for late-completing daemons whose claim was released.
5. **Split `disabled_at` into `disabled_at` (admin) and `stopped_at` (clean shutdown).** v1 conflated them, which would have broken `rove workers disable` after a daemon restart.
6. **Specified the `daemon_heartbeats` migration.** v1 left it ambiguous. Plan now drops `daemon_heartbeats` and makes `workers.last_heartbeat_at` the single source of truth, with a one-shot backfill.
7. **Added a claimable-jobs index and a check constraint on `required_capability`** that Codex flagged were missing.
8. **Resized to ~3.5 days.** v1's 2.5 was optimistic; the claim correctness work and the heartbeat migration are real.

---

## Goal

Make walkers first-class team resources with identity, capability, and visibility — without requiring tunnels, without requiring inbound traffic to anyone's machine, and **without re-billing AI inference**. A team's existing Claude Code subscriptions are the substrate; Rove is the coordination layer on top.

## Non-goals

- **No Vercel Sandbox / cloud walker.** Explicitly out of scope. Every walk is performed by a worker the team operates and that uses their own Claude Code session. We are not running inference on Rove's infrastructure.
- **No ngrok / Cloudflare Tunnel / Tailscale Funnel.** The cloud does not need inbound access to the daemon. The daemon polls/subscribes outbound, as it does today.
- **No per-token billing path.** Rove will never need a customer's Anthropic API key under this design. If you want walks to happen, you operate a worker.
- **No multi-tenant rework.** This plan stays inside the existing `project_id` tenancy model. Workspace-level RBAC is Phase F and unrelated.

## Why pull (queue) beats push (tunnel) here

The cloud is not trying to *call* the daemon — it is trying to *hand it work*. That is a queue problem, not an RPC problem. Postgres + Supabase Realtime is a perfectly good queue for our scale; the daemon already subscribes to job-state changes. A tunnel would add a third-party dependency, inbound surface area on user machines, a new failure mode (tunnel down ≠ daemon down), and would not remove the need for the queue (since we still need to handle the "no worker online" case).

## Mental model

A **worker** is any long-running process that can claim and execute jobs. Three kinds, all team-operated:

| Kind | Typical host | Always-on? | Default capabilities |
| --- | --- | --- | --- |
| `laptop` | Developer's MacBook running `pnpm daemon` | No — closes with the lid | `{manual, localhost}` |
| `dedicated` | An always-on machine the team operates (Brian's home Mac mini, a $5/mo Linode, an unused desktop in the office) | Yes | `{manual, webhook}` |
| `cloud` | _(reserved; not implemented in this plan)_ | — | — |

Capability semantics:

- `manual` — walks a human triggers from the dashboard or CLI.
- `webhook` — walks triggered by a PR / push event hitting a Rove webhook endpoint.
- `localhost` — walks whose `target_url` is a `localhost:*` address. Only the developer's own laptop daemon can reach it.

Laptop daemons deliberately do **not** advertise `webhook`. That is what keeps webhook jobs flowing to the dedicated worker without needing priority semantics: dedicated workers are simply the only eligible ones.

The `cloud` row is reserved in the schema so we don't have to migrate again if a customer ever asks for a Rove-operated worker. It will stay disabled by default and is not used by any code path in this plan.

## Database changes

One new table, three new columns on `agent_jobs`, one new claim function, one removed table.

```sql
-- 2026-MM-DD_named_workers.sql

create table public.workers (
  id                uuid        primary key default gen_random_uuid(),
  project_id        text        not null,
  name              text        not null,                       -- e.g. "agiterra-home-mini", "brian-laptop"
  kind              text        not null check (kind in ('laptop','dedicated','cloud')),
  github_handle     text,                                       -- which human owns this worker, if applicable
  capabilities      jsonb       not null default '{}'::jsonb,   -- e.g. {"webhook": true, "manual": true}
  last_heartbeat_at timestamptz,
  stopped_at        timestamptz,                                -- clean shutdown timestamp; cleared on next start
  disabled_at       timestamptz,                                -- administrative soft-disable; survives restart
  created_at        timestamptz not null default now(),
  unique (project_id, name)
);

create index workers_eligible_idx
  on public.workers (project_id, last_heartbeat_at desc)
  where disabled_at is null and stopped_at is null;

-- RLS — same pattern as agent_jobs / runs / findings: read is gated by
-- is_team_member(); writes are service-role only (daemons today).
alter table public.workers enable row level security;

create policy workers_read
  on public.workers
  for select
  using (public.is_team_member());

-- No insert/update/delete policy: daemons run with service_role and
-- bypass RLS. Authenticated dashboard users have read access only.
-- (Revisit when daemons move off service_role.)

alter table public.agent_jobs
  add column required_capability  text
       check (required_capability is null
              or required_capability in ('webhook','manual','localhost')),
  add column preferred_worker     text,
  add column claimed_by_worker_id uuid references public.workers(id),
  add column recovery_count       int  not null default 0,
  add column last_recovered_at    timestamptz;

create index agent_jobs_claimable_idx
  on public.agent_jobs (project_id, required_capability, preferred_worker, created_at)
  where status = 'pending';

-- Removed: public.daemon_heartbeats (see migration step below).
```

Status / heartbeat semantics:

- `disabled_at is null and stopped_at is null and last_heartbeat_at > now() - 30s` → **online**.
- `disabled_at is null and stopped_at is null and last_heartbeat_at <= now() - 30s` → **stale** (UI shows red; jobs claimed by this worker are subject to recovery sweep).
- `stopped_at is not null` → **offline (cleanly stopped)**.
- `disabled_at is not null` → **disabled (admin)**. Survives restart; daemon refuses to start until `rove workers enable <name>`.

RLS: `workers` follows the same `is_team_member()` pattern as `agent_jobs`.

### Realtime publication

`daemon_heartbeats` was added to the `supabase_realtime` publication by an earlier migration. Dropping the table requires removing it from the publication first; adding the new `workers` table to the publication is required for the dashboard header chip and `/workers` page to update live.

```sql
-- Remove the obsolete table from realtime before dropping it.
alter publication supabase_realtime drop table public.daemon_heartbeats;

-- Add the new table so subscribers see heartbeat / disable / stop changes live.
alter publication supabase_realtime add table public.workers;
```

The compatibility VIEW described in the migration section below is *not* added to the publication — views cannot participate in logical replication, and the dashboard's live updates need to come from `workers` directly. During the step-1-through-step-3 window, the dashboard's existing read paths still see fresh data via the view (PostgREST queries hit the view live), but any realtime subscriptions on `daemon_heartbeats` must be rewritten to subscribe to `workers` in step 4.

## Claim atomicity

Claiming is done via a Postgres function using `SELECT ... FOR UPDATE SKIP LOCKED`. This is the standard "queue with N workers" primitive and guarantees no two workers ever claim the same job, regardless of how many daemons hit the function simultaneously.

```sql
create or replace function public.claim_next_job(p_worker_id uuid)
returns public.agent_jobs
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
    return null;
  end if;

  -- Derive the legacy claimed_by (auth.users.id) from worker ownership so the
  -- dashboard's existing attribution UI keeps working during the transition.
  -- Dedicated workers without a github_handle leave claimed_by null.
  select tm.supabase_user_id
    into v_auth_user
    from public.team_members tm
   where tm.github_handle = v_worker.github_handle
   limit 1;

  -- Heartbeat is updated as a side effect of every claim attempt.
  update public.workers
     set last_heartbeat_at = now()
   where id = p_worker_id;

  select * into v_job
    from public.agent_jobs j
   where j.project_id = v_worker.project_id
     and j.status = 'pending'
     and (j.required_capability is null
          or v_worker.capabilities ? j.required_capability)
     and (j.preferred_worker is null
          or j.preferred_worker = v_worker.name)
     -- Preserve the existing user-pin semantics during the transition.
     -- A job with assigned_to set may only be claimed by the worker whose
     -- owner is that auth user. If we couldn't resolve an auth user
     -- (dedicated workers without a github_handle), assigned_to-pinned
     -- jobs are not eligible.
     and (j.assigned_to is null
          or (v_auth_user is not null and j.assigned_to = v_auth_user))
   order by (j.preferred_worker = v_worker.name) desc nulls last,
            j.priority desc,
            j.created_at asc
   for update skip locked
   limit 1;

  if v_job is null then
    return null;
  end if;

  update public.agent_jobs
     set status               = 'claimed',
         claimed_by_worker_id = p_worker_id,
         claimed_by           = v_auth_user,            -- legacy column; transitional dual-write
         claimed_at           = now()
   where id = v_job.id
   returning * into v_job;

  return v_job;
end;
$$;

revoke all on function public.claim_next_job(uuid) from public;
-- Granted to service_role only. Daemons currently authenticate with the
-- service-role key. Do NOT grant to `authenticated` — the function is
-- SECURITY DEFINER and performs no caller authorization, so an authenticated
-- user could otherwise claim any worker's jobs by guessing its UUID.
-- When daemons move to per-worker JWTs (deferred decision in docs/ROADMAP.md),
-- add a `where p_worker_id = (auth.jwt() ->> 'worker_id')::uuid` check inside
-- the function and only then grant execute to the new role.
grant execute on function public.claim_next_job(uuid) to service_role;
```

Notes:

- The ordering biases toward jobs explicitly preferring this worker, then by job priority, then FIFO across the eligible pool. This preserves the legacy `agent_jobs_pending_idx (status, priority desc, created_at)` semantics callers may depend on.
- No worker-level priority column exists. Eligibility alone determines who can claim, and `SKIP LOCKED` makes the race deterministic.
- `assigned_to` (existing user-pin) and `preferred_worker` (new) coexist. `assigned_to` filters by *auth user*; `preferred_worker` orders by *worker name*. A job may set both; both predicates must pass.
- Heartbeat updates here are a *side benefit* of claim attempts. They do not replace the fixed-interval heartbeat described below — a daemon executing a long-running walk would otherwise stop heartbeating and have its claim recovered.

## Stuck-claim recovery

A job whose claiming worker has stopped heartbeating must return to the queue. A second worker should never wait forever for a ghost claim.

A recovery sweep runs in *every* daemon's loop, every 30 seconds, **scoped to that daemon's project**. The first daemon to issue it wins; subsequent sweeps are no-ops. Daemons never recover work for another tenant.

```sql
-- :daemon_project_id is the project_id from the daemon's rove.config.ts
-- (= the worker row's project_id). Service-role bypasses RLS, so this
-- predicate is what enforces tenancy here.
update public.agent_jobs j
   set status               = 'pending',
       claimed_by_worker_id = null,
       claimed_by           = null,
       claimed_at           = null,
       recovery_count       = recovery_count + 1,
       last_recovered_at    = now()
 where j.project_id = :daemon_project_id
   and j.status in ('claimed','running')
   and exists (
     select 1
       from public.workers w
      where w.id          = j.claimed_by_worker_id
        and w.project_id  = :daemon_project_id
        and (w.last_heartbeat_at is null
             or w.last_heartbeat_at < now() - interval '90 seconds')
   );
```

Recovery threshold (90s) is intentionally three heartbeat intervals (≈30s ticks) to tolerate transient network glitches. The `project_id` predicate appears on both the outer UPDATE and the inner workers lookup so that even a misbehaving daemon configured with a different project's worker id cannot reach across tenancy.

### Late-completing daemons (and every other status mutation)

A daemon whose claim was recovered may still try to write status changes. The guard lives in SQL, not in the daemon — checking an in-memory job row that was read minutes earlier proves nothing about current ownership. **Every UPDATE that mutates `agent_jobs.status` must include the ownership predicate**, not just completion/failure. The relevant transitions:

| From | To | Trigger |
| --- | --- | --- |
| `claimed` | `running` | Daemon begins execution |
| `running` | `completed` | Walk finished successfully |
| `running` | `failed` | Walk threw or exceeded budget |

The recovery sweep is the fourth path; it goes `claimed | running → pending` and is the *only* writer permitted to violate the ownership predicate (because by definition it operates on jobs whose worker is gone).

All three daemon-side writes use the same shape — predicate on `(id, claimed_by_worker_id, status)`, single `finished_at` for completion **and** failure:

```sql
-- markRunning  (claimed → running). agent_jobs has no started_at; the status
-- change alone is the signal. updated_at is bumped by the existing trigger.
update public.agent_jobs
   set status = 'running'
 where id                   = :jobId
   and claimed_by_worker_id = :selfWorkerId
   and status               = 'claimed'
returning id;

-- markCompleted  (running → completed)
update public.agent_jobs
   set status      = 'completed',
       finished_at = now(),
       result      = :result
 where id                   = :jobId
   and claimed_by_worker_id = :selfWorkerId
   and status               = 'running'
returning id;

-- markFailed  (running → failed)
update public.agent_jobs
   set status      = 'failed',
       finished_at = now(),
       error       = :error
 where id                   = :jobId
   and claimed_by_worker_id = :selfWorkerId
   and status               = 'running'
returning id;
```

If `returning id` yields zero rows on any of these, the claim was recovered (or the prior status drifted) and the write is silently dropped. TS-side example:

```ts
const { data } = await supabase.from("agent_jobs")
  .update({ status: "completed", finished_at: new Date().toISOString(), result })
  .eq("id", jobId)
  .eq("claimed_by_worker_id", self.workerId)
  .eq("status", "running")
  .select("id");

if (!data?.length) {
  log.warn({ jobId, workerId: self.workerId, op: "markCompleted" }, "claim was recovered or status drifted; discarding stale write");
  return;
}
```

This must be applied uniformly to **every** status-mutation path the daemon owns. There is no "trust the in-memory job row" fallback. Stale writes are dropped without a side table; the cost of debugging the rare case is lower than the cost of carrying a secondary write path. (Re-revisit if it happens twice.)

## Daemon changes (`packages/cli`)

1. **Identity flags** on `rove daemon start`:
   - `--as <name>` — required for the new code path; default for backward compat is `${os.hostname()}-${process.env.USER}` with a startup warning recommending an explicit name.
   - `--kind <laptop|dedicated>` — defaults to `laptop`.
   - `--claims <comma-list>` — defaults derive from `--kind`: `laptop`→`manual,localhost`, `dedicated`→`manual,webhook`.

2. **Worker registration on startup** — upsert into `workers` on `(project_id, name)`. Refuses to start if the row has `disabled_at is not null`. On a clean start, clears `stopped_at` only; never touches `disabled_at`.

3. **Heartbeat** — a dedicated timer fires every 15 seconds for the daemon's entire lifetime, updating `workers.last_heartbeat_at = now()`. This runs *concurrently* with whatever the daemon is doing — idle, claiming, or executing a long-running dispatcher subprocess. Walks routinely exceed the 90s recovery threshold, so an idle-only or claim-only heartbeat would cause healthy in-flight walks to be recovered out from under their daemon. The timer must run on the same event loop as the daemon process; if the event loop is starved (long sync work, debugger pause), the daemon will eventually be marked stale — that is acceptable, since a frozen event loop is a real liveness failure.

4. **Claim** — replaces the existing `UPDATE WHERE status='pending'` with `SELECT public.claim_next_job(:worker_id)`.

5. **Recovery sweep** — every daemon issues the recovery UPDATE every 30 seconds. Idempotent and cheap.

6. **Graceful shutdown** — on SIGTERM/SIGINT, the daemon:
   - sets `workers.stopped_at = now()`,
   - releases in-flight claims, scoped to its own project, clearing both new and legacy attribution columns:
     ```sql
     update public.agent_jobs
        set status               = 'pending',
            claimed_by_worker_id = null,
            claimed_by           = null,
            claimed_at           = null
      where project_id           = :daemon_project_id
        and claimed_by_worker_id = :self_worker_id
        and status               in ('claimed','running');
     ```
   - exits.

   This is cleaner than waiting for the recovery sweep — peer daemons can pick up the work immediately, not 90s later. Project-scoping is defensive: a misconfigured daemon should never reach across tenancy even on its own shutdown path.

## Dashboard changes (`apps/dashboard`)

1. **New page `/workers`** — table of all workers in the active project. Columns: name, kind, owner (`github_handle`), capabilities, status badge, last heartbeat (relative), claim count today. Sort: online > stale > stopped > disabled, then by name.

2. **Header chip** — small "Workers: 2 online" indicator that links to `/workers`. So the team always knows whether *anybody* is around to do work.

3. **Job rows show their worker** — wherever `agent_jobs` is rendered, show `claimed_by_worker_id`'s name. Helps debugging ("oh, agiterra-home-mini is offline, that's why webhook walks are queued").

4. **"No worker available" state on the flow page** — when the user clicks "Run walk" and no eligible worker has heartbeated in the last 30s, queue the job but show a banner: "No worker is currently online. Your job will run when one comes back."

## CLI surface

- `rove workers list` — print the same table the dashboard shows.
- `rove workers disable <name>` / `rove workers enable <name>` — soft-toggle from the command line.
- `rove workers logs <name>` — _(future)_ tail recent claim activity; not in this plan.

## Job-routing rules (caller-side)

Job creators set `required_capability` and `preferred_worker` based on intent:

| Trigger | `required_capability` | `preferred_worker` |
| --- | --- | --- |
| Manual "Run walk" button (dashboard) | `manual` | the invoking user's worker.name if online, else null |
| Localhost walk (target URL is `localhost:*`) | `localhost` | the invoking user's worker.name (only their daemon can reach localhost) |
| Webhook from a PR | `webhook` | null |
| `rove change-review` CLI invocation | `manual` | the invoking daemon's name |

Correctness falls out of the capability filter inside `claim_next_job`: a laptop daemon's `capabilities` jsonb lacks the `webhook` key, so it cannot claim webhook jobs even if it's the only worker online.

## Migration of `daemon_heartbeats`

Today, `daemon_heartbeats` is keyed on `user_id` (one row per user with columns `user_id, daemon_name, hostname, version, claim_mode, last_seen_at, project_id`). One user cannot run two daemons (e.g. `brian-laptop` + `brian-home-mini`) without overwriting their own heartbeat row. Replace it.

The dashboard reads `daemon_heartbeats` in several places (header chip, debugging surfaces). Dropping the table in step 1 while the dashboard still expects it would break the live UI. Bridge the gap with a compatibility VIEW that exposes `workers` rows under the old column names; the view is dropped in step 4 once the dashboard has been switched to read `workers` directly.

One-shot migration, in the same SQL file as the `workers` table:

```sql
-- Backfill workers from existing daemon_heartbeats.
-- daemon_name is taken as-is for the worker name; github_handle is recovered
-- via team_members (which maps supabase auth user → github handle).
insert into public.workers (project_id, name, kind, github_handle, capabilities, last_heartbeat_at)
select dh.project_id,
       coalesce(dh.daemon_name, 'legacy-' || left(dh.user_id::text, 8)),
       'laptop',
       tm.github_handle,
       '{"manual": true, "localhost": true}'::jsonb,
       dh.last_seen_at
  from public.daemon_heartbeats dh
  left join public.team_members tm on tm.supabase_user_id = dh.user_id
 where not exists (
   select 1 from public.workers w
    where w.project_id = dh.project_id
      and w.name = coalesce(dh.daemon_name, 'legacy-' || left(dh.user_id::text, 8))
 );

-- Drop the real table, then expose a compatibility VIEW with the old shape.
-- Read-only; the dashboard's existing SELECTs continue to work unchanged
-- until step 4 swaps them over to read `workers`.
--
-- security_invoker = true is required so the authenticated dashboard read
-- runs RLS against `workers` as the calling user (going through
-- is_team_member()), NOT as the view owner — a default view would bypass
-- RLS and leak workers across projects.
drop table public.daemon_heartbeats;

create view public.daemon_heartbeats
  with (security_invoker = true) as
select w.id                                     as user_id,        -- shape compat; not the original auth.users UUID
       w.name                                   as daemon_name,
       null::text                               as hostname,
       null::text                               as version,
       'standard'::text                         as claim_mode,
       w.last_heartbeat_at                      as last_seen_at,
       w.project_id                             as project_id
  from public.workers w;

grant select on public.daemon_heartbeats to authenticated;
-- service_role inherits via the public schema's default grants; do not
-- grant insert/update/delete — the view is read-only by design.
```

`packages/cli/src/daemon/heartbeat.ts` is updated in step 1 to write `workers.last_heartbeat_at`. After step 4 lands the dashboard swap, drop the compatibility view in the same migration that updates the dashboard reads.

**Caveat — what the compat view does *not* preserve.** The view bridges *column shapes*, not foreign-key semantics. The original `daemon_heartbeats.user_id` referenced `auth.users(id)`; any dashboard read that joined through it (e.g. `team_members.supabase_user_id = daemon_heartbeats.user_id` to recover the GitHub handle) will return no rows against the view because `w.id` is a worker UUID, not an auth user UUID. Step 1 must audit and update such queries to either (a) join through `team_members.github_handle = worker.github_handle` against the view, or (b) skip step 4 and read `workers.github_handle` directly. Pick whichever is one fewer line of dashboard code. Either way: the view alone is not enough; the step-1 PR has to touch the leaky readers.

## Order of work

Each step is independently shippable. Stop after any step and the system still works.

1. **Schema + `claim_next_job` function + `daemon_heartbeats` migration (with compat view) + realtime publication update.** Migration applied; daemon writes to `workers.last_heartbeat_at`; existing claim code switched to call `claim_next_job` (with no capability filter yet — every worker is eligible for every job). Dashboard continues to read from the compatibility VIEW unchanged. Behavior unchanged from today; correctness improved. (~1.5 days)
2. **Identity flags (`--as`, `--kind`, `--claims`) + capability-based eligibility + conditional UPDATE for completion/failure.** Daemons advertise capabilities; jobs gain `required_capability` / `preferred_worker`; result writes use the ownership predicate. Webhook routing starts working. (~1 day)
3. **Recovery sweep + graceful-shutdown release + fixed-interval heartbeat timer.** Stuck claims auto-release after 90s; shutdown releases immediately; heartbeat ticks every 15s regardless of job execution state. (~half day)
4. **Dashboard `/workers` page + header chip + job-row attribution + "no worker available" banner + swap dashboard reads from compat view to `workers` + drop the compat view.** This step both adds the new UI and removes the temporary view in a single migration. (~1 day, up from half — the dashboard read swap is non-trivial and the migration ordering matters.)
5. **CLI verbs (`rove workers list / disable / enable`).** (~2 hours)
6. **Document the home-desktop pattern in `docs/walkers.md`.** Concrete walkthrough. (~1 hour)

Total: ~4 days of focused work. The half-day grew on step 4 once the compat-view teardown is folded in.

## Acceptance criteria

- A developer can run `rove daemon start --as=brian-laptop` and see the worker appear in `/workers` within 30 seconds, marked online.
- A second machine running `rove daemon start --as=team-walker --kind=dedicated` claims webhook-triggered jobs even when laptop daemons are also online — by virtue of being the only eligible worker, not by priority sorting.
- Manual walks the user triggers from the dashboard prefer that user's own laptop daemon (so screenshots and trajectories tie back to *their* Claude Code).
- Closing the laptop's daemon with Ctrl-C marks it `stopped` in the UI within 5 seconds, AND releases its in-flight claims back to `pending` immediately.
- Killing a daemon process with `kill -9` (no graceful shutdown) results in its in-flight claims auto-recovering within 90s, with `recovery_count` incremented.
- `rove workers disable brian-laptop` prevents that worker from claiming, and the row's `disabled_at` survives a daemon restart (it must be explicitly re-enabled).
- A second daemon writing a result for a claim that has been recovered does **not** overwrite the new claimer's result.
- A webhook job fired with no eligible worker online stays `pending` and is visible in the UI as "waiting for a worker."
- The team never has to provide an Anthropic API key. The product still works end-to-end without one.
- `daemon_heartbeats` is gone; no code references it after this PR.

## Open questions to resolve during implementation

1. **`SECURITY DEFINER` on `claim_next_job`** — needed so the function can update `workers.last_heartbeat_at` from a worker that may not have direct UPDATE permissions on the table. Verify RLS pass-through is correct; the function is owned by `service_role` but called via PostgREST with a worker-scoped JWT.
2. **What is the worker's auth identity?** Today the daemon uses the service-role key. That gives it carte blanche. A future worker-scoped JWT (per the deferred decision in ROADMAP) would change this. For now, keep service-role; revisit when external customers exist.
3. **Heartbeat-on-idle frequency** — 15s feels right but uses ~5760 row updates per day per worker. Verify Supabase's free-tier write quota tolerates it for an org with ~10 workers. If not, drop to 30s.
4. **Default `name` for unflagged daemons** — `${hostname}-${user}` is unique enough on a single machine but two devs cloning the same laptop image (same hostname, same user) collide. Probably fine; document.

## What stays the same

- `agent_jobs` lifecycle, statuses (other than the new fields), payload shape — unchanged.
- Sinks (markdown / supabase / github-issues) — unchanged.
- Persona model, flow YAML shape, walk prompt — unchanged.
- Auth, RLS, tenancy boundary — unchanged.
- Dispatcher subprocess model (`claude` / `codex`) — unchanged. Same local-only execution; only the *coordination* around it changes.

---

## Reviewer cheatsheet

Flag if you see:

1. Any place this design implicitly assumes a Rove-hosted cloud walker or inference billing relationship. There should be none.
2. Any place this design would require inbound traffic to a developer's machine (tunnel, port forward, NAT punchthrough). There should be none.
3. Any place the schema or claim logic breaks the existing `project_id` tenancy boundary. v4 fix: recovery sweep is scoped to `project_id` on both the outer UPDATE and the inner workers join.
4. Any place the order-of-work introduces an unshippable intermediate state. The compat-view bridge is the v3 fix; v4 added `security_invoker = true` + explicit GRANT so RLS still applies through the view.
5. Any race between `claim_next_job`, the recovery sweep, the fixed-interval heartbeat, and graceful shutdown that could double-claim a job or lose a result.
6. Any place `disabled_at` and `stopped_at` are being conflated again — the v1 review caught one such case.
7. Any UPDATE to `agent_jobs.status` (running, completed, failed, or any new status) that does not include the predicate `where claimed_by_worker_id = :self and status = :expected_prior`. v4 broadens this from v3's completion/failure-only rule. The recovery sweep is the **only** exempt writer.
8. SQL columns that don't exist. v4 fix: `agent_jobs.finished_at` is the single lifecycle column for completion and failure — no `completed_at` or `failed_at` in the schema.
9. The `daemon_heartbeats` backfill SQL — does the `team_members` join recover `github_handle` against the real schema (`supabase_user_id`)? Does the `coalesce(daemon_name, 'legacy-...')` produce unique names per (project_id) in your data?
10. Whether the legacy `claimed_by` column is being kept in sync during the transition (v4 dual-write inside `claim_next_job`; v5 also clears it on graceful shutdown). Search for any dashboard or daemon read of `claimed_by` that the plan leaves stranded.
11. Whether the legacy `assigned_to` user-pin semantic is preserved by `claim_next_job` (v5 fix). A job with `assigned_to` set should still only be claimed by a worker whose owner is that auth user.
12. The grant on `claim_next_job` — v5 restricts it to `service_role` only. Flag any text or example that implies an `authenticated` caller can invoke it without first adding caller authorization inside the function body.
13. `agent_jobs` column references — confirm SQL only uses columns that exist (`id, kind, input, result, error, status, requested_by, assigned_to, claimed_by, claimed_at, finished_at, priority, notes, created_at, updated_at`, plus the new `required_capability, preferred_worker, claimed_by_worker_id, recovery_count, last_recovered_at`). v5 fixed an invented `started_at`.
14. `workers` RLS — verify the `enable row level security` + `workers_read` policy are present in the migration block, since the compat view's `security_invoker = true` means RLS on the underlying table is what gates dashboard reads.
15. Sizing — does ~4 days feel right, or is something hidden?
