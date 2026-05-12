/**
 * Parses the MCP-proxy's JSONL trajectory log into structured tool-call
 * records + aggregate metrics. Each log line is one JSON-RPC frame; pairs
 * are matched by `id` to produce one record per completed call.
 */
import { readFile } from "node:fs/promises";

const ACTION_TOOLS = new Set([
  "browser_navigate",
  "browser_navigate_back",
  "browser_click",
  "browser_type",
  "browser_press_key",
  "browser_hover",
  "browser_drag",
  "browser_fill",
  "browser_fill_form",
  "browser_select_option",
  "browser_file_upload",
  "browser_handle_dialog",
]);
const SNAPSHOT_TOOLS = new Set(["browser_snapshot", "browser_take_snapshot"]);
const SCREENSHOT_TOOLS = new Set(["browser_take_screenshot"]);
const RECOVERY_TOOLS = new Set(["browser_navigate_back"]);

export interface TrajectoryStep {
  step_index: number;
  direction: "result" | "error";
  tool_name: string;
  args: unknown;
  result_summary: string | null;
  aria_snapshot: string | null;
  url_after: string | null;
  duration_ms: number;
}

export interface TrajectoryMetrics {
  actual_tool_calls: number;
  snapshots: number;
  actions: number;
  screenshots: number;
  snapshots_per_action: number | null;
  recovery_count: number;
  errors: number;
  time_to_first_action_ms: number | null;
  parsed_at: string;
}

export interface ParsedTrajectory {
  steps: TrajectoryStep[];
  metrics: TrajectoryMetrics;
}

/**
 * Reads + parses. Missing log file → null (the walk may have skipped the
 * proxy path — the sink should treat that as "no trajectory captured"
 * rather than an error).
 */
export async function readTrajectoryLog(
  path: string,
  walkStartedAt: Date,
): Promise<ParsedTrajectory | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return null;
  }
  return parseTrajectoryLog(raw, walkStartedAt);
}

export function parseTrajectoryLog(raw: string, walkStartedAt: Date): ParsedTrajectory {
  type Frame = { t: string; dir: "in" | "out" | "err"; raw: unknown };
  const frames: Frame[] = [];
  for (const line of raw.split("\n")) {
    if (line.length === 0) continue;
    try {
      frames.push(JSON.parse(line) as Frame);
    } catch {
      // skip malformed lines — proxy writes one JSON per line so this
      // should never happen but be defensive.
    }
  }

  const pending = new Map<string | number, { call: Frame; toolName: string; args: unknown }>();
  const steps: TrajectoryStep[] = [];
  let stepIndex = 0;
  let actions = 0;
  let snapshots = 0;
  let screenshots = 0;
  let recoveries = 0;
  let errors = 0;
  let firstActionTs: number | null = null;

  for (const f of frames) {
    if (f.dir === "in") {
      const msg = f.raw as Record<string, unknown> | null;
      if (!msg || typeof msg !== "object") continue;
      if (msg.method !== "tools/call") continue;
      const id = msg.id as string | number | undefined;
      const params = msg.params as { name?: string; arguments?: unknown } | undefined;
      if (id === undefined || !params?.name) continue;
      pending.set(id, { call: f, toolName: params.name, args: params.arguments });
    } else if (f.dir === "out") {
      const msg = f.raw as Record<string, unknown> | null;
      if (!msg || typeof msg !== "object") continue;
      const id = msg.id as string | number | undefined;
      if (id === undefined) continue;
      const match = pending.get(id);
      if (!match) continue;
      pending.delete(id);

      const isErr = msg.error !== undefined;
      const stepStartTs = new Date(match.call.t).getTime();
      const stepEndTs = new Date(f.t).getTime();
      stepIndex++;

      const result = msg.result as { content?: Array<{ type?: string; text?: string }> } | undefined;
      const aria_snapshot =
        SNAPSHOT_TOOLS.has(match.toolName) && result?.content
          ? result.content.find((c) => c.type === "text")?.text ?? null
          : null;
      const result_summary = isErr
        ? typeof (msg.error as { message?: string })?.message === "string"
          ? ((msg.error as { message: string }).message)
          : "error"
        : summarizeResult(match.toolName, result);

      steps.push({
        step_index: stepIndex,
        direction: isErr ? "error" : "result",
        tool_name: match.toolName,
        args: match.args ?? null,
        result_summary,
        aria_snapshot,
        url_after: extractUrlAfter(match.toolName, match.args),
        duration_ms: Math.max(0, stepEndTs - stepStartTs),
      });

      if (isErr) errors++;
      if (SNAPSHOT_TOOLS.has(match.toolName)) snapshots++;
      if (SCREENSHOT_TOOLS.has(match.toolName)) screenshots++;
      if (RECOVERY_TOOLS.has(match.toolName)) recoveries++;
      if (ACTION_TOOLS.has(match.toolName)) {
        actions++;
        if (firstActionTs === null) firstActionTs = stepStartTs;
      }
    }
  }

  return {
    steps,
    metrics: {
      actual_tool_calls: steps.length,
      snapshots,
      actions,
      screenshots,
      snapshots_per_action: actions > 0 ? Number((snapshots / actions).toFixed(2)) : null,
      recovery_count: recoveries,
      errors,
      time_to_first_action_ms:
        firstActionTs !== null ? firstActionTs - walkStartedAt.getTime() : null,
      parsed_at: new Date().toISOString(),
    },
  };
}

function summarizeResult(
  toolName: string,
  result: { content?: Array<{ type?: string; text?: string }> } | undefined,
): string | null {
  if (!result?.content) return null;
  const text = result.content.find((c) => c.type === "text")?.text;
  if (!text) return null;
  if (SNAPSHOT_TOOLS.has(toolName)) return `${text.length.toLocaleString()} chars`;
  return text.length > 140 ? text.slice(0, 137) + "…" : text;
}

function extractUrlAfter(toolName: string, args: unknown): string | null {
  if (toolName !== "browser_navigate") return null;
  if (!args || typeof args !== "object") return null;
  const url = (args as Record<string, unknown>).url;
  return typeof url === "string" ? url : null;
}
