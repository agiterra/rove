import { describe, it, expect } from "vitest";
import { parseDispatcherId, parseSinkIds, parseSeverity } from "../factories.js";

describe("parseDispatcherId", () => {
  it("accepts known dispatcher ids", () => {
    expect(parseDispatcherId("claude-code")).toBe("claude-code");
    expect(parseDispatcherId("codex")).toBe("codex");
  });
  it("rejects unknown", () => {
    expect(() => parseDispatcherId("aider")).toThrow(/Unknown dispatcher/);
  });
});

describe("parseSinkIds", () => {
  it("parses comma-separated list with whitespace tolerance", () => {
    expect(parseSinkIds("markdown, github-issues")).toEqual(["markdown", "github-issues"]);
  });
  it("rejects unknown sink ids", () => {
    expect(() => parseSinkIds("plane")).toThrow(/Unknown sink/);
  });
  it("dedups nothing — order is preserved", () => {
    expect(parseSinkIds("github-issues,markdown")).toEqual(["github-issues", "markdown"]);
  });
});

describe("parseSeverity", () => {
  it("accepts the four canonical severities", () => {
    expect(parseSeverity("critical")).toBe("critical");
    expect(parseSeverity("major")).toBe("major");
    expect(parseSeverity("minor")).toBe("minor");
    expect(parseSeverity("nit")).toBe("nit");
  });
  it("rejects unknown severities", () => {
    expect(() => parseSeverity("blocker")).toThrow(/Unknown severity/);
  });
});
