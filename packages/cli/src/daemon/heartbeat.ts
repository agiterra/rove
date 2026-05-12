/**
 * Periodic UPSERT into daemon_heartbeats so the dashboard can show
 * "Brian's Mac · last seen 12s ago".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DaemonIdentity } from "./identity.js";

const HEARTBEAT_INTERVAL_MS = 30_000;
const VERSION = "0.0.0-alpha.1";

export interface HeartbeatHandle {
  stop: () => void;
}

export function startHeartbeat(
  supabase: SupabaseClient,
  identity: DaemonIdentity,
  projectId: string,
): HeartbeatHandle {
  const beat = async () => {
    const { error } = await supabase.from("daemon_heartbeats").upsert(
      {
        user_id: identity.userId,
        project_id: projectId,
        daemon_name: identity.daemonName,
        hostname: identity.hostname,
        version: VERSION,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) {
      console.error(`[heartbeat] ${error.message}`);
    }
  };

  void beat();
  const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
  return { stop: () => clearInterval(timer) };
}
