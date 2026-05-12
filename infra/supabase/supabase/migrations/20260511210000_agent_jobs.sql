-- TankLoop Eval — Phase 11a: agent_jobs + daemon_heartbeats.
--
-- The daemon is a long-running process on a teammate's Mac that claims
-- queued work (AI generation now, walks in Phase 11 proper) and runs it
-- using the operator's local Claude session. Pull-based by design — see
-- nimbalyst-local/plans/tankloop-eval-team-usability.md §"Phase 11".
--
-- The schema is deliberately polymorphic: `kind` discriminates between
-- `generate_flow` / `generate_persona` / `walk`. Phase 11a only
-- implements the two generate handlers; the walk handler lands in 11b.
--
-- Writes from the daemon currently use the service-role key. Phase 11
-- proper swaps this for per-device JWTs scoped to `daemon:claim` /
-- `daemon:write-jobs`. RLS read policies below already assume that
-- future shape (any team member sees all rows).

create extension if not exists "pgcrypto";

-- ── agent_jobs ───────────────────────────────────────────────────────────────

create table public.agent_jobs (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null
                  check (kind in ('generate_flow','generate_persona','walk')),
  -- Free-form input the daemon needs to do the work. For generate_*: the
  -- prose description from the wizard. For walk: { flow_id, persona_id,
  -- target_url, sinks, ... } — Phase 11b adds those fields.
  input         jsonb not null default '{}'::jsonb,
  -- Daemon writes the structured result here on completion. For generate_*:
  -- the validated FlowDraft or PersonaDraft. For walk: { run_id }.
  result        jsonb,
  error         text,
  status        text not null default 'pending'
                  check (status in ('pending','claimed','running','completed','failed','cancelled')),
  requested_by  uuid references auth.users(id) on delete set null,
  -- Optional pin to a specific operator's daemon. Null = any daemon may claim.
  assigned_to   uuid references auth.users(id) on delete set null,
  claimed_by    uuid references auth.users(id) on delete set null,
  claimed_at    timestamptz,
  finished_at   timestamptz,
  priority      int not null default 50,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index agent_jobs_pending_idx on public.agent_jobs(status, priority desc, created_at)
  where status = 'pending';
create index agent_jobs_requester_idx on public.agent_jobs(requested_by, created_at desc);
create index agent_jobs_kind_idx on public.agent_jobs(kind, created_at desc);

create or replace function public.touch_agent_jobs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger agent_jobs_updated_at
  before update on public.agent_jobs
  for each row execute function public.touch_agent_jobs_updated_at();

-- ── daemon_heartbeats ────────────────────────────────────────────────────────
--
-- One row per active daemon. The dashboard's "online daemons" pill reads
-- this. Stale heartbeats (>5min) imply the daemon is offline.

create table public.daemon_heartbeats (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  daemon_name   text not null,
  hostname      text,
  version       text,
  -- When set, the daemon claims only jobs whose assigned_to = user_id (i.e.
  -- opt-out of the auto-claim path described in plan §"Risks").
  claim_mode    text not null default 'all'
                  check (claim_mode in ('all','requested-only')),
  last_seen_at  timestamptz not null default now()
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
--
-- Service-role bypasses RLS unconditionally; these policies only constrain
-- the dashboard's authenticated reads. No authenticated-role write policies
-- yet — daemons + dashboard server actions both write via service-role for
-- now.

alter table public.agent_jobs        enable row level security;
alter table public.daemon_heartbeats enable row level security;

create policy agent_jobs_read on public.agent_jobs
  for select using (public.is_team_member());

create policy daemon_heartbeats_read on public.daemon_heartbeats
  for select using (public.is_team_member());

-- Realtime publications: the dashboard subscribes via supabase-js Realtime
-- so it can flip the wizard from "waiting for daemon" to "form populated"
-- without a refresh. Add tables to the supabase_realtime publication.
alter publication supabase_realtime add table public.agent_jobs;
alter publication supabase_realtime add table public.daemon_heartbeats;
