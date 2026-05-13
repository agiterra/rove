/**
 * Daemon main loop.
 *
 * Named-workers plan step 2: the daemon advertises an explicit
 * (name, kind, capabilities) tuple via the `--as` / `--kind` / `--claims`
 * flags. Capability eligibility is now active — laptops without the
 * `webhook` capability cannot claim webhook-triggered jobs, which routes
 * those to dedicated team walkers without requiring priority semantics.
 *
 * Result-write paths (`markRunning` / `markCompleted` / `markFailed`)
 * include the ownership predicate so a daemon whose claim was recovered
 * mid-execution cannot overwrite the new claimer's progress.
 *
 * Concurrency cap = 1.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchJob } from "./dispatch.js";
import {
  claimNextJob,
  listClaimableIds,
  tryClaimJob,
  type AgentJobRow,
} from "./claim.js";
import {
  registerWorker,
  startHeartbeat,
  type WorkerKind,
} from "./heartbeat.js";
import { resolveDaemonIdentity, type DaemonIdentity } from "./identity.js";
import type { WorkerCapability } from "../commands/daemon.js";

export interface DaemonOptions {
  projectId: string;
  claimMode?: "all" | "requested-only";
  workerName?: string;
  workerKind?: WorkerKind;
  capabilities?: WorkerCapability[];
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

  const worker = await registerWorker(supabase, identity, opts.projectId, {
    name: opts.workerName,
    kind: opts.workerKind,
    capabilities: opts.capabilities,
  });
  console.log(
    `[daemon] worker "${worker.workerName}" id=${worker.workerId.slice(0, 8)} kind=${worker.kind} claims=${worker.capabilities.join(",")}`,
  );

  const heartbeat = startHeartbeat(supabase, worker.workerId);

  let busy = false;

  const drainAll = async () => {
    if (busy) return;
    busy = true;
    try {
      while (true) {
        const job = await claimNextJob(supabase, worker.workerId);
        if (!job) break;
        await dispatchJob(supabase, job, worker.workerId);
      }
    } finally {
      busy = false;
    }
  };

  const tryDispatchLegacy = async (jobId: string) => {
    if (busy) return;
    busy = true;
    try {
      const claimed = await tryClaimJob(supabase, identity, jobId);
      if (!claimed) return;
      await dispatchJob(supabase, claimed, worker.workerId);
    } finally {
      busy = false;
    }
  };

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
