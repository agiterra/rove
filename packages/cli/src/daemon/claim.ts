/**
 * Atomic claim + completion writes for agent_jobs rows.
 *
 * Race semantics: the conditional UPDATE with WHERE status='pending' is
 * atomic in Postgres — multiple daemons can fire `claimJob` for the same
 * id, only one gets the row back. Losers see no rows returned and skip.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DaemonIdentity } from "./identity.js";

export interface AgentJobRow {
  id: string;
  kind: "generate_flow" | "generate_persona" | "walk";
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  status:
    | "pending"
    | "claimed"
    | "running"
    | "completed"
    | "failed"
    | "cancelled";
  requested_by: string | null;
  assigned_to: string | null;
  claimed_by: string | null;
  priority: number;
  notes: string | null;
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

export async function markRunning(
  supabase: SupabaseClient,
  jobId: string,
): Promise<void> {
  const { error } = await supabase
    .from("agent_jobs")
    .update({ status: "running" })
    .eq("id", jobId);
  if (error) throw new Error(`mark running ${jobId}: ${error.message}`);
}

export async function markCompleted(
  supabase: SupabaseClient,
  jobId: string,
  result: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from("agent_jobs")
    .update({
      status: "completed",
      result,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (error) throw new Error(`mark completed ${jobId}: ${error.message}`);
}

export async function markFailed(
  supabase: SupabaseClient,
  jobId: string,
  message: string,
): Promise<void> {
  const { error } = await supabase
    .from("agent_jobs")
    .update({
      status: "failed",
      error: message,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (error) console.error(`mark failed ${jobId}: ${error.message}`);
}

/**
 * On startup, scan for any pending rows the daemon could claim now (so we
 * don't only react to live INSERT events). Returns the ids only — the main
 * loop calls tryClaimJob individually so the race semantics stay identical.
 */
export async function listClaimableIds(
  supabase: SupabaseClient,
  identity: DaemonIdentity,
  claimMode: "all" | "requested-only",
): Promise<string[]> {
  let query = supabase
    .from("agent_jobs")
    .select("id")
    .eq("status", "pending")
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
