import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import type {
  DispatcherAdapter,
  DispatcherInput,
  DispatcherPreflightResult,
  DispatcherResult,
  PreflightCheck,
} from "@rove/core";

const execFile = promisify(execFileCb);

/**
 * Drives a walk by shelling out to the Codex CLI (`codex exec`).
 *
 * Caveat — Codex does not expose a budget cap flag the way Claude does;
 * the caller's `maxBudgetUsd` is ignored. Wall-clock timeout still applies.
 */
export class CodexCliDispatcher implements DispatcherAdapter {
  readonly id = "codex-cli";
  readonly label = "Codex CLI";

  constructor(
    private readonly opts: {
      model?: string;
      codexBin?: string;
    } = {},
  ) {}

  async preflight(): Promise<DispatcherPreflightResult> {
    const checks: PreflightCheck[] = [];

    checks.push(await checkCommand(this.codexBin, ["--version"], "codex CLI installed"));

    if (checks[0].status === "ok") {
      checks.push(await checkPlaywrightMcp(this.codexBin));
    } else {
      checks.push({
        name: "playwright MCP registered (codex)",
        status: "fail",
        detail: "skipped — codex CLI missing",
      });
    }

    return {
      ok: checks.every((c) => c.status !== "fail"),
      checks,
    };
  }

  async dispatch(input: DispatcherInput): Promise<DispatcherResult> {
    const startedAt = Date.now();
    const args = ["exec"];
    if (this.model) args.push("--model", this.model);
    args.push(input.prompt);

    return new Promise<DispatcherResult>((resolve, reject) => {
      const child = spawn(this.codexBin, args, {
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

  private get codexBin(): string {
    return this.opts.codexBin ?? "codex";
  }

  private get model(): string | undefined {
    return this.opts.model;
  }
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
      remedy: bin === "codex" ? "Install Codex CLI: npm i -g @openai/codex" : undefined,
    };
  }
}

async function checkPlaywrightMcp(codexBin: string): Promise<PreflightCheck> {
  try {
    const { stdout } = await execFile(codexBin, ["mcp", "list"], { timeout: 15_000 });
    if (/playwright/i.test(stdout)) {
      return { name: "playwright MCP registered (codex)", status: "ok" };
    }
    return {
      name: "playwright MCP registered (codex)",
      status: "fail",
      detail: "no playwright entry in `codex mcp list`",
      remedy: "codex mcp add playwright -- npx @playwright/mcp@latest",
    };
  } catch (err) {
    return {
      name: "playwright MCP registered (codex)",
      status: "fail",
      detail: err instanceof Error ? err.message : String(err),
      remedy: "codex mcp add playwright -- npx @playwright/mcp@latest",
    };
  }
}
