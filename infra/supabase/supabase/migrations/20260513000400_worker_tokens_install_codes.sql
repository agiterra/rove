-- Worker tokens — step 1 of docs/plans/worker-tokens.md (v2).
--
-- Introduces the credential substrate that the daemon worker-token
-- cutover (step 3) sits on top of, plus the install_codes table that
-- docs/plans/install-flow.md (v3) consumes for the curl-paste flow.
--
-- This migration ships:
--   1. `public.safe_uuid(text)` — non-raising UUID cast (returns NULL on
--      failure). Every `auth.jwt() ->> '<uuid_claim>'` cast must go
--      through this; a raw `::uuid` on a malformed claim raises a
--      Postgres exception that surfaces to the daemon as a noisy 500
--      instead of a clean auth deny.
--   2. `public.is_worker_jwt()`, `public.jwt_worker_id()`,
--      `public.jwt_project_id()` — convenience accessors over
--      `auth.jwt()` claims, used by the worker RPCs that ship in
--      step 2 and by `claim_next_job` / `recover_stale_claims` after
--      step 2's tightening.
--   3. `public.jwt_is_valid_worker_token()` — token freshness +
--      revocation check. SECURITY DEFINER so it can read worker_tokens
--      regardless of the calling JWT's RLS view. Every worker-callable
--      function in step 2 invokes this; without it, `is_worker_jwt()`
--      alone lets a revoked token continue working until expiry.
--   4. `public.worker_tokens` — one row per minted token (alive or
--      revoked). The `jti` claim in the JWT keys into this table.
--   5. `public.install_codes` — short-lived single-use bearer codes
--      that the install one-liner exchanges for a worker JWT bundle.
--      The table belongs conceptually to install-flow.md but lands
--      here so the credential plan is self-contained server-side.
--
-- Non-goals for this step (deferred to step 2):
--   - The six worker RPCs (worker_heartbeat, worker_mark_stopped,
--     worker_release_my_claims, job_mark_running, job_mark_completed,
--     job_mark_failed).
--   - Caller-auth tightening on claim_next_job / recover_stale_claims.
--   - Granting `authenticated` execute on those functions.
--
-- Existing service-role daemons keep working unchanged after this
-- migration — no callers reference any of the new helpers yet.

-- ── safe_uuid ───────────────────────────────────────────────────────────────

create or replace function public.safe_uuid(s text)
returns uuid
language plpgsql
immutable
as $$
begin
  if s is null or s = '' then
    return null;
  end if;
  return s::uuid;
exception when others then
  return null;
end;
$$;

-- ── JWT claim accessors ────────────────────────────────────────────────────

create or replace function public.is_worker_jwt()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'kind' = 'worker', false);
$$;

create or replace function public.jwt_worker_id()
returns uuid
language sql
stable
as $$
  select public.safe_uuid(auth.jwt() ->> 'worker_id');
$$;

create or replace function public.jwt_project_id()
returns text
language sql
stable
as $$
  select auth.jwt() ->> 'project_id';
$$;

-- ── worker_tokens table ────────────────────────────────────────────────────

create table public.worker_tokens (
  jti              uuid         primary key default gen_random_uuid(),
  worker_id        uuid         not null references public.workers(id) on delete cascade,
  project_id       text         not null,
  issued_at        timestamptz  not null default now(),
  expires_at       timestamptz  not null,
  revoked_at       timestamptz,
  -- The team-member handle that minted this token. Audit trail only;
  -- not a credential.
  issued_to_handle text
);

-- Hot path: SECURITY DEFINER revocation check looks tokens up by jti.
-- Partial index keeps it tight for the live-token set.
create index worker_tokens_lookup_idx
  on public.worker_tokens (jti)
  where revoked_at is null;

-- Mint endpoint revokes any prior un-revoked tokens for the same worker
-- before issuing a new one — covering index keeps that scan cheap.
create index worker_tokens_worker_idx
  on public.worker_tokens (worker_id, issued_at desc);

alter table public.worker_tokens enable row level security;

-- Read by team members for audit/debug visibility on /workers. No
-- write policy — only the dashboard mint endpoint (service-role)
-- writes here.
create policy worker_tokens_read
  on public.worker_tokens
  for select
  using (public.is_team_member());

-- ── jwt_is_valid_worker_token ──────────────────────────────────────────────
--
-- SECURITY DEFINER so it can probe worker_tokens regardless of the
-- caller's RLS view. Returns false for any non-worker JWT (the
-- worker-RPC preambles still gate on `is_worker_jwt()` first, but this
-- belt-and-braces means a stray call from a human session yields a
-- clean false rather than a partial-validation hit).
create or replace function public.jwt_is_valid_worker_token()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_jti uuid;
begin
  if not public.is_worker_jwt() then
    return false;
  end if;

  v_jti := public.safe_uuid(auth.jwt() ->> 'jti');
  if v_jti is null then
    return false;
  end if;

  return exists (
    select 1
      from public.worker_tokens wt
     where wt.jti        = v_jti
       and wt.revoked_at is null
       and wt.expires_at > now()
  );
end;
$$;

revoke all on function public.jwt_is_valid_worker_token() from public;
grant execute on function public.jwt_is_valid_worker_token() to authenticated, service_role;

-- ── install_codes table ────────────────────────────────────────────────────
--
-- One row per /setup paste — issued by `/api/install/mint` (ships in
-- install-flow step 2) and redeemed by `/api/install/exchange` (ships
-- now).
--
-- The code is a short-lived single-use bearer secret while it's live
-- (5 minutes); whoever captures it before exchange can redeem it once.
-- Once consumed or expired, it's inert. Re-pasting the same install
-- one-liner produces a fresh row with a new code value at the source
-- /setup page, not by reusing the prior row.

create table public.install_codes (
  code         uuid         primary key default gen_random_uuid(),
  user_id      uuid         not null references auth.users(id) on delete cascade,
  project_id   text         not null,
  worker_name  text         not null,
  worker_kind  text         not null default 'laptop'
                  check (worker_kind in ('laptop','dedicated')),
  expires_at   timestamptz  not null default (now() + interval '5 minutes'),
  consumed_at  timestamptz,
  consumed_ip  inet,
  created_at   timestamptz  not null default now()
);

create index install_codes_lookup_idx
  on public.install_codes (code)
  where consumed_at is null;

alter table public.install_codes enable row level security;

-- The issuing user can see their own pending codes (so a /setup reload
-- can show "your install code is still valid"). No other read access.
create policy install_codes_self_read
  on public.install_codes
  for select
  using (user_id = auth.uid());

-- No insert/update/delete policy — mint + exchange both run server-side
-- with service-role.
