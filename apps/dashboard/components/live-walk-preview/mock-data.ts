/**
 * Hardcoded fixtures for /preview/live-walk. Mirrors the shape of real
 * runs / run_steps / findings rows from Supabase so the components can
 * be ported to live data later without rewriting types.
 */

export type StepStatus = "done" | "running" | "errored" | "pending";

export interface MockStep {
  index: number;
  toolName: string;
  status: StepStatus;
  durationMs: number;
  urlAfter: string;
  caption: string;
  shotKind: ShotKind;
}

export interface MockFinding {
  id: string;
  severity: "critical" | "major" | "minor" | "nit";
  title: string;
  heuristic: string;
  stepIndex: number;
  shotKind: ShotKind;
}

export type ShotKind =
  | "list-view"
  | "form-empty"
  | "form-filled"
  | "modal-confirm"
  | "loading"
  | "error-state"
  | "details"
  | "success";

export const RUN_META = {
  id: "f5b81aef-ec00-4db0-a226-fd2c973ff9a7",
  flowId: "eval_dashboard.discover_flows",
  personaId: "claude_browser_agent",
  targetUrl: "https://app.tankloop.io",
  status: "running" as const,
  startedAt: "2026-05-14T01:08:14.706+00:00",
  budgetStepsMax: 25,
  budgetSecondsMax: 300,
  elapsedSeconds: 92,
  commitSha: "64ccef7",
  branch: "main",
  daemon: "WrangleMeThis-Mac",
  project: "tankloop",
};

export const NOW_DOING = {
  verb: "Clicking",
  target: "Run walk",
  startedAtOffsetMs: 1100,
};

export const STEPS: MockStep[] = [
  {
    index: 1,
    toolName: "browser_navigate",
    status: "done",
    durationMs: 1180,
    urlAfter: "/runs",
    caption: "Navigating to /runs",
    shotKind: "list-view",
  },
  {
    index: 2,
    toolName: "browser_snapshot",
    status: "done",
    durationMs: 420,
    urlAfter: "/runs",
    caption: "Reading the runs list",
    shotKind: "list-view",
  },
  {
    index: 3,
    toolName: "browser_click",
    status: "done",
    durationMs: 280,
    urlAfter: "/flows",
    caption: 'Clicking nav "Flows"',
    shotKind: "details",
  },
  {
    index: 4,
    toolName: "browser_take_screenshot",
    status: "done",
    durationMs: 640,
    urlAfter: "/flows",
    caption: "Capturing the flows page",
    shotKind: "details",
  },
  {
    index: 5,
    toolName: "browser_click",
    status: "errored",
    durationMs: 2210,
    urlAfter: "/flows",
    caption: 'Tried to click "Run walk" (no accessible name)',
    shotKind: "error-state",
  },
  {
    index: 6,
    toolName: "browser_snapshot",
    status: "done",
    durationMs: 510,
    urlAfter: "/flows",
    caption: "Re-reading the page to find affordances",
    shotKind: "form-empty",
  },
  {
    index: 7,
    toolName: "browser_click",
    status: "done",
    durationMs: 320,
    urlAfter: "/flows/discover_flows",
    caption: 'Clicking the flow card "discover_flows"',
    shotKind: "form-filled",
  },
  {
    index: 8,
    toolName: "browser_click",
    status: "running",
    durationMs: 0,
    urlAfter: "/flows/discover_flows",
    caption: 'Clicking "Run walk"',
    shotKind: "modal-confirm",
  },
];

export const ARIA_TREE = [
  { depth: 0, role: "banner", name: null, expanded: true, highlighted: false },
  { depth: 1, role: "navigation", name: null, expanded: true, highlighted: false },
  { depth: 2, role: "link", name: "Runs", expanded: null, highlighted: false },
  { depth: 2, role: "link", name: "Flows", expanded: null, highlighted: false },
  { depth: 2, role: "link", name: "Findings", expanded: null, highlighted: false },
  { depth: 0, role: "main", name: null, expanded: true, highlighted: false },
  { depth: 1, role: "region", name: "Flow detail", expanded: true, highlighted: false },
  { depth: 2, role: "heading", name: "discover_flows", expanded: null, highlighted: false },
  { depth: 2, role: "region", name: "Persona picker", expanded: false, highlighted: false },
  { depth: 2, role: "region", name: "Run controls", expanded: true, highlighted: false },
  { depth: 3, role: "button", name: "Run walk", expanded: null, highlighted: true },
  { depth: 3, role: "button", name: "Cancel", expanded: null, highlighted: false },
];

export const FINDINGS: MockFinding[] = [
  {
    id: "fnd_01",
    severity: "critical",
    title: "Run-walk button on /flows lacks an accessible name",
    heuristic: "agent.accessibility_tree_completeness",
    stepIndex: 5,
    shotKind: "error-state",
  },
  {
    id: "fnd_02",
    severity: "major",
    title: "Loading state on /flows has no aria-live region",
    heuristic: "agent.feedback_announced",
    stepIndex: 4,
    shotKind: "details",
  },
  {
    id: "fnd_03",
    severity: "minor",
    title: "Heading hierarchy on flow detail skips h2",
    heuristic: "agent.semantic_html",
    stepIndex: 7,
    shotKind: "form-filled",
  },
];

export const SELECTED_STEP_INDEX = 8;
