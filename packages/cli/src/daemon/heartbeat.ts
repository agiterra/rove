/**
 * Worker registration + fixed-interval heartbeat.
 *
 * Named-workers plan step 1: replaces the legacy `daemon_heartbeats` upsert.
 * Step 2: registration accepts explicit name / kind / capability set so a
 * dedicated team walker can register with {manual, webhook} instead of the
 * laptop default.
 * Step 3 (worker-tokens): heartbeat + markWorkerStopped branch on auth mode.
 * In worker-token mode both go through SECURITY DEFINER RPCs instead of
 * direct UPDATEs (which the authenticated role is not granted).
 *
 * Heartbeat runs on a fixed 15s timer for the daemon's entire lifetime —
 * concurrently with dispatcher subprocesses. Walks routinely exceed the
 * 90s recovery threshold; an idle-only heartbeat would cause healthy
 * in-flight walks to be recovered out from under their daemon.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DaemonIdentity } from "./identity.js";
import type { WorkerCapability } from "../commands/daemon.js";
import type { AuthMode } from "../supabase/client.js";
import { handleWorkerTokenRejection } from "./worker-error.js";

const HEARTBEAT_INTERVAL_MS = 15_000;

export interface HeartbeatHandle {
  stop: () => void;
}

export type WorkerKind = "laptop" | "dedicated";

export interface RegisterWorkerOpts {
  name?: string;
  kind?: WorkerKind;
  capabilities?: WorkerCapability[];
}

function defaultCapabilities(kind: WorkerKind): WorkerCapability[] {
  // Laptop daemons explicitly do NOT advertise `webhook` — that is what
  // routes webhook-triggered work to the dedicated team walker even when
  // laptops are also online. Capabilities + claim_next_job's eligibility
  // filter do the routing; there is no priority sort.
  return kind === "dedicated" ? ["manual", "webhook"] : ["manual", "localhost"];
}

export interface RegisteredWorker {
  workerId: string;
  workerName: string;
  kind: WorkerKind;
  capabilities: WorkerCapability[];
}

export async function registerWorker(
  supabase: SupabaseClient,
  identity: DaemonIdentity,
  projectId: string,
  opts: RegisterWorkerOpts = {},
): Promise<RegisteredWorker> {
  const name = opts.name ?? identity.daemonName;
  const kind: WorkerKind = opts.kind ?? "laptop";
  const capabilities = opts.capabilities ?? defaultCapabilities(kind);

  const capabilitiesJson: Record<string, boolean> = {};
  for (const c of capabilities) capabilitiesJson[c] = true;

  const { data, error } = await supabase
    .from("workers")
    .upsert(
      {
        project_id: projectId,
        name,
        kind,
        github_handle: identity.githubHandle,
        capabilities: capabilitiesJson,
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
      `worker "${name}" is administratively disabled. Re-enable it before starting the daemon.`,
    );
  }

  return { workerId: data.id as string, workerName: name, kind, capabilities };
}

/**
 * Stamp the worker row as cleanly stopped. In worker-token mode uses the
 * worker_mark_stopped RPC; in service-role mode uses a direct UPDATE.
 */
export async function markWorkerStopped(
  supabase: SupabaseClient,
  workerId: string,
  auth: AuthMode,
): Promise<void> {
  if (auth.mode === "worker") {
    const { error } = await supabase.rpc("worker_mark_stopped");
    if (error) {
      handleWorkerTokenRejection(error);
      console.error(`[shutdown] mark worker stopped (rpc): ${error.message}`);
    }
    return;
  }
  const { error } = await supabase
    .from("workers")
    .update({ stopped_at: new Date().toISOString() })
    .eq("id", workerId);
  if (error) {
    console.error(`[shutdown] mark worker stopped: ${error.message}`);
  }
}

/**
 * Start the periodic heartbeat timer. In worker-token mode uses the
 * worker_heartbeat RPC; in service-role mode uses a direct UPDATE.
 */
export function startHeartbeat(
  supabase: SupabaseClient,
  workerId: string,
  auth: AuthMode,
): HeartbeatHandle {
  const beat = async () => {
    if (auth.mode === "worker") {
      const { error } = await supabase.rpc("worker_heartbeat");
      if (error) {
        handleWorkerTokenRejection(error);
        console.error(`[heartbeat] ${error.message}`);
      }
      return;
    }
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
