import { describe, it, expect } from "vitest";
import { parseFindings } from "../parse-findings.js";
import { FINDINGS_START_MARKER, FINDINGS_END_MARKER } from "../prompt.js";

function wrap(payload: unknown): string {
  return [
    "I have enough data to compile findings.",
    "",
    FINDINGS_START_MARKER,
    JSON.stringify(payload, null, 2),
    FINDINGS_END_MARKER,
  ].join("\n");
}

const VALID_PAYLOAD = {
  flow_id: "scheduling.create_job.dispatcher",
  persona_id: "dispatcher_novice",
  walked_url: "http://localhost:3000/admin/scheduling",
  summary: "Entry route bounced to sign-in; evaluated login UX.",
  findings: [
    {
      id: "finding-1",
      severity: "critical",
      title: "Entry route requires auth",
      description: "Redirects to /auth/login immediately.",
      step_index: 1,
      heuristic: "nielsen-1",
      evidence: "http://localhost:3000/auth/login?error=authentication_required",
    },
  ],
};

describe("parseFindings", () => {
  it("extracts a well-formed JSON payload", () => {
    const result = parseFindings(wrap(VALID_PAYLOAD));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.flow_id).toBe(VALID_PAYLOAD.flow_id);
    expect(result.data.findings).toHaveLength(1);
    expect(result.data.findings[0].severity).toBe("critical");
  });

  it("accepts an empty findings array (agent found nothing)", () => {
    const empty = { ...VALID_PAYLOAD, findings: [] };
    const result = parseFindings(wrap(empty));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.findings).toEqual([]);
  });

  it("returns no_start_marker when the marker is absent", () => {
    const result = parseFindings("just some prose, no markers here.");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no_start_marker");
  });

  it("returns no_end_marker when only the opener is present", () => {
    const stdout = `${FINDINGS_START_MARKER}\n{"flow_id":"x"}`;
    const result = parseFindings(stdout);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no_end_marker");
  });

  it("returns invalid_json when the payload is malformed", () => {
    const stdout = [FINDINGS_START_MARKER, "{ flow_id: not json }", FINDINGS_END_MARKER].join("\n");
    const result = parseFindings(stdout);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid_json");
    expect(result.detail).toBeTruthy();
  });

  it("returns schema_mismatch when severity is not a known value", () => {
    const bad = {
      ...VALID_PAYLOAD,
      findings: [{ ...VALID_PAYLOAD.findings[0], severity: "blocker" }],
    };
    const result = parseFindings(wrap(bad));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("schema_mismatch");
  });

  it("uses the LAST occurrence of the start marker (ignores the prompt's own example)", () => {
    // The agent may echo the prompt's format example before its real output.
    // Make sure we take the real payload, not the example.
    const stdout = [
      "Here is the format I will use:",
      FINDINGS_START_MARKER,
      "{ ...example...",
      FINDINGS_END_MARKER,
      "Now my actual output:",
      FINDINGS_START_MARKER,
      JSON.stringify(VALID_PAYLOAD),
      FINDINGS_END_MARKER,
    ].join("\n");
    const result = parseFindings(stdout);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.findings[0].id).toBe("finding-1");
  });

  it("parses the real Phase 0 spike transcript shape", () => {
    // Mirrors the structure of /tmp/walk-transcript.txt produced by the spike.
    const payload = {
      flow_id: "scheduling.create_job.dispatcher",
      persona_id: "dispatcher_novice",
      walked_url: "http://localhost:3000/admin/scheduling",
      summary: "Bounced to sign-in.",
      findings: [
        { id: "f1", severity: "critical", title: "T", description: "D" },
        { id: "f2", severity: "major", title: "T", description: "D" },
        { id: "f3", severity: "minor", title: "T", description: "D" },
        { id: "f4", severity: "nit", title: "T", description: "D" },
      ],
    };
    const result = parseFindings(wrap(payload));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.findings.map((f) => f.severity).sort()).toEqual([
      "critical",
      "major",
      "minor",
      "nit",
    ]);
  });
});
