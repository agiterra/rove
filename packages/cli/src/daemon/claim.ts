/**
 * Atomic claim + status writes for agent_jobs rows.
 *
 * Named-workers plan step 1: the primary claim path is `claimNextJob`,
 * which calls the `claim_next_job(p_worker_id)` Postgres function. That
 * function does `SELECT ... FOR UPDATE SKIP LOCKED` so no two daemons can
 * claim the same job regardless of how many call concurrently.
 *
 * The legacy `tryClaimJob` is kept for the `requested-only` claim mode,
 * which `claim_next_job` does not yet support (it filters
 * `assigned_to is null OR = me`; requested-only needs the stricter
 * `assigned_to = me`). Step 2 unifies the modes by extending the function.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DaemonIdentity } from "./identity.js";

export interface AgentJobRow {
  id: string;
  kind: "generate_flow" | "generate_persona" | "walk";
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  status: "pending" | "claimed" | "running" | "completed" | "failed" | "cancelled";
  requested_by: string | null;
  assigned_to: string | null;
  claimed_by: string | null;
  claimed_by_worker_id: string | null;
  priority: number;
  notes: string | null;
  project_id?: string;
}

export async function claimNextJob(
  supabase: SupabaseClient,
  workerId: string,
): Promise<AgentJobRow | null> {
  // The DB function is declared `returns setof agent_jobs` (limit 1) so
  // PostgREST gives back either `[]` or `[{row}]`. A scalar composite
  // return would marshal "no row" as `{id: null, ...}`, indistinguishable
  // from a real row.
  const { data, error } = await supabase.rpc("claim_next_job", {
    p_worker_id: workerId,
  });
  if (error) throw new Error(`claim_next_job: ${error.message}`);
  const rows = (data as AgentJobRow[] | null) ?? [];
  return rows[0] ?? null;
}

export async function tryClaimJob(
  supabase: SupabaseClient,
  identity: DaemonIdentity,
  jobId: string,
): Promise<AgentJobRow | null> {
  const { data, error } = await supabase
    .from("agent_jobs")
    .update({
      status: "claimed",
      claimed_by: identity.userId,
      claimed_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (error) throw new Error(`claim ${jobId}: ${error.message}`);
  return (data as AgentJobRow | null) ?? null;
}

/**
 * Status-mutating UPDATEs use the ownership predicate
 * `(claimed_by_worker_id = :self AND status = :expected_prior)`. If 0 rows
 * are affected, the claim was recovered during execution — we log and
 * return `false` so the caller can discard the result rather than overwrite
 * the new claimer's progress. The recovery sweep (step 3) is the only
 * status-mutating writer permitted to bypass this predicate.
 */
export async function markRunning(
  supabase: SupabaseClient,
  jobId: string,
  workerId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("agent_jobs")
    .update({ status: "running" })
    .eq("id", jobId)
    .eq("claimed_by_worker_id", workerId)
    .eq("status", "claimed")
    .select("id");
  if (error) throw new Error(`mark running ${jobId}: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function markCompleted(
  supabase: SupabaseClient,
  jobId: string,
  result: Record<string, unknown>,
  workerId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("agent_jobs")
    .update({
      status: "completed",
      result,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("claimed_by_worker_id", workerId)
    .eq("status", "running")
    .select("id");
  if (error) throw new Error(`mark completed ${jobId}: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function markFailed(
  supabase: SupabaseClient,
  jobId: string,
  message: string,
  workerId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("agent_jobs")
    .update({
      status: "failed",
      error: message,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("claimed_by_worker_id", workerId)
    .eq("status", "running")
    .select("id");
  if (error) {
    console.error(`mark failed ${jobId}: ${error.message}`);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * On startup, scan for any pending rows the daemon could claim now (so we
 * don't only react to live INSERT events). Returns the ids only — the main
 * loop calls tryClaimJob individually so the race semantics stay identical.
 *
 * Used only by the legacy `requested-only` claim path. The "all" mode
 * drain goes through `claimNextJob` in a loop.
 */
export async function listClaimableIds(
  supabase: SupabaseClient,
  identity: DaemonIdentity,
  claimMode: "all" | "requested-only",
  projectId: string,
): Promise<string[]> {
  let query = supabase
    .from("agent_jobs")
    .select("id")
    .eq("status", "pending")
    .eq("project_id", projectId)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(20);
  if (claimMode === "requested-only") {
    query = query.eq("assigned_to", identity.userId);
  } else {
    query = query.or(`assigned_to.is.null,assigned_to.eq.${identity.userId}`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`scan pending: ${error.message}`);
  return (data ?? []).map((r) => r.id as string);
}
