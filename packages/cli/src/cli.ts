import { Command } from "commander";
import { resolveWorkspace } from "./workspace.js";
import { runListCommand } from "./commands/list.js";
import { runPersonasCommand } from "./commands/personas.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runRunCommand } from "./commands/run.js";
import { runIngestCommand } from "./commands/ingest.js";
import { runAuthSetupCommand } from "./commands/auth-setup.js";
import { runCleanupResolvedCommand } from "./commands/cleanup-resolved.js";
import { runDaemonCommand } from "./commands/daemon.js";
import { runInitCommand } from "./commands/init.js";
import { runSyncCommand } from "./commands/sync.js";
import { runUiCommand } from "./commands/ui.js";
import type { AuthRole } from "./auth-state.js";
import {
  DEFAULT_DISPATCHER,
  DEFAULT_SINKS,
  parseDispatcherId,
  parseSeverity,
  parseSinkIds,
} from "./factories.js";

function parseAuthRole(s: string): AuthRole {
  if (s === "dispatcher" || s === "admin" || s === "technician") return s;
  throw new Error(`Unknown role: ${s}. Use one of: dispatcher, admin, technician`);
}

const program = new Command();
program
  .name("rove")
  .description("Agentic UX evaluator — walk any web app, file findings, no shared cloud key")
  .version("0.0.0");

program
  .command("init")
  .description("Bootstrap Rove in this project (writes rove.config.ts + flows dir + .env example)")
  .option("--workspace-id <id>", "Pre-fill workspaceId from your Rove dashboard")
  .option("--flows-dir <path>", "Where flow YAMLs live, repo-relative", "rove/flows")
  .option("--target-url <url>", "Default origin to walk (e.g. http://localhost:3000)")
  .option("--github-repo <owner/repo>", "Enables the github-issues sink + PR-driven walks later")
  .option("--force", "Overwrite an existing rove.config.ts", false)
  .action(async (rawOpts: Record<string, unknown>) => {
    process.exit(
      await runInitCommand({
        workspaceId: rawOpts.workspaceId as string | undefined,
        flowsDir: rawOpts.flowsDir as string | undefined,
        defaultTargetUrl: rawOpts.targetUrl as string | undefined,
        githubRepo: rawOpts.githubRepo as string | undefined,
        force: rawOpts.force as boolean,
      }),
    );
  });

program
  .command("list")
  .description("List discoverable flow files")
  .action(async () => {
    const ws = resolveWorkspace();
    process.exit(await runListCommand(ws));
  });

program
  .command("personas")
  .description("List built-in personas")
  .action(() => {
    process.exit(runPersonasCommand());
  });

program
  .command("doctor")
  .description("Check the local environment is ready to dispatch a walk")
  .action(async () => {
    const ws = resolveWorkspace();
    process.exit(await runDoctorCommand(ws));
  });

program
  .command("run")
  .description("Dispatch a walk")
  .requiredOption("--flow <id>", "Flow id, e.g. scheduling.create_job.dispatcher")
  .requiredOption("--persona <id>", "Persona id, e.g. dispatcher_novice")
  .option("--goal <text>", "Override the flow's default goal")
  .option("--notes <text>", "Per-run notes appended to the prompt")
  .option(
    "--target-url <url>",
    "Origin to walk (defaults to http://localhost:3000 / EVAL_TARGET_URL env)",
  )
  .option("--dry-run", "Print the prompt and exit without dispatching", false)
  .option("--max-budget-usd <n>", "Dispatcher budget cap in dollars", parseFloat, 5)
  .option(
    "--timeout-seconds <n>",
    "Wall-clock timeout for the dispatcher",
    (s) => parseInt(s, 10),
    600,
  )
  .option(
    "--dispatcher <id>",
    "Dispatcher: claude-code | codex",
    parseDispatcherId,
    DEFAULT_DISPATCHER,
  )
  .option(
    "--sinks <ids>",
    "Comma-separated sinks: markdown,github-issues",
    parseSinkIds,
    DEFAULT_SINKS,
  )
  .option(
    "--gh-min-severity <s>",
    "GitHub sink only — minimum severity to file (critical|major|minor|nit)",
    parseSeverity,
  )
  .option("--gh-dry-run", "GitHub sink only — log gh commands instead of running them", false)
  .option("--no-auth", "Walk anonymously (skip storage-state injection)")
  .action(async (rawOpts: Record<string, unknown>) => {
    const ws = resolveWorkspace();
    process.exit(
      await runRunCommand(ws, {
        flowId: rawOpts.flow as string,
        personaId: rawOpts.persona as string,
        goal: rawOpts.goal as string | undefined,
        notes: rawOpts.notes as string | undefined,
        targetUrl: rawOpts.targetUrl as string | undefined,
        dryRun: rawOpts.dryRun as boolean,
        maxBudgetUsd: rawOpts.maxBudgetUsd as number,
        timeoutSeconds: rawOpts.timeoutSeconds as number,
        dispatcher: rawOpts.dispatcher as ReturnType<typeof parseDispatcherId>,
        sinks: rawOpts.sinks as ReturnType<typeof parseSinkIds>,
        ghMinSeverity: rawOpts.ghMinSeverity as ReturnType<typeof parseSeverity> | undefined,
        ghDryRun: rawOpts.ghDryRun as boolean,
        authenticated: (rawOpts.auth as boolean | undefined) ?? true,
      }),
    );
  });

program
  .command("ingest <file>")
  .description("Route a saved findings JSON file through the configured sinks")
  .option("--sinks <ids>", "Comma-separated sinks", parseSinkIds, DEFAULT_SINKS)
  .option("--gh-min-severity <s>", "GitHub sink only — minimum severity", parseSeverity)
  .option("--gh-dry-run", "GitHub sink only — log gh commands instead of running them", false)
  .option("--dispatcher-id <id>", "Dispatcher id to record (default: manual-ingest)")
  .action(async (filePath: string, rawOpts: Record<string, unknown>) => {
    const ws = resolveWorkspace();
    process.exit(
      await runIngestCommand(ws, {
        filePath,
        sinks: rawOpts.sinks as ReturnType<typeof parseSinkIds>,
        ghMinSeverity: rawOpts.ghMinSeverity as ReturnType<typeof parseSeverity> | undefined,
        ghDryRun: rawOpts.ghDryRun as boolean,
        dispatcherId: rawOpts.dispatcherId as string | undefined,
      }),
    );
  });

program
  .command("auth-setup")
  .description(
    "Log in to the dev server with seeded credentials and save a Playwright storage state",
  )
  .option("--role <role>", "Role: dispatcher | admin | technician", parseAuthRole, "dispatcher")
  .option("--email <email>", "Seeded user email", "admin@example.com")
  .option("--password <password>", "Seeded user password", "password123")
  .option("--base-url <url>", "Dev server base URL", "http://localhost:3000")
  .option("--expect-url-contains <s>", "URL fragment to wait for after login", "/admin")
  .option("--headed", "Show the browser (debug)", false)
  .option("--timeout-ms <n>", "Per-step Playwright timeout", (s) => parseInt(s, 10), 15000)
  .action(async (rawOpts: Record<string, unknown>) => {
    process.exit(
      await runAuthSetupCommand({
        role: rawOpts.role as AuthRole,
        email: rawOpts.email as string,
        password: rawOpts.password as string,
        baseUrl: rawOpts.baseUrl as string,
        expectUrlContains: rawOpts.expectUrlContains as string,
        headed: rawOpts.headed as boolean,
        timeoutMs: rawOpts.timeoutMs as number,
      }),
    );
  });

program
  .command("ui")
  .description("Serve the Markdown walk reports as a local web UI")
  .option("--port <n>", "Port to bind", (s) => parseInt(s, 10), 4040)
  .option("--no-open", "Don't auto-open the browser")
  .action(async (rawOpts: Record<string, unknown>) => {
    const ws = resolveWorkspace();
    process.exit(
      await runUiCommand(ws, {
        port: rawOpts.port as number,
        open: (rawOpts.open as boolean | undefined) ?? true,
      }),
    );
  });

program
  .command("sync")
  .description("Push built-in personas + flow YAML to the eval Supabase store.")
  .option("--dry-run", "Print what would be written but don't write", false)
  .action(async (rawOpts: Record<string, unknown>) => {
    const ws = resolveWorkspace();
    process.exit(await runSyncCommand(ws, { dryRun: rawOpts.dryRun as boolean }));
  });

program
  .command("cleanup-resolved")
  .description("Delete Supabase Storage screenshots + join rows for findings marked resolved.")
  .option("--dry-run", "Log what would be deleted but don't delete", false)
  .action(async (rawOpts: Record<string, unknown>) => {
    process.exit(
      await runCleanupResolvedCommand({
        dryRun: rawOpts.dryRun as boolean,
      }),
    );
  });

program
  .command("daemon")
  .description(
    "Long-running worker that claims queued agent_jobs and runs them via your local Claude session.",
  )
  .option("--claim-mode <mode>", "Which jobs to claim: all (default) | requested-only", (s) => {
    if (s !== "all" && s !== "requested-only") {
      throw new Error(`--claim-mode must be 'all' or 'requested-only' (got: ${s})`);
    }
    return s;
  })
  .action(async (rawOpts: Record<string, unknown>) => {
    process.exit(
      await runDaemonCommand({
        claimMode: rawOpts.claimMode as "all" | "requested-only" | undefined,
      }),
    );
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
