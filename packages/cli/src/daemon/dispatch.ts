/**
 * Dispatches a claimed agent_jobs row to the appropriate handler.
 * Generation handlers shell out to the local Claude session; walk handler
 * shells out to the existing `rove run` pipeline.
 *
 * Named-workers plan step 2: status writes (`markRunning`/`markCompleted`/
 * `markFailed`) carry the worker_id of the claiming worker so the ownership
 * predicate inside those updates can detect a recovered claim and drop a
 * stale write rather than overwriting the new claimer's progress.
 *
 * Step 3 (worker-tokens): status writes branch on auth mode — in
 * worker-token mode they go through SECURITY DEFINER RPCs.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthMode } from "../supabase/client.js";
import { generateFlow, generatePersona } from "./handlers/generate.js";
import { runWalk } from "./handlers/walk.js";
import { markCompleted, markFailed, markRunning, type AgentJobRow } from "./claim.js";

export async function dispatchJob(
  supabase: SupabaseClient,
  job: AgentJobRow,
  workerId: string,
  auth: AuthMode,
): Promise<void> {
  console.log(`[dispatch] ${job.id} kind=${job.kind}`);
  try {
    const stillOurs = await markRunning(supabase, job.id, workerId, auth);
    if (!stillOurs) {
      console.warn(`[dispatch] ${job.id} claim was recovered before run; skipping`);
      return;
    }
    const result = await runHandler(job);
    const wrote = await markCompleted(supabase, job.id, result as Record<string, unknown>, workerId, auth);
    if (!wrote) {
      console.warn(`[dispatch] ${job.id} completed but claim was recovered; discarding result`);
      return;
    }
    console.log(`[dispatch] ${job.id} ok`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[dispatch] ${job.id} failed: ${message}`);
    await markFailed(supabase, job.id, message, workerId, auth);
  }
}

async function runHandler(job: AgentJobRow): Promise<unknown> {
  switch (job.kind) {
    case "generate_flow":
    case "generate_persona": {
      const description = (job.input as { description?: string }).description ?? "";
      if (!description.trim()) throw new Error("input.description is empty");
      return job.kind === "generate_flow"
        ? generateFlow({ description })
        : generatePersona({ description });
    }
    case "walk":
      return runWalk(job.input, { projectId: job.project_id });
    default: {
      const exhaustive: never = job.kind;
      throw new Error(`unknown job kind: ${String(exhaustive)}`);
    }
  }
}
