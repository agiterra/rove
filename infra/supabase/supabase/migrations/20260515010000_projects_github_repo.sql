-- ─────────────────────────────────────────────────────────────────────────
-- projects.github_repo — per-project GitHub repo binding for the
-- dashboard's "Send to GitHub issue" flow.
--
-- Until now the dashboard couldn't surface a working Send-to-issue button
-- because it didn't know which repo to file against. The CLI side knows
-- (rove.config.ts → github.repo); the projects table is the natural place
-- to mirror it so dashboard server actions can resolve it cheaply.
--
-- Format: "owner/repo" (matches the rove.config.ts shape). Optional —
-- projects without a binding render the button disabled with a tooltip.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.projects
  add column if not exists github_repo text;

-- "owner/repo" — letters/digits/hyphens/underscores/dots on each side, one
-- slash. Tightens the dashboard's trust boundary so a malformed value
-- can't slip through to GitHub API calls.
alter table public.projects
  drop constraint if exists projects_github_repo_shape;
alter table public.projects
  add constraint projects_github_repo_shape
    check (
      github_repo is null
      or github_repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'
    );

comment on column public.projects.github_repo is
  'owner/repo binding for the dashboard "Send to GitHub issue" flow. Populated by `rove sync` from rove.config.ts → github.repo.';
