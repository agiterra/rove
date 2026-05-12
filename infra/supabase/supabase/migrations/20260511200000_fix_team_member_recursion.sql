-- Fix: is_team_member() recursed through the team_members RLS policy that
-- itself called is_team_member(), exhausting Postgres' stack and surfacing
-- as `stack depth limit exceeded` whenever an RLS-bound query touched the
-- table. First reproduced from the dashboard's requireTeamMember() guard.
--
-- The function should bypass RLS when it runs (it's the gatekeeper, not a
-- consumer). SECURITY DEFINER + a pinned search_path is the standard
-- Supabase pattern.

create or replace function public.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.removed_at is null
      and tm.supabase_user_id = auth.uid()
  );
$$;
