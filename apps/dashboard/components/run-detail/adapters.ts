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
  ActionTarget,
  FindingView,
  FooterView,
  HeroView,
  MetricsView,
  PlanStepView,
  ReflectionView,
  RunDetailView,
  RunStatus,
  StepView,
  StepThumb,
  SurpriseKind,
  SurpriseView,
  TopBarView,
} from "./types";

/**
 * Pull the action target + (optional) human-readable element name out of
 * a Playwright MCP `arguments` payload. Recognized arg shapes:
 *
 *   - `browser_click`  / `browser_type` / `browser_hover` / `browser_drag`:
 *       target = args.target ?? args.ref ?? args.selector
 *       element = args.element  (set by Playwright MCP for accessible-name)
 *   - `browser_navigate`:
 *       target = args.url
 *
 * Returns null for tools without a meaningful target (`browser_snapshot`,
 * `browser_take_screenshot`, `browser_press_key`, etc).
 */
export function extractActionTarget(toolName: string, args: unknown): ActionTarget | null {
  if (!toolName) return null;
  const a = (args && typeof args === "object" ? (args as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;

  if (toolName.startsWith("browser_navigate")) {
    const url = typeof a.url === "string" ? a.url : null;
    return url ? { target: url, element: null } : null;
  }

  const TARGETED = new Set([
    "browser_click",
    "browser_type",
    "browser_hover",
    "browser_drag",
    "browser_fill",
    "browser_select_option",
    "browser_file_upload",
  ]);
  if (!TARGETED.has(toolName)) return null;

  const target =
    pickString(a.target) ?? pickString(a.ref) ?? pickString(a.selector) ?? null;
  const element = pickString(a.element);
  if (!target && !element) return null;
  return { target, element };
}

function pickString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

interface PlanRowStep {
  step?: unknown;
  description?: unknown;
  expected_affordance?: unknown;
}

interface PlanRow {
  expected_step_count?: unknown;
  biggest_worry?: unknown;
  expected_path?: unknown;
}

interface SurpriseRow {
  kind?: unknown;
  step_index?: unknown;
  expected?: unknown;
  observed?: unknown;
  recovered?: unknown;
}

interface MetricsRow {
  actual_tool_calls?: unknown;
  actions?: unknown;
  snapshots?: unknown;
  screenshots?: unknown;
  snapshots_per_action?: unknown;
  recovery_count?: unknown;
  errors?: unknown;
  time_to_first_action_ms?: unknown;
}

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
  plan?: PlanRow | null;
  surprises?: SurpriseRow[] | null;
  largest_expectation_gap?: string | null;
  persona_success_confidence?: number | null;
  metrics?: MetricsRow | null;
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
  aria_snapshot?: string | null;
}

interface FindingRow {
  id: string;
  severity: string;
  title: string;
  heuristic: string | null;
  step_index?: number | null;
  first_seen_at?: string | null;
}

interface AdapterInput {
  run: RunRow;
  steps: StepRow[];
  findings: FindingRow[];
  signedScreenshotUrls?: Record<string, string>;
  /**
   * Map of `findings.id → signed URL` for the first-ordinal entry in
   * `finding_screenshots` for that finding. Preferred over the step
   * screenshot when present.
   */
  signedFindingScreenshotUrls?: Record<string, string>;
  /**
   * Wall-clock budget from `flows.budget.max_seconds` for this run's
   * flow. When set, the hero subline renders the remaining-budget chunk.
   */
  flowBudgetSecondsMax?: number | null;
  /** Logged-in user (from layout / cookie); shown in top bar. */
  currentUserLabel?: string | null;
  /** Anything > 0 makes the worker status pill "online". */
  workerOnline?: boolean;
}

export function buildRunDetailView(input: AdapterInput): RunDetailView {
  const {
    run,
    steps,
    findings,
    signedScreenshotUrls,
    signedFindingScreenshotUrls,
    flowBudgetSecondsMax,
    currentUserLabel,
    workerOnline,
  } = input;
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

  const findingViews = findings.map((f) =>
    toFindingView(f, steps, signedScreenshotUrls, signedFindingScreenshotUrls),
  );

  const lastFindingAt = findings.reduce<string | null>((acc, f) => {
    const ts = typeof f.first_seen_at === "string" ? f.first_seen_at : null;
    if (!ts) return acc;
    if (!acc || Date.parse(ts) > Date.parse(acc)) return ts;
    return acc;
  }, null);

  return {
    topBar: buildTopBar(run, currentUserLabel, workerOnline),
    hero: buildHero(run, status, stepViews, elapsedLabel, elapsedSec, flowBudgetSecondsMax ?? null),
    steps: stepViews,
    selectedStepIndex: stepViews.length > 0 ? stepViews[stepViews.length - 1].index : null,
    findings: findingViews,
    lastFindingAt,
    reflection: buildReflection(run),
    footer: buildFooter(run, elapsedLabel),
  };
}

const SURPRISE_KINDS: ReadonlySet<SurpriseKind> = new Set([
  "unexpected_detour",
  "affordance_missing",
  "ambiguous_label",
  "hesitation",
  "recovery",
  "dead_end",
  "expectation_mismatch",
]);

function buildReflection(run: RunRow): ReflectionView {
  const plan = normalizePlan(run.plan);
  const surprises = normalizeSurprises(run.surprises);
  const gap =
    typeof run.largest_expectation_gap === "string" && run.largest_expectation_gap.trim().length > 0
      ? run.largest_expectation_gap
      : null;
  const confidence =
    typeof run.persona_success_confidence === "number" &&
    Number.isFinite(run.persona_success_confidence)
      ? Math.max(0, Math.min(1, run.persona_success_confidence))
      : null;
  const metrics = normalizeMetrics(run.metrics);

  return {
    hasContent: Boolean(plan || surprises.length > 0 || gap || confidence != null || metrics),
    plan,
    surprises,
    largestExpectationGap: gap,
    personaSuccessConfidence: confidence,
    metrics,
  };
}

function normalizePlan(raw: PlanRow | null | undefined): ReflectionView["plan"] {
  if (!raw || typeof raw !== "object") return null;
  const expectedStepCount = typeof raw.expected_step_count === "number" ? raw.expected_step_count : null;
  const biggestWorry =
    typeof raw.biggest_worry === "string" && raw.biggest_worry.trim().length > 0
      ? raw.biggest_worry
      : null;
  const expectedPath = Array.isArray(raw.expected_path)
    ? (raw.expected_path as PlanRowStep[]).map(toPlanStep).filter((s): s is PlanStepView => s != null)
    : [];
  if (expectedStepCount == null && !biggestWorry && expectedPath.length === 0) return null;
  return {
    expectedStepCount: expectedStepCount ?? expectedPath.length,
    biggestWorry,
    expectedPath,
  };
}

function toPlanStep(raw: PlanRowStep): PlanStepView | null {
  if (!raw || typeof raw !== "object") return null;
  const description = typeof raw.description === "string" ? raw.description : "";
  if (description.length === 0) return null;
  const step = typeof raw.step === "number" ? raw.step : 0;
  const expectedAffordance =
    typeof raw.expected_affordance === "string" && raw.expected_affordance.trim().length > 0
      ? raw.expected_affordance
      : null;
  return { step, description, expectedAffordance };
}

function normalizeSurprises(raw: SurpriseRow[] | null | undefined): SurpriseView[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => {
      if (!s || typeof s !== "object") return null;
      const kindRaw = typeof s.kind === "string" ? (s.kind as SurpriseKind) : null;
      if (!kindRaw || !SURPRISE_KINDS.has(kindRaw)) return null;
      const stepIndex = typeof s.step_index === "number" ? s.step_index : 0;
      const expected = typeof s.expected === "string" ? s.expected : "";
      const observed = typeof s.observed === "string" ? s.observed : "";
      const recovered = Boolean(s.recovered);
      if (expected.length === 0 || observed.length === 0) return null;
      return { kind: kindRaw, stepIndex, expected, observed, recovered } satisfies SurpriseView;
    })
    .filter((s): s is SurpriseView => s != null);
}

function normalizeMetrics(raw: MetricsRow | null | undefined): MetricsView | null {
  if (!raw || typeof raw !== "object") return null;
  const toolCalls = numOrNull(raw.actual_tool_calls);
  const actions = numOrNull(raw.actions);
  const snapshots = numOrNull(raw.snapshots);
  const screenshots = numOrNull(raw.screenshots);
  const recoveryCount = numOrNull(raw.recovery_count);
  const errors = numOrNull(raw.errors);
  const snapshotsPerAction =
    typeof raw.snapshots_per_action === "number" && Number.isFinite(raw.snapshots_per_action)
      ? raw.snapshots_per_action
      : null;
  const timeToFirstActionMs =
    typeof raw.time_to_first_action_ms === "number" && Number.isFinite(raw.time_to_first_action_ms)
      ? raw.time_to_first_action_ms
      : null;
  if (
    toolCalls == null &&
    actions == null &&
    snapshots == null &&
    screenshots == null &&
    recoveryCount == null &&
    errors == null &&
    snapshotsPerAction == null &&
    timeToFirstActionMs == null
  ) {
    return null;
  }
  return {
    toolCalls: toolCalls ?? 0,
    actions: actions ?? 0,
    snapshots: snapshots ?? 0,
    screenshots: screenshots ?? 0,
    snapshotsPerAction,
    recoveryCount: recoveryCount ?? 0,
    errors: errors ?? 0,
    timeToFirstActionMs,
  };
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
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

function buildHero(
  run: RunRow,
  status: RunStatus,
  steps: StepView[],
  elapsedLabel: string,
  elapsedSec: number,
  flowBudgetSecondsMax: number | null,
): HeroView {
  const stepCount = run.actual_step_count ?? steps.length;
  const estimated = run.predicted_step_count ?? null;
  const targetUrl = run.walked_url ?? "";
  const hostPath = targetUrl.replace(/^https?:\/\//, "");

  const { headline, outcomeGlow, statusPillLabel, statusPillPulsing, nowDoing } =
    buildHeroStatusBits(status, run.goal_reached, steps);

  const remainingLabel = computeRemainingLabel(status, elapsedSec, flowBudgetSecondsMax);

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
    remainingLabel,
    nowDoing,
    timerLabel: elapsedLabel,
    startedAtMs: new Date(run.started_at).getTime(),
    finishedAtMs: run.finished_at ? new Date(run.finished_at).getTime() : null,
    budgetSecondsMax: flowBudgetSecondsMax,
  };
}

/**
 * Returns a `MM:SS` remaining label while the walk is running with a
 * known budget. Hides on terminal states — once a walk has finished,
 * "remaining" is meaningless and would just confuse.
 */
function computeRemainingLabel(
  status: RunStatus,
  elapsedSec: number,
  budgetSecondsMax: number | null,
): string | null {
  if (status !== "running") return null;
  if (budgetSecondsMax == null || budgetSecondsMax <= 0) return null;
  const remaining = Math.max(0, budgetSecondsMax - elapsedSec);
  return formatDuration(Math.floor(remaining));
}

/** Re-formats `seconds` as `MM:SS`. Exported so `RunDetailLive` can
 * compute its 1Hz tick without depending on the adapter's internals. */
export function formatElapsed(seconds: number): string {
  return formatDuration(Math.max(0, Math.floor(seconds)));
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
      ? { verb: humanizeVerb(lastStep.toolName), target: deriveNowDoingTarget(lastStep) }
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

  const toolName = step.tool_name ?? "unknown";
  return {
    index: step.step_index,
    toolName,
    status,
    durationLabel:
      step.duration_ms != null ? `${(step.duration_ms / 1000).toFixed(1)}s` : "—",
    url: step.url_after ?? "",
    thumb,
    actionTarget: extractActionTarget(toolName, step.args),
    ariaSnapshot:
      typeof step.aria_snapshot === "string" && step.aria_snapshot.length > 0
        ? step.aria_snapshot
        : null,
  };
}

function toFindingView(
  f: FindingRow,
  steps: StepRow[],
  signedUrls: Record<string, string> | undefined,
  signedFindingUrls: Record<string, string> | undefined,
): FindingView {
  const severity = (["critical", "major", "minor", "nit"].includes(f.severity)
    ? f.severity
    : "minor") as FindingView["severity"];
  const stepIndex = f.step_index ?? null;
  const refStep = stepIndex != null ? steps.find((s) => s.step_index === stepIndex) : undefined;

  // Prefer a finding-specific screenshot over the step screenshot.
  const findingShot = signedFindingUrls?.[f.id];
  const stepShot =
    refStep?.screenshot_key && signedUrls?.[refStep.screenshot_key]
      ? signedUrls[refStep.screenshot_key]
      : null;
  const thumb: StepThumb = findingShot
    ? { kind: "image", src: findingShot, alt: `Screenshot for ${f.title}` }
    : stepShot
      ? { kind: "image", src: stepShot, alt: `Step ${stepIndex} screenshot for ${f.title}` }
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

/**
 * Prefer the human-readable element name (e.g., "Run walk"); fall back to
 * the stable target ref; fall back to the step URL. NowDoing speaks human
 * first, machine second.
 */
function deriveNowDoingTarget(step: StepView): string {
  const at = step.actionTarget;
  if (at?.element) return at.element;
  if (at?.target) return at.target;
  return shortTarget(step.url);
}
