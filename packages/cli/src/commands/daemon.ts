import { loadRoveConfig } from "../config.js";
import { getSupabaseClient } from "../supabase/client.js";
import { startDaemon } from "../daemon/runner.js";

export type WorkerCapability = "manual" | "localhost" | "webhook";

export interface DaemonCommandOpts {
  claimMode?: "all" | "requested-only";
  workerName?: string;
  workerKind?: "laptop" | "dedicated";
  capabilities?: WorkerCapability[];
}

export async function runDaemonCommand(opts: DaemonCommandOpts): Promise<number> {
  try {
    const { config } = await loadRoveConfig();
    const supabase = getSupabaseClient();
    await startDaemon(supabase, {
      projectId: config.projectId,
      claimMode: opts.claimMode,
      workerName: opts.workerName,
      workerKind: opts.workerKind,
      capabilities: opts.capabilities,
    });
    return 0;
  } catch (err) {
    console.error(`[daemon] fatal: ${(err as Error).message}`);
    return 1;
  }
}
