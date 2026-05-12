-- §0 item #1 — goal_reached on every walk.
--
-- The single most diagnostic signal Rove produces: goal_reached=false with
-- findings_count=0 is the navigation-maze signature. Every page worked, the
-- user never arrived. Item #2 (pre-walk plan + post-walk reflection) will
-- add siblings under this column's logical group; for now this lone field
-- lights up /runs and /flows/[id] with a measurable success rate.
--
-- Nullable on purpose. Pre-rollout walks predate the prompt change and
-- should render as "—" rather than backfill to a guessed value.

alter table public.runs add column goal_reached boolean;

comment on column public.runs.goal_reached is
  'Whether the persona accomplished the flow goal. NULL for walks predating the §0 item-#1 rollout (2026-05-12).';

create index runs_goal_reached_idx on public.runs(project_id, goal_reached)
  where goal_reached is not null;
