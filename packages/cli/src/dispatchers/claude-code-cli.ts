import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import type {
  DispatcherAdapter,
  DispatcherInput,
  DispatcherPreflightResult,
  DispatcherResult,
  PreflightCheck,
} from "@agiterra/rove-core";

const execFile = promisify(execFileCb);

/**
 * Drives a walk by shelling out to the `claude` CLI in --print mode.
 *
 * Expects the user to have:
 *   1. `claude` on PATH (the Claude Code CLI)
 *   2. Playwright MCP registered as `playwright` (see preflight remedy)
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
    } = {},
  ) {}

  private get skipPermissions(): boolean {
    return this.opts.skipPermissions ?? true;
  }

  async preflight(): Promise<DispatcherPreflightResult> {
    const checks: PreflightCheck[] = [];

    checks.push(await checkCommand(this.claudeBin, ["--version"], "claude CLI installed"));

    if (checks[0].status === "ok") {
      checks.push(await checkPlaywrightMcp(this.claudeBin));
    } else {
      checks.push({
        name: "playwright MCP registered",
        status: "fail",
        detail: "skipped — claude CLI missing",
      });
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

    if (this.opts.userDataDirPath) {
      const mcpConfigPath = await writeMcpConfigWithUserDataDir(this.opts.userDataDirPath);
      args.push("--mcp-config", mcpConfigPath, "--strict-mcp-config");
    }

    args.push(input.prompt);

    return new Promise<DispatcherResult>((resolve, reject) => {
      const child = spawn(this.claudeBin, args, {
        cwd: input.cwd ?? process.cwd(),
        env: process.env,
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

async function writeMcpConfigWithUserDataDir(userDataDirPath: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "rove-mcp-"));
  const config = {
    mcpServers: {
      playwright: {
        command: "npx",
        args: ["-y", "@playwright/mcp@latest", "--user-data-dir", userDataDirPath],
      },
    },
  };
  const filePath = join(dir, "mcp-config.json");
  await writeFile(filePath, JSON.stringify(config, null, 2), "utf8");
  return filePath;
}

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
