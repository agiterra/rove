import { describe, expect, it } from "vitest";
import type { Finding } from "@tankloop/agentic-ux-evaluator-core";
import { computeContentHash } from "../supabase/content-hash.js";

function f(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "finding-1",
    severity: "major",
    title: "Sign-in form lacks visible labels",
    description: "...",
    screenshots: [],
    ...overrides,
  };
}

describe("computeContentHash", () => {
  it("is deterministic for the same inputs", () => {
    const a = computeContentHash("scheduling.create_job", f());
    const b = computeContentHash("scheduling.create_job", f());
    expect(a).toBe(b);
  });

  it("differs when the flow id changes", () => {
    expect(computeContentHash("scheduling.create_job", f())).not.toBe(
      computeContentHash("billing.invoice", f()),
    );
  });

  it("differs when severity changes", () => {
    expect(computeContentHash("x", f({ severity: "major" }))).not.toBe(
      computeContentHash("x", f({ severity: "critical" })),
    );
  });

  it("is insensitive to title casing, trailing punctuation, and extra whitespace", () => {
    const base = computeContentHash("x", f({ title: "Sign-in form lacks visible labels" }));
    expect(computeContentHash("x", f({ title: "  Sign-In Form Lacks Visible Labels  " }))).toBe(
      base,
    );
    expect(computeContentHash("x", f({ title: "Sign-in form lacks visible labels." }))).toBe(base);
    expect(computeContentHash("x", f({ title: "Sign-in   form lacks  visible labels" }))).toBe(
      base,
    );
  });

  it("differs when the substantive title changes", () => {
    expect(computeContentHash("x", f({ title: "Sign-in form lacks labels" }))).not.toBe(
      computeContentHash("x", f({ title: "Sign-in form lacks contrast" })),
    );
  });
});
