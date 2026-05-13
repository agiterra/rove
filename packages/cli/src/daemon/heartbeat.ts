/**
 * Worker registration + fixed-interval heartbeat.
 *
 * Named-workers plan step 1: replaces the legacy `daemon_heartbeats` upsert.
 * Each daemon corresponds to one `workers` row keyed on (project_id, name).
 *
 * Heartbeat runs on a fixed 15s timer for the daemon's entire lifetime —
 * concurrently with dispatcher subprocesses. Walks routinely exceed the
 * 90s recovery threshold; an idle-only heartbeat would cause healthy
 * in-flight walks to be recovered out from under their daemon.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DaemonIdentity } from "./identity.js";

const HEARTBEAT_INTERVAL_MS = 15_000;

export interface HeartbeatHandle {
  stop: () => void;
}

/**
 * Upsert the worker row on daemon startup, return its UUID. Refuses to
 * start if the row exists with `disabled_at` set — an admin must clear it
 * (`rove workers enable <name>`, landing in step 5).
 *
 * Step 1 hard-codes laptop capabilities. Step 2 introduces the `--kind`
 * and `--claims` flags that let dedicated workers register with different
 * capability sets.
 */
export async function registerWorker(
  supabase: SupabaseClient,
  identity: DaemonIdentity,
  projectId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("workers")
    .upsert(
      {
        project_id: projectId,
        name: identity.daemonName,
        kind: "laptop",
        github_handle: identity.githubHandle,
        capabilities: { manual: true, localhost: true },
        last_heartbeat_at: new Date().toISOString(),
        stopped_at: null,
      },
      { onConflict: "project_id,name" },
    )
    .select("id, disabled_at")
    .single();

  if (error) throw new Error(`worker register: ${error.message}`);
  if (data.disabled_at !== null) {
    throw new Error(
      `worker "${identity.daemonName}" is administratively disabled. ` +
        `Re-enable it before starting the daemon.`,
    );
  }

  return data.id as string;
}

export function startHeartbeat(
  supabase: SupabaseClient,
  workerId: string,
): HeartbeatHandle {
  const beat = async () => {
    const { error } = await supabase
      .from("workers")
      .update({ last_heartbeat_at: new Date().toISOString() })
      .eq("id", workerId);
    if (error) {
      console.error(`[heartbeat] ${error.message}`);
    }
  };

  void beat();
  const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
  return { stop: () => clearInterval(timer) };
}
