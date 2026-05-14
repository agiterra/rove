/**
 * View-model types for the run-detail surface. Components consume these
 * shapes, NOT raw Supabase rows. The adapter in ./adapters.ts converts
 * DB rows → view models so the same components serve both
 * /preview/live-walk (mock data) and /runs/[id] (real data).
 */

import type { ThumbKind } from "./MockThumbs";

export type RunStatus = "running" | "done" | "errored" | "pending";

export type StepThumb =
  | { kind: "mock"; name: ThumbKind }
  | { kind: "image"; src: string; alt?: string }
  | { kind: "placeholder"; reason: "no-screenshot" | "running" };

export interface StepView {
  index: number;
  toolName: string;
  status: "running" | "done" | "errored";
  durationLabel: string;
  url: string;
  thumb: StepThumb;
}

export interface FindingView {
  id: string;
  severity: "critical" | "major" | "minor" | "nit";
  title: string;
  heuristic: string;
  stepIndex: number | null;
  thumb: StepThumb;
}

export interface NowDoing {
  verb: string;
  target: string;
}

/** Headline + subline + status pill content for the hero. */
export interface HeroView {
  status: RunStatus;
  headline: string;
  /** Optional cyan glow ("done") or rose glow ("errored"). */
  outcomeGlow: "accent" | "rose" | null;
  /** Top-line eyebrow: RUN · flow · persona. */
  flowId: string;
  personaId: string;
  personaLabel: string;
  /** 2x2 metric grid right side. */
  targetUrl: string;
  targetUrlHostPath: string;
  flowUuid: string;
  statusPill: { label: string; pulsing: boolean };
  /** Subline: "Step 8 of ~25 · 1m 32s elapsed · 3m 28s remaining budget". */
  stepCount: number;
  estimatedStepCount: number | null;
  elapsedLabel: string;
  remainingLabel: string | null;
  /** Top-right NowDoing pill content. Null on completed/errored. */
  nowDoing: NowDoing | null;
  /** Always-on timer (elapsed for done, live for running). */
  timerLabel: string;
}

export interface FooterView {
  commit: string | null;
  branch: string | null;
  daemon: string | null;
  runShort: string;
  startedLabel: string;
}

export interface TopBarView {
  runId: string;
  runIdShort: string;
  project: string;
  userLabel: string | null;
  workerStatus: "online" | "offline" | "unknown";
}

export type SurpriseKind =
  | "unexpected_detour"
  | "affordance_missing"
  | "ambiguous_label"
  | "hesitation"
  | "recovery"
  | "dead_end"
  | "expectation_mismatch";

export interface PlanStepView {
  step: number;
  description: string;
  expectedAffordance: string | null;
}

export interface SurpriseView {
  kind: SurpriseKind;
  stepIndex: number;
  expected: string;
  observed: string;
  recovered: boolean;
}

export interface MetricsView {
  toolCalls: number;
  actions: number;
  snapshots: number;
  screenshots: number;
  snapshotsPerAction: number | null;
  recoveryCount: number;
  errors: number;
  timeToFirstActionMs: number | null;
}

export interface ReflectionView {
  /** True if the run has any reflection data to render (plan / surprises / gap / confidence / metrics). */
  hasContent: boolean;
  plan: {
    expectedStepCount: number;
    biggestWorry: string | null;
    expectedPath: PlanStepView[];
  } | null;
  surprises: SurpriseView[];
  largestExpectationGap: string | null;
  /** 0..1. */
  personaSuccessConfidence: number | null;
  metrics: MetricsView | null;
}

export interface RunDetailView {
  topBar: TopBarView;
  hero: HeroView;
  steps: StepView[];
  selectedStepIndex: number | null;
  findings: FindingView[];
  reflection: ReflectionView;
  footer: FooterView;
}
