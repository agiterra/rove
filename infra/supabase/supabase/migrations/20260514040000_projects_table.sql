-- ─────────────────────────────────────────────────────────────────────────
-- public.projects — canonical registry of project slugs.
--
-- Before this: project_id was just a text column on every row; the slug
-- "existed" the first time anything referenced it. The dashboard's
-- ProjectSwitcher scanned runs + agent_jobs for distinct values, which
-- meant a brand-new project (no walks queued yet, no runs recorded)
-- couldn't appear in the switcher even though it conceptually existed.
--
-- After this: projects is the source of truth for which slugs exist +
-- their display name + an optional default target URL the run-walk
-- wizard pre-fills. ProjectSwitcher reads from this table.
--
-- Idempotent: add-if-missing. Backfills existing slugs from the union
-- of project_id values across runs, agent_jobs, flows, and workers so
-- nothing in production disappears from the switcher when we cut over.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.projects (
  id                  text         primary key,
  display_name        text         not null,
  default_target_url  text,
  created_at          timestamptz  not null default now(),
  created_by          uuid         references auth.users(id) on delete set null
);

comment on table public.projects is
  'Project registry. project_id text on every other table references this slug.';

-- Backfill from the union of slugs that exist in any project-id-bearing
-- table. on conflict do nothing keeps re-running the migration safe.
insert into public.projects (id, display_name, created_at)
select sub.project_id,
       sub.project_id as display_name,
       min(sub.first_seen) as created_at
  from (
    select project_id, min(started_at) as first_seen from public.runs        group by project_id
    union all
    select project_id, min(created_at) as first_seen from public.agent_jobs  group by project_id
    union all
    select project_id, min(created_at) as first_seen from public.flows      group by project_id
    union all
    select project_id, min(created_at) as first_seen from public.workers    group by project_id
  ) sub
 group by sub.project_id
    on conflict (id) do nothing;

alter table public.projects enable row level security;

-- Team members can SELECT and INSERT. UPDATE/DELETE are not granted here;
-- renaming or removing a project is a separate intentional admin action.
drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects
  for select using (public.is_team_member());

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects
  for insert with check (public.is_team_member());
