/**
 * Fixtures for /preview/live-walk. Ported from Claude Design's "Live Walk.html"
 * handoff (chats/chat1.md). The shape mirrors real runs / run_steps / findings
 * rows so the same components can later read live Supabase data with no
 * re-typing.
 */

export type StepStatus = "done" | "running" | "errored" | "pending";

export type ThumbKind =
  | "dashboard"
  | "runs"
  | "filters"
  | "saveView"
  | "walkOver"
  | "walkIdle"
  | "liveAction"
  | "settings"
  | "dangerZone"
  | "workspace"
  | "loading"
  | "login";

export interface MockStep {
  index: number;
  toolName: string;
  status: StepStatus;
  durationLabel: string;
  url: string;
  thumb: ThumbKind;
}

export interface MockFinding {
  id: string;
  severity: "critical" | "major" | "minor" | "nit";
  title: string;
  heuristic: string;
  stepIndex: number;
  thumb: ThumbKind;
}

export const RUN_META = {
  id: "abc123def",
  flowId: "eval_dashboard.discover_flows",
  personaLabel: "Power User",
  personaId: "claude_browser_agent",
  targetUrl: "https://app.tankloop.com",
  flowUuid: "d3f5c9a8-7b21-4e2c",
  budgetLabel: "5m 00s",
  elapsedLabel: "00:01:32",
  remainingLabel: "03:28",
  commitSha: "64ccef7",
  branch: "main",
  daemon: "WrangleMeThis-Mac",
  runShort: "f5b81aef",
  startedAgo: "2m ago",
  project: "tankloop",
  user: "alex",
};

export const NOW_DOING = {
  verb: "Clicking",
  target: '"Run walk"',
};

export const STEPS: MockStep[] = [
  { index: 4, toolName: "browser_snapshot", status: "done", durationLabel: "1.2s", url: "app.tankloop.com/runs", thumb: "dashboard" },
  { index: 5, toolName: "browser_click", status: "done", durationLabel: "1.1s", url: "app.tankloop.com/runs", thumb: "runs" },
  { index: 6, toolName: "browser_type", status: "done", durationLabel: "2.3s", url: "app.tankloop.com/runs?q=walk", thumb: "filters" },
  { index: 7, toolName: "browser_click", status: "done", durationLabel: "1.0s", url: "app.tankloop.com/runs", thumb: "saveView" },
  { index: 8, toolName: "browser_click", status: "running", durationLabel: "1.4s", url: "app.tankloop.com/runs/abc123def", thumb: "walkOver" },
  { index: 9, toolName: "browser_take_screenshot", status: "done", durationLabel: "1.3s", url: "app.tankloop.com/runs/abc123def", thumb: "liveAction" },
  { index: 10, toolName: "browser_type", status: "errored", durationLabel: "2.6s", url: "app.tankloop.com/settings/danger", thumb: "dangerZone" },
  { index: 11, toolName: "browser_snapshot", status: "done", durationLabel: "0.9s", url: "app.tankloop.com/settings/workspace", thumb: "workspace" },
];

export const SELECTED_STEP_INDEX = 8;

export const FINDINGS: MockFinding[] = [
  {
    id: "fnd_01",
    severity: "critical",
    title: "Login button lacks accessible name",
    heuristic: "agent.accessibility_tree_completeness",
    stepIndex: 8,
    thumb: "login",
  },
  {
    id: "fnd_02",
    severity: "major",
    title: "Loading state has no aria-live region",
    heuristic: "agent.feedback_announced",
    stepIndex: 9,
    thumb: "loading",
  },
  {
    id: "fnd_03",
    severity: "minor",
    title: "Heading hierarchy skips h2 inside main",
    heuristic: "agent.semantic_html",
    stepIndex: 6,
    thumb: "filters",
  },
];
