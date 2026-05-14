import type { DispatcherAdapter, FindingSeverity, SinkAdapter } from "@agiterra/rove-core";
import { FINDING_SEVERITIES } from "@agiterra/rove-core";
import { ClaudeCodeCliDispatcher } from "./dispatchers/claude-code-cli.js";
import { CodexCliDispatcher } from "./dispatchers/codex-cli.js";
import { MarkdownSink } from "./sinks/markdown.js";
import { GitHubIssuesSink } from "./sinks/github-issues.js";
import { SupabaseSink } from "./sinks/supabase.js";
import { readEvalSupabaseEnv } from "./supabase/env.js";
import type { ResolvedWorkspace } from "./workspace.js";

export type DispatcherId = "claude-code" | "codex";
export type SinkId = "markdown" | "github-issues" | "supabase";
export const ALL_SINK_IDS: readonly SinkId[] = ["markdown", "github-issues", "supabase"];

export const DEFAULT_DISPATCHER: DispatcherId = "claude-code";

/**
 * Default sink list. Markdown is always on; Supabase auto-attaches when the
 * eval-store env vars are set so the agent-friendly "just run the walk"
 * default does the right thing without a flag.
 */
export function computeDefaultSinks(): SinkId[] {
  const out: SinkId[] = ["markdown"];
  if (readEvalSupabaseEnv()) out.push("supabase");
  return out;
}

/** Snapshot evaluated at module load — fine because env doesn't change mid-process. */
export const DEFAULT_SINKS: SinkId[] = computeDefaultSinks();

export interface DispatcherFactoryOptions {
  /** Path to a persistent Chromium profile (`--user-data-dir`) to hand to MCP. */
  userDataDirPath?: string;
  /**
   * `clean-room` for agent and change-review walks — fresh cwd, scrubbed env,
   * strict MCP config so the agent has no source-read access. `shared`
   * (default) preserves the operator's cwd and full env for human-persona
   * walks where some project context is acceptable.
   */
  isolation?: "clean-room" | "shared";
}

export function createDispatcher(
  id: DispatcherId,
  opts: DispatcherFactoryOptions = {},
): DispatcherAdapter {
  switch (id) {
    case "claude-code":
      return new ClaudeCodeCliDispatcher({
        userDataDirPath: opts.userDataDirPath,
        isolation: opts.isolation,
        // LaunchAgent daemons run with a sparse PATH that excludes
        // ~/.local/bin where `claude` typically lives. The installer
        // resolves the absolute path at install time and writes it as
        // ROVE_CLAUDE_BIN; honor it here, fall back to PATH lookup for
        // in-repo `pnpm cli -- run` invocations.
        claudeBin: process.env.ROVE_CLAUDE_BIN,
      });
    case "codex":
      // Codex doesn't yet have user-data-dir injection — the codex MCP setup
      // is the user's call.
      return new CodexCliDispatcher();
  }
}

export interface SinkFactoryOptions {
  ghMinSeverity?: FindingSeverity;
  ghDryRun?: boolean;
}

export function createSinks(
  ids: SinkId[],
  ws: ResolvedWorkspace,
  projectId: string,
  opts: SinkFactoryOptions = {},
): SinkAdapter[] {
  // Force "supabase" before "github-issues" so dedup is established before
  // issues are filed. Both sinks query the same store; ordering ensures
  // the new row exists when GitHubIssuesSink writes back the issue URL.
  const ordered = orderForDedup(ids);
  let supabaseSink: SupabaseSink | undefined;
  return ordered.map((id) => {
    switch (id) {
      case "markdown":
        return new MarkdownSink(ws.reportsDir);
      case "github-issues":
        return new GitHubIssuesSink({
          minSeverity: opts.ghMinSeverity,
          dryRun: opts.ghDryRun,
          // Wire dedup automatically when supabase is also enabled — the
          // GH sink will comment on the prior issue instead of duplicating.
          dedupStore: supabaseSink?.store,
        });
      case "supabase":
        supabaseSink = new SupabaseSink({ projectId });
        return supabaseSink;
    }
  });
}

function orderForDedup(ids: SinkId[]): SinkId[] {
  const rank: Record<SinkId, number> = {
    supabase: 0,
    markdown: 1,
    "github-issues": 2,
  };
  return [...ids].sort((a, b) => rank[a] - rank[b]);
}

export function parseDispatcherId(s: string): DispatcherId {
  if (s === "claude-code" || s === "codex") return s;
  throw new Error(`Unknown dispatcher: ${s}. Use one of: claude-code, codex`);
}

export function parseSinkIds(s: string): SinkId[] {
  const ids = s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  for (const id of ids) {
    if (!ALL_SINK_IDS.includes(id as SinkId)) {
      throw new Error(`Unknown sink: ${id}. Use any of: ${ALL_SINK_IDS.join(", ")}`);
    }
  }
  return ids as SinkId[];
}

export function parseSeverity(s: string): FindingSeverity {
  if ((FINDING_SEVERITIES as readonly string[]).includes(s)) return s as FindingSeverity;
  throw new Error(`Unknown severity: ${s}. Use one of: ${FINDING_SEVERITIES.join(", ")}`);
}
