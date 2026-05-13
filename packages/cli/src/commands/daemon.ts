import { loadRoveConfig } from "../config.js";
import { getSupabaseClient } from "../supabase/client.js";
import { startDaemon } from "../daemon/runner.js";

export type WorkerCapability = "manual" | "localhost" | "webhook";

export interface DaemonCommandOpts {
  claimMode?: "all" | "requested-only";
  workerName?: string;
  workerKind?: "laptop" | "dedicated";
  capabilities?: WorkerCapability[];
  /**
   * Overrides rove.config.ts → projectId. Lets one machine run daemons
   * against multiple projects without switching cwd or editing config.
   * Validated against the same slug shape `rove init` enforces.
   */
  projectIdOverride?: string;
}

const PROJECT_SLUG_RE = /^[a-z][a-z0-9-]*$/;

export async function runDaemonCommand(opts: DaemonCommandOpts): Promise<number> {
  try {
    const { config } = await loadRoveConfig();
    let projectId = config.projectId;
    if (opts.projectIdOverride !== undefined) {
      if (!PROJECT_SLUG_RE.test(opts.projectIdOverride)) {
        throw new Error(
          `--project-id must be lowercase letters/numbers/hyphens (got: ${opts.projectIdOverride})`,
        );
      }
      projectId = opts.projectIdOverride;
      if (projectId !== config.projectId) {
        console.log(
          `[daemon] project override: '${projectId}' (rove.config.ts says '${config.projectId}')`,
        );
      }
    }
    const supabase = getSupabaseClient();
    await startDaemon(supabase, {
      projectId,
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
