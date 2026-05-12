import { describe, it, expect } from "vitest";
import { parseTrajectoryLog } from "../mcp-proxy/parse-log.js";

function frame(dir: "in" | "out" | "err", payload: unknown, tISO: string): string {
  return JSON.stringify({ t: tISO, dir, raw: payload });
}

describe("parseTrajectoryLog", () => {
  const start = new Date("2026-05-12T20:00:00.000Z");

  it("pairs requests with responses by id and emits one step per pair", () => {
    const lines = [
      frame(
        "in",
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "browser_navigate", arguments: { url: "http://x" } } },
        "2026-05-12T20:00:01.000Z",
      ),
      frame(
        "out",
        { jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "ok" }] } },
        "2026-05-12T20:00:01.500Z",
      ),
      frame(
        "in",
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "browser_snapshot", arguments: {} } },
        "2026-05-12T20:00:02.000Z",
      ),
      frame(
        "out",
        { jsonrpc: "2.0", id: 2, result: { content: [{ type: "text", text: "yaml: page snapshot here" }] } },
        "2026-05-12T20:00:02.500Z",
      ),
    ].join("\n");

    const { steps, metrics } = parseTrajectoryLog(lines, start);

    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({
      step_index: 1,
      direction: "result",
      tool_name: "browser_navigate",
      url_after: "http://x",
      duration_ms: 500,
    });
    expect(steps[1]).toMatchObject({
      step_index: 2,
      direction: "result",
      tool_name: "browser_snapshot",
    });
    expect(steps[1].aria_snapshot).toBe("yaml: page snapshot here");
    expect(metrics.actual_tool_calls).toBe(2);
    expect(metrics.actions).toBe(1);
    expect(metrics.snapshots).toBe(1);
    expect(metrics.snapshots_per_action).toBe(1);
    expect(metrics.errors).toBe(0);
    expect(metrics.time_to_first_action_ms).toBe(1000);
  });

  it("marks errored responses as direction=error and increments the metric", () => {
    const lines = [
      frame(
        "in",
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "browser_click", arguments: { ref: "e7" } } },
        "2026-05-12T20:00:01.000Z",
      ),
      frame(
        "out",
        { jsonrpc: "2.0", id: 1, error: { message: "element not found" } },
        "2026-05-12T20:00:01.100Z",
      ),
    ].join("\n");

    const { steps, metrics } = parseTrajectoryLog(lines, start);
    expect(steps[0].direction).toBe("error");
    expect(steps[0].result_summary).toBe("element not found");
    expect(metrics.errors).toBe(1);
  });

  it("ignores non-tool-call methods and malformed lines", () => {
    const lines = [
      "{ this is not json",
      frame("in", { jsonrpc: "2.0", id: 99, method: "initialize" }, "2026-05-12T20:00:00.000Z"),
      frame(
        "in",
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "browser_navigate", arguments: {} } },
        "2026-05-12T20:00:01.000Z",
      ),
      frame("out", { jsonrpc: "2.0", id: 1, result: { content: [] } }, "2026-05-12T20:00:01.100Z"),
    ].join("\n");

    const { steps, metrics } = parseTrajectoryLog(lines, start);
    expect(steps).toHaveLength(1);
    expect(metrics.actual_tool_calls).toBe(1);
  });

  it("counts navigate_back as a recovery", () => {
    const lines = [
      frame(
        "in",
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "browser_navigate_back", arguments: {} } },
        "2026-05-12T20:00:01.000Z",
      ),
      frame("out", { jsonrpc: "2.0", id: 1, result: { content: [] } }, "2026-05-12T20:00:01.050Z"),
    ].join("\n");
    const { metrics } = parseTrajectoryLog(lines, start);
    expect(metrics.recovery_count).toBe(1);
    expect(metrics.actions).toBe(1);
  });

  it("returns empty metrics when the log has no usable frames", () => {
    const { steps, metrics } = parseTrajectoryLog("", start);
    expect(steps).toHaveLength(0);
    expect(metrics.actual_tool_calls).toBe(0);
    expect(metrics.snapshots_per_action).toBeNull();
    expect(metrics.time_to_first_action_ms).toBeNull();
  });
});
