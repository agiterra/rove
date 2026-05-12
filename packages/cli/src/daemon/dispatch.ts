/**
 * Dispatches a claimed agent_jobs row to the appropriate handler.
 * Generation handlers shell out to the local Claude session; walk handler
 * shells out to the existing `tankloop-eval run` pipeline.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateFlow, generatePersona } from "./handlers/generate.js";
import { runWalk } from "./handlers/walk.js";
import { markCompleted, markFailed, markRunning, type AgentJobRow } from "./claim.js";

export async function dispatchJob(supabase: SupabaseClient, job: AgentJobRow): Promise<void> {
  console.log(`[dispatch] ${job.id} kind=${job.kind}`);
  try {
    await markRunning(supabase, job.id);
    const result = await runHandler(job);
    await markCompleted(supabase, job.id, result as Record<string, unknown>);
    console.log(`[dispatch] ${job.id} ok`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[dispatch] ${job.id} failed: ${message}`);
    await markFailed(supabase, job.id, message);
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
      return runWalk(job.input);
    default: {
      const exhaustive: never = job.kind;
      throw new Error(`unknown job kind: ${String(exhaustive)}`);
    }
  }
}
