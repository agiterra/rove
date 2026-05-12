import type { FlowInfo, Persona } from "./types.js";

/**
 * Stable markers wrapping the JSON findings block in agent stdout.
 * The CLI extracts content between these markers and parses as JSON.
 * Treat these as a wire contract — changing them is a breaking change.
 */
export const FINDINGS_START_MARKER = "<<<FINDINGS_JSON>>>";
export const FINDINGS_END_MARKER = "<<<END_FINDINGS_JSON>>>";

export type McpToolPrefix = "playwright" | "playwright-test";

export interface BuildWalkPromptInput {
  flow: FlowInfo;
  goal: string;
  persona: Persona;
  notes?: string;
  /**
   * Workspace root. Used for the persona-facing reference to the flow spec
   * file location and prior findings reports.
   */
  workspacePath: string;
  /**
   * Which Playwright MCP server name the host has registered.
   * - "playwright"      → @playwright/mcp@latest (Claude Code CLI default)
   * - "playwright-test" → Nimbalyst's bundled Playwright MCP
   * Tool names will be derived as `mcp__<prefix>__browser_*`.
   */
  mcpToolPrefix?: McpToolPrefix;
  /**
   * Soft caps the agent is told to respect. Defaults are calibrated against
   * the Phase 0 spike (~3 min wall, ≤25 calls).
   */
  maxBrowserCalls?: number;
  maxWalkMinutes?: number;
  /**
   * True when the agent is handed a pre-authenticated browser session via
   * Playwright MCP's `--storage-state`. Changes the auth-wall guidance:
   * a redirect to /auth/login is then a real finding, not a setup gap.
   */
  authenticated?: boolean;
  /**
   * Absolute path to the per-run screenshots directory. When provided, the
   * prompt instructs the agent to save evidence screenshots into this dir and
   * reference them by filename in the `screenshots` field of each finding.
   * The CLI creates the dir before dispatch; the agent only writes into it.
   */
  screenshotsDir?: string;
  /**
   * Base URL (origin) the agent should navigate to when it loads the flow's
   * entry_route. Defaults to http://localhost:3000 — the TankLoop dev
   * server. Override for walks that target a deployed environment (eval-
   * dashboard, staging, Vercel preview).
   */
  targetUrl?: string;
}

export function buildWalkPrompt(input: BuildWalkPromptInput): string {
  const {
    flow,
    goal,
    persona,
    notes = "",
    workspacePath,
    mcpToolPrefix = "playwright",
    maxBrowserCalls = 25,
    maxWalkMinutes = 5,
    authenticated = false,
    screenshotsDir,
    targetUrl = "http://localhost:3000",
  } = input;

  const toolPrefix = `mcp__${mcpToolPrefix}__browser_`;
  const constraints = persona.constraints;

  const lines: string[] = [
    `You are running an agentic UX evaluation walk for TankLoop.`,
    ``,
    `Flow ID: ${flow.flowId}`,
    `Goal: ${goal}`,
    `Persona: ${persona.id} — ${persona.label} (${persona.category}, ${persona.expertise})`,
    `Persona behavior: ${persona.promptAddendum}`,
    `Persona constraints: ` +
      `shortcuts_allowed=${constraints.shortcuts_allowed}, ` +
      `hovers_allowed=${constraints.hovers_allowed}, ` +
      `keyboard_only=${constraints.keyboard_navigation_only ?? false}, ` +
      `retries_per_step=${constraints.retries_per_step}.`,
    ``,
    `Environment:`,
    `- Target environment: ${targetUrl}`,
    `  Combine this origin with the entry_route from the flow spec to form your starting URL.`,
    `- Entry route comes from the flow spec at ${flow.filePath}`,
    authenticated
      ? `- You ARE pre-authenticated. The browser has a valid session cookie from a` +
        `\n  prior tankloop-eval auth-setup. If a navigation redirects to /auth/login,` +
        `\n  that is a real finding (session-expiry or role-mismatch bug) — file it.`
      : `- You are NOT pre-authenticated. If you hit a sign-in wall, do NOT attempt` +
        `\n  to sign in — treat it as a finding and continue evaluating whatever IS` +
        `\n  reachable (landing page, the sign-in page UX itself, public routes).`,
    ``,
    `Steps:`,
    `1. Use ${toolPrefix}* tools to walk the flow goal as this persona. Typical`,
    `   tools include ${toolPrefix}navigate, ${toolPrefix}snapshot, ${toolPrefix}click,`,
    `   ${toolPrefix}type, ${toolPrefix}press_key, ${toolPrefix}take_screenshot,`,
    `   ${toolPrefix}wait_for, ${toolPrefix}console_messages.`,
    `2. Take an accessibility snapshot (${toolPrefix}snapshot) as your primary`,
    `   observation tool — refs from that snapshot are good evidence citations.`,
    `3. Walk the flow goal as the persona. Record what you observed, what you`,
    `   clicked, what feedback you got, and what was confusing or missing.`,
    `4. When something is worth capturing visually, call ${toolPrefix}take_screenshot.`,
    screenshotsDir
      ? `   Save screenshots into this directory (it already exists):\n` +
        `     ${screenshotsDir}\n` +
        `   Name them like \`step<N>-<short-slug>.png\` (e.g. \`step3-empty-state.png\`).\n` +
        `   Reference them in the matching finding using just the filename in the\n` +
        `   \`screenshots\` array — the CLI resolves the path relative to that dir.`
      : `   No screenshots dir was provided; reference image paths in \`evidence\` only.`,
    `5. Time-box: ~${maxWalkMinutes} minutes of browser interaction, no more than`,
    `   ${maxBrowserCalls} browser tool calls total. Stop early if you run out of`,
    `   meaningful affordances.`,
    `6. Reference the flow spec for what to expect at each step: ${flow.filePath}`,
    ``,
    `UX evaluation rubric:`,
    `- Nielsen heuristics (status visibility, real-world match, error prevention,`,
    `  recognition over recall, consistency)`,
    `- WCAG 2.2 AA basics (focus, target size, semantic roles, labels, contrast)`,
    `- ISO 9241-110 (self-descriptiveness, suitability for the task)`,
    ``,
    `Severity scale:`,
    `- critical: blocks the flow goal entirely`,
    `- major: forces a workaround or major confusion`,
    `- minor: friction or polish issue`,
    `- nit: cosmetic / wording`,
    ``,
    `OUTPUT FORMAT — VERY IMPORTANT:`,
    ``,
    `After all browser exploration is done, emit findings as the LAST thing in`,
    `your response. Use exactly this format, with no prose after the closing`,
    `marker:`,
    ``,
    FINDINGS_START_MARKER,
    `{`,
    `  "flow_id": "${flow.flowId}",`,
    `  "persona_id": "${persona.id}",`,
    `  "walked_url": "${targetUrl}/...",`,
    `  "summary": "one-paragraph summary of what you observed",`,
    `  "findings": [`,
    `    {`,
    `      "id": "finding-1",`,
    `      "severity": "critical | major | minor | nit",`,
    `      "title": "Short imperative title",`,
    `      "description": "What you observed, why it is a UX problem, and what a user would expect instead.",`,
    `      "step_index": 1,`,
    `      "heuristic": "nielsen-1 | wcag-target-size | iso-self-descriptiveness | ...",`,
    `      "evidence": "url, snapshot ref, or short pointer to the relevant artifact",`,
    `      "screenshots": [`,
    `        { "path": "step3-empty-state.png", "caption": "what this shows" }`,
    `      ]`,
    `    }`,
    `  ]`,
    `}`,
    FINDINGS_END_MARKER,
    ``,
    `Rules for the JSON block:`,
    `- It MUST be the last thing in your response. No prose, no markdown after`,
    `  the closing marker.`,
    `- It MUST be valid JSON parseable by JSON.parse.`,
    `- If you found nothing, return findings: [] with a summary explaining why.`,
    `- The \`screenshots\` field is optional. Omit it (or use []) when nothing`,
    `  worth showing was captured for that finding. Bare-string entries`,
    `  (\`"step3.png"\`) are also accepted.`,
    `- Do NOT call any tracker MCP tools. Do NOT write files anywhere except`,
    `  the screenshots dir mentioned above. Findings live in the JSON block`,
    `  only — the CLI parses and routes them post-hoc.`,
  ];

  if (notes.trim()) {
    lines.push(``, `Additional constraints for this run:`, notes.trim());
  }

  lines.push(``, `Workspace root (for path references only): ${workspacePath}`);
  lines.push(`Begin.`);

  return lines.join("\n");
}
