/**
 * Convert raw Supabase rows from /runs/[id] into view models the
 * run-detail components consume. Pure functions, no Supabase calls —
 * pass already-fetched rows in.
 *
 * Screenshot resolution: callers pass a `signedUrls` map keyed by
 * `run_steps.screenshot_key`. The adapter prefers those URLs and falls
 * back to a placeholder when a step has no screenshot yet (the daemon
 * doesn't write screenshot_key on every step today — Track B2 in
 * docs/plans/live-walk.md).
 */

import type {
  FindingView,
  FooterView,
  HeroView,
  RunDetailView,
  RunStatus,
  StepView,
  StepThumb,
  TopBarView,
} from "./types";

interface RunRow {
  id: string;
  project_id: string;
  flow_id: string;
  persona_id: string;
  status: string;
  goal_reached: boolean | null;
  predicted_step_count: number | null;
  actual_step_count: number | null;
  started_at: string;
  finished_at: string | null;
  branch: string | null;
  commit_sha: string | null;
  walked_url: string | null;
  initiator_label: string | null;
}

interface StepRow {
  step_index: number;
  direction: string;
  tool_name: string | null;
  args: unknown;
  result_summary: string | null;
  url_after: string | null;
  duration_ms: number | null;
  screenshot_key?: string | null;
}

interface FindingRow {
  id: string;
  severity: string;
  title: string;
  heuristic: string | null;
  step_index?: number | null;
}

interface AdapterInput {
  run: RunRow;
  steps: StepRow[];
  findings: FindingRow[];
  signedScreenshotUrls?: Record<string, string>;
  /** Logged-in user (from layout / cookie); shown in top bar. */
  currentUserLabel?: string | null;
  /** Anything > 0 makes the worker status pill "online". */
  workerOnline?: boolean;
}

export function buildRunDetailView(input: AdapterInput): RunDetailView {
  const { run, steps, findings, signedScreenshotUrls, currentUserLabel, workerOnline } = input;
  const status = normalizeStatus(run.status, run.goal_reached);
  const isRunning = status === "running";

  const elapsedSec = computeElapsedSeconds(run.started_at, run.finished_at);
  const elapsedLabel = formatDuration(elapsedSec);

  const stepViews = steps.map((s) => toStepView(s, signedScreenshotUrls));
  // If the run is still running and the latest step is a "result" with no
  // following "running" placeholder, synthesize a tail "running" tile so
  // the filmstrip never goes flat during a live walk.
  if (isRunning && stepViews.length > 0 && stepViews[stepViews.length - 1].status === "done") {
    // No-op for now — the running tile would be daemon-driven. Track B2.
  }

  const findingViews = findings.map((f) => toFindingView(f, steps, signedScreenshotUrls));

  return {
    topBar: buildTopBar(run, currentUserLabel, workerOnline),
    hero: buildHero(run, status, stepViews, elapsedLabel),
    steps: stepViews,
    selectedStepIndex: stepViews.length > 0 ? stepViews[stepViews.length - 1].index : null,
    findings: findingViews,
    footer: buildFooter(run, elapsedLabel),
  };
}

function normalizeStatus(raw: string, goalReached: boolean | null): RunStatus {
  if (raw === "running") return "running";
  if (raw === "failed") return "errored";
  if (raw === "completed") return goalReached === false ? "errored" : "done";
  return "pending";
}

function computeElapsedSeconds(startedAt: string, finishedAt: string | null): number {
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  return Math.max(0, Math.floor((end - start) / 1000));
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function buildTopBar(run: RunRow, userLabel: string | null | undefined, online: boolean | undefined): TopBarView {
  return {
    runId: run.id,
    runIdShort: run.id.slice(0, 8),
    project: run.project_id,
    userLabel: userLabel ?? null,
    workerStatus: online ? "online" : "unknown",
  };
}

function buildHero(run: RunRow, status: RunStatus, steps: StepView[], elapsedLabel: string): HeroView {
  const stepCount = run.actual_step_count ?? steps.length;
  const estimated = run.predicted_step_count ?? null;
  const targetUrl = run.walked_url ?? "";
  const hostPath = targetUrl.replace(/^https?:\/\//, "");

  const { headline, outcomeGlow, statusPillLabel, statusPillPulsing, nowDoing } =
    buildHeroStatusBits(status, run.goal_reached, steps);

  return {
    status,
    headline,
    outcomeGlow,
    flowId: run.flow_id,
    personaId: run.persona_id,
    personaLabel: prettyPersona(run.persona_id),
    targetUrl,
    targetUrlHostPath: hostPath || "—",
    flowUuid: run.id,
    statusPill: { label: statusPillLabel, pulsing: statusPillPulsing },
    stepCount,
    estimatedStepCount: estimated,
    elapsedLabel,
    remainingLabel: null,
    nowDoing,
    timerLabel: elapsedLabel,
  };
}

function buildHeroStatusBits(
  status: RunStatus,
  goalReached: boolean | null,
  steps: StepView[],
): {
  headline: string;
  outcomeGlow: "accent" | "rose" | null;
  statusPillLabel: string;
  statusPillPulsing: boolean;
  nowDoing: HeroView["nowDoing"];
} {
  if (status === "running") {
    const lastStep = steps[steps.length - 1];
    const inferredNowDoing = lastStep
      ? { verb: humanizeVerb(lastStep.toolName), target: shortTarget(lastStep.url) }
      : null;
    return {
      headline: "Walking the app",
      outcomeGlow: null,
      statusPillLabel: "Walking",
      statusPillPulsing: true,
      nowDoing: inferredNowDoing,
    };
  }
  if (status === "errored") {
    return {
      headline: goalReached === false ? "Goal not reached" : "Walk failed",
      outcomeGlow: "rose",
      statusPillLabel: "Errored",
      statusPillPulsing: false,
      nowDoing: null,
    };
  }
  if (status === "done") {
    return {
      headline: goalReached ? "Goal reached" : "Walk completed",
      outcomeGlow: goalReached ? "accent" : null,
      statusPillLabel: "Completed",
      statusPillPulsing: false,
      nowDoing: null,
    };
  }
  return {
    headline: "Walk pending",
    outcomeGlow: null,
    statusPillLabel: "Pending",
    statusPillPulsing: false,
    nowDoing: null,
  };
}

function toStepView(step: StepRow, signedUrls: Record<string, string> | undefined): StepView {
  const status: StepView["status"] =
    step.direction === "error" ? "errored" : step.direction === "call" ? "running" : "done";

  const thumb: StepThumb = step.screenshot_key && signedUrls?.[step.screenshot_key]
    ? { kind: "image", src: signedUrls[step.screenshot_key] }
    : { kind: "placeholder", reason: status === "running" ? "running" : "no-screenshot" };

  return {
    index: step.step_index,
    toolName: step.tool_name ?? "unknown",
    status,
    durationLabel:
      step.duration_ms != null ? `${(step.duration_ms / 1000).toFixed(1)}s` : "—",
    url: step.url_after ?? "",
    thumb,
  };
}

function toFindingView(
  f: FindingRow,
  steps: StepRow[],
  signedUrls: Record<string, string> | undefined,
): FindingView {
  const severity = (["critical", "major", "minor", "nit"].includes(f.severity)
    ? f.severity
    : "minor") as FindingView["severity"];
  const stepIndex = f.step_index ?? null;
  const refStep = stepIndex != null ? steps.find((s) => s.step_index === stepIndex) : undefined;
  const thumb: StepThumb =
    refStep?.screenshot_key && signedUrls?.[refStep.screenshot_key]
      ? { kind: "image", src: signedUrls[refStep.screenshot_key] }
      : { kind: "placeholder", reason: "no-screenshot" };
  return {
    id: f.id,
    severity,
    title: f.title,
    heuristic: f.heuristic ?? "uncategorized",
    stepIndex,
    thumb,
  };
}

function buildFooter(run: RunRow, elapsedLabel: string): FooterView {
  return {
    commit: run.commit_sha ? run.commit_sha.slice(0, 7) : null,
    branch: run.branch,
    daemon: run.initiator_label,
    runShort: run.id.slice(0, 8),
    startedLabel: relativeAgo(run.started_at, elapsedLabel),
  };
}

function relativeAgo(startedAt: string, _elapsedLabel: string): string {
  const sec = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function prettyPersona(id: string): string {
  return id
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

function humanizeVerb(toolName: string): string {
  if (toolName.startsWith("browser_click")) return "Clicking";
  if (toolName.startsWith("browser_type")) return "Typing into";
  if (toolName.startsWith("browser_snapshot")) return "Reading";
  if (toolName.startsWith("browser_take_screenshot")) return "Capturing";
  if (toolName.startsWith("browser_navigate")) return "Navigating to";
  return "Running";
}

function shortTarget(url: string): string {
  if (!url) return "—";
  const stripped = url.replace(/^https?:\/\//, "");
  return stripped.length > 48 ? stripped.slice(0, 45) + "…" : stripped;
}
