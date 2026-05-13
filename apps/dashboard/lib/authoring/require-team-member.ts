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
    // Resolve the real supabase_user_id from team_members so inserts that carry
    // a user_id FK (e.g. install_codes → auth.users) receive a valid UUID that
    // actually exists in the DB. If the lookup fails (e.g. no Supabase connection),
    // fall back gracefully — callers that don't insert into FK-constrained tables
    // will still work.
    const { createServiceRoleSupabase } = await import("../supabase/server");
    const bypassHandle = process.env["ROVE_DAEMON_GITHUB_HANDLE"] ?? null;
    const svc = createServiceRoleSupabase();
    const { data: member } = bypassHandle
      ? await svc
          .from("team_members")
          .select("supabase_user_id, github_handle, display_name")
          .eq("github_handle", bypassHandle)
          .is("removed_at", null)
          .maybeSingle()
      : { data: null };
    if (member?.supabase_user_id) {
      return {
        userId: member.supabase_user_id as string,
        githubHandle: (member.github_handle as string | null) ?? bypassHandle,
        displayName: (member.display_name as string | null) ?? bypassHandle,
      };
    }
    // No matching team member — return a sentinel. Any insert that FKs auth.users
    // will fail; that's acceptable since this path is dev-only.
    return { userId: "00000000-0000-0000-0000-000000000000", githubHandle: bypassHandle, displayName: "DEV_BYPASS_AUTH" };
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
