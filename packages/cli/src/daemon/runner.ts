/**
 * Daemon main loop.
 *
 * Named-workers plan step 1: on startup the daemon registers a `workers`
 * row and uses `claim_next_job` (via `claimNextJob`) as the primary claim
 * path. The legacy `tryClaimJob` path is retained only for the
 * `requested-only` claim mode, which the v5 `claim_next_job` filter does
 * not yet support strictly. Step 2 unifies the two paths.
 *
 * Concurrency cap = 1 — generation is fast enough that we don't need to
 * parallelize, and serializing keeps logs readable.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchJob } from "./dispatch.js";
import {
  claimNextJob,
  listClaimableIds,
  tryClaimJob,
  type AgentJobRow,
} from "./claim.js";
import { registerWorker, startHeartbeat } from "./heartbeat.js";
import { resolveDaemonIdentity, type DaemonIdentity } from "./identity.js";

export interface DaemonOptions {
  projectId: string;
  claimMode?: "all" | "requested-only";
}

export async function startDaemon(supabase: SupabaseClient, opts: DaemonOptions): Promise<void> {
  const claimMode =
    opts.claimMode ??
    ((process.env.ROVE_DAEMON_CLAIM_MODE === "requested-only" ||
    (process.env.ROVE_DAEMON_CLAIM_MODE ?? process.env.EVAL_DAEMON_CLAIM_MODE) === "requested-only"
      ? "requested-only"
      : "all") as "all" | "requested-only");

  const identity = await resolveDaemonIdentity(supabase);
  console.log(
    `[daemon] up as ${identity.daemonName} (user=${identity.userId.slice(0, 8)} mode=${claimMode} project=${opts.projectId})`,
  );

  const workerId = await registerWorker(supabase, identity, opts.projectId);
  console.log(`[daemon] worker id=${workerId.slice(0, 8)}`);

  const heartbeat = startHeartbeat(supabase, workerId);

  let busy = false;

  // "all" mode: drain via claim_next_job in a loop.
  const drainAll = async () => {
    if (busy) return;
    busy = true;
    try {
      while (true) {
        const job = await claimNextJob(supabase, workerId);
        if (!job) break;
        await dispatchJob(supabase, job);
      }
    } finally {
      busy = false;
    }
  };

  // "requested-only" mode: legacy list-then-try path until step 2 unifies.
  const tryDispatchLegacy = async (jobId: string) => {
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
  if (claimMode === "all") {
    await drainAll();
  } else {
    const pending = await listClaimableIds(supabase, identity, claimMode, opts.projectId);
    for (const id of pending) {
      await tryDispatchLegacy(id);
    }
  }

  const channel = supabase
    .channel("agent_jobs_inserts")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "agent_jobs" },
      (payload) => {
        const row = payload.new as AgentJobRow & { project_id?: string };
        if (row.status !== "pending") return;
        if (row.project_id && row.project_id !== opts.projectId) return;

        if (claimMode === "all") {
          // Cheap optimization: skip the RPC round-trip if this row is
          // assigned to someone else. claim_next_job would correctly
          // filter it out anyway, but draining unnecessarily on every
          // unrelated INSERT wastes time.
          if (row.assigned_to && row.assigned_to !== identity.userId) return;
          void drainAll();
        } else {
          if (row.assigned_to !== identity.userId) return;
          void tryDispatchLegacy(row.id);
        }
      },
    )
    .subscribe((status) => {
      console.log(`[daemon] realtime ${status}`);
    });

  // Stay alive until SIGTERM/SIGINT. Step 3 adds graceful-shutdown release
  // of in-flight claims; for now we rely on the (still-to-come) recovery
  // sweep.
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

export type { DaemonIdentity };
