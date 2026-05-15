# Plan — Per-Worker JWT Auth

**Status**: ✅ **Shipped 2026-05-14**. Evidence: `apps/dashboard/lib/auth/mint-worker-token.ts`, migration `20260513000400_worker_tokens_install_codes.sql`, `worker_tokens` table, `is_worker_jwt()` + `jwt_*()` helpers, `claim_next_job` + `recover_stale_claims` with revocation check, `ROVE_WORKER_TOKEN_FILE` env var. **Caveat**: alpha.15 install flow currently *also* ships the service-role key to workers as a transitional concession (see [`wire-sink-relay.md`](wire-sink-relay.md) for the retire path) — the worker-token machinery is in place but full hardening blocks on Wire-sink-relay landing. v2 — incorporates first Codex review.
**Owner**: Brian.
**Why now**: Today every daemon authenticates to Supabase with the project's service-role key — full DB admin. That's tolerable while team = trusted Agiterra org but cannot survive the install-flow Brian wants. The install one-liner has to deliver *some* credential to the user's `~/.rove/`; service-role is too powerful, leaks via view-source on `/setup`, and forecloses any non-team deployment. Path B from the install-flow conversation: solve credentials first, then build the install on top.

## v2 changes (responses to first Codex review)

1. **Supabase client auth shape corrected.** v1 implied the worker JWT went into `apikey`. Wrong. The publishable/anon key stays in `apikey` (PostgREST requires it for the project to even respond); the worker JWT goes into `Authorization: Bearer <jwt>`. The daemon gains `ROVE_SUPABASE_PUBLISHABLE_KEY` as a required env when in worker-token mode.
2. **`claim_next_job` and `recover_stale_claims` now invoke `jwt_is_valid_worker_token()`.** v1's caller-auth check inside those functions only verified `is_worker_jwt()` + matching IDs — never checked revocation, since `SECURITY DEFINER` bypasses RLS. v2 adds the explicit revocation check so a revoked token cannot keep claiming.
3. **Worker writes no longer go through table policies.** v1 added `workers_self_update` and `agent_jobs_worker_update` RLS policies, but those let a worker mutate *any* column on its own row / its claimed jobs — including `disabled_at`, `capabilities`, `kind`, raw `result` overwrites, etc. v2 removes those policies entirely. All worker mutations go through a closed set of `SECURITY DEFINER` RPCs (`worker_heartbeat`, `worker_mark_stopped`, `worker_release_my_claims`, `job_mark_running`, `job_mark_completed`, `job_mark_failed`) that touch only the columns daemons actually need. Service-role keeps its bypass for dashboard server code.
4. **Daemon startup path splits on auth mode.** v1 left the existing `resolveDaemonIdentity` (team_members lookup) + `registerWorker` (upsert) path intact, but a worker JWT *cannot* execute either of those — they need privileges a scoped token shouldn't have. v2 specifies a separate startup path: decode JWT claims, extract `worker_id` / `project_id` / `worker_name`, skip identity resolution and worker upsert, jump straight to `worker_heartbeat()` + claim loop.
5. **Safe UUID cast.** v1 used `nullif(auth.jwt() ->> 'worker_id', '')::uuid` which raises on a malformed value. v2 adds a `public.safe_uuid(text)` helper that returns null on cast failure; all JWT claim casts go through it.
6. **Order of work consolidated.** v1's step 3 made daemons "functional" but they would have hit RLS denials immediately because step 4's policies weren't in place yet. v2 merges those into one cutover step — daemon worker-token support, the RPCs, the function tightening, and the grants all land together.
7. **Token-file daemon support documented.** v1 mentioned the file at `~/.rove/auth.token` informally. v2 makes `ROVE_WORKER_TOKEN_FILE` (path to a file containing the JWT) a first-class env var that the daemon reads, matching what `install-flow.md` writes into the LaunchAgent plist.

## Goal

Replace the service-role key on daemons with a **per-worker JWT** that authorizes exactly one worker, in exactly one project, for exactly the operations a daemon needs: claim jobs, write status, heartbeat, recover stale claims. Nothing else. View-source on `/setup` may still leak the token, but the token only grants the rights of *one* worker — losing it is recoverable (revoke + re-mint).

This unblocks the install-flow story (`/setup` page + curl-paste install) without requiring trust that the user is a team member with admin powers.

## Non-goals

- **No OAuth-style device-code flow.** Tokens are minted from the authenticated dashboard, full stop. Future enhancement.
- **No short-lived tokens + refresh.** Tokens are long-lived (365 days). If we need rotation, that's a future pass.
- **No revocation UI.** Revoke happens via SQL or `rove workers disable <name>` (which also blocks claims regardless of token validity). UI to "rotate this worker's token" is future polish.
- **No removal of service-role auth.** The dashboard's server-side code (queueing jobs, syncing flows, etc.) keeps using service-role. We're only changing *daemon* auth.
- **No multi-token-per-worker.** One worker → one active token. Re-minting invalidates the prior token.

## Mental model

Two distinct trust contexts after this lands:

| Caller | Auth method | What it can do |
| --- | --- | --- |
| Dashboard server code | Service-role key | Insert agent_jobs, sync flows, mint worker tokens, anything (full admin) |
| Daemon | Per-worker JWT | Heartbeat its own worker row, claim eligible jobs in its project, update status on jobs it claimed, run recovery sweep in its project |
| Dashboard browser code | User session JWT (Supabase OAuth) | Read everything (gated by `is_team_member()`); no direct writes |

The worker JWT is the new thing. It's signed with Supabase's project JWT secret so Supabase's PostgREST validates it like any auth token — we don't add an auth proxy.

## Token shape

Standard Supabase auth JWT (HS256, signed with `SUPABASE_JWT_SECRET`), with custom claims:

```json
{
  "iss": "rove-dashboard",
  "sub": "<worker_id_uuid>",
  "aud": "authenticated",
  "role": "authenticated",
  "kind": "worker",
  "worker_id": "<uuid>",
  "project_id": "<slug>",
  "worker_name": "<name>",
  "jti": "<uuid>",
  "iat": 1700000000,
  "exp": 1731000000
}
```

- `sub = worker_id` — lets `auth.uid()` continue to work; we just interpret it as a worker UUID when `kind=worker`.
- `aud = authenticated` and `role = authenticated` — Supabase accepts the token as valid auth.
- `kind = 'worker'` — distinguishes worker tokens from human OAuth tokens; RLS policies branch on this.
- `worker_id`, `project_id`, `worker_name` — convenient redundancy for RLS predicates.
- `jti` — used for revocation lookup.

Validation happens inside Supabase / PostgREST automatically. We just write RLS that reads `auth.jwt() -> '<claim>'`.

## Schema

One new table for revocation. No changes to `workers`.

```sql
create table public.worker_tokens (
  jti              uuid primary key default gen_random_uuid(),
  worker_id        uuid not null references public.workers(id) on delete cascade,
  project_id       text not null,
  issued_at        timestamptz not null default now(),
  expires_at       timestamptz not null,
  revoked_at       timestamptz,
  issued_to_handle text                                    -- the human who minted it (for audit)
);

create index worker_tokens_lookup_idx
  on public.worker_tokens (jti)
  where revoked_at is null;

create index worker_tokens_worker_idx
  on public.worker_tokens (worker_id, issued_at desc);

alter table public.worker_tokens enable row level security;

create policy worker_tokens_read
  on public.worker_tokens
  for select
  using (public.is_team_member());

-- No write policy — only service-role (dashboard mint endpoint) writes.
```

## RLS helpers

Four SQL helpers. `safe_uuid` is critical — `auth.jwt() ->> 'worker_id'` can return a malformed value (or null), and a naive `::uuid` cast raises an exception, which propagates into a Postgres error the worker sees instead of a clean deny.

```sql
create or replace function public.safe_uuid(s text) returns uuid
  language plpgsql immutable as $$
begin
  if s is null or s = '' then return null; end if;
  return s::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.is_worker_jwt() returns boolean
  language sql stable as $$
  select coalesce(auth.jwt() ->> 'kind' = 'worker', false)
$$;

create or replace function public.jwt_worker_id() returns uuid
  language sql stable as $$
  select public.safe_uuid(auth.jwt() ->> 'worker_id')
$$;

create or replace function public.jwt_project_id() returns text
  language sql stable as $$
  select auth.jwt() ->> 'project_id'
$$;

-- Token freshness/revocation check.
create or replace function public.jwt_is_valid_worker_token() returns boolean
  language plpgsql stable security definer
  set search_path = public, pg_temp
as $$
declare
  v_jti uuid;
begin
  if not public.is_worker_jwt() then return false; end if;
  v_jti := public.safe_uuid(auth.jwt() ->> 'jti');
  if v_jti is null then return false; end if;
  return exists (
    select 1 from public.worker_tokens wt
     where wt.jti = v_jti
       and wt.revoked_at is null
       and wt.expires_at > now()
  );
end;
$$;
```

**No new RLS policies are added on `workers` or `agent_jobs`.** Worker tokens have no direct UPDATE rights on either table — `authenticated` role is intentionally not granted `update` on them. The existing `is_team_member()` SELECT policies stay; service-role keeps its bypass. The only write path for a worker is the closed set of RPCs in the next section.

## Worker RPCs (the only write surface)

Six new `SECURITY DEFINER` functions. Each is the minimum-scope write the daemon needs. Each starts with the same caller-auth preamble; if it fails, the function raises and PostgREST returns 4xx — the daemon translates that into the friendly "token rejected" message described below.

```sql
-- Reused caller-auth check. Inlined into each RPC (or wrapped as a helper) so
-- the same revocation check runs for every worker call, not just claim_next_job.
-- Pseudocode:
--   if is_worker_jwt() then
--     if not jwt_is_valid_worker_token() then raise insufficient_privilege; end if;
--   elsif auth.role() <> 'service_role' then
--     raise insufficient_privilege;
--   end if;
```

The six RPCs:

```sql
-- Heartbeat — the only field the worker can update on its own row.
create or replace function public.worker_heartbeat()
  returns void
  language plpgsql security definer set search_path = public, pg_temp
as $$ begin
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
end; $$;

-- Graceful shutdown — set stopped_at; daemon calls before exit.
create or replace function public.worker_mark_stopped()
  returns void
  language plpgsql security definer set search_path = public, pg_temp
as $$ begin
  if not public.is_worker_jwt() or not public.jwt_is_valid_worker_token() then
    raise exception 'worker token rejected' using errcode = '42501';
  end if;
  update public.workers
     set stopped_at = now()
   where id = public.jwt_worker_id();
end; $$;

-- Graceful shutdown — release the worker's in-flight claims.
create or replace function public.worker_release_my_claims()
  returns int
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_n int;
begin
  if not public.is_worker_jwt() or not public.jwt_is_valid_worker_token() then
    raise exception 'worker token rejected' using errcode = '42501';
  end if;
  update public.agent_jobs
     set status = 'pending',
         claimed_by_worker_id = null,
         claimed_by = null,
         claimed_at = null
   where project_id           = public.jwt_project_id()
     and claimed_by_worker_id = public.jwt_worker_id()
     and status               in ('claimed','running');
  get diagnostics v_n = row_count;
  return v_n;
end; $$;

-- Status mutations on agent_jobs. Each enforces the ownership predicate
-- (claimed_by_worker_id = self AND status = expected_prior) so a recovered
-- daemon's stale write is dropped — same semantics as the v5 named-workers
-- predicate, just behind an RPC.

create or replace function public.job_mark_running(p_job_id uuid)
  returns boolean
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_n int;
begin
  if not public.is_worker_jwt() or not public.jwt_is_valid_worker_token() then
    raise exception 'worker token rejected' using errcode = '42501';
  end if;
  update public.agent_jobs
     set status = 'running'
   where id                   = p_job_id
     and project_id           = public.jwt_project_id()
     and claimed_by_worker_id = public.jwt_worker_id()
     and status               = 'claimed';
  get diagnostics v_n = row_count;
  return v_n > 0;
end; $$;

create or replace function public.job_mark_completed(p_job_id uuid, p_result jsonb)
  returns boolean
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_n int;
begin
  if not public.is_worker_jwt() or not public.jwt_is_valid_worker_token() then
    raise exception 'worker token rejected' using errcode = '42501';
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
end; $$;

create or replace function public.job_mark_failed(p_job_id uuid, p_error text)
  returns boolean
  language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_n int;
begin
  if not public.is_worker_jwt() or not public.jwt_is_valid_worker_token() then
    raise exception 'worker token rejected' using errcode = '42501';
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
end; $$;
```

Grants:

```sql
revoke all on function public.worker_heartbeat()         from public;
revoke all on function public.worker_mark_stopped()      from public;
revoke all on function public.worker_release_my_claims() from public;
revoke all on function public.job_mark_running(uuid)     from public;
revoke all on function public.job_mark_completed(uuid, jsonb) from public;
revoke all on function public.job_mark_failed(uuid, text) from public;

-- Worker tokens land in the authenticated role; service-role keeps everything.
grant execute on function public.worker_heartbeat()         to authenticated, service_role;
grant execute on function public.worker_mark_stopped()      to authenticated, service_role;
grant execute on function public.worker_release_my_claims() to authenticated, service_role;
grant execute on function public.job_mark_running(uuid)     to authenticated, service_role;
grant execute on function public.job_mark_completed(uuid, jsonb) to authenticated, service_role;
grant execute on function public.job_mark_failed(uuid, text) to authenticated, service_role;
```

A worker token has rights to: heartbeat its own row, mark itself stopped, release its own claims, mark its claimed jobs through their state machine. Nothing else. It cannot toggle `disabled_at`, change `kind`, alter `capabilities`, set arbitrary `result` on someone else's job, or touch any administrative metadata. That's the bounded blast radius the install flow needs.

## Function changes

`claim_next_job` and `recover_stale_claims` already exist (`SECURITY DEFINER`, granted to service_role only). v2 extends both with the same caller-auth + revocation check used by the worker RPCs, then opens execute to `authenticated`:

```sql
-- (inside claim_next_job, after the worker fetch)
if public.is_worker_jwt() then
  if not public.jwt_is_valid_worker_token() then
    raise exception 'worker token rejected' using errcode = '42501';
  end if;
  if p_worker_id <> public.jwt_worker_id() then
    raise exception 'token worker_id does not match p_worker_id' using errcode = '42501';
  end if;
elsif auth.role() <> 'service_role' then
  raise exception 'claim_next_job: caller must be a worker JWT or service_role' using errcode = '42501';
end if;
```

Same shape inside `recover_stale_claims` (compare `p_project_id` instead of `p_worker_id`).

Both then add `grant execute … to authenticated` alongside the existing service_role grant.

## Dashboard mint endpoint

Server route `POST /api/workers/tokens`:

- Auth: requires a signed-in team member.
- Body: `{ worker_name: string, project_id: string, kind?: "laptop"|"dedicated" }`.
- Behavior:
  1. Validate inputs.
  2. Upsert the `workers` row (so the token has a real worker_id to embed). If the row exists and is disabled, refuse with 409.
  3. Revoke any existing un-revoked tokens for this worker.
  4. Mint a new JWT with the claims above. Sign with `SUPABASE_JWT_SECRET` (server-only env var).
  5. Insert a `worker_tokens` row with the new `jti`.
  6. Return `{ token, worker_id, expires_at }`.

Token TTL: 365 days. Long enough that nobody renews routinely; short enough that an abandoned token eventually rots.

## Daemon changes

Three things change in `packages/cli/src/`: how the supabase client is built, how the daemon starts up, and how status writes happen.

### Supabase client auth shape

`packages/cli/src/supabase/client.ts` picks an auth mode and constructs the client with the correct header split. **`apikey` must always be the publishable/anon key**; the worker JWT only goes in `Authorization: Bearer`. Stuffing the worker JWT into `apikey` skips PostgREST's project-key check and confuses the auth pipeline.

```ts
type AuthMode =
  | { mode: "worker"; token: string; publishableKey: string }
  | { mode: "service-role"; key: string };

function pickAuth(): AuthMode {
  const tokenFile = process.env.ROVE_WORKER_TOKEN_FILE;
  const tokenInline = process.env.ROVE_WORKER_TOKEN;
  const token = tokenInline
    ?? (tokenFile ? readFileTrimmed(tokenFile) : undefined)
    ?? readIfExists(path.join(os.homedir(), ".rove", "auth.token"));
  if (token) {
    const publishableKey =
      process.env.ROVE_SUPABASE_PUBLISHABLE_KEY
      ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      throw new Error(
        "Worker token present but no ROVE_SUPABASE_PUBLISHABLE_KEY set. " +
        "Both are required: the publishable key authenticates the project to PostgREST; " +
        "the worker token authenticates THIS worker."
      );
    }
    return { mode: "worker", token, publishableKey };
  }
  const serviceRole = process.env.ROVE_SUPABASE_SERVICE_ROLE_KEY
    ?? process.env.EVAL_SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRole) return { mode: "service-role", key: serviceRole };
  throw new Error("No worker token and no service-role key configured.");
}

function buildSupabase(url: string, auth: AuthMode): SupabaseClient {
  if (auth.mode === "worker") {
    return createClient(url, auth.publishableKey, {
      global: { headers: { Authorization: `Bearer ${auth.token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return createClient(url, auth.key, { auth: { persistSession: false } });
}
```

### Daemon startup splits on auth mode

`packages/cli/src/daemon/runner.ts` startup gains a branch. In **service-role mode** (today's path): resolve `team_members` identity, upsert the worker, register. In **worker-token mode**: decode the JWT, extract `worker_id` / `project_id` / `worker_name` / `github_handle`, **skip** the team_members lookup, **skip** the worker upsert (the dashboard's mint endpoint already created the row), proceed straight to the claim loop.

```ts
function decodeWorkerToken(token: string): WorkerClaims {
  const [, payload] = token.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  return {
    workerId: claims.worker_id,
    projectId: claims.project_id,
    workerName: claims.worker_name,
    githubHandle: claims.github_handle ?? null,
  };
}

if (authMode === "worker") {
  const claims = decodeWorkerToken(token);
  await callRpc(supabase, "worker_heartbeat"); // also serves as a token-validity probe
  // … claim loop, recovery sweep, etc. — all already worker_id-driven from step 1
} else {
  const identity = await resolveDaemonIdentity(supabase);   // existing path
  const worker = await registerWorker(supabase, identity, projectId, …);
  // … etc.
}
```

The first `worker_heartbeat` call serves a second purpose: if the token is invalid or revoked, this call 4xx-fails immediately and the daemon exits with the friendly message below, before claiming any work.

### Status writes go through RPCs in worker-token mode

`markRunning`, `markCompleted`, `markFailed`, and the periodic heartbeat all switch on auth mode:

| Operation | Service-role mode (today) | Worker-token mode (v2) |
| --- | --- | --- |
| Heartbeat tick | `UPDATE workers SET last_heartbeat_at=now() WHERE id=…` | `supabase.rpc("worker_heartbeat")` |
| Mark running | conditional UPDATE on agent_jobs | `supabase.rpc("job_mark_running", { p_job_id })` |
| Mark completed | conditional UPDATE on agent_jobs | `supabase.rpc("job_mark_completed", { p_job_id, p_result })` |
| Mark failed | conditional UPDATE on agent_jobs | `supabase.rpc("job_mark_failed", { p_job_id, p_error })` |
| Graceful shutdown release | `UPDATE agent_jobs SET status='pending' …` | `supabase.rpc("worker_release_my_claims")` |
| Mark stopped | `UPDATE workers SET stopped_at=now() …` | `supabase.rpc("worker_mark_stopped")` |
| Claim | `supabase.rpc("claim_next_job", { p_worker_id })` | `supabase.rpc("claim_next_job", { p_worker_id })` (same — function extends to authenticated callers in v2) |
| Recovery sweep | `supabase.rpc("recover_stale_claims", { p_project_id })` | same |

The RPC return shapes mirror the existing return values: `worker_heartbeat` returns void, `job_mark_*` returns boolean (true = wrote, false = claim recovered).

### Friendly token-rejection error

When any worker RPC raises with code `42501` (`insufficient_privilege`) and the message includes `worker token rejected`, the daemon catches it once at startup and exits:

```
[daemon] fatal: worker token rejected (revoked or expired)
  Re-install or mint a fresh token at https://rove-agiterra.vercel.app/setup
```

If the same error fires later (during the claim loop) the daemon logs and exits cleanly with the same message — `launchd`'s `KeepAlive` won't help (it can't re-mint a token), so the LaunchAgent ThrottleInterval + dashboard's "no worker online" state takes over until the user re-installs.

## CLI change

Two new verbs:

```
rove auth mint-token --as=<name> --project-id=<slug>  [--kind=<laptop|dedicated>]
  Calls the dashboard mint endpoint via an interactive OAuth flow
  (or, in alpha, a one-shot installer link). Writes the returned token
  to ~/.rove/auth.token (chmod 600).

rove auth show-token
  Prints the active token's claims (decoded, no signature). Useful for
  debugging "why is the daemon getting denied?"
```

For alpha, `mint-token` can be skipped — the setup page renders the install one-liner with the token already embedded. Step 2 of the install-flow plan ships the page.

## Order of work

Each step independently shippable. After step 1, existing daemons (service-role) keep working unchanged. After step 3, daemons with a worker token also work, end-to-end.

1. **Schema + RLS helpers + safe_uuid + `worker_tokens` table + `install_codes` table + mint endpoint.** New SQL functions, two new tables, new dashboard API routes (`/api/workers/tokens` mint + `/api/install/exchange`). No behavior change for daemons. The `install_codes` table actually belongs to `install-flow.md`, but lands in this step so the credential plan is fully self-contained on the server side. (~half day)
2. **Worker RPCs land.** All six RPCs (`worker_heartbeat`, `worker_mark_stopped`, `worker_release_my_claims`, `job_mark_running`, `job_mark_completed`, `job_mark_failed`) plus the caller-auth tightening on `claim_next_job` and `recover_stale_claims`. Granted to authenticated + service_role. No daemon changes yet — these RPCs are dark code until step 3 wires the daemon. (~half day)
3. **Daemon worker-token cutover.** Supabase client `pickAuth()`; runner.ts startup branch; all status writes switch on auth mode; friendly token-rejection error. Service-role mode unchanged so old daemons keep working. Token-token daemons fully functional end-to-end. (~1 day — the largest step, because it touches every status-write path.)
4. **CLI verb `rove auth show-token`** (decode + print). Optional; helps the install flow debug "why isn't my token working?". (~1 hour)

Total: ~2 days of focused work. The install flow (separate plan) is then ~2 days on top.

## Acceptance criteria

- A daemon started with `ROVE_WORKER_TOKEN=<jwt>` + `ROVE_SUPABASE_PUBLISHABLE_KEY=<key>` (and **no** service-role key) heartbeats, claims, dispatches, and completes jobs end-to-end against the live DB.
- The daemon's heartbeat tick goes through `worker_heartbeat()` RPC, not a direct UPDATE — verified by revoking the `authenticated` role's UPDATE on `workers` and confirming the daemon still works.
- The same daemon **cannot** call `worker_heartbeat()` and have it touch another worker's row (the RPC reads `jwt_worker_id()` and that's the only worker it can affect).
- The same daemon **cannot** call `job_mark_completed(other_workers_job_id, payload)` and have it write — the ownership predicate inside the RPC returns false, no row touched.
- The same daemon **cannot** alter `disabled_at` / `kind` / `capabilities` on its own row. The RPC for `worker_heartbeat` only touches `last_heartbeat_at`; direct UPDATE on `workers` is denied.
- A revoked token (`update worker_tokens set revoked_at=now() where jti=…`) causes the **next** RPC call to fail with 42501 / `worker token rejected`; the daemon logs the friendly message and exits.
- A token with a malformed `worker_id` claim (e.g., a non-UUID string injected post-mint) yields a clean "token rejected" rather than a Postgres cast error — verified by `safe_uuid`.
- Service-role-authed code (dashboard server actions, migration scripts) continues to bypass RLS and the worker-RPC paths exactly as before. The dashboard's `queueWalkJob` still works; `rove daemon` in legacy service-role mode still works.
- The mint endpoint refuses unauthenticated callers (401) and callers who aren't team members (403).
- The exchange endpoint refuses an install code that's already consumed, expired, or belongs to a no-longer-team-member user.

## Open questions

1. **`SUPABASE_JWT_SECRET` env var.** Not currently in `.env.local` or Vercel. Need to grab it from the Supabase project settings and add to both before step 1 can ship. Document in step 1 PR description.
2. **`ROVE_SUPABASE_PUBLISHABLE_KEY` env var on the daemon side.** The publishable key already exists for the dashboard (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). The install-flow plan's exchange endpoint returns it alongside the JWT so it lands in `~/.rove/env`. Ad-hoc CLI users without the install flow set it manually.
3. **Token storage on the daemon side.** Three sources, checked in order: `ROVE_WORKER_TOKEN` env (inline, for one-off testing), `ROVE_WORKER_TOKEN_FILE` env (points at a file the daemon reads — what `install-flow.md` writes into the LaunchAgent), or the default file path `~/.rove/auth.token`. The daemon trims whitespace and rejects a multi-line value (defends against accidental shell pipe artifacts).
4. **What `auth.role()` looks like for a custom-signed worker JWT.** Should be `authenticated` since we set `role=authenticated` in the claims. Verify with a `select auth.role()` from a worker-token-authenticated session before relying on the `elsif auth.role() = 'service_role'` branch in the RPC preambles.
5. **Backward-compat window.** Existing daemons using service-role keep working through all four steps and beyond. Removing service-role support from the daemon is a future PR, only after every active daemon has been re-installed with a token. Plan to keep the dual path through at least one alpha cycle.
6. **Index on `install_codes` and `worker_tokens` for cleanup.** Step 1 lands the tables but doesn't define a cleanup cadence. Probably a simple `delete … where consumed_at < now() - interval '1 day'` inside the exchange endpoint is enough; a real cron job is overkill at alpha volume.

## Reviewer cheatsheet

Flag if you see:

1. Service-role bypass being weakened — any RLS or function change that affects how the dashboard server code authenticates. Daemons are the only caller getting tighter auth.
2. **Direct UPDATE on `workers` or `agent_jobs` granted to `authenticated`.** v2 fix: the only worker write path is the six RPCs. If the migration grants table-level UPDATE to `authenticated`, regress.
3. **A worker RPC missing the `jwt_is_valid_worker_token()` revocation check.** v2 fix: every worker-callable function (the six new RPCs *and* `claim_next_job` *and* `recover_stale_claims`) calls it. A function that only checks `is_worker_jwt()` lets revoked tokens through.
4. **Worker JWT going into `apikey`** instead of `Authorization: Bearer`. v2 fix: `apikey` must be the publishable key; the worker JWT only goes in the Authorization header.
5. **Daemon startup attempting `team_members` lookup or `workers` upsert in worker-token mode.** v2 fix: in worker-token mode, the row already exists and the JWT carries the claims; daemon skips both.
6. **`safe_uuid` removed or bypassed.** v2 fix: every `auth.jwt() ->> '<uuid_claim>'` cast goes through it; a raw `::uuid` cast on a JWT claim is a footgun.
7. Token TTL or refresh logic creeping in. We deliberately picked long-lived + no refresh.
8. RLS predicates that compare a JWT claim to a column without ALSO checking `is_worker_jwt()` — otherwise a human auth session with a stray claim could spoof a worker.
9. Mint endpoint accepting `worker_id` from the body. It must use `worker_name + project_id` and look up / create the row server-side. Otherwise a caller could mint a token for someone else's worker.
10. Exchange endpoint failing open on a malformed or already-consumed install code — must explicitly return 401/410 with no token body.
11. Sizing — does ~2 days feel right, or is something hidden?
