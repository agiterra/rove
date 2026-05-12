/**
 * Server-side guard for authoring server actions. Uses the team_members
 * RLS function (`public.is_team_member()` from migration 0002) by issuing
 * a request via the cookie-bound supabase client and checking the
 * resulting `team_members` row. If the caller isn't on the team, throws.
 */
import "server-only";
import { createServerSupabase } from "../supabase/server";
import { env } from "../env";

export interface TeamMemberContext {
  userId: string;
  githubHandle: string | null;
  displayName: string | null;
}

export async function requireTeamMember(): Promise<TeamMemberContext> {
  if (env.devBypassAuth() && !env.isProduction()) {
    return { userId: "dev-bypass", githubHandle: null, displayName: "DEV_BYPASS_AUTH" };
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Not signed in.");
  }

  const handle = (user.user_metadata?.user_name ??
    user.user_metadata?.preferred_username ??
    user.user_metadata?.login ??
    null) as string | null;

  // RLS-bounded SELECT — returns empty if the user isn't a team member.
  const { data, error } = await supabase
    .from("team_members")
    .select("github_handle, display_name")
    .eq("supabase_user_id", user.id)
    .is("removed_at", null)
    .maybeSingle();

  if (error) throw new Error(`Team membership check failed: ${error.message}`);
  if (!data) throw new Error("Not a team member.");

  return {
    userId: user.id,
    githubHandle: data.github_handle ?? handle,
    displayName: data.display_name ?? handle,
  };
}
