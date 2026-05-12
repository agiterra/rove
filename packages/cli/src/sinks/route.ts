import type {
  FindingsPayload,
  SinkAdapter,
  SinkInput,
  SinkResult,
} from "@agiterra/rove-core";

export type RouteToSinksInput = SinkInput;

// Re-exported so callers building one don't need to know the field by field
// shape lives in core. Keep here for clarity if you grep this file.
export type { FindingsPayload };

/**
 * Run every sink against the payload. Each sink's errors are isolated —
 * one sink failing does not block the others. Caller renders the results.
 */
export async function routeToSinks(
  sinks: SinkAdapter[],
  input: RouteToSinksInput,
): Promise<SinkResult[]> {
  const results: SinkResult[] = [];
  for (const sink of sinks) {
    try {
      results.push(await sink.route(input));
    } catch (err) {
      results.push({
        sinkId: sink.id,
        routedCount: 0,
        skippedCount: 0,
        artifacts: [],
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

export function renderSinkResult(label: string, result: SinkResult): string {
  const icon = result.ok ? "✓" : "✗";
  const artifacts = result.artifacts.join(", ") || "(no artifacts)";
  const tail = result.error ? ` — ${result.error}` : "";
  return (
    `${icon} ${label}: ${result.routedCount} routed, ` +
    `${result.skippedCount} skipped, ${artifacts}${tail}`
  );
}
