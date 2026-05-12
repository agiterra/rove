import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { FindingsPayload } from "@rove/core";
import { MarkdownSink } from "../sinks/markdown.js";

const PAYLOAD: FindingsPayload = {
  flow_id: "scheduling.create_job.dispatcher",
  persona_id: "dispatcher_novice",
  walked_url: "http://localhost:3000/admin/scheduling",
  summary: "Bounced to sign-in; evaluated login UX.",
  findings: [
    {
      id: "f1",
      severity: "critical",
      title: "Entry route requires auth",
      description: "Redirects to /auth/login immediately.",
      step_index: 1,
      heuristic: "nielsen-1",
      evidence: "http://localhost:3000/auth/login",
    },
    {
      id: "f2",
      severity: "minor",
      title: "Inputs use placeholder-as-label",
      description: "Form fields lack <label> elements.",
      heuristic: "wcag-1.3.1",
    },
  ],
};

describe("MarkdownSink", () => {
  let reportsDir: string;
  beforeAll(async () => {
    reportsDir = await mkdtemp(join(tmpdir(), "rove-md-sink-"));
  });
  afterAll(async () => {
    await rm(reportsDir, { recursive: true, force: true });
  });

  it("writes one Markdown file with severity groupings", async () => {
    const sink = new MarkdownSink(reportsDir);
    const startedAt = new Date("2026-05-11T10:00:00Z");
    const finishedAt = new Date("2026-05-11T10:03:00Z");

    const out = await sink.route({
      payload: PAYLOAD,
      dispatcherId: "claude-code-cli",
      startedAt,
      finishedAt,
      rawStdout: "",
    });

    expect(out.ok).toBe(true);
    expect(out.routedCount).toBe(2);
    expect(out.artifacts).toHaveLength(1);

    const written = await readdir(join(reportsDir, "agentic-walks"));
    expect(written).toHaveLength(1);

    const md = await readFile(out.artifacts[0], "utf8");
    expect(md).toContain("# Agentic UX Walk — scheduling.create_job.dispatcher");
    expect(md).toContain("- **Persona**: dispatcher_novice");
    expect(md).toContain("- **Dispatcher**: claude-code-cli");
    expect(md).toContain("### critical (1)");
    expect(md).toContain("### minor (1)");
    expect(md).toContain("Entry route requires auth");
    expect(md).toContain("Inputs use placeholder-as-label");
    expect(md).toContain("heuristic: `nielsen-1`");
    expect(md).not.toContain("### major");
    expect(md).not.toContain("### nit");
  });

  it("returns a sanitized filename safe for the filesystem", async () => {
    const sink = new MarkdownSink(reportsDir);
    const out = await sink.route({
      payload: { ...PAYLOAD, flow_id: "weird/id with spaces" },
      dispatcherId: "claude-code-cli",
      startedAt: new Date(),
      finishedAt: new Date(),
      rawStdout: "",
    });
    const name = basename(out.artifacts[0]);
    expect(name).not.toMatch(/[\s/]/);
    expect(name).toMatch(/weird-id-with-spaces/);
  });
});
