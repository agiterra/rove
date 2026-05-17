-- ─────────────────────────────────────────────────────────────────────────
-- Backlog adapter substrate (alpha.38a)
--
-- Rove's dashboard is the canonical store; external backlog tools
-- (GitHub Project v2, GitHub Issues, Linear, future X) are downstream
-- projections. This migration adds the data layer that makes the
-- adapter-per-provider abstraction first-class:
--
--   - backlog_connections   per-(project, provider) install record
--   - backlog_items         per-(finding, connection) external item link
--   - finding_occurrences   recurrence audit so re-files don't rewrite
--                           external bodies but DO update Rove's record
--   - flows.owner_handle /  populate assignee/team on the destination
--     flows.team_label /    (Codex's "no one feels ownership" objection)
--     flows.canonical        opts a flow into auto-sync at major severity
--
-- Adding a new provider = one BacklogAdapter implementation + one
-- 'provider' check-constraint value. Zero churn elsewhere.
--
-- See docs/plans/ci-and-backlog.md §3 for the architecture and
-- docs/reviews/2026-05-16-codex-ci-and-backlog.md for the design
-- decisions this migration encodes.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Connections — one row per (project_id, provider) install.
--    project_id matches Rove's tenancy primitive used everywhere else.
create table if not exists public.backlog_connections (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  provider text not null,
  -- destination — provider-specific. Examples:
  --   github  → { "kind":"project_v2", "node_id":"PVT_...", "owner":"agiterra",
  --              "field_ids":{"severity":"...","heuristic":"...", ...} }
  --   github  → { "kind":"issues", "repo":"agiterra/tankloop" }
  --   linear  → { "team_id":"TEAM_...", "project_id":"PRJ_..." }
  destination jsonb not null,
  -- sync_policy — declarative, evaluated per finding by the sink.
  --   { "critical":"auto", "major":"auto-canonical", "minor":"manual",
  --     "agent_readiness_boost":true }
  sync_policy jsonb not null default '{
    "critical": "auto",
    "major": "auto-canonical",
    "minor": "manual",
    "nit": "manual",
    "agent_readiness_boost": true,
    "recurrence_comment": true
  }'::jsonb,
  -- status_map — per-connection mapping from external status names to
  -- Rove's lifecycle. GH default differs from Linear default; user-editable
  -- at install via the settings UI.
  status_map jsonb not null default '{
    "Todo": "new",
    "In Progress": "filed",
    "Done": "fixed",
    "Cancelled": "dismissed"
  }'::jsonb,
  -- secret_ref — pointer to Supabase Vault for the auth token. Never the
  -- raw token. Provider tokens (Linear API key, GH App installation
  -- token) resolve server-side on each adapter call.
  secret_ref text,
  -- installed_via — which of the three install paths produced this row.
  installed_via text not null check (installed_via in (
    'dashboard_only', 'connect_existing', 'managed_board'
  )),
  installed_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint backlog_connections_provider_known
    check (provider in ('dashboard-only', 'github', 'linear')),
  -- At most one ACTIVE connection per (project_id, provider). Disabled
  -- rows can stack so we keep history when a connection is rotated.
  constraint backlog_connections_active_unique
    exclude using btree (project_id with =, provider with =)
    where (disabled_at is null)
);

comment on table public.backlog_connections is
  'One row per (Rove project_id, provider) install. The active row (disabled_at is null) is what new findings flow through. Old rows kept for audit.';

create index if not exists backlog_connections_project_active_idx
  on public.backlog_connections (project_id)
  where disabled_at is null;

-- 2. Items — one row per (finding, connection) external-item link.
create table if not exists public.backlog_items (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.findings(id) on delete cascade,
  connection_id uuid not null references public.backlog_connections(id) on delete cascade,
  project_id text not null,                 -- denormalized for RLS + filter
  external_id text not null,                -- provider's node id or item id
  external_url text,
  external_kind text not null,              -- 'draft_item' | 'issue' | 'linear_issue'
  marker_value text not null,               -- adapter refuses to edit items missing this
  external_state text,                      -- last-known external status (delta detection)
  rove_state text not null default 'new',   -- Rove-side lifecycle: new|triaged|in_progress|fixed|dismissed
  body_locked boolean not null default false,  -- true once draft is promoted to issue; Rove stops body mutations
  created_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  -- a finding can have at most one item per connection
  constraint backlog_items_unique_per_connection unique (finding_id, connection_id)
);

create index if not exists backlog_items_finding_idx on public.backlog_items (finding_id);
create index if not exists backlog_items_connection_idx on public.backlog_items (connection_id);
create index if not exists backlog_items_external_idx on public.backlog_items (connection_id, external_id);

comment on table public.backlog_items is
  'Link between a Rove finding and an external backlog item. body_locked flips true on draft→issue promotion (or first creation for non-draft providers); Rove never mutates title/body after that.';

-- 3. Occurrences — every time a walk re-files the same content_hash,
--    record an occurrence. Adapter optionally adds a comment to the
--    external item; never rewrites the body. This is the audit trail
--    Codex called out as the missing piece for recurrence handling.
create table if not exists public.finding_occurrences (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.findings(id) on delete cascade,
  run_id uuid not null references public.runs(id) on delete cascade,
  project_id text not null,                 -- denormalized for filter
  seen_at timestamptz not null default now(),
  consensus_group_id uuid                   -- future-proof for multi-walk consensus
);

create index if not exists finding_occurrences_finding_idx
  on public.finding_occurrences (finding_id, seen_at desc);
create index if not exists finding_occurrences_run_idx
  on public.finding_occurrences (run_id);
create index if not exists finding_occurrences_consensus_idx
  on public.finding_occurrences (consensus_group_id)
  where consensus_group_id is not null;

comment on table public.finding_occurrences is
  'Audit trail of every walk that re-filed a finding with the same content_hash. The adapter reads this to drive "seen N times" annotations on external items without rewriting bodies.';

-- 4. Flow-level ownership + canonical-flow flag.
--    owner_handle + team_label flow into the adapter so the destination
--    item lands with the right assignee/team. canonical flips a flow
--    into auto-sync at major severity (vs manual-only for non-canonical).
alter table public.flows
  add column if not exists owner_handle text,
  add column if not exists team_label text,
  add column if not exists canonical boolean not null default false;

comment on column public.flows.owner_handle is
  'GitHub/Linear handle of the engineer who owns this flow. Used by backlog adapters to set assignee.';
comment on column public.flows.team_label is
  'Team label (e.g. "platform-ui") populated as a label/field on destination items.';
comment on column public.flows.canonical is
  'When true, major-severity findings on this flow auto-sync to the backlog. Non-canonical flows require manual send.';

-- 5. RLS — backlog tables follow the same is_team_member() gate the
--    rest of the schema uses. project_id scoping is enforced via the
--    column rather than RLS today; per-project membership lands in D-2.
alter table public.backlog_connections enable row level security;
alter table public.backlog_items enable row level security;
alter table public.finding_occurrences enable row level security;

create policy "team can read backlog_connections"
  on public.backlog_connections for select to authenticated
  using (public.is_team_member());
create policy "team can write backlog_connections"
  on public.backlog_connections for all to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

create policy "team can read backlog_items"
  on public.backlog_items for select to authenticated
  using (public.is_team_member());
create policy "team can write backlog_items"
  on public.backlog_items for all to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

create policy "team can read finding_occurrences"
  on public.finding_occurrences for select to authenticated
  using (public.is_team_member());
create policy "team can write finding_occurrences"
  on public.finding_occurrences for all to authenticated
  using (public.is_team_member())
  with check (public.is_team_member());

grant select, insert, update, delete on
  public.backlog_connections,
  public.backlog_items,
  public.finding_occurrences
  to authenticated, service_role;
