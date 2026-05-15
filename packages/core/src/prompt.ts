// File-size exception (~350 lines): the walk prompt is one cohesive
// document the agent reads sequentially. Splitting the four phases
// (plan / walk / reflect / surprise log) and the two rubrics into
// sibling files would fragment what is essentially a long string
// literal. Re-evaluate if individual phases gain independent logic.
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
   * entry_route. Defaults to http://localhost:3000 — the local dev
   * server. Override for walks that target a deployed environment (eval-
   * dashboard, staging, Vercel preview).
   */
  targetUrl?: string;
  /**
   * Clean-room mode. When true, the agent runs with no access to the project
   * source (fresh cwd, strict-mcp-config, scrubbed env). The prompt therefore
   * must not reference any project-internal file paths — entry routes and
   * goals are inlined, not pointed-to. Set true for agent personas; defaults
   * to false for human personas which still have project context.
   */
  isolated?: boolean;
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
    isolated = false,
  } = input;

  const toolPrefix = `mcp__${mcpToolPrefix}__browser_`;
  const constraints = persona.constraints;

  const lines: string[] = [
    `You are running an agentic UX evaluation walk.`,
    ``,
    ...(isolated
      ? [
          `You have NO prior knowledge of this app. You have not seen its source code,`,
          `you have no memory of any prior visit, and you cannot read files from disk.`,
          `The only way to learn anything about this app is to drive its browser UI`,
          `using the ${toolPrefix}* tools. If the only way to find an affordance would`,
          `be to read the project's source — that is itself a finding, not a workaround.`,
          ``,
        ]
      : []),
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
    isolated
      ? `  Navigate directly to this origin to begin. The flow's entry route is part\n` +
        `  of the goal stated above; discover it from the UI, not from any file.`
      : `  Combine this origin with the entry_route from the flow spec to form your starting URL.`,
    ...(isolated ? [] : [`- Entry route comes from the flow spec at ${flow.filePath}`]),
    authenticated
      ? `- You ARE pre-authenticated. The browser has a valid session cookie from a` +
        `\n  prior rove auth-setup. If a navigation redirects to /auth/login,` +
        `\n  that is a real finding (session-expiry or role-mismatch bug) — file it.`
      : `- You are NOT pre-authenticated. If you hit a sign-in wall, do NOT attempt` +
        `\n  to sign in — treat it as a finding and continue evaluating whatever IS` +
        `\n  reachable (landing page, the sign-in page UX itself, public routes).`,
    ``,
    buildPriorPlanCaptureSection(persona, toolPrefix),
    ``,
    `Phase A — Plan FIRST, before any browser call.`,
    `Before you call any ${toolPrefix}* tool, think through how a ${persona.label}`,
    `would expect to accomplish "${goal}". Then write down a structured plan:`,
    `- 3 to 7 ordered steps, each one sentence, describing what you expect to do.`,
    `- For each step, the affordance you expect to find (e.g. "button name='Create'",`,
    `  "input labeled 'Email'", "link in left nav under 'Settings'").`,
    `- The total step count you expect, in minutes if you'd estimate it.`,
    `- Your biggest worry — the single place a real ${persona.category} user of this`,
    `  persona is most likely to get stuck or confused.`,
    `Set authored_before_browser_open = true to attest you wrote this before`,
    `looking at the app. The plan ships in the JSON output as the \`plan\` field.`,
    ``,
    `Phase B — Walk the flow.`,
    `1. Use ${toolPrefix}* tools to walk the flow goal as this persona. Typical`,
    `   tools include ${toolPrefix}navigate, ${toolPrefix}snapshot, ${toolPrefix}click,`,
    `   ${toolPrefix}type, ${toolPrefix}press_key, ${toolPrefix}take_screenshot,`,
    `   ${toolPrefix}wait_for, ${toolPrefix}console_messages.`,
    `2. Take an accessibility snapshot (${toolPrefix}snapshot) as your primary`,
    `   observation tool — refs from that snapshot are good evidence citations.`,
    `3. Walk the flow goal as the persona. Record what you observed, what you`,
    `   clicked, what feedback you got, and what was confusing or missing.`,
    `4. Whenever reality diverged from your plan, log a SURPRISE — see Phase D.`,
    `5. When something is worth capturing visually, call ${toolPrefix}take_screenshot.`,
    screenshotsDir
      ? `   Save screenshots into this directory (it already exists):\n` +
        `     ${screenshotsDir}\n` +
        `   Name them like \`step<N>-<short-slug>.png\` (e.g. \`step3-empty-state.png\`).\n` +
        `   Reference them in the matching finding using just the filename in the\n` +
        `   \`screenshots\` array — the CLI resolves the path relative to that dir.`
      : `   No screenshots dir was provided; reference image paths in \`evidence\` only.`,
    `6. Time-box: ~${maxWalkMinutes} minutes of browser interaction, no more than`,
    `   ${maxBrowserCalls} browser tool calls total. Stop early if you run out of`,
    `   meaningful affordances.`,
    ...(isolated
      ? [
          `7. The goal stated above is the entire success criterion. There is no flow`,
          `   spec file to consult; if the goal feels under-specified, treat the gap`,
          `   itself as evidence (e.g. "the goal said 'create a job' but the UI offered`,
          `   no obvious way to know which job type").`,
        ]
      : [`7. Reference the flow spec for what to expect at each step: ${flow.filePath}`]),
    ``,
    persona.category === "agent" ? buildAgentRubric() : buildHumanRubric(),
    ``,
    buildKeyboardNavigationSection(persona, toolPrefix),
    ``,
    buildNativeDialogsSection(persona, toolPrefix),
    ``,
    buildAffordanceEnumerationSection(persona, toolPrefix),
    ``,
    buildPlanVerdictSection(persona, toolPrefix),
    ``,
    `Phase C — Reflect, adversarially.`,
    `After the walk, ask yourself: "If this app shipped tomorrow, what specific`,
    `reasons would a different user of this persona FAIL to accomplish this goal?"`,
    `Search your own trajectory for those reasons. Only then estimate your`,
    `confidence (0.0 to 1.0) that another user of this persona would succeed.`,
    `Bias toward lower confidence when the path required recovery, when the`,
    `success state was hard to verify, or when the goal depended on a discovery`,
    `step you had to retry. This adversarial framing improves calibration —`,
    `naive "rate your confidence" is uninformative.`,
    ``,
    `Phase D — Surprise log.`,
    `A SURPRISE is a moment where reality diverged from your plan. Log one for:`,
    `- An expected affordance was missing or hidden ("affordance_missing")`,
    `- The path detoured through unexpected pages ("unexpected_detour")`,
    `- A label or icon was ambiguous and slowed you ("ambiguous_label")`,
    `- You hesitated, unsure what to click ("hesitation")`,
    `- You had to backtrack or undo to recover ("recovery")`,
    `- You reached a state with no obvious next step ("dead_end")`,
    `- The UI's response didn't match what you expected from your action ("expectation_mismatch")`,
    `Each surprise: kind, step_index it happened on, what you expected, what you`,
    `observed, recovered (true if you got back on track), and recovery_cost_steps.`,
    `Surprises are NOT the same as findings. A surprise is data; a finding is a`,
    `judgement. Some surprises become findings; some don't. Log both.`,
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
    `  "plan": {`,
    `    "expected_path": [`,
    `      { "step": 1, "description": "Click the primary CTA on the dashboard.", "expected_affordance": "button name='New job'" },`,
    `      { "step": 2, "description": "Pick a property from a searchable list." }`,
    `    ],`,
    `    "expected_step_count": 4,`,
    `    "expected_minutes": 2,`,
    `    "biggest_worry": "The property picker may not search by partial name.",`,
    `    "authored_before_browser_open": true`,
    `  },`,
    `  "surprises": [`,
    `    {`,
    `      "kind": "affordance_missing",`,
    `      "step_index": 1,`,
    `      "expected": "Primary 'New job' CTA visible on the dashboard.",`,
    `      "observed": "Only a kebab menu in the toolbar exposed it.",`,
    `      "recovered": true,`,
    `      "recovery_cost_steps": 2`,
    `    }`,
    `  ],`,
    `  "reflection": {`,
    `    "goal_reached": true,`,
    `    "actual_step_count": 7,`,
    `    "largest_expectation_gap": "Expected a primary CTA; took four clicks to discover the kebab menu.",`,
    `    "confidence_persona_would_succeed": 0.55`,
    `  },`,
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
    `- \`plan\` is REQUIRED. Author it in Phase A, before any browser call.`,
    `  authored_before_browser_open must be literally true.`,
    `- \`surprises\` is an array; emit one per divergence per Phase D. Empty array`,
    `  is valid only if the walk genuinely matched the plan step-for-step.`,
    `- \`reflection.goal_reached\` is REQUIRED. Set true iff you actually`,
    `  accomplished the flow's stated goal as a user of this persona would`,
    `  recognize success — not "the page loaded," not "the request succeeded,"`,
    `  but "a real ${persona.category} user would say: yes, I got what I came for."`,
    `  Set false if you ran out of budget, got lost, could not find the path,`,
    `  or completed an action without being able to verify the result from the UI.`,
    `- \`reflection.confidence_persona_would_succeed\` is REQUIRED. Estimate it`,
    `  AFTER you have written down at least two reasons a different user of`,
    `  this persona might fail (Phase C). 1.0 = certain success; 0.0 = certain`,
    `  failure. Do not anchor on your own outcome — a different user is the`,
    `  subject of the estimate.`,
    `- If you found nothing, return findings: [] with a summary explaining why.`,
    `  goal_reached can still be true (or false) independent of findings count —`,
    `  an app can have zero findings and still leave you stranded.`,
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

  if (!isolated) {
    lines.push(``, `Workspace root (for path references only): ${workspacePath}`);
  }
  lines.push(`Begin.`);

  return lines.join("\n");
}

/**
 * Rubric for human personas — Nielsen / WCAG / ISO.
 */
function buildHumanRubric(): string {
  return [
    `UX evaluation rubric:`,
    `- Nielsen heuristics (status visibility, real-world match, error prevention,`,
    `  recognition over recall, consistency)`,
    `- WCAG 2.2 AA basics (focus, target size, semantic roles, labels, contrast)`,
    `- ISO 9241-110 (self-descriptiveness, suitability for the task)`,
  ].join("\n");
}

/**
 * Rubric for agent personas — agent-readability heuristics.
 *
 * Every heuristic id starts with `agent.` so the dashboard can split
 * agent-readability findings from human-UX findings without parsing the
 * description.
 */
function buildAgentRubric(): string {
  return [
    `Agent-readiness rubric — file each finding with one of these heuristic ids:`,
    ``,
    `- agent.semantic_html — interactive elements are real <button>/<a>/<input>,`,
    `  not styled <div onClick>. Agents bind to roles, not pixels.`,
    `- agent.stable_selectors — critical actions have stable identifiers`,
    `  (id, data-testid, aria-label, role+name) the agent can target across`,
    `  renders. Class-name selectors are unstable; flag their absence.`,
    `- agent.accessibility_tree_completeness — everything visually meaningful`,
    `  is present in the accessibility tree (no canvas-rendered text, no`,
    `  aria-hidden on critical content, no images-of-text for labels).`,
    `- agent.feedback_announced — success/error feedback updates the a11y`,
    `  tree (role="status", aria-live, focus shift). Pure visual feedback`,
    `  (toast that doesn't shift focus or announce) is invisible to agents.`,
    `- agent.no_hover_only — no critical affordance requires a hover the`,
    `  agent can't reliably perform.`,
    `- agent.no_visual_only_state — state (selected/active/disabled/loading)`,
    `  is communicated via aria-attributes + roles, not just color/icon.`,
    `- agent.predictable_urls — important state is reflected in the URL so`,
    `  the agent can deep-link, resume, share, and verify "did I land where`,
    `  I expected?"`,
    `- agent.titles_and_meta — <title> and meta descriptions actually`,
    `  describe what the page is. Agents use these to verify navigation.`,
    `- agent.captcha_friendly — no aggressive bot-detection (Cloudflare`,
    `  challenge, hCaptcha, etc.) blocking legitimate agentic traffic.`,
    `  Surface the issue; do NOT try to bypass.`,
    `- agent.rate_limit_signaling — 429 responses carry Retry-After;`,
    `  errors include machine-readable codes the agent can branch on.`,
    ``,
    `Severity for agent findings:`,
    `- critical: the goal is unreachable for this agent runtime`,
    `- major: requires a workaround (visual-only signal, brittle selector)`,
    `- minor: friction (extra hop, ambiguous role name)`,
    `- nit: cosmetic (missing meta description on a non-critical page)`,
  ].join("\n");
}

// ── Keyboard-navigation section (additive, 2026-05-14) ───────────────────────
// New section. Edit here, not inside buildWalkPrompt. The header literal
// `### Keyboard navigation` is the anchor downstream tests / parallel agents
// look for; keep it stable.
function buildKeyboardNavigationSection(persona: Persona, toolPrefix: string): string {
  const pressKey = `${toolPrefix}press_key`;
  const click = `${toolPrefix}click`;

  const common = [
    `### Keyboard navigation`,
    ``,
    `You may use ${pressKey} for keyboard input. The keys you will reach for`,
    `most often are Tab, Shift+Tab, Enter, Space, the arrow keys, and Escape.`,
    `Real users of every persona occasionally hit a key; agents that only ever`,
    `click do not catch keyboard-path failures.`,
    ``,
    `File a finding when:`,
    `- Focus disappears off-document after Tab (no visible focus ring AND no`,
    `  ${toolPrefix}snapshot ref for the focused element).`,
    `- A custom widget (combobox, menu, tabs, switch, disclosure) does not`,
    `  respond to Space or Enter the way its role implies.`,
    `- A skip-link is present but Enter on it does not move focus past the nav.`,
    `- The flow declared an \`expected_keyboard_navigation\` step (from_selector`,
    `  → to_selector) and Tab from \`from_selector\` did not land on`,
    `  \`to_selector\`. Cite the step in your evidence.`,
    ``,
    `If a keyboard probe is ambiguous — you pressed Tab and you cannot tell`,
    `from the snapshot where focus went — that ambiguity is itself the`,
    `finding. Do NOT retry until it works; do NOT switch to ${click} to`,
    `paper over it. The absence of perceivable focus is the UX problem.`,
  ];

  if (persona.category === "accessibility") {
    return [
      ...common,
      ``,
      `You are an accessibility persona. Keyboard-only operation is REQUIRED.`,
      `Do NOT use ${click} for any affordance that has a keyboard path —`,
      `navigate with Tab / Shift+Tab, activate with Enter or Space. ${click}`,
      `is permitted only when the element provably has no keyboard path (which`,
      `is itself the finding — file it under WCAG 2.1.1 or 2.4.7).`,
      ``,
      `Map findings to WCAG criteria:`,
      `- 2.1.1 Keyboard — any control reachable by mouse but not by keyboard.`,
      `- 2.1.2 No Keyboard Trap — focus enters a region and cannot leave by`,
      `  Tab / Shift+Tab / Escape.`,
      `- 2.4.3 Focus Order — Tab order does not match the visual reading order`,
      `  or the order declared in \`expected_keyboard_navigation\`.`,
      `- 2.4.7 Focus Visible — focused element has no visible indicator.`,
    ].join("\n");
  }

  if (persona.category === "agent") {
    return [
      ...common,
      ``,
      `You are an agent persona. Use the keyboard to probe affordances that`,
      `might be hover-only in disguise — Tab to the element first; if a menu`,
      `or tooltip only appears via hover, that is an agent.no_hover_only`,
      `finding even when the element itself receives focus. Cite the`,
      `agent.accessibility_tree_completeness heuristic when Tab moves focus`,
      `to a region your ${toolPrefix}snapshot cannot describe.`,
    ].join("\n");
  }

  return common.join("\n");
}

// ── Native dialogs (additive, 2026-05-14) ────────────────────────────────────
// New section. Edit here, not inside buildWalkPrompt. The header literal
// `### Native dialogs` is the anchor downstream tests / parallel agents
// look for; keep it stable.
function buildNativeDialogsSection(persona: Persona, toolPrefix: string): string {
  const handleDialog = `${toolPrefix}handle_dialog`;
  const lines = [
    `### Native dialogs`,
    ``,
    `If your tool calls suddenly stop affecting the page, call ${handleDialog}`,
    `to query — the page may be blocked by a browser-native alert/confirm/prompt.`,
    `Rove surfaces dialog events to human personas automatically; agent personas`,
    `will not be told about them — that absence is the finding.`,
  ];
  return lines.join("\n");
}

// ── Affordance enumeration (additive, 2026-05-14) ────────────────────────────
// Operationalizes docs/theses/negative-space.md at page granularity. The
// walker pauses on each substantive page and explicitly enumerates the
// affordances a user of this persona/goal would expect — turning negative
// space into positive tokens we can file as findings.
//
// The header literal `### Affordance enumeration` is the anchor downstream
// tests / parallel agents look for; keep it stable. Edit here, not inside
// buildWalkPrompt.
function buildAffordanceEnumerationSection(persona: Persona, toolPrefix: string): string {
  const snapshot = `${toolPrefix}snapshot`;
  const personaLens = describePersonaLens(persona);
  const lines = [
    `### Affordance enumeration`,
    ``,
    `Each time you land on a SUBSTANTIVE page (a page that renders a real`,
    `view — not a loading screen, not an auth wall, not a 4xx/5xx error),`,
    `pause before continuing. Take stock of where you are.`,
    ``,
    `You are on this page as the ${persona.label} persona pursuing the flow`,
    `goal. Enumerate the affordances a user with this goal would expect to`,
    `be able to perform here. Do NOT only check for the affordance that`,
    `advances your next step — enumerate the FULL set a user would need.`,
    `Consider, to the extent each is relevant to your current page and goal:`,
    ``,
    `- create:     "+ New" / Add / Compose-style entry points`,
    `- read:       inspect / view-details affordances for items in view`,
    `- update:     edit / rename / configure for items in view`,
    `- delete:     remove / archive / discard for items in view`,
    `- undo:       a way to revert the last destructive action`,
    `- recover:    retry / clear-error after a failure state`,
    `- navigate:   a clear way back, out, or sideways`,
    `- status:     loading / progress / outcome for async actions`,
    `- confirm:    confirmation step for destructive operations`,
    `- save_state: auto-save indicator / loss-of-work warning on long forms`,
    `- empty:      onboarding CTA on empty lists / first-run states`,
    `- error:      human-readable cause when something goes wrong`,
    ``,
    `Do not force-fit categories that don't apply. A landing page has no`,
    `"delete"; an empty inbox has no "read"; an error page may have only`,
    `"recover" and "navigate."`,
    ``,
    `For each MISSING affordance, file one entry under \`affordance_gaps\``,
    `in the JSON output (matches are silent — only gaps emit). Each entry:`,
    ``,
    `- kind:              one of the twelve listed above`,
    `- expected_for:      one sentence describing the user-goal context`,
    `- severity:          critical | major | minor | nit`,
    `- step_index:        REQUIRED — the step at which you observed the absence.`,
    `                     Use the snapshot/screenshot step that anchored the`,
    `                     enumeration. Without this the gap can't be located`,
    `                     in the project-wide Negative Space rollup.`,
    `- evidence:          what IS on the page (cite ${snapshot} refs) and`,
    `                     why the missing affordance is absent — not just`,
    `                     "no Delete button" but "toolbar exposes Edit + Share`,
    `                     [ref=e42]; overflow menu offers Pin + Duplicate;`,
    `                     no Delete in either"`,
    `- suggested_location: brief hint where the affordance would naturally live`,
    ``,
    `Severity heuristic:`,
    `- critical: the only place this operation could exist is here, and a`,
    `  user with the goal cannot proceed without it (most "delete" gaps`,
    `  on detail views fit this)`,
    `- major:    the missing affordance forces a workaround that a real`,
    `  user would likely abandon (no auto-save on a long form)`,
    `- minor:    friction; the user can still succeed but the path is`,
    `  worse than it should be (empty state with no CTA)`,
    `- nit:      polish gap (no undo on a non-destructive toggle)`,
    ``,
    `Throttling: enumerate ONCE per URL per walk. If the page is`,
    `\`/properties/xyz\` and you arrive twice in the same walk, the second`,
    `arrival skips this phase. The flow-author's \`affordance_exclusions\``,
    `block may silence specific (URL, kind) pairs — when one applies, log`,
    `the gap silently as \`silenced_by_flow\` and continue.`,
    ``,
    `${personaLens}`,
    ``,
    `Then resume your task.`,
  ];
  return lines.join("\n");
}

function describePersonaLens(persona: Persona): string {
  switch (persona.category) {
    case "accessibility":
      return [
        `As an accessibility persona, enumerate the KEYBOARD-EQUIVALENT of`,
        `each affordance. "Edit by clicking the row" is not the same affordance`,
        `as "Edit by Tab+Enter on a focusable row." A missing keyboard path is`,
        `itself an affordance gap (kind=update / kind=delete / etc).`,
      ].join("\n");
    case "agent":
      return [
        `As an agent persona, enumerate the PROGRAMMATICALLY-IDENTIFIABLE`,
        `affordances — stable selectors, semantic roles, accessible names.`,
        `An affordance that exists visually but lacks accessibility-tree`,
        `presence is, for an agent, a gap. File those alongside the obvious`,
        `missing-button gaps.`,
      ].join("\n");
    case "mobile":
      return [
        `As a mobile persona, enumerate affordances that are reachable at`,
        `thumb-friendly positions and don't require hover. Hover-only menus`,
        `are themselves affordance gaps for this persona (kind=navigate or`,
        `kind=update depending on what's hidden).`,
      ].join("\n");
    default:
      return [
        `Your expertise level shapes what you'd expect: a novice end-user`,
        `expects discovery-friendly placement (visible buttons, descriptive`,
        `labels); an expert accepts keyboard shortcuts and overflow menus.`,
        `File gaps in terms of what THIS persona would notice missing.`,
      ].join("\n");
  }
}

// ── Prior plan capture (additive, 2026-05-14, expectation-match) ─────────────
// New section. Edit here, not inside buildWalkPrompt. The header literal
// `### Prior plan` is the anchor downstream tests / adapters look for;
// keep it stable. Surfaces the agent's pre-flight expectations as a
// first-class artifact rendered against observed reality. See
// `docs/plans/expectation-match.md`.
function buildPriorPlanCaptureSection(persona: Persona, toolPrefix: string): string {
  const navigate = `${toolPrefix}navigate`;
  const archetypeLine =
    persona.constraints.prior_archetype && persona.constraints.prior_archetype !== "auto"
      ? `This persona walks under a fixed archetype prior: \`${persona.constraints.prior_archetype}\`.`
      : `No fixed archetype is set; infer one from the goal + first landing page.`;

  return [
    `### Prior plan`,
    ``,
    `BEFORE calling ${navigate} for the first time, externalize the prior plan`,
    `you already carry into this walk. You have domain knowledge; we want it`,
    `written down so we can compare what you EXPECTED to what you OBSERVED.`,
    ``,
    archetypeLine,
    ``,
    `Emit a structured \`prior_plan\` block in your final JSON output with these`,
    `fields (all required unless noted):`,
    ``,
    `- archetype_assumed: short label, e.g. "saas-dashboard" or`,
    `  "shopify-style-commerce".`,
    `- expected_route_pattern: ordered list of route shapes you expect to walk,`,
    `  e.g. ["/", "/menu", "/cart", "/checkout"].`,
    `- expected_step_count: integer count of meaningful steps you expect.`,
    `- expected_affordances_by_route: object keyed by route → list of`,
    `  affordances you expect to find there (e.g. {"/cart": ["quantity controls",`,
    `  "checkout CTA"]}).`,
    `- anticipated_friction: list of friction points you brace for (e.g.`,
    `  ["account creation gate", "address validation failure"]).`,
    `- affordance_assumptions: list of layout/affordance assumptions`,
    `  (e.g. ["cart icon top-right", "primary CTA on /cart is the checkout button"]).`,
    `- captured_before_browser_open: literal true — attesting you wrote this`,
    `  before any ${navigate} call.`,
    ``,
    `Freeze this plan; do NOT rewrite it as you learn. The whole point is the`,
    `diff between the frozen plan and observed reality. Revisions belong in`,
    `per-step \`plan_delta\` entries (see ### Plan verdict).`,
  ].join("\n");
}

// ── Plan verdict (additive, 2026-05-14, expectation-match) ───────────────────
// New section. Edit here, not inside buildWalkPrompt. The header literal
// `### Plan verdict` is the anchor downstream tests / adapters look for;
// keep it stable. Drives per-step `run_steps.plan_delta` jsonb. See
// `docs/plans/expectation-match.md`.
function buildPlanVerdictSection(persona: Persona, _toolPrefix: string): string {
  return [
    `### Plan verdict`,
    ``,
    `After each browser tool call resolves, emit a one-line verdict against the`,
    `prior plan you froze in ### Prior plan. The verdict goes on each finding`,
    `you file for that step under the \`plan_delta\` field, and is collected by`,
    `the sink onto \`run_steps.plan_delta\`.`,
    ``,
    `Verdict vocabulary (exactly one per step):`,
    `- match — reality is as expected; the plan does not need revision.`,
    `- extension — extra step the plan didn't anticipate but is coherent`,
    `  (e.g. a dismissable upsell modal). The plan grows but is not contradicted.`,
    `- surprise — friction the plan didn't anticipate but is recoverable`,
    `  (e.g. unexpected account-gate). Candidate finding gated by recoverability.`,
    `- deviation — reality contradicts the plan in a way that breaks it`,
    `  (e.g. expected /cart, got a marketing page). ALWAYS becomes a finding`,
    `  under \`agent.expectation_match.<kind>\` where kind ∈`,
    `  {route, affordance, copy, step_count, friction, archetype}.`,
    ``,
    `When verdict is \`extension\`, \`surprise\`, or \`deviation\`, include:`,
    `- what_revised: one sentence — what changed about your understanding.`,
    `- revised_plan_diff (optional): the minimal patch to the prior plan that`,
    `  would have matched reality. Shape is free-form but JSON-serializable.`,
    ``,
    `Severity for deviation findings: route-shape > affordance > copy.`,
    `A missing primary affordance on a critical route is \`critical\`. An extra`,
    `step inside an otherwise-coherent flow is \`minor\`. Don't double-file a`,
    `\`surprise\` if you already anticipated it in \`anticipated_friction\`.`,
  ].join("\n");
}
