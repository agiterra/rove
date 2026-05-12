import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runIngestCommand } from "../commands/ingest.js";
import type { ResolvedWorkspace } from "../workspace.js";

const PAYLOAD = {
  flow_id: "scheduling.create_job.dispatcher",
  persona_id: "dispatcher_novice",
  summary: "Ingest test payload.",
  findings: [{ id: "f1", severity: "minor", title: "Tiny issue", description: "Body." }],
};

describe("runIngestCommand", () => {
  let dir: string;
  let ws: ResolvedWorkspace;
  let payloadFile: string;
  let badJsonFile: string;
  let badSchemaFile: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "rove-ingest-"));
    ws = {
      rootDir: dir,
      flowsDir: join(dir, "flows"),
      reportsDir: join(dir, "reports"),
    };
    payloadFile = join(dir, "findings.json");
    await writeFile(payloadFile, JSON.stringify(PAYLOAD), "utf8");
    badJsonFile = join(dir, "bad.json");
    await writeFile(badJsonFile, "{not json", "utf8");
    badSchemaFile = join(dir, "schema.json");
    await writeFile(badSchemaFile, JSON.stringify({ flow_id: 1 }), "utf8");
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("routes a valid payload through the markdown sink", async () => {
    const code = await runIngestCommand(ws, {
      filePath: payloadFile,
      sinks: ["markdown"],
      ghDryRun: true,
    });
    expect(code).toBe(0);
    // agentic-walks now contains both the markdown file AND a per-run
    // screenshots dir (ingest stages an empty one for sink consistency).
    const written = await readdir(join(ws.reportsDir, "agentic-walks"));
    const mdFiles = written.filter((n) => n.endsWith(".md"));
    expect(mdFiles).toHaveLength(1);
  });

  it("returns 1 on missing file", async () => {
    const code = await runIngestCommand(ws, {
      filePath: join(dir, "nope.json"),
      sinks: ["markdown"],
      ghDryRun: true,
    });
    expect(code).toBe(1);
  });

  it("returns 1 on malformed JSON", async () => {
    const code = await runIngestCommand(ws, {
      filePath: badJsonFile,
      sinks: ["markdown"],
      ghDryRun: true,
    });
    expect(code).toBe(1);
  });

  it("returns 1 when schema validation fails", async () => {
    const code = await runIngestCommand(ws, {
      filePath: badSchemaFile,
      sinks: ["markdown"],
      ghDryRun: true,
    });
    expect(code).toBe(1);
  });
});
