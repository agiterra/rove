import { loadRoveConfig } from "../config.js";
import { getSupabaseClient } from "../supabase/client.js";
import { startDaemon } from "../daemon/runner.js";

export interface DaemonCommandOpts {
  claimMode?: "all" | "requested-only";
}

export async function runDaemonCommand(opts: DaemonCommandOpts): Promise<number> {
  try {
    const { config } = await loadRoveConfig();
    const supabase = getSupabaseClient();
    await startDaemon(supabase, {
      projectId: config.projectId,
      claimMode: opts.claimMode,
    });
    return 0;
  } catch (err) {
    console.error(`[daemon] fatal: ${(err as Error).message}`);
    return 1;
  }
}
