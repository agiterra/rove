/**
 * Fixtures for /preview/live-walk. Ported from Claude Design's "Live Walk.html"
 * handoff (chats/chat1.md). The shape mirrors real runs / run_steps / findings
 * rows so the same components can later read live Supabase data with no
 * re-typing.
 */

import type { LifecycleFinding } from "../finding-lifecycle/types";
import type {
  ActionTarget,
  AffordanceGap,
  FindingView,
  FooterView,
  HeroView,
  ReflectionView,
  RunDetailView,
  StepView,
  TopBarView,
} from "./types";

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

export const LIFECYCLE_FINDINGS: LifecycleFinding[] = [
  {
    id: "fnd_01",
    severity: "critical",
    title: "Login button lacks accessible name",
    heuristicId: "agent.accessibility_tree_completeness",
    url: "https://app.tankloop.com/signin",
    evidence: "<button class='btn-primary' onClick={…}></button>",
    suggestedLocation: "apps/web/src/pages/signin.tsx:48",
    runId: RUN_META.id,
    flowId: RUN_META.flowId,
    personaId: RUN_META.personaId,
    personaLabel: RUN_META.personaLabel,
    silencedAt: null,
    silenceReason: null,
    silenceScope: null,
    githubIssueUrl: null,
  },
  {
    id: "fnd_02",
    severity: "major",
    title: "Loading state has no aria-live region",
    heuristicId: "agent.feedback_announced",
    url: "https://app.tankloop.com/runs/abc123def",
    evidence: "<div className='spinner'/>",
    suggestedLocation: "apps/web/src/components/run-loader.tsx:12",
    runId: RUN_META.id,
    flowId: RUN_META.flowId,
    personaId: RUN_META.personaId,
    personaLabel: RUN_META.personaLabel,
    silencedAt: null,
    silenceReason: null,
    silenceScope: null,
    githubIssueUrl: null,
  },
  {
    id: "fnd_03",
    severity: "minor",
    title: "Heading hierarchy skips h2 inside main",
    heuristicId: "agent.semantic_html",
    url: "https://app.tankloop.com/runs?q=walk",
    evidence: "<main><h1>…</h1><h3>…</h3></main>",
    suggestedLocation: "apps/web/src/pages/runs.tsx:88",
    runId: RUN_META.id,
    flowId: RUN_META.flowId,
    personaId: RUN_META.personaId,
    personaLabel: RUN_META.personaLabel,
    silencedAt: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(),
    silenceReason: "intentional design choice — h3 is contextually correct",
    silenceScope: "finding",
    githubIssueUrl: null,
  },
  {
    id: "fnd_04",
    severity: "major",
    title: "Filter dropdown only opens on hover",
    heuristicId: "agent.no_hover_only",
    url: "https://app.tankloop.com/runs",
    evidence: ".filter-menu { display: none; } .filter:hover .filter-menu { display: block; }",
    suggestedLocation: "apps/web/src/components/runs-filter.tsx:24",
    runId: RUN_META.id,
    flowId: RUN_META.flowId,
    personaId: RUN_META.personaId,
    personaLabel: RUN_META.personaLabel,
    silencedAt: null,
    silenceReason: null,
    silenceScope: null,
    githubIssueUrl: "https://github.com/agiterra/tankloop/issues/4271",
  },
];

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

const MOCK_ARIA_SNAPSHOT = `- banner:
  - navigation:
    - link "Runs" [ref=e1]: /runs
    - link "Flows" [ref=e2]: /flows
- main:
  - region "Walk overview":
    - heading "Walking the app" [level=1] [ref=e6]
    - region "Live action":
      - button "Run walk" [ref=e7]
`;

function mockActionTarget(s: MockStep): ActionTarget | null {
  if (s.toolName.startsWith("browser_click")) {
    if (s.index === 8) return { target: "e7", element: "Run walk button" };
    if (s.index === 5) return { target: "e3", element: "Open Runs nav item" };
    if (s.index === 7) return { target: "e4", element: "Apply saved view" };
    return { target: `e${s.index}`, element: null };
  }
  if (s.toolName.startsWith("browser_type")) {
    if (s.index === 6) return { target: "e2", element: 'Search input — "walk"' };
    return { target: `e${s.index}`, element: null };
  }
  return null;
}

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
    actionTarget: mockActionTarget(s),
    ariaSnapshot: s.index === 8 ? MOCK_ARIA_SNAPSHOT : null,
    typedText: s.toolName === "browser_type" && s.index === 6 ? "walk" : null,
    resultSummary: null,
    dialog:
      s.index === 10
        ? {
            type: "confirm",
            message: "Delete this workspace? This action cannot be undone.",
            personaPerceived: false,
          }
        : null,
    affordance_gaps: MOCK_AFFORDANCE_GAPS_BY_STEP[s.index],
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
    // Frozen at 00:01:32 — finishedAtMs is non-null so the ticker won't
    // advance in the preview, even though status === "running".
    startedAtMs: Date.now() - 92_000,
    finishedAtMs: Date.now(),
    budgetSecondsMax: 300, // 5m budget — preview shows "03:28 remaining"
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

  const reflection: ReflectionView = {
    hasContent: true,
    plan: {
      expectedStepCount: 22,
      biggestWorry:
        "The filter UI on /runs might be hidden behind a hover-only menu, which would block keyboard-driven users.",
      expectedPath: [
        { step: 1, description: "Sign in", expectedAffordance: "Primary auth CTA on /signin" },
        { step: 2, description: "Land on the dashboard home", expectedAffordance: "Side nav with project context" },
        { step: 3, description: "Open the Runs page", expectedAffordance: '"Runs" nav item' },
        { step: 4, description: "Apply a filter", expectedAffordance: "Filter pill or search input" },
        { step: 5, description: "Open a recent run", expectedAffordance: "Row click → run detail" },
        { step: 6, description: "Trigger a fresh walk", expectedAffordance: '"Run walk" primary button' },
        { step: 7, description: "Watch the walk progress", expectedAffordance: "Live filmstrip + status pill" },
        { step: 8, description: "Open a flagged finding", expectedAffordance: "Findings card → drawer" },
      ],
    },
    surprises: [
      {
        kind: "affordance_missing",
        stepIndex: 6,
        expected: "Filter pill labeled 'flow' on the Runs page",
        observed: "No filter UI visible until a magnifier icon was opened",
        recovered: true,
      },
      {
        kind: "expectation_mismatch",
        stepIndex: 10,
        expected: "Toast confirms walk launch within 2 seconds",
        observed: "No toast — only the status pill changed; relied on the filmstrip to confirm",
        recovered: false,
      },
    ],
    largestExpectationGap:
      "The Runs filter UI was hidden behind an icon-only button with no accessible name — keyboard-only users would not discover it. The plan assumed a visible filter pill.",
    personaSuccessConfidence: 0.62,
    metrics: {
      toolCalls: 28,
      actions: 11,
      snapshots: 12,
      screenshots: 5,
      snapshotsPerAction: 1.09,
      recoveryCount: 1,
      errors: 1,
      timeToFirstActionMs: 1820,
    },
  };

  return {
    topBar,
    hero,
    steps: stepViews,
    selectedStepIndex: SELECTED_STEP_INDEX,
    findings: findingViews,
    lastFindingAt: new Date(Date.now() - 92_000).toISOString(),
    reflection,
    footer,
  };
}

// ── Mock affordance gaps (additive, 2026-05-14) ─────────────────────────────
// Substantive pages get a non-empty inventory; transient steps (browser_type
// without a URL change, errored navigations) get nothing. Mirrors the
// substantive-page detection rules in the MCP proxy.
const MOCK_AFFORDANCE_GAPS_BY_STEP: Record<number, AffordanceGap[]> = {
  8: [
    {
      kind: "delete",
      expected_for: "Power User reviewing an old run to clear it from the list",
      severity: "critical",
      evidence:
        "Toolbar exposes Re-run [ref=e7] and Share [ref=e9]; overflow menu offers Copy URL + Open in new tab; no Delete or Archive affordance anywhere on the run-detail page.",
      suggested_location: "Toolbar overflow menu next to Share, with a confirm step",
    },
    {
      kind: "navigate",
      expected_for: "Power User wanting to jump from this run to the parent flow",
      severity: "medium",
      evidence:
        "Breadcrumb shows '← all runs' but no link to the originating flow's detail page; the flow_id is rendered as plain text in the hero.",
      suggested_location: "Make the flow_id chip in the hero a link to /flows/<id>",
    },
  ],
  11: [
    {
      kind: "save_state",
      expected_for: "Power User editing workspace settings",
      severity: "high",
      evidence:
        "Workspace name + slug form has 8 inputs and a single 'Save' button at the bottom; no auto-save indicator, no dirty-state warning, no unsaved-changes prompt on navigation.",
      suggested_location:
        "Header-level 'unsaved changes · save' affordance and a beforeunload guard on the form",
    },
    {
      kind: "empty",
      expected_for: "First-time admin landing on the workspace settings page",
      severity: "minor",
      evidence:
        "Members list renders an empty <ul> when the workspace has zero invited members; no onboarding CTA explaining how to invite the first teammate.",
      suggested_location: "Empty-state card in the members list with a 'Invite first teammate' CTA",
    },
  ],
};
