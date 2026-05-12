/**
 * Daemon main loop. Subscribes to agent_jobs INSERT events via Supabase
 * Realtime, also scans on startup to drain any rows that were inserted
 * while we were offline. Concurrency cap = 1 — generation is fast enough
 * that we don't need to parallelize, and serializing keeps logs readable.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchJob } from "./dispatch.js";
import { listClaimableIds, tryClaimJob, type AgentJobRow } from "./claim.js";
import { startHeartbeat } from "./heartbeat.js";
import { resolveDaemonIdentity, type DaemonIdentity } from "./identity.js";

export interface DaemonOptions {
  projectId: string;
  claimMode?: "all" | "requested-only";
}

export async function startDaemon(supabase: SupabaseClient, opts: DaemonOptions): Promise<void> {
  const claimMode =
    opts.claimMode ??
    ((process.env.ROVE_DAEMON_CLAIM_MODE === "requested-only" ||
    process.env.EVAL_DAEMON_CLAIM_MODE === "requested-only"
      ? "requested-only"
      : "all") as "all" | "requested-only");

  const identity = await resolveDaemonIdentity(supabase);
  console.log(
    `[daemon] up as ${identity.daemonName} (user=${identity.userId.slice(0, 8)} mode=${claimMode} project=${opts.projectId})`,
  );

  const heartbeat = startHeartbeat(supabase, identity, opts.projectId);

  let busy = false;
  const tryDispatch = async (jobId: string) => {
    if (busy) return;
    busy = true;
    try {
      const claimed = await tryClaimJob(supabase, identity, jobId);
      if (!claimed) return;
      await dispatchJob(supabase, claimed);
    } finally {
      busy = false;
    }
  };

  // Drain anything pending from before we started.
  const pending = await listClaimableIds(supabase, identity, claimMode, opts.projectId);
  for (const id of pending) {
    await tryDispatch(id);
  }

  // Subscribe to live INSERTs.
  const channel = supabase
    .channel("agent_jobs_inserts")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "agent_jobs" },
      (payload) => {
        const row = payload.new as AgentJobRow & { project_id?: string };
        if (row.status !== "pending") return;
        // Phase C-lite: only claim jobs in this daemon's project.
        if (row.project_id && row.project_id !== opts.projectId) return;
        if (claimMode === "requested-only" && row.assigned_to !== identity.userId) {
          return;
        }
        if (claimMode === "all" && row.assigned_to && row.assigned_to !== identity.userId) {
          return;
        }
        void tryDispatch(row.id);
      },
    )
    .subscribe((status) => {
      console.log(`[daemon] realtime ${status}`);
    });

  // Stay alive until SIGTERM/SIGINT.
  await new Promise<void>((resolve) => {
    const shutdown = (signal: string) => {
      console.log(`[daemon] ${signal} received — shutting down`);
      heartbeat.stop();
      void channel.unsubscribe().finally(resolve);
    };
    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
  });
}

// Re-export for callers that want their own typed identity.
export type { DaemonIdentity };
