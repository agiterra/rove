// Change-review prompt. The reviewer first samples nearby reference routes,
// synthesizes a local design contract, then walks the changed route as the
// chosen persona and reports coherence deltas.
import type { Persona } from "./types.js";
import { FINDINGS_END_MARKER, FINDINGS_START_MARKER } from "./prompt.js";

export interface BuildChangeReviewPromptInput {
  changedRoutes: string[];
  referenceRoutes: string[];
  goal: string;
  persona: Persona;
  targetUrl: string;
  notes?: string;
  screenshotsDir?: string;
  mcpToolPrefix?: "playwright" | "playwright-test";
  maxBrowserCalls?: number;
  maxWalkMinutes?: number;
  /** Same isolation contract as a regular agent walk — no source-read. */
  isolated?: boolean;
}

export function buildChangeReviewPrompt(input: BuildChangeReviewPromptInput): string {
  const {
    changedRoutes,
    referenceRoutes,
    goal,
    persona,
    targetUrl,
    notes = "",
    screenshotsDir,
    mcpToolPrefix = "playwright",
    maxBrowserCalls = 35,
    maxWalkMinutes = 6,
    isolated = true,
  } = input;

  const toolPrefix = `mcp__${mcpToolPrefix}__browser_`;
  const c = persona.constraints;
  const refList = referenceRoutes.length > 0 ? referenceRoutes : ["(none provided)"];

  const lines: string[] = [
    `You are running a CHANGE REVIEW walk.`,
    ``,
    `Unlike a flow walk, your job is to evaluate whether a *changed* route fits the`,
    `product's existing patterns and lets the persona accomplish the stated goal.`,
    `Code-correctness is NOT your concern; you cannot read source. Product`,
    `coherence and goal-reachability are.`,
    ``,
    ...(isolated
      ? [
          `You have NO prior knowledge of this app's source code or prior screens.`,
          `Discover everything from the browser. The only way to learn anything`,
          `about this app is through ${toolPrefix}* tools.`,
          ``,
        ]
      : []),
    `Persona: ${persona.id} — ${persona.label} (${persona.category}, ${persona.expertise})`,
    `Persona behavior: ${persona.promptAddendum}`,
    `Persona constraints: ` +
      `shortcuts_allowed=${c.shortcuts_allowed}, ` +
      `hovers_allowed=${c.hovers_allowed}, ` +
      `keyboard_only=${c.keyboard_navigation_only ?? false}, ` +
      `retries_per_step=${c.retries_per_step}.`,
    ``,
    `Target origin: ${targetUrl}`,
    `Changed routes (the surfaces under review):`,
    ...changedRoutes.map((r) => `  - ${r}`),
    `Reference routes (nearby surfaces the contract is inferred from):`,
    ...refList.map((r) => `  - ${r}`),
    ``,
    `Persona goal at the changed route: ${goal}`,
    ``,
    `Phase 0 — REFERENCE SCAN.`,
    `For each reference route above, in order:`,
    `  1. ${toolPrefix}navigate to ${targetUrl}<reference route>.`,
    `  2. ${toolPrefix}snapshot to read the page.`,
    `  3. Note: layout (where is nav? where does primary content sit?),`,
    `     primary affordance position + style, form patterns (if any),`,
    `     success-state pattern (toast? redirect? new row?), density,`,
    `     and tone of copy.`,
    `Do NOT deep-walk reference routes. ~2–3 tool calls each is plenty.`,
    `If a reference route is unreachable (auth wall, 404, redirect), record`,
    `that — the contract is intentionally partial, not invented.`,
    ``,
    `Phase 1 — SYNTHESIZE THE CONTRACT.`,
    `Compose a design_contract describing the local pattern as you observed it.`,
    `Keep each field one short sentence. If you didn't see enough evidence`,
    `for a field, OMIT it — do not guess. For each field you fill in,`,
    `record which reference route it came from in derived_from.`,
    ``,
    `Phase 2 — WALK THE CHANGED ROUTE(S).`,
    `For each changed route:`,
    `  1. ${toolPrefix}navigate to ${targetUrl}<changed route>.`,
    `  2. Walk it as the persona, attempting the stated goal.`,
    `  3. Apply the same persona constraints as a flow walk.`,
    `  4. Take screenshots when a contract divergence is visually load-bearing.`,
    screenshotsDir
      ? `     Pass \`filename\` as a BARE basename — no slashes, no path segments.\n` +
        `     Examples: \`auth-wall.png\`, \`primary-action.png\`. Playwright MCP\n` +
        `     is already configured to save into the per-run screenshots dir;\n` +
        `     passing an absolute path mangles it and the file lands somewhere\n` +
        `     the CLI cannot find. Reference the same basename in the matching\n` +
        `     finding's \`screenshots\` array so the dashboard can render it.`
      : `     No screenshots dir was provided; reference image paths in \`evidence\` only.`,
    `Budget: ~${maxWalkMinutes} min, ≤ ${maxBrowserCalls} browser tool calls TOTAL`,
    `(reference scan + walk combined).`,
    ``,
    `Phase 3 — COMPARE.`,
    `Emit one delta per material divergence between the contract and what the`,
    `changed route shows. A delta is NOT a code review and NOT a Nielsen finding;`,
    `it is "the rest of the product does X here, this page does Y, and that`,
    `mismatch will confuse a real user trying to do <goal>." Categories:`,
    ``,
    `- change.navigation_mismatch — discoverable, but not from where users expect`,
    `  based on the reference routes.`,
    `- change.intent_mismatch — the implementation satisfies a plausible reading`,
    `  of the request, but not what a real user would mean by <goal>.`,
    `- change.design_incoherence — layout/density/visual hierarchy diverges`,
    `  from neighbors in a way that breaks the product's feel.`,
    `- change.pattern_drift — introduces a new interaction pattern where the`,
    `  reference routes already established a local convention.`,
    `- change.primary_action_confusion — main action exists but is visually`,
    `  or semantically subordinate to non-primary actions.`,
    `- change.copy_mismatch — labels/terminology diverge from the surrounding`,
    `  product vocabulary in a way that confuses identification.`,
    ``,
    `Each delta must also appear as a finding in findings[] with`,
    `heuristic = "<delta kind>" so the dedup + lifecycle pipeline works.`,
    ``,
    `OUTPUT FORMAT — VERY IMPORTANT.`,
    ``,
    `After all browser exploration is done, emit the JSON as the LAST thing in`,
    `your response. Use exactly this shape:`,
    ``,
    FINDINGS_START_MARKER,
    `{`,
    `  "flow_id": "change_review:${changedRoutes[0]}",`,
    `  "persona_id": "${persona.id}",`,
    `  "walked_url": "${targetUrl}${changedRoutes[0]}",`,
    `  "summary": "one paragraph: what you reviewed, what you concluded.",`,
    `  "reflection": {`,
    `    "goal_reached": false,`,
    `    "confidence_persona_would_succeed": 0.0`,
    `  },`,
    `  "change_review": {`,
    `    "changed_routes": ${JSON.stringify(changedRoutes)},`,
    `    "reference_routes": ${JSON.stringify(referenceRoutes)},`,
    `    "design_contract": {`,
    `      "layout_pattern": "…",`,
    `      "primary_action_pattern": "…",`,
    `      "form_pattern": "…",`,
    `      "success_pattern": "…",`,
    `      "navigation_pattern": "…",`,
    `      "density": "…",`,
    `      "tone": "…",`,
    `      "derived_from": { "layout_pattern": "/clients", "primary_action_pattern": "/clients/:id" }`,
    `    },`,
    `    "deltas": [`,
    `      {`,
    `        "kind": "change.primary_action_confusion",`,
    `        "expected": "Top-right filled 'Save' button matching /clients/:id",`,
    `        "observed": "Centered 'Submit' text-link below a marketing banner",`,
    `        "why_it_matters": "A first-time user scans the top-right edge first.",`,
    `        "step_index": 2,`,
    `        "severity": "major"`,
    `      }`,
    `    ]`,
    `  },`,
    `  "findings": [`,
    `    {`,
    `      "id": "finding-1",`,
    `      "severity": "major",`,
    `      "title": "Primary save action is visually subordinate",`,
    `      "description": "Mirrors the delta above; here for the lifecycle pipeline.",`,
    `      "step_index": 2,`,
    `      "heuristic": "change.primary_action_confusion",`,
    `      "evidence": "compared to /clients/:id",`,
    `      "screenshots": [`,
    `        { "path": "step2-primary-action.png", "caption": "what this shows" }`,
    `      ]`,
    `    }`,
    `  ],`,
    `  "affordance_gaps": [`,
    `    {`,
    `      "kind": "delete",`,
    `      "severity": "minor",`,
    `      "step_index": 2,`,
    `      "url_pattern": "/flows/new",`,
    `      "expected_for": "user wanting to clear a half-typed flow draft",`,
    `      "evidence": "form exposes Submit and Cancel but no Reset / Discard affordance",`,
    `      "suggested_location": "right of the Submit button"`,
    `    }`,
    `  ]`,
    `}`,
    FINDINGS_END_MARKER,
    ``,
    `Rules for the JSON block:`,
    `- It MUST be the last thing in your response. No prose after the marker.`,
    `- design_contract fields you didn't observe MUST be omitted, not invented.`,
    `- Every delta MUST also exist as a findings[] row with the matching heuristic.`,
    `- The \`screenshots\` field is optional. Omit it (or use []) when nothing`,
    `  worth showing was captured for that finding. Bare-string entries`,
    `  (\`"step2.png"\`) are also accepted. ${screenshotsDir ? `Reference files by name only — the CLI resolves them against ${screenshotsDir}.` : ""}`,
    `- reflection.goal_reached: true iff the persona could actually accomplish`,
    `  the stated goal at the changed route. confidence_persona_would_succeed:`,
    `  estimated AFTER searching for failure reasons (adversarial framing).`,
    `- If the changed route has zero deltas vs the contract AND the goal was`,
    `  reachable, return deltas: [] and findings: []. Empty is honest.`,
    `- \`affordance_gaps\` is the negative-space inventory at each substantive`,
    `  page you visited (see the [Rove · negative-space enumeration] directive`,
    `  injected into your tool results). Emit one entry per missing affordance.`,
    `  These are persona-agnostic — they fire on change-review walks as well.`,
    `  Use the same \`kind\` vocabulary as flow walks (create, read, update,`,
    `  delete, undo, recover, navigate, status, confirm, save_state, empty,`,
    `  error). Omit the array if you observed no gaps anywhere.`,
  ];

  if (notes.trim()) {
    lines.push(``, `Additional notes for this run:`, notes.trim());
  }

  lines.push(``, `Begin Phase 0.`);
  return lines.join("\n");
}
