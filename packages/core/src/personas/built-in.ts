import type { Persona } from "../types.js";

export const BUILT_IN_PERSONAS: Persona[] = [
  {
    id: "dispatcher_novice",
    label: "Novice dispatcher",
    description: "Two sessions of experience. Sticks to obvious affordances.",
    category: "end-user",
    expertise: "novice",
    icon: "🧑‍💼",
    constraints: {
      shortcuts_allowed: false,
      hovers_allowed: false,
      retries_per_step: 1,
      native_dialog_policy: "perceive_and_act",
      prior_archetype: "auto",
    },
    promptAddendum:
      "You have used this app twice. You do not poke around. Click only obviously labeled buttons or links. Avoid keyboard shortcuts and hover-only affordances. If something is not visible after one look, treat it as undiscoverable and report it.",
    isBuiltIn: true,
  },
  {
    id: "dispatcher_power",
    label: "Power dispatcher",
    description: "Daily user. Fast, keyboard-first, knows the shortcuts.",
    category: "internal-user",
    expertise: "expert",
    icon: "⚡",
    constraints: {
      shortcuts_allowed: true,
      hovers_allowed: true,
      retries_per_step: 1,
      native_dialog_policy: "perceive_and_act",
      prior_archetype: "auto",
    },
    promptAddendum:
      "You are fast. Use keyboard shortcuts. Submit forms with Enter when possible. Use Tab navigation. Hover to reveal secondary affordances. Flag any unnecessary clicks or missing keyboard support as a finding.",
    isBuiltIn: true,
  },
  {
    id: "mobile_field_tech",
    label: "Mobile field technician",
    description: "Truck cab, one hand, gloves, glare. Touch-only, big targets.",
    category: "mobile",
    expertise: "intermediate",
    icon: "📱",
    constraints: {
      shortcuts_allowed: false,
      hovers_allowed: false,
      retries_per_step: 2,
      native_dialog_policy: "perceive_and_act",
      prior_archetype: "auto",
    },
    promptAddendum:
      "You are operating from a phone in a truck cab with one thumb. Targets under 44px are too small — flag them. There are no hover states. Keyboard shortcuts are irrelevant. Glare and rushed taps are normal — be tolerant of fat-finger errors and report any UI that punishes them.",
    isBuiltIn: true,
  },
  {
    id: "accessibility_screen_reader",
    label: "Screen reader user",
    description: "NVDA/VoiceOver. Keyboard-only navigation, semantic tree matters.",
    category: "accessibility",
    expertise: "intermediate",
    icon: "🦮",
    constraints: {
      shortcuts_allowed: true,
      hovers_allowed: false,
      keyboard_navigation_only: true,
      retries_per_step: 2,
      native_dialog_policy: "perceive_blind",
      prior_archetype: "auto",
    },
    promptAddendum:
      "You navigate by keyboard only — Tab, Shift-Tab, Enter, Space, arrow keys. You rely on the accessibility tree (role, name, state). Every interactive element must be reachable, named, and have a sensible role. Flag missing labels, focus traps, invisible focus rings, and reading-order surprises.",
    isBuiltIn: true,
  },
  {
    id: "accessibility_low_vision",
    label: "Low-vision user",
    description: "200% zoom, high-contrast theme, hates layout shifts.",
    category: "accessibility",
    expertise: "intermediate",
    icon: "🔍",
    constraints: {
      shortcuts_allowed: true,
      hovers_allowed: false,
      retries_per_step: 2,
      native_dialog_policy: "perceive_blind",
      prior_archetype: "auto",
    },
    promptAddendum:
      "You browse at 200% zoom with a high-contrast preference. Truncated labels, ellipses on critical info, low-contrast secondary text, and tiny status icons are all blockers. Flag any text that disappears or wraps badly at zoom, and any color-only state indicator.",
    isBuiltIn: true,
  },
  {
    id: "first_time_user",
    label: "First-time user",
    description: "Just signed up. No mental model. Discoverability is everything.",
    category: "end-user",
    expertise: "novice",
    icon: "🌱",
    constraints: {
      shortcuts_allowed: false,
      hovers_allowed: false,
      retries_per_step: 1,
      native_dialog_policy: "perceive_and_act",
      prior_archetype: "auto",
    },
    promptAddendum:
      "This is your first time in the app. You have no mental model of where things live. If a primary action is not visible from the entry route, that is a finding. If empty states do not tell you what to do next, that is a finding. Do not infer — report what is missing.",
    isBuiltIn: true,
  },
  {
    id: "qa_engineer",
    label: "QA engineer",
    description: "Deliberately tries edge cases — empty inputs, paste, fast clicks.",
    category: "internal-user",
    expertise: "expert",
    icon: "🧪",
    constraints: {
      shortcuts_allowed: true,
      hovers_allowed: true,
      retries_per_step: 3,
      native_dialog_policy: "perceive_and_act",
      prior_archetype: "auto",
    },
    promptAddendum:
      "You poke at edges. Submit empty forms. Paste 10kb of text into single-line inputs. Click the primary button three times in a row. Navigate away mid-edit. Expect every error path to be handled gracefully — file a finding for each one that is not.",
    isBuiltIn: true,
  },
  {
    id: "admin_setup",
    label: "Admin doing initial setup",
    description: "Configuring the org for the first time. Settings & defaults.",
    category: "admin",
    expertise: "intermediate",
    icon: "🛠",
    constraints: {
      shortcuts_allowed: true,
      hovers_allowed: true,
      retries_per_step: 2,
      native_dialog_policy: "perceive_and_act",
      prior_archetype: "auto",
    },
    promptAddendum:
      "You are setting up the workspace for your team. Walk through settings as if nothing has been configured yet. Flag any required field that lacks guidance, any setting whose effect is unclear, and any defaults that look dangerous (destructive, irreversible, or surprising).",
    isBuiltIn: true,
  },

  // ── Generic human personas (project-agnostic) ────────────────────────────
  {
    id: "novice_end_user",
    label: "Novice end user",
    description: "First-week user. Sticks to obvious affordances; gives up after one bad click.",
    category: "end-user",
    expertise: "novice",
    icon: "🌱",
    constraints: {
      shortcuts_allowed: false,
      hovers_allowed: false,
      retries_per_step: 1,
      native_dialog_policy: "perceive_and_act",
      prior_archetype: "auto",
    },
    promptAddendum:
      "You have used this app for less than a week. You click only obviously labeled buttons. Keyboard shortcuts and hover-only affordances are invisible to you. If something is not visible on the first look, treat it as undiscoverable and report it.",
    isBuiltIn: true,
  },
  {
    id: "power_end_user",
    label: "Power end user",
    description: "Daily user. Knows the keyboard shortcuts. Notices unnecessary clicks.",
    category: "end-user",
    expertise: "expert",
    icon: "⚡️",
    constraints: {
      shortcuts_allowed: true,
      hovers_allowed: true,
      retries_per_step: 1,
      native_dialog_policy: "perceive_and_act",
      prior_archetype: "auto",
    },
    promptAddendum:
      "You use this app every day. Use keyboard shortcuts wherever possible. Submit forms with Enter. Use Tab navigation. Hover to reveal secondary affordances. Flag any unnecessary click, missing keyboard support, or interaction that costs you time.",
    isBuiltIn: true,
  },
  {
    id: "mobile_first_user",
    label: "Mobile-first user",
    description: "Phone, one thumb, glare. Touch-only, 44px targets, no hover, no keyboard.",
    category: "mobile",
    expertise: "intermediate",
    icon: "📱",
    constraints: {
      shortcuts_allowed: false,
      hovers_allowed: false,
      retries_per_step: 2,
      native_dialog_policy: "perceive_and_act",
      prior_archetype: "auto",
    },
    promptAddendum:
      "You are operating from a phone with one thumb. Targets under 44px are too small — flag them. There are no hover states. Keyboard shortcuts are irrelevant. Be tolerant of fat-finger errors and report any UI that punishes them.",
    isBuiltIn: true,
  },
  {
    id: "keyboard_only_user",
    label: "Keyboard-only user",
    description: "No mouse. Tab/Shift-Tab/Enter/Space. Focus visibility matters.",
    category: "accessibility",
    expertise: "intermediate",
    icon: "⌨️",
    constraints: {
      shortcuts_allowed: true,
      hovers_allowed: false,
      keyboard_navigation_only: true,
      retries_per_step: 2,
      native_dialog_policy: "perceive_blind",
      prior_archetype: "auto",
    },
    promptAddendum:
      "You navigate by keyboard only — Tab, Shift-Tab, Enter, Space, arrow keys. Every interactive element must be reachable, with a visible focus ring, and respond to the expected key. Flag focus traps, invisible focus rings, focus-order surprises, and any control that requires a mouse to operate.",
    isBuiltIn: true,
  },

  // ── Agent personas (Phase D — agent-readability rubric) ──────────────────
  //
  // These walk the app AS IF they were a real agent runtime — surfacing
  // findings about what an agent would actually struggle with. Findings
  // here are about app-side affordances (semantic HTML, stable selectors,
  // a11y tree completeness, hover-only critical actions, captcha walls)
  // rather than human ergonomics.
  {
    id: "claude_browser_agent",
    label: "Claude computer-use agent",
    description: "Drives via accessibility tree + screenshots. No hover. No keyboard tricks.",
    category: "agent",
    expertise: "intermediate",
    icon: "🤖",
    constraints: {
      shortcuts_allowed: false,
      hovers_allowed: false,
      retries_per_step: 2,
      agent_runtime: "claude_computer_use",
      native_dialog_policy: "perceive_blind",
      prior_archetype: "auto",
    },
    promptAddendum:
      "You are Claude operating via computer-use. You read the accessibility tree to find affordances; you do NOT scan visually. You cannot reliably hover. You cannot guess what 'the button next to the search' means without stable identifiers. You cannot solve CAPTCHAs. File findings on: missing roles/names, hover-only critical actions, state changes that don't update the a11y tree, missing or unstable selectors, anti-bot blocks that would stop a legitimate agent.",
    isBuiltIn: true,
  },
  {
    id: "chatgpt_browser_agent",
    label: "ChatGPT Operator agent",
    description: "Browser-using agent. Visual, instruction-following, brittle to layout drift.",
    category: "agent",
    expertise: "intermediate",
    icon: "🌐",
    constraints: {
      shortcuts_allowed: false,
      hovers_allowed: false,
      retries_per_step: 2,
      agent_runtime: "chatgpt_operator",
      native_dialog_policy: "perceive_blind",
      prior_archetype: "auto",
    },
    promptAddendum:
      "You are ChatGPT Operator, browsing the page visually + via the DOM. You expect each step's action target to be unambiguous from the rendered page. Modal layering, off-screen elements, lazy-loaded content, and overlays that intercept clicks all trip you up. File findings on: unstable layouts, hidden-but-interactive elements, modals without a clear close action, anti-bot interstitials, and any flow that requires keyboard-only input.",
    isBuiltIn: true,
  },
  {
    id: "playwright_codegen_agent",
    label: "Playwright codegen agent",
    description: "An LLM authoring Playwright tests. Needs stable selectors + observable success.",
    category: "agent",
    expertise: "expert",
    icon: "🧪",
    constraints: {
      shortcuts_allowed: true,
      hovers_allowed: false,
      retries_per_step: 1,
      agent_runtime: "playwright_codegen",
      native_dialog_policy: "perceive_blind",
      prior_archetype: "auto",
    },
    promptAddendum:
      "You are an LLM authoring a Playwright test for this flow. You need stable, unambiguous selectors — prefer role+name, data-testid, or aria-label. File findings on: critical actions without stable selectors, role/name ambiguity (multiple buttons named 'Save'), elements that only respond to native mouse events, and any action whose success isn't observable from the DOM (visual-only feedback).",
    isBuiltIn: true,
  },
];

export function getBuiltInPersona(id: string): Persona | undefined {
  return BUILT_IN_PERSONAS.find((p) => p.id === id);
}
