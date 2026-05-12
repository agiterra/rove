import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { findingsPayloadSchema, type FindingSeverity } from "@tankloop/agentic-ux-evaluator-core";
import { createSinks, type SinkId } from "../factories.js";
import { renderSinkResult, routeToSinks } from "../sinks/route.js";
import type { ResolvedWorkspace } from "../workspace.js";

export interface IngestOptions {
  filePath: string;
  sinks: SinkId[];
  ghMinSeverity?: FindingSeverity;
  ghDryRun: boolean;
  /** Dispatcher id to record in the sink output. Defaults to "manual-ingest". */
  dispatcherId?: string;
}

export async function runIngestCommand(
  ws: ResolvedWorkspace,
  opts: IngestOptions,
): Promise<number> {
  let raw: string;
  try {
    raw = await readFile(opts.filePath, "utf8");
  } catch (err) {
    console.error(`✗ Could not read ${opts.filePath}: ${err instanceof Error ? err.message : err}`);
    return 1;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (err) {
    console.error(`✗ Not valid JSON: ${err instanceof Error ? err.message : err}`);
    return 1;
  }

  const validation = findingsPayloadSchema.safeParse(parsedJson);
  if (!validation.success) {
    console.error(`✗ Findings payload schema mismatch: ${validation.error.message}`);
    return 1;
  }

  const now = new Date();
  const runId = randomUUID();
  // Ingest has no in-progress walk to stage screenshots from. Create an empty
  // dir at the same conventional path so sinks that resolve screenshot paths
  // don't trip on a missing directory.
  const screenshotsDir = join(ws.reportsDir, "agentic-walks", runId, "screenshots");
  await mkdir(screenshotsDir, { recursive: true });

  const sinks = createSinks(opts.sinks, ws, {
    ghMinSeverity: opts.ghMinSeverity,
    ghDryRun: opts.ghDryRun,
  });
  const results = await routeToSinks(sinks, {
    payload: validation.data,
    runId,
    dispatcherId: opts.dispatcherId ?? "manual-ingest",
    startedAt: now,
    finishedAt: now,
    rawStdout: raw,
    screenshotsDir,
  });
  for (let i = 0; i < sinks.length; i++) {
    console.log(renderSinkResult(sinks[i].label, results[i]));
  }
  return results.every((r) => r.ok) ? 0 : 1;
}
