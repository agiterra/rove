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
 *
 * Step 3 (worker-tokens): markRunning/markCompleted/markFailed/
 * releaseInFlightClaims branch on auth mode. In worker-token mode they
 * call SECURITY DEFINER RPCs; in service-role mode they use direct UPDATEs.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DaemonIdentity } from "./identity.js";
import type { AuthMode } from "../supabase/client.js";
import { handleWorkerTokenRejection } from "./worker-error.js";

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
  if (error) {
    handleWorkerTokenRejection(error);
    throw new Error(`claim_next_job: ${error.message}`);
  }
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
 *
 * In worker-token mode the RPC enforces the same predicate server-side and
 * returns a boolean; false means the predicate filtered out the write.
 */
export async function markRunning(
  supabase: SupabaseClient,
  jobId: string,
  workerId: string,
  auth: AuthMode,
): Promise<boolean> {
  if (auth.mode === "worker") {
    const { data, error } = await supabase.rpc("job_mark_running", {
      p_job_id: jobId,
    });
    if (error) {
      handleWorkerTokenRejection(error);
      throw new Error(`mark running ${jobId}: ${error.message}`);
    }
    return (data as boolean) ?? false;
  }
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
  auth: AuthMode,
): Promise<boolean> {
  if (auth.mode === "worker") {
    const { data, error } = await supabase.rpc("job_mark_completed", {
      p_job_id: jobId,
      p_result: result,
    });
    if (error) {
      handleWorkerTokenRejection(error);
      throw new Error(`mark completed ${jobId}: ${error.message}`);
    }
    return (data as boolean) ?? false;
  }
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
  auth: AuthMode,
): Promise<boolean> {
  if (auth.mode === "worker") {
    const { data, error } = await supabase.rpc("job_mark_failed", {
      p_job_id: jobId,
      p_error: message,
    });
    if (error) {
      handleWorkerTokenRejection(error);
      console.error(`mark failed ${jobId} (rpc): ${error.message}`);
      return false;
    }
    return (data as boolean) ?? false;
  }
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
 * Recovery sweep — releases jobs whose claiming worker has stopped
 * heartbeating. Called every 30s from every daemon's loop; the first one
 * to grab eligible rows wins. Returns the count for logging.
 */
export async function recoverStaleClaims(
  supabase: SupabaseClient,
  projectId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("recover_stale_claims", {
    p_project_id: projectId,
  });
  if (error) {
    handleWorkerTokenRejection(error);
    console.error(`[recovery] ${error.message}`);
    return 0;
  }
  return (data as number) ?? 0;
}

/**
 * Stuck-walk timeout — flips `runs` rows from `running` to `failed` when
 * no new `run_steps` row has arrived for `idleMinutes`. The job-side
 * watchdog is `recover_stale_claims`; this is its run-side counterpart.
 *
 * Without this, a hung agent (or a dispatcher subprocess that crashed
 * after marking the run row `running` and before its sink could write a
 * terminal state) leaves the run stuck on the dashboard indefinitely. The
 * RPC is SECURITY DEFINER so worker-token-mode daemons can drive it too.
 */
export async function sweepStuckRuns(
  supabase: SupabaseClient,
  projectId: string,
  idleMinutes: number,
): Promise<number> {
  const { data, error } = await supabase.rpc("sweep_stuck_runs", {
    p_project_id: projectId,
    p_idle_minutes: idleMinutes,
  });
  if (error) {
    handleWorkerTokenRejection(error);
    console.error(`[recovery] sweep_stuck_runs: ${error.message}`);
    return 0;
  }
  return (data as number) ?? 0;
}

/**
 * Graceful shutdown helper — release every job this worker still holds
 * back to `pending` so peer daemons can pick them up immediately.
 *
 * In worker-token mode uses the worker_release_my_claims RPC.
 * In service-role mode uses a direct UPDATE (project-scoped).
 */
export async function releaseInFlightClaims(
  supabase: SupabaseClient,
  projectId: string,
  workerId: string,
  auth: AuthMode,
): Promise<void> {
  if (auth.mode === "worker") {
    const { data, error } = await supabase.rpc("worker_release_my_claims");
    if (error) {
      handleWorkerTokenRejection(error);
      console.error(`[shutdown] release claims (rpc): ${error.message}`);
      return;
    }
    const n = (data as number) ?? 0;
    if (n > 0) console.log(`[shutdown] released ${n} in-flight claim(s)`);
    return;
  }
  const { error } = await supabase
    .from("agent_jobs")
    .update({
      status: "pending",
      claimed_by_worker_id: null,
      claimed_by: null,
      claimed_at: null,
    })
    .eq("project_id", projectId)
    .eq("claimed_by_worker_id", workerId)
    .in("status", ["claimed", "running"]);
  if (error) {
    console.error(`[shutdown] release claims: ${error.message}`);
  }
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
