/**
 * Resolve the worker status pill for a run-detail page.
 *
 * Hop chain:
 *   runs.id  →  agent_jobs WHERE result->>'run_id' = runId  →  claimed_by_worker_id
 *            →  workers.last_heartbeat_at + stopped_at + disabled_at
 *
 * No `runs.agent_job_id` column today; the walk handler stores `{ run_id }`
 * in `agent_jobs.result` and we join through that. Returns `"unknown"`
 * when no matching job exists (manual `rove run` from a local CLI, etc.).
 *
 * `online` requires a heartbeat within the last 90s AND no shutdown /
 * disable markers — matches the dashboard's Workers page heuristic.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type WorkerStatus = "online" | "offline" | "unknown";

const ONLINE_WINDOW_MS = 90_000;

export async function resolveRunWorkerStatus(
  supabase: SupabaseClient,
  runId: string,
  projectId: string,
): Promise<WorkerStatus> {
  // Daemons may file multiple jobs against the same run id over its lifetime
  // (rare), so order by claimed_at desc and take the most recent.
  const { data: jobs, error: jobsErr } = await supabase
    .from("agent_jobs")
    .select("claimed_by_worker_id, claimed_at")
    .eq("project_id", projectId)
    .eq("kind", "walk")
    .filter("result->>run_id", "eq", runId)
    .order("claimed_at", { ascending: false })
    .limit(1);
  if (jobsErr || !jobs || jobs.length === 0) return "unknown";
  const workerId = jobs[0].claimed_by_worker_id as string | null;
  if (!workerId) return "unknown";

  const { data: worker, error: workerErr } = await supabase
    .from("workers")
    .select("last_heartbeat_at, stopped_at, disabled_at")
    .eq("id", workerId)
    .maybeSingle();
  if (workerErr || !worker) return "unknown";

  if (worker.stopped_at || worker.disabled_at) return "offline";
  if (!worker.last_heartbeat_at) return "offline";
  const heartbeatMs = new Date(worker.last_heartbeat_at as string).getTime();
  return Date.now() - heartbeatMs <= ONLINE_WINDOW_MS ? "online" : "offline";
}
