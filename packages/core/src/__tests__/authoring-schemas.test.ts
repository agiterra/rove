import { describe, it, expect } from "vitest";
import { flowDraftWithKeyboardNavSchema } from "../authoring-schemas.js";

const BASE = {
  flow_id: "test.action.persona",
  goal: "Walk the keyboard path through the form",
  entry_route: "/dashboard",
  success_criteria: ["Submit succeeds via Enter key"],
};

describe("flowDraftWithKeyboardNavSchema", () => {
  it("accepts a flow without expected_keyboard_navigation", () => {
    const r = flowDraftWithKeyboardNavSchema.safeParse(BASE);
    expect(r.success).toBe(true);
  });

  it("accepts a flow with a populated expected_keyboard_navigation", () => {
    const r = flowDraftWithKeyboardNavSchema.safeParse({
      ...BASE,
      expected_keyboard_navigation: [
        { from_selector: "#email", to_selector: "#password", description: "email → password" },
        { from_selector: "#password", to_selector: "button[type=submit]" },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("accepts an empty expected_keyboard_navigation array", () => {
    const r = flowDraftWithKeyboardNavSchema.safeParse({
      ...BASE,
      expected_keyboard_navigation: [],
    });
    expect(r.success).toBe(true);
  });

  it("rejects an empty selector", () => {
    const r = flowDraftWithKeyboardNavSchema.safeParse({
      ...BASE,
      expected_keyboard_navigation: [{ from_selector: "", to_selector: "#foo" }],
    });
    expect(r.success).toBe(false);
  });
});
