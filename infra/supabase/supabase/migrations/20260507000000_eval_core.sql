-- TankLoop Eval — core schema.
--
-- Tables:
--   personas              mirrors git-authoritative persona definitions
--   flows                 mirrors git-authoritative flow YAML
--   runs                  one row per `tankloop-eval run` invocation
--   findings              parsed from the agent's findings JSON block
--   finding_screenshots   N screenshots per finding (Storage object keys)
--
-- Git is canonical for personas and flows; this DB mirrors them so the
-- dashboard can render labels next to run rows without reading the repo.
-- `tankloop-eval sync` (Phase 8) upserts from YAML.
--
-- Runs and findings are canonical here.

create extension if not exists "pgcrypto";

-- ── personas ─────────────────────────────────────────────────────────────────

create table public.personas (
  id                    text primary key,             -- e.g. 'dispatcher_novice'
  label                 text not null,
  description           text not null,
  category              text not null,                -- end-user|internal-user|admin|mobile|accessibility|custom
  expertise             text not null,                -- novice|intermediate|expert
  constraints           jsonb not null default '{}'::jsonb,
  prompt_addendum       text not null default '',
  is_built_in           boolean not null default false,
  icon                  text,
  yaml_sha256           text,                         -- hash of source YAML at last sync; null for built-ins
  synced_from_yaml_at   timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── flows ────────────────────────────────────────────────────────────────────

create table public.flows (
  id                    text primary key,             -- e.g. 'scheduling.create_job'
  title                 text not null,
  goal                  text not null,
  yaml_path             text not null,                -- repo-relative path
  yaml_sha256           text,
  synced_from_yaml_at   timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── runs ─────────────────────────────────────────────────────────────────────

create table public.runs (
  id                        uuid primary key default gen_random_uuid(),
  flow_id                   text not null references public.flows(id) on delete restrict,
  persona_id                text not null references public.personas(id) on delete restrict,
  dispatcher                text not null,             -- 'claude-code' | 'codex' | 'nimbalyst' | ...
  -- initiator is the Supabase auth.users id of the team member who launched
  -- the walk. Null while Phase 7 writes via service-role; Phase 9 dashboard
  -- backfills as walks are launched via the (future) hosted runner.
  initiator                 uuid references auth.users(id) on delete set null,
  initiator_label           text,                     -- best-effort name when initiator is null (e.g. "WrangleMeThis (local)")
  commit_sha                text,                     -- git HEAD at run time, if known
  branch                    text,                     -- git branch at run time, if known
  walked_url                text,                     -- canonical URL the agent ended at
  summary                   text,                     -- agent-provided one-paragraph summary
  raw_stdout_storage_key    text,                     -- optional pointer to full agent stdout (Storage)
  -- All Storage objects for this run live under runs/<id>/ in the `walks` bucket.
  artifacts_storage_prefix  text not null,            -- always "runs/<id>" — denormalized for convenience
  started_at                timestamptz not null,
  finished_at               timestamptz,
  status                    text not null default 'running',  -- running | completed | failed
  exit_code                 int,
  created_at                timestamptz not null default now()
);

create index runs_flow_idx      on public.runs(flow_id, started_at desc);
create index runs_persona_idx   on public.runs(persona_id, started_at desc);
create index runs_initiator_idx on public.runs(initiator);
create index runs_started_idx   on public.runs(started_at desc);

-- ── findings ─────────────────────────────────────────────────────────────────

create table public.findings (
  id                        uuid primary key default gen_random_uuid(),
  run_id                    uuid not null references public.runs(id) on delete cascade,
  -- Agent-assigned identifier within the run (e.g. "finding-1"). Not unique
  -- across runs; just useful for cross-referencing the raw stdout.
  agent_id                  text,
  severity                  text not null check (severity in ('critical','major','minor','nit')),
  title                     text not null,
  description               text not null,
  step_index                int,
  heuristic                 text,
  evidence                  text,
  -- content_hash is computed and stored from Phase 7 onward even though dedup
  -- isn't wired until Phase 8. Doing it now means Phase 8 is "add a query"
  -- instead of "add a migration".
  --
  -- Default: sha256(lower(flow_id || '|' || severity || '|' || normalize(title))).
  -- The CLI computes this client-side; the column is kept loose here so we can
  -- evolve the recipe without a migration.
  content_hash              text not null,
  github_issue_url          text,
  status                    text not null default 'new'
                              check (status in ('new','filed','dismissed','fixed')),
  first_seen_at             timestamptz not null default now(),
  last_seen_at              timestamptz not null default now(),
  -- Set by the cleanup loop after Phase 8 moves a finding to 'fixed' or
  -- 'dismissed'. Drives the screenshot-cleanup CLI.
  resolved_at               timestamptz,
  screenshots_purged_at     timestamptz,
  created_at                timestamptz not null default now()
);

create index findings_run_idx     on public.findings(run_id);
create index findings_hash_idx    on public.findings(content_hash);
create index findings_status_idx  on public.findings(status);
create index findings_cleanup_idx on public.findings(resolved_at)
  where resolved_at is not null and screenshots_purged_at is null;

-- ── finding_screenshots ──────────────────────────────────────────────────────
--
-- Storage objects in the `walks` bucket. Keys are conventionally
-- `runs/<run_id>/<filename>.png`. One row per uploaded screenshot referenced
-- by a finding.

create table public.finding_screenshots (
  id              uuid primary key default gen_random_uuid(),
  finding_id      uuid not null references public.findings(id) on delete cascade,
  storage_bucket  text not null default 'walks',
  storage_key     text not null,                  -- e.g. 'runs/<run_id>/step3-empty-state.png'
  caption         text,
  ordinal         int not null default 0,         -- preserves agent-emitted ordering
  byte_size       int,
  uploaded_at     timestamptz not null default now(),
  unique (finding_id, storage_key)
);

create index finding_screenshots_finding_idx on public.finding_screenshots(finding_id, ordinal);

-- ── updated_at maintenance ───────────────────────────────────────────────────

create or replace function public.set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger personas_updated_at before update on public.personas
  for each row execute function public.set_updated_at();

create trigger flows_updated_at before update on public.flows
  for each row execute function public.set_updated_at();
