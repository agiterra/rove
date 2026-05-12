-- Phase C-lite: project-scoping. Every Rove row gains a project_id so
-- TankLoop's findings and the next installer's findings don't collide
-- in the shared store. Default backfill is 'tankloop' so the existing
-- data lands in the right bucket without manual touch-ups.
--
-- Multi-tenant workspaces (members, RLS by workspace, switching) is
-- Phase D; this migration is the minimum bar for "two projects can
-- write to the same Rove Supabase project without stepping on each
-- other."

alter table public.personas             add column project_id text not null default 'tankloop';
alter table public.flows                add column project_id text not null default 'tankloop';
alter table public.runs                 add column project_id text not null default 'tankloop';
alter table public.findings             add column project_id text not null default 'tankloop';
alter table public.finding_screenshots  add column project_id text not null default 'tankloop';
alter table public.agent_jobs           add column project_id text not null default 'tankloop';
alter table public.daemon_heartbeats    add column project_id text not null default 'tankloop';

-- Drop the defaults — new rows must set project_id explicitly. The
-- backfill above stays in place.
alter table public.personas             alter column project_id drop default;
alter table public.flows                alter column project_id drop default;
alter table public.runs                 alter column project_id drop default;
alter table public.findings             alter column project_id drop default;
alter table public.finding_screenshots  alter column project_id drop default;
alter table public.agent_jobs           alter column project_id drop default;
alter table public.daemon_heartbeats    alter column project_id drop default;

-- Indexes for the common project-scoped reads.
create index personas_project_idx        on public.personas(project_id);
create index flows_project_idx           on public.flows(project_id);
create index runs_project_idx            on public.runs(project_id, started_at desc);
create index findings_project_idx        on public.findings(project_id, last_seen_at desc);
create index agent_jobs_project_idx      on public.agent_jobs(project_id, created_at desc);
