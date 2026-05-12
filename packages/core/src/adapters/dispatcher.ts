/**
 * A DispatcherAdapter knows how to run an agentic walk prompt against a
 * specific host (Claude Code CLI, Codex CLI, future Cursor/Windsurf/etc).
 *
 * The contract is intentionally minimal: take a prompt + a session label,
 * return the agent's full stdout. Findings extraction is the caller's
 * concern (use `parseFindings`).
 */
export interface DispatcherAdapter {
  /** Stable identifier (e.g. "claude-code-cli", "codex-cli"). */
  readonly id: string;
  /** Human-readable label for log lines. */
  readonly label: string;
  /**
   * Resolve once before dispatch — verifies the underlying CLI is on PATH
   * and any required MCP servers are wired up. Throw to abort.
   */
  preflight(): Promise<DispatcherPreflightResult>;
  /** Run the walk. Resolves with the agent's complete stdout. */
  dispatch(input: DispatcherInput): Promise<DispatcherResult>;
}

export interface DispatcherInput {
  prompt: string;
  /** Human-readable label for the session — used in log lines, not by the agent. */
  sessionName: string;
  /** Maximum dollars to spend on the underlying API. */
  maxBudgetUsd?: number;
  /** Wall-clock timeout in seconds. */
  timeoutSeconds?: number;
  /** Optional cwd override; defaults to process.cwd(). */
  cwd?: string;
}

export interface DispatcherResult {
  /** The agent's full stdout. The caller extracts findings from this. */
  stdout: string;
  /** Stderr captured during the run (may be empty). */
  stderr: string;
  /** Process exit code. Non-zero means the dispatcher itself failed. */
  exitCode: number;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
}

export interface DispatcherPreflightResult {
  ok: boolean;
  /** Human-readable diagnostic lines (one per check). */
  checks: PreflightCheck[];
}

export interface PreflightCheck {
  name: string;
  status: "ok" | "warn" | "fail";
  detail?: string;
  /** Shell command the user can run to fix a failed check, if any. */
  remedy?: string;
}
