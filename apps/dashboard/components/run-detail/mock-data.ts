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

// ── Mock → ViewModel converter ───────────────────────────────────────────
// Lets /preview/live-walk feed the parameterized components the same
// shapes that /runs/[id]'s adapter (./adapters.ts) produces from real
// Supabase rows.

import type {
  FindingView,
  FooterView,
  HeroView,
  RunDetailView,
  StepView,
  TopBarView,
} from "./types";

const STATUS_MAP = {
  done: "done",
  running: "running",
  errored: "errored",
  pending: "running",
} as const;

export function buildMockRunDetailView(): RunDetailView {
  const stepViews: StepView[] = STEPS.map((s) => ({
    index: s.index,
    toolName: s.toolName,
    status: STATUS_MAP[s.status],
    durationLabel: s.durationLabel,
    url: s.url,
    thumb: { kind: "mock", name: s.thumb },
  }));

  const findingViews: FindingView[] = FINDINGS.map((f) => ({
    id: f.id,
    severity: f.severity,
    title: f.title,
    heuristic: f.heuristic,
    stepIndex: f.stepIndex,
    thumb: { kind: "mock", name: f.thumb },
  }));

  const hero: HeroView = {
    status: "running",
    headline: "Walking the app",
    outcomeGlow: null,
    flowId: RUN_META.flowId,
    personaId: RUN_META.personaId,
    personaLabel: RUN_META.personaLabel,
    targetUrl: RUN_META.targetUrl,
    targetUrlHostPath: RUN_META.targetUrl.replace(/^https?:\/\//, ""),
    flowUuid: RUN_META.flowUuid,
    statusPill: { label: "Walking", pulsing: true },
    stepCount: SELECTED_STEP_INDEX,
    estimatedStepCount: 25,
    elapsedLabel: RUN_META.elapsedLabel,
    remainingLabel: RUN_META.remainingLabel,
    nowDoing: NOW_DOING,
    timerLabel: RUN_META.elapsedLabel,
  };

  const topBar: TopBarView = {
    runId: RUN_META.id,
    runIdShort: RUN_META.id,
    project: RUN_META.project,
    userLabel: RUN_META.user,
    workerStatus: "online",
  };

  const footer: FooterView = {
    commit: RUN_META.commitSha,
    branch: RUN_META.branch,
    daemon: RUN_META.daemon,
    runShort: RUN_META.runShort,
    startedLabel: RUN_META.startedAgo,
  };

  return {
    topBar,
    hero,
    steps: stepViews,
    selectedStepIndex: SELECTED_STEP_INDEX,
    findings: findingViews,
    footer,
  };
}
