import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FlowInfo } from "./types.js";

const FLOW_FILE_SUFFIX = ".flow.yaml";

/**
 * Discover every `*.flow.yaml` file under the given directory and return its
 * parsed FlowInfo. Currently matches the extension's behavior: regex-extract
 * `flow_id:` and `goal:` from the file head. We do NOT pull a full YAML
 * parser in core — the harness consumes the rich structure separately.
 */
export async function discoverFlows(flowsDir: string): Promise<FlowInfo[]> {
  let entries: string[];
  try {
    entries = await readdir(flowsDir);
  } catch {
    return [];
  }

  const flowFiles = entries.filter((name) => name.endsWith(FLOW_FILE_SUFFIX));

  const infos: FlowInfo[] = [];
  for (const name of flowFiles) {
    const filePath = join(flowsDir, name);
    try {
      const content = await readFile(filePath, "utf8");
      infos.push(parseFlowFile(content, filePath));
    } catch {
      // Skip unreadable / malformed files. The CLI's `doctor` command can
      // surface these separately if needed.
    }
  }

  return dedupeByFlowId(infos);
}

export function parseFlowFile(content: string, filePath: string): FlowInfo {
  return {
    flowId: extractScalar(content, "flow_id") ?? "unknown",
    goal: extractScalar(content, "goal") ?? "(no goal found)",
    filePath,
  };
}

function extractScalar(content: string, key: string): string | null {
  // Matches  `key: value`  or  `key: "value"`  at the start of a line.
  const pattern = new RegExp(`^${key}:\\s*"?(.+?)"?\\s*$`, "m");
  return content.match(pattern)?.[1]?.trim() ?? null;
}

function dedupeByFlowId(infos: FlowInfo[]): FlowInfo[] {
  const seen = new Map<string, FlowInfo>();
  for (const info of infos) {
    if (!seen.has(info.flowId)) seen.set(info.flowId, info);
  }
  return Array.from(seen.values());
}
