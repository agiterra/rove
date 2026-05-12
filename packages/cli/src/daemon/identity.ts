/**
 * Resolves the daemon operator's Supabase user_id by looking up their
 * github_handle in the team_members table. We need the user_id for the
 * heartbeat row PK and for `claimed_by`.
 *
 * Phase 11a uses the service-role key for all writes, so this lookup is
 * just bookkeeping. Phase 11 proper swaps in per-device JWTs.
 */
import { hostname } from "node:os";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface DaemonIdentity {
  userId: string;
  githubHandle: string;
  daemonName: string;
  hostname: string;
}

export async function resolveDaemonIdentity(
  supabase: SupabaseClient,
): Promise<DaemonIdentity> {
  const githubHandle = process.env.EVAL_DAEMON_GITHUB_HANDLE;
  if (!githubHandle) {
    throw new Error(
      "EVAL_DAEMON_GITHUB_HANDLE is required. Set it to your GitHub handle so the daemon knows which team_members row to use.",
    );
  }

  const { data, error } = await supabase
    .from("team_members")
    .select("supabase_user_id")
    .ilike("github_handle", githubHandle)
    .is("removed_at", null)
    .maybeSingle();

  if (error) throw new Error(`team_members lookup failed: ${error.message}`);
  if (!data?.supabase_user_id) {
    throw new Error(
      `No team_members row found for github_handle=${githubHandle} with a bound supabase_user_id. Sign in to the dashboard once so the bind trigger fires, then retry.`,
    );
  }

  return {
    userId: data.supabase_user_id,
    githubHandle,
    daemonName: process.env.EVAL_DAEMON_NAME ?? `${githubHandle}-${hostname()}`,
    hostname: hostname(),
  };
}
