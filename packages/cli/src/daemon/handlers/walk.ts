/**
 * Handler for kind=walk. Spawns `rove run --flow X --persona Y`
 * as a subprocess so the existing run pipeline (preflight, dispatcher,
 * sinks, prompt, screenshots) is reused unchanged.
 *
 * The daemon uses the operator's local Claude session — same as
 * generation. When the subprocess exits 0, the supabase sink has already
 * written the run row + findings; the daemon just records job ok.
 */
import { spawn } from "node:child_process";
import { z } from "zod";

export const walkInputSchema = z.object({
  flow_id: z.string().min(1),
  persona_id: z.string().min(1),
  target_url: z.url().optional(),
  notes: z.string().max(2000).optional(),
  max_budget_usd: z.number().positive().max(50).optional(),
  timeout_seconds: z.number().int().positive().max(1800).optional(),
});
export type WalkInput = z.infer<typeof walkInputSchema>;

export interface WalkResult {
  exit_code: number;
  duration_ms: number;
  stdout_tail: string;
}

export interface RunWalkOptions {
  /**
   * Project slug. Required when the daemon has no repo checkout (installed
   * via /setup) — passed through to `rove run --project-id` so the
   * subprocess synthesizes its workspace from Supabase.
   */
  projectId?: string;
}

export async function runWalk(input: unknown, opts: RunWalkOptions = {}): Promise<WalkResult> {
  const parsed = walkInputSchema.parse(input);
  // Reuse the same bin script that started the daemon — avoids requiring
  // `rove` on $PATH. process.argv[1] is the entry script (the
  // daemon's own bin/rove.js), so we spawn:
  //   node /path/to/bin/rove.js run …
  const binJs = process.env.ROVE_CLI_BIN ?? process.env.EVAL_TANKLOOP_BIN ?? process.argv[1];
  const args = [
    binJs,
    "run",
    "--flow",
    parsed.flow_id,
    "--persona",
    parsed.persona_id,
    "--sinks",
    "markdown,supabase,github-issues",
  ];
  if (opts.projectId) args.push("--project-id", opts.projectId);
  if (parsed.target_url) args.push("--target-url", parsed.target_url);
  if (parsed.notes) args.push("--notes", parsed.notes);
  if (parsed.max_budget_usd !== undefined) {
    args.push("--max-budget-usd", String(parsed.max_budget_usd));
  }
  const timeoutMs = (parsed.timeout_seconds ?? 600) * 1000 + 30_000;

  return new Promise<WalkResult>((resolve, reject) => {
    const startedAt = Date.now();
    // Inherit env so EVAL_SUPABASE_*, GH_TOKEN, etc. flow through.
    const child = spawn(process.execPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`rove run timed out after ${timeoutMs}ms (bin=${binJs})`));
    }, timeoutMs);

    child.stdout.on("data", (b: Buffer) => {
      const s = b.toString("utf8");
      stdout += s;
      // Stream to daemon's own log so the operator can follow.
      process.stdout.write(s);
    });
    child.stderr.on("data", (b: Buffer) => {
      const s = b.toString("utf8");
      stderr += s;
      process.stderr.write(s);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const duration_ms = Date.now() - startedAt;
      if (code !== 0) {
        reject(
          new Error(
            `rove run exited with ${code}\n--- stderr tail ---\n${stderr.slice(-800)}`,
          ),
        );
        return;
      }
      resolve({
        exit_code: code,
        duration_ms,
        stdout_tail: stdout.slice(-800),
      });
    });
  });
}
