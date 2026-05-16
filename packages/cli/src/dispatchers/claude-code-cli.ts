// File-size exception (~315 lines): the dispatcher's concerns — preflight,
// MCP-config writing, isolation handling, env scrubbing — are tightly
// coupled to the single spawn site. Splitting them into siblings would
// require re-threading more state than it would save in cognitive load.
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";

const localRequire = createRequire(import.meta.url);
import type {
  DispatcherAdapter,
  DispatcherInput,
  DispatcherPreflightResult,
  DispatcherResult,
  PreflightCheck,
} from "@agiterra/rove-core";

const execFile = promisify(execFileCb);

export type IsolationMode = "clean-room" | "shared";

/**
 * Drives a walk by shelling out to the `claude` CLI in --print mode.
 *
 * Expects the user to have:
 *   1. `claude` on PATH (the Claude Code CLI)
 *   2. Playwright MCP — either registered globally (shared mode) or available
 *      as an installable npm package (clean-room mode bundles it on-the-fly).
 *
 * Isolation mode:
 *   - `shared`: legacy behavior. cwd = caller's cwd. Inherits full env. Uses
 *     the operator's global MCP registry unless a user-data-dir is provided.
 *   - `clean-room`: required for agent / change-review walks. cwd = fresh
 *     tmpdir with no source. MCP config is written per-walk and constrained
 *     via --strict-mcp-config so the agent can't Read/Grep/Bash project files.
 *     Env is scrubbed to a minimal allowlist (no API keys, no Supabase creds,
 *     no GH tokens) so prior session context cannot color the walk.
 */
export class ClaudeCodeCliDispatcher implements DispatcherAdapter {
  readonly id = "claude-code-cli";
  readonly label = "Claude Code CLI";

  constructor(
    private readonly opts: {
      model?: string;
      claudeBin?: string;
      /** Pass --dangerously-skip-permissions. Default true: required for non-interactive MCP tool use. */
      skipPermissions?: boolean;
      /**
       * Path to a persistent Chromium profile (`--user-data-dir`). When set,
       * the dispatcher writes a per-walk MCP config that registers
       * `@playwright/mcp` with `--user-data-dir <path>`. The agent's browser
       * inherits cookies + localStorage from a prior `rove auth-setup`.
       */
      userDataDirPath?: string;
      /**
       * Defaults to "shared" for compatibility. Set "clean-room" for agent
       * personas and change-review walks — see class doc.
       */
      isolation?: IsolationMode;
    } = {},
  ) {}

  private get isolation(): IsolationMode {
    return this.opts.isolation ?? "shared";
  }

  private get skipPermissions(): boolean {
    return this.opts.skipPermissions ?? true;
  }

  async preflight(): Promise<DispatcherPreflightResult> {
    const checks: PreflightCheck[] = [];

    checks.push(await checkCommand(this.claudeBin, ["--version"], "claude CLI installed"));

    // In clean-room mode (or any mode that ships its own MCP config), the
    // global playwright registration is irrelevant — we write our own per
    // walk and pin it with --strict-mcp-config.
    const providesOwnMcp = this.isolation === "clean-room" || !!this.opts.userDataDirPath;

    if (checks[0].status !== "ok") {
      checks.push({
        name: "playwright MCP registered",
        status: "fail",
        detail: "skipped — claude CLI missing",
      });
    } else if (providesOwnMcp) {
      checks.push({
        name: "playwright MCP (per-walk config)",
        status: "ok",
        detail: "isolated mode — registers @playwright/mcp via --mcp-config",
      });
    } else {
      checks.push(await checkPlaywrightMcp(this.claudeBin));
    }

    return {
      ok: checks.every((c) => c.status !== "fail"),
      checks,
    };
  }

  async dispatch(input: DispatcherInput): Promise<DispatcherResult> {
    const startedAt = Date.now();
    const args = ["--print", "--model", this.model];
    // Required for non-interactive runs: --print can't prompt for MCP tool
    // approval, so without this flag mcp__playwright__browser_* calls are
    // silently denied and the agent pivots to code-inspection instead.
    if (this.skipPermissions) args.push("--dangerously-skip-permissions");
    if (input.maxBudgetUsd !== undefined) {
      args.push("--max-budget-usd", String(input.maxBudgetUsd));
    }

    // Decide MCP config + cwd + env based on isolation.
    const isCleanRoom = this.isolation === "clean-room";
    let cwd: string = input.cwd ?? process.cwd();
    let env: NodeJS.ProcessEnv = process.env;

    // Always route through the proxy when we have a log path. Otherwise
    // legacy behavior — proxy only when isolation/userDataDir need it.
    const needsCustomMcpConfig =
      isCleanRoom || !!this.opts.userDataDirPath || !!input.trajectoryLogPath;
    if (needsCustomMcpConfig) {
      const mcpConfigPath = await writeMcpConfig({
        userDataDirPath: this.opts.userDataDirPath,
        trajectoryLogPath: input.trajectoryLogPath,
        screenshotsDir: input.screenshotsDir,
        liveStepWrites: input.liveStepWrites,
      });
      args.push("--mcp-config", mcpConfigPath, "--strict-mcp-config");
    }

    if (isCleanRoom) {
      cwd = await mkdtemp(join(tmpdir(), "rove-cleanroom-"));
      env = scrubbedEnv(process.env);
    }

    args.push(input.prompt);

    return new Promise<DispatcherResult>((resolve, reject) => {
      const child = spawn(this.claudeBin, args, {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      const timer = input.timeoutSeconds
        ? setTimeout(() => child.kill("SIGTERM"), input.timeoutSeconds * 1000)
        : null;

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", (err) => {
        if (timer) clearTimeout(timer);
        reject(err);
      });
      child.on("close", (code) => {
        if (timer) clearTimeout(timer);
        resolve({
          stdout,
          stderr,
          exitCode: code ?? -1,
          durationMs: Date.now() - startedAt,
        });
      });
    });
  }

  private get claudeBin(): string {
    return this.opts.claudeBin ?? "claude";
  }

  private get model(): string {
    return this.opts.model ?? "sonnet";
  }
}

/**
 * Writes a per-walk MCP config registering only `@playwright/mcp`. With
 * --strict-mcp-config this is the entire toolset the agent can call. When
 * a trajectoryLogPath is supplied, the playwright server is fronted by the
 * proxy script so every JSON-RPC message is teed to the log.
 */
async function writeMcpConfig(opts: {
  userDataDirPath?: string;
  trajectoryLogPath?: string;
  screenshotsDir?: string;
  liveStepWrites?: DispatcherInput["liveStepWrites"];
}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "rove-mcp-"));
  // Args destined for @playwright/mcp itself (NOT the npx wrapper — the
  // proxy spawns `npx -y @playwright/mcp@latest` internally, then appends
  // these. When we're not proxying, the dispatcher invokes npx + these.
  const playwrightServerArgs: string[] = [];
  if (opts.userDataDirPath) {
    playwrightServerArgs.push("--user-data-dir", opts.userDataDirPath);
  }
  if (opts.screenshotsDir) {
    playwrightServerArgs.push("--output-dir", opts.screenshotsDir);
  }

  // Resolve @playwright/mcp from rove-cli's own node_modules — avoids the
  // npx cold-start (network + cache miss) on every walk. The package is a
  // declared dependency of @agiterra/rove-cli. The proxy does its own resolve.
  // Note: @playwright/mcp's `exports` map doesn't expose ./cli.js, so we
  // resolve via package.json and derive the bin file from its directory.
  const command = process.execPath;
  let args: string[];
  let proxyEnv: Record<string, string> | undefined;
  if (opts.trajectoryLogPath) {
    const proxyArgs = [proxyScriptPath(), "--log", opts.trajectoryLogPath];
    // Always tell the proxy where screenshots are supposed to land. The
    // proxy uses this for take_screenshot filename rewriting (so Playwright
    // MCP's path-mangling can't drop the file outside the per-run dir),
    // separate from live-step write semantics.
    if (opts.screenshotsDir) {
      proxyArgs.push("--screenshots-dir", opts.screenshotsDir);
    }
    if (opts.liveStepWrites) {
      proxyArgs.push(
        "--live-run-id",
        opts.liveStepWrites.runId,
        "--live-project-id",
        opts.liveStepWrites.projectId,
      );
      if (opts.liveStepWrites.personaId) {
        proxyArgs.push("--live-persona-id", opts.liveStepWrites.personaId);
      }
      if (opts.liveStepWrites.personaPolicy) {
        proxyArgs.push("--live-persona-policy", opts.liveStepWrites.personaPolicy);
      }
      proxyEnv = {
        ROVE_SUPABASE_URL: opts.liveStepWrites.supabaseUrl,
        ROVE_SUPABASE_SERVICE_ROLE_KEY: opts.liveStepWrites.supabaseServiceRoleKey,
      };
    }
    proxyArgs.push("--", ...playwrightServerArgs);
    args = proxyArgs;
  } else {
    args = [resolveMcpCli(), ...playwrightServerArgs];
  }

  const config = {
    mcpServers: {
      playwright: { command, args, ...(proxyEnv ? { env: proxyEnv } : {}) },
    },
  };
  const filePath = join(dir, "mcp-config.json");
  await writeFile(filePath, JSON.stringify(config, null, 2), "utf8");
  return filePath;
}

function proxyScriptPath(): string {
  // packages/cli/dist/dispatchers/claude-code-cli.js (built) ←→
  // packages/cli/bin/playwright-mcp-proxy.mjs (sibling)
  // Resolve via import.meta.url so it works in both built dist and ts-node.
  const here = new URL(import.meta.url);
  return new URL("../../bin/playwright-mcp-proxy.mjs", here).pathname;
}

function resolveMcpCli(): string {
  const pkgJsonPath = localRequire.resolve("@playwright/mcp/package.json");
  return join(dirname(pkgJsonPath), "cli.js");
}

/**
 * Build a minimal env for the agent subprocess. The agent must NOT inherit
 * secrets that belong to the dispatcher's own pipeline (Supabase service-role
 * key, GitHub tokens, third-party API keys). It also must not inherit any
 * project-specific connection strings — those are the source-of-truth the
 * agent might otherwise consult instead of walking the UI.
 *
 * Allowed: path/locale basics for claude + playwright to function. Any
 * variable matching one of the SCRUB_ALLOW_PREFIXES is also passed (CLAUDE_*,
 * PLAYWRIGHT_*, NODE_*, XDG_*) — those are tool-config, not data.
 */
function scrubbedEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const key of SCRUB_ALLOW_EXACT) {
    const v = source[key];
    if (v !== undefined) out[key] = v;
  }
  for (const [key, v] of Object.entries(source)) {
    if (v === undefined) continue;
    if (out[key] !== undefined) continue;
    if (SCRUB_ALLOW_PREFIXES.some((p) => key.startsWith(p))) {
      out[key] = v;
    }
  }
  return out;
}

const SCRUB_ALLOW_EXACT: readonly string[] = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TERM",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LC_MESSAGES",
  "PWD",
  "ANTHROPIC_API_KEY",
];

const SCRUB_ALLOW_PREFIXES: readonly string[] = [
  "CLAUDE_",
  "PLAYWRIGHT_",
  "NODE_",
  "XDG_",
];

async function checkCommand(bin: string, args: string[], name: string): Promise<PreflightCheck> {
  try {
    const { stdout } = await execFile(bin, args, { timeout: 5_000 });
    return { name, status: "ok", detail: stdout.trim().split("\n")[0] };
  } catch (err) {
    return {
      name,
      status: "fail",
      detail: err instanceof Error ? err.message : String(err),
      remedy: bin === "claude" ? "Install Claude Code: https://claude.com/claude-code" : undefined,
    };
  }
}

async function checkPlaywrightMcp(claudeBin: string): Promise<PreflightCheck> {
  try {
    const { stdout } = await execFile(claudeBin, ["mcp", "list"], { timeout: 15_000 });
    const hasPlaywright = /^\s*playwright\s*:/m.test(stdout);
    if (hasPlaywright) {
      return { name: "playwright MCP registered", status: "ok" };
    }
    return {
      name: "playwright MCP registered",
      status: "fail",
      detail: "no `playwright:` entry in `claude mcp list` output",
      remedy: "claude mcp add playwright npx '@playwright/mcp@latest'",
    };
  } catch (err) {
    return {
      name: "playwright MCP registered",
      status: "fail",
      detail: err instanceof Error ? err.message : String(err),
      remedy: "claude mcp add playwright npx '@playwright/mcp@latest'",
    };
  }
}
