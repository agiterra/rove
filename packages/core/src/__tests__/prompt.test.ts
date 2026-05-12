import { describe, it, expect } from "vitest";
import { buildWalkPrompt, FINDINGS_START_MARKER, FINDINGS_END_MARKER } from "../prompt.js";
import { BUILT_IN_PERSONAS } from "../personas/built-in.js";
import type { FlowInfo, Persona } from "../types.js";

const FLOW: FlowInfo = {
  flowId: "scheduling.create_job.dispatcher",
  goal: "Create a PUMPING job for an existing property",
  filePath: "/repo/e2e/ui-overhaul/agentic/flows/scheduling-create-job.flow.yaml",
};

const NOVICE = BUILT_IN_PERSONAS.find((p) => p.id === "dispatcher_novice") as Persona;

describe("buildWalkPrompt", () => {
  it("includes flow id, goal, persona id and label", () => {
    const out = buildWalkPrompt({
      flow: FLOW,
      goal: FLOW.goal,
      persona: NOVICE,
      workspacePath: "/repo",
    });
    expect(out).toContain(FLOW.flowId);
    expect(out).toContain(FLOW.goal);
    expect(out).toContain(NOVICE.id);
    expect(out).toContain(NOVICE.label);
    expect(out).toContain(NOVICE.promptAddendum);
  });

  it("emits persona constraints inline so the agent sees them as text", () => {
    const out = buildWalkPrompt({
      flow: FLOW,
      goal: FLOW.goal,
      persona: NOVICE,
      workspacePath: "/repo",
    });
    expect(out).toContain("shortcuts_allowed=false");
    expect(out).toContain("retries_per_step=1");
  });

  it("uses mcp__playwright__browser_* by default", () => {
    const out = buildWalkPrompt({
      flow: FLOW,
      goal: FLOW.goal,
      persona: NOVICE,
      workspacePath: "/repo",
    });
    expect(out).toContain("mcp__playwright__browser_");
    expect(out).not.toContain("mcp__playwright-test__browser_");
  });

  it("switches to mcp__playwright-test__browser_* when host requires it", () => {
    const out = buildWalkPrompt({
      flow: FLOW,
      goal: FLOW.goal,
      persona: NOVICE,
      workspacePath: "/repo",
      mcpToolPrefix: "playwright-test",
    });
    expect(out).toContain("mcp__playwright-test__browser_");
    expect(out).not.toMatch(/mcp__playwright__browser_/);
  });

  it("declares the findings JSON markers exactly once each", () => {
    const out = buildWalkPrompt({
      flow: FLOW,
      goal: FLOW.goal,
      persona: NOVICE,
      workspacePath: "/repo",
    });
    expect(occurrences(out, FINDINGS_START_MARKER)).toBe(1);
    expect(occurrences(out, FINDINGS_END_MARKER)).toBe(1);
  });

  it("does NOT instruct the agent to call any tracker MCP tool", () => {
    const out = buildWalkPrompt({
      flow: FLOW,
      goal: FLOW.goal,
      persona: NOVICE,
      workspacePath: "/repo",
    });
    expect(out).not.toMatch(/mcp__nimbalyst-mcp__/);
    expect(out).not.toMatch(/tracker_create/);
  });

  it("appends per-run notes when provided", () => {
    const out = buildWalkPrompt({
      flow: FLOW,
      goal: FLOW.goal,
      persona: NOVICE,
      notes: "Focus only on the property combobox affordances.",
      workspacePath: "/repo",
    });
    expect(out).toContain("Focus only on the property combobox affordances.");
  });
});

function occurrences(haystack: string, needle: string): number {
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}
