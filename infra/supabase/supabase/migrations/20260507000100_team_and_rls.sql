-- TankLoop Eval — team allowlist, RLS, Storage bucket.
--
-- Auth model:
--   - GitHub OAuth via Supabase Auth (configured in dashboard).
--   - A user is "on the team" iff their github_handle appears in team_members
--     OR their supabase user id appears in team_members.supabase_user_id.
--   - Phase 7 writes happen from the CLI with the service-role key, which
--     bypasses RLS. These policies guard reads (everyone on the team can read
--     everything) and dashboard-initiated writes (you can only update findings
--     you didn't create if you're the original initiator).

-- ── team_members ─────────────────────────────────────────────────────────────

create table public.team_members (
  id                  uuid primary key default gen_random_uuid(),
  github_handle       text not null unique,
  supabase_user_id    uuid unique references auth.users(id) on delete set null,
  display_name        text,
  added_at            timestamptz not null default now(),
  removed_at          timestamptz
);

-- Seed the initial team. Backfill supabase_user_id on first sign-in via a
-- trigger (added below). Replace these handles via update; do not delete rows
-- (mark removed_at instead) so historical run rows still have a name to show.
insert into public.team_members (github_handle, display_name) values
  ('WrangleMeThis', 'Brian'),
  ('andy-tankloop',  'Andy'),
  ('tankloop-dev-3', 'TBD')
on conflict (github_handle) do nothing;

create or replace function public.is_team_member()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.removed_at is null
      and tm.supabase_user_id = auth.uid()
  );
$$;

-- On sign-in, if the github_handle in user_metadata matches an existing
-- team_members row, bind the supabase user id. New team members are added by
-- inserting a row with the github_handle, then the user signs in.
create or replace function public.bind_team_member_to_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_handle text;
begin
  v_handle := coalesce(
    new.raw_user_meta_data->>'user_name',     -- GitHub provider sets this
    new.raw_user_meta_data->>'preferred_username',
    new.raw_user_meta_data->>'login'
  );
  if v_handle is null then
    return new;
  end if;
  update public.team_members
     set supabase_user_id = new.id
   where lower(github_handle) = lower(v_handle)
     and removed_at is null
     and (supabase_user_id is null or supabase_user_id = new.id);
  return new;
end;
$$;

create trigger team_members_bind_on_signup
  after insert on auth.users
  for each row execute function public.bind_team_member_to_auth_user();

-- ── RLS ──────────────────────────────────────────────────────────────────────
--
-- service_role bypasses RLS unconditionally; these policies only constrain
-- the anon and authenticated roles (i.e. the dashboard).

alter table public.personas             enable row level security;
alter table public.flows                enable row level security;
alter table public.runs                 enable row level security;
alter table public.findings             enable row level security;
alter table public.finding_screenshots  enable row level security;
alter table public.team_members         enable row level security;

-- Read policies: any team member can read everything.
create policy personas_read           on public.personas            for select using (public.is_team_member());
create policy flows_read              on public.flows               for select using (public.is_team_member());
create policy runs_read               on public.runs                for select using (public.is_team_member());
create policy findings_read           on public.findings            for select using (public.is_team_member());
create policy finding_screenshots_rd  on public.finding_screenshots for select using (public.is_team_member());
create policy team_members_read       on public.team_members        for select using (public.is_team_member());

-- Write policies (dashboard-initiated, Phase 9): team members can update
-- findings they initiated (i.e. they launched the run that produced them) to
-- mark them dismissed / fixed.
create policy findings_update_own on public.findings
  for update
  using (
    public.is_team_member()
    and exists (
      select 1 from public.runs r
      where r.id = findings.run_id
        and r.initiator = auth.uid()
    )
  )
  with check (
    public.is_team_member()
    and exists (
      select 1 from public.runs r
      where r.id = findings.run_id
        and r.initiator = auth.uid()
    )
  );

-- Personas, flows, runs, finding_screenshots, team_members have no
-- authenticated-role write policies — the only writers are the CLI
-- (service-role) and the bind trigger (security definer). Inserting/deleting
-- team members happens via SQL or Studio, deliberately.

-- ── Storage bucket: walks ────────────────────────────────────────────────────
--
-- Private bucket. CLI writes via service-role key; dashboard reads via signed
-- URLs (Phase 9). Keys are namespaced as `runs/<run_id>/...`.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('walks', 'walks', false, 10485760, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

create policy walks_read_team on storage.objects
  for select using (
    bucket_id = 'walks' and public.is_team_member()
  );
