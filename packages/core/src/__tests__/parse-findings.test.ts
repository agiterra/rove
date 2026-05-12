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

  it("parses a payload with reflection.goal_reached and exposes the boolean", () => {
    const payload = { ...VALID_PAYLOAD, reflection: { goal_reached: false } };
    const result = parseFindings(wrap(payload));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.reflection?.goal_reached).toBe(false);
  });

  it("accepts a payload without reflection (pre-rollout walks)", () => {
    const result = parseFindings(wrap(VALID_PAYLOAD));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.reflection).toBeUndefined();
  });

  it("parses a full payload with plan, surprises, and extended reflection", () => {
    const payload = {
      ...VALID_PAYLOAD,
      plan: {
        expected_path: [
          { step: 1, description: "Click 'New job'", expected_affordance: "button name='New job'" },
          { step: 2, description: "Pick a property" },
        ],
        expected_step_count: 4,
        expected_minutes: 2,
        biggest_worry: "Property picker may not search by partial name.",
        authored_before_browser_open: true as const,
      },
      surprises: [
        {
          kind: "affordance_missing" as const,
          step_index: 1,
          expected: "Primary CTA visible",
          observed: "Hidden behind a kebab",
          recovered: true,
          recovery_cost_steps: 2,
        },
      ],
      reflection: {
        goal_reached: true,
        actual_step_count: 7,
        largest_expectation_gap: "Discovery of the CTA took four clicks.",
        confidence_persona_would_succeed: 0.55,
      },
    };
    const result = parseFindings(wrap(payload));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.plan?.expected_step_count).toBe(4);
    expect(result.data.surprises).toHaveLength(1);
    expect(result.data.surprises[0].kind).toBe("affordance_missing");
    expect(result.data.reflection?.confidence_persona_would_succeed).toBe(0.55);
  });

  it("rejects a plan whose authored_before_browser_open is false", () => {
    const payload = {
      ...VALID_PAYLOAD,
      plan: {
        expected_path: [{ step: 1, description: "Click X" }],
        expected_step_count: 1,
        authored_before_browser_open: false,
      },
    };
    const result = parseFindings(wrap(payload));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("schema_mismatch");
  });

  it("parses a change_review payload with design_contract and deltas", () => {
    const payload = {
      flow_id: "change_review:/flows/new",
      persona_id: "first_time_user",
      summary: "Reviewed /flows/new against /flows.",
      change_review: {
        changed_routes: ["/flows/new"],
        reference_routes: ["/flows"],
        design_contract: {
          layout_pattern: "app shell with left nav",
          primary_action_pattern: "top-right filled button",
          derived_from: {
            layout_pattern: "/flows",
            primary_action_pattern: "/flows",
          },
        },
        deltas: [
          {
            kind: "change.primary_action_confusion" as const,
            expected: "Top-right filled 'Save' button",
            observed: "Centered Submit link",
            why_it_matters: "First-time users scan top-right.",
            step_index: 2,
            severity: "major" as const,
          },
        ],
      },
      reflection: { goal_reached: false, confidence_persona_would_succeed: 0.3 },
      findings: [
        {
          id: "f1",
          severity: "major" as const,
          title: "Primary save action subordinate",
          description: "—",
          step_index: 2,
          heuristic: "change.primary_action_confusion",
        },
      ],
    };
    const result = parseFindings(wrap(payload));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.change_review?.changed_routes).toEqual(["/flows/new"]);
    expect(result.data.change_review?.deltas).toHaveLength(1);
    expect(result.data.change_review?.deltas[0].kind).toBe("change.primary_action_confusion");
    expect(result.data.change_review?.design_contract.layout_pattern).toContain("app shell");
  });

  it("rejects a change_review with an unknown delta kind", () => {
    const payload = {
      flow_id: "change_review:/x",
      persona_id: "first_time_user",
      change_review: {
        changed_routes: ["/x"],
        reference_routes: [],
        design_contract: {},
        deltas: [
          {
            kind: "change.something_made_up",
            expected: "x",
            observed: "y",
            why_it_matters: "z",
          },
        ],
      },
      findings: [],
    };
    const result = parseFindings(wrap(payload));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("schema_mismatch");
  });

  it("defaults surprises to empty array when omitted", () => {
    const result = parseFindings(wrap(VALID_PAYLOAD));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.surprises).toEqual([]);
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
