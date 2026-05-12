import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverFlows, parseFlowFile } from "../flows.js";

describe("parseFlowFile", () => {
  it("extracts unquoted flow_id and quoted goal", () => {
    const content = [
      "flow_id: scheduling.create_job.dispatcher",
      'goal: "Create a PUMPING job for an existing property"',
      "entry_route: /admin/scheduling",
    ].join("\n");
    const info = parseFlowFile(content, "/repo/flows/scheduling.flow.yaml");
    expect(info.flowId).toBe("scheduling.create_job.dispatcher");
    expect(info.goal).toBe("Create a PUMPING job for an existing property");
    expect(info.filePath).toBe("/repo/flows/scheduling.flow.yaml");
  });

  it("falls back when flow_id or goal are missing", () => {
    const info = parseFlowFile("# empty file\n", "/x.flow.yaml");
    expect(info.flowId).toBe("unknown");
    expect(info.goal).toBe("(no goal found)");
  });
});

describe("discoverFlows", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "evaluator-core-flows-"));
    await writeFile(join(dir, "a.flow.yaml"), 'flow_id: alpha\ngoal: "Walk A"\n', "utf8");
    await writeFile(join(dir, "b.flow.yaml"), 'flow_id: beta\ngoal: "Walk B"\n', "utf8");
    // Should be ignored — wrong suffix
    await writeFile(join(dir, "notes.md"), "# not a flow\n", "utf8");
    // Duplicate flow_id — first wins
    await writeFile(
      join(dir, "a-dup.flow.yaml"),
      'flow_id: alpha\ngoal: "Different goal text"\n',
      "utf8",
    );
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns one FlowInfo per unique flow_id", async () => {
    const infos = await discoverFlows(dir);
    const ids = infos.map((i) => i.flowId).sort();
    expect(ids).toEqual(["alpha", "beta"]);
  });

  it("returns [] when the directory does not exist", async () => {
    const infos = await discoverFlows(join(dir, "does-not-exist"));
    expect(infos).toEqual([]);
  });
});
