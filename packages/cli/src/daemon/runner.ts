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
 * Step 3 (worker-tokens): startup splits on auth mode.
 *   - Service-role mode: existing path (team_members lookup → worker upsert).
 *   - Worker-token mode: decode JWT claims, skip identity resolution and
 *     worker upsert (dashboard mint already created the row), call
 *     worker_heartbeat() as a startup probe, then enter the claim loop.
 *   All status writes branch on auth mode through to SECURITY DEFINER RPCs.
 *
 * Concurrency cap = 1.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthMode } from "../supabase/client.js";
import { dispatchJob } from "./dispatch.js";
import {
  claimNextJob,
  listClaimableIds,
  recoverStaleClaims,
  releaseInFlightClaims,
  tryClaimJob,
  type AgentJobRow,
} from "./claim.js";
import {
  markWorkerStopped,
  registerWorker,
  startHeartbeat,
  type WorkerKind,
} from "./heartbeat.js";
import { resolveDaemonIdentity, type DaemonIdentity } from "./identity.js";
import { handleWorkerTokenRejection } from "./worker-error.js";
import type { WorkerCapability } from "../commands/daemon.js";

export interface DaemonOptions {
  projectId: string;
  claimMode?: "all" | "requested-only";
  workerName?: string;
  workerKind?: WorkerKind;
  capabilities?: WorkerCapability[];
}

interface WorkerClaims {
  workerId: string;
  projectId: string;
  workerName: string;
  githubHandle: string | null;
}

function decodeWorkerToken(token: string): WorkerClaims {
  const [, payload] = token.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  return {
    workerId: claims.worker_id as string,
    projectId: claims.project_id as string,
    workerName: claims.worker_name as string,
    githubHandle: (claims.github_handle as string | undefined) ?? null,
  };
}

export async function startDaemon(
  supabase: SupabaseClient,
  auth: AuthMode,
  opts: DaemonOptions,
): Promise<void> {
  const claimMode =
    opts.claimMode ??
    ((process.env.ROVE_DAEMON_CLAIM_MODE === "requested-only" ||
    (process.env.ROVE_DAEMON_CLAIM_MODE ?? process.env.EVAL_DAEMON_CLAIM_MODE) === "requested-only"
      ? "requested-only"
      : "all") as "all" | "requested-only");

  let workerId: string;
  let workerName: string;
  let capabilities: WorkerCapability[];
  let workerKind: WorkerKind;
  // identity is only used by the service-role legacy path
  let identity: DaemonIdentity | null = null;

  if (auth.mode === "worker") {
    const claims = decodeWorkerToken(auth.token);

    // JWT project_id is canonical in worker mode — mismatch with --project-id is fatal.
    if (claims.projectId !== opts.projectId) {
      throw new Error(
        `JWT project_id '${claims.projectId}' does not match --project-id '${opts.projectId}'. ` +
          "The JWT's project_id is canonical in worker-token mode. " +
          "Remove --project-id or mint a token for the correct project.",
      );
    }

    workerId = claims.workerId;
    workerName = opts.workerName ?? claims.workerName;
    workerKind = opts.workerKind ?? "laptop";
    capabilities = opts.capabilities ?? (workerKind === "dedicated" ? ["manual", "webhook"] : ["manual", "localhost"]);

    // Startup probe: proves the token is valid. A revoked token raises 42501
    // here, handleWorkerTokenRejection prints the friendly message and exits.
    const { error: hbErr } = await supabase.rpc("worker_heartbeat");
    if (hbErr) {
      handleWorkerTokenRejection(hbErr);
      throw new Error(`worker_heartbeat startup probe: ${hbErr.message}`);
    }

    console.log(
      `[daemon] up in worker-token mode — worker=${workerId.slice(0, 8)} name="${workerName}" project=${claims.projectId} mode=${claimMode}`,
    );
    console.log(
      `[daemon] worker "${workerName}" id=${workerId.slice(0, 8)} kind=${workerKind} claims=${capabilities.join(",")}`,
    );
  } else {
    // Service-role mode: existing startup path.
    identity = await resolveDaemonIdentity(supabase);
    console.log(
      `[daemon] up as ${identity.daemonName} (user=${identity.userId.slice(0, 8)} mode=${claimMode} project=${opts.projectId})`,
    );

    const worker = await registerWorker(supabase, identity, opts.projectId, {
      name: opts.workerName,
      kind: opts.workerKind,
      capabilities: opts.capabilities,
    });
    workerId = worker.workerId;
    workerName = worker.workerName;
    workerKind = worker.kind;
    capabilities = worker.capabilities;

    console.log(
      `[daemon] worker "${workerName}" id=${workerId.slice(0, 8)} kind=${workerKind} claims=${capabilities.join(",")}`,
    );
  }

  const heartbeat = startHeartbeat(supabase, workerId, auth);

  // Every daemon runs the recovery sweep on a 30s cadence. The first one
  // to grab eligible rows wins; subsequent sweeps are no-ops.
  const recoveryTimer = setInterval(() => {
    void recoverStaleClaims(supabase, opts.projectId).then((n) => {
      if (n > 0) console.log(`[recovery] released ${n} stale claim(s)`);
    });
  }, 30_000);

  let busy = false;

  const drainAll = async () => {
    if (busy) return;
    busy = true;
    try {
      while (true) {
        const job = await claimNextJob(supabase, workerId);
        if (!job) break;
        await dispatchJob(supabase, job, workerId, auth);
      }
    } finally {
      busy = false;
    }
  };

  const tryDispatchLegacy = async (jobId: string) => {
    if (busy) return;
    busy = true;
    try {
      // tryClaimJob uses identity; only reachable in service-role mode.
      if (!identity) return;
      const claimed = await tryClaimJob(supabase, identity, jobId);
      if (!claimed) return;
      await dispatchJob(supabase, claimed, workerId, auth);
    } finally {
      busy = false;
    }
  };

  if (claimMode === "all") {
    await drainAll();
  } else {
    // requested-only uses identity (service-role only)
    if (identity) {
      const pending = await listClaimableIds(supabase, identity, claimMode, opts.projectId);
      for (const id of pending) {
        await tryDispatchLegacy(id);
      }
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
          if (identity && row.assigned_to && row.assigned_to !== identity.userId) return;
          void drainAll();
        } else {
          if (!identity || row.assigned_to !== identity.userId) return;
          void tryDispatchLegacy(row.id);
        }
      },
    )
    .subscribe((status) => {
      console.log(`[daemon] realtime ${status}`);
    });

  await new Promise<void>((resolve) => {
    let shuttingDown = false;
    const shutdown = async (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`[daemon] ${signal} received — shutting down`);
      heartbeat.stop();
      clearInterval(recoveryTimer);
      // Release any in-flight claims back to pending so peer daemons can
      // pick them up immediately, then stamp the worker as cleanly stopped
      // so the UI shows "offline" without waiting 90s for recovery.
      try {
        await releaseInFlightClaims(supabase, opts.projectId, workerId, auth);
        await markWorkerStopped(supabase, workerId, auth);
      } catch (err) {
        console.error(`[shutdown] ${(err as Error).message}`);
      }
      await channel.unsubscribe();
      resolve();
    };
    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
  });
}

export type { DaemonIdentity };
