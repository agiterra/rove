import { z } from "zod";

// ── Personas ──────────────────────────────────────────────────────────────────

export type PersonaCategory =
  | "end-user"
  | "internal-user"
  | "admin"
  | "mobile"
  | "accessibility"
  | "agent"
  | "custom";

export type PersonaExpertise = "novice" | "intermediate" | "expert";

export type AgentRuntime =
  | "claude_computer_use"
  | "chatgpt_operator"
  | "browser_use"
  | "playwright_codegen";

export interface PersonaConstraints {
  shortcuts_allowed: boolean;
  hovers_allowed: boolean;
  keyboard_navigation_only?: boolean;
  retries_per_step: number;
  /**
   * Agent personas only — which agent runtime this persona simulates.
   * The walk prompt injects different "what an agent of this shape can
   * actually do" guidance based on the runtime.
   */
  agent_runtime?: AgentRuntime;
}

export interface Persona {
  id: string;
  label: string;
  description: string;
  category: PersonaCategory;
  expertise: PersonaExpertise;
  constraints: PersonaConstraints;
  promptAddendum: string;
  isBuiltIn: boolean;
  icon?: string;
}

// ── Flows ─────────────────────────────────────────────────────────────────────

export interface FlowInfo {
  flowId: string;
  goal: string;
  filePath: string;
}

// ── Findings (the contract between agent stdout and the sink) ─────────────────

export const FINDING_SEVERITIES = ["critical", "major", "minor", "nit"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const findingScreenshotSchema = z.object({
  /** Path relative to the per-run screenshots dir, e.g. "step3-empty-state.png". */
  path: z.string().min(1),
  /** Optional human-readable caption the agent attaches. */
  caption: z.string().optional(),
});

export const findingSchema = z.object({
  id: z.string().min(1),
  severity: z.enum(FINDING_SEVERITIES),
  title: z.string().min(1),
  description: z.string().min(1),
  step_index: z.number().int().nonnegative().optional(),
  heuristic: z.string().optional(),
  evidence: z.string().optional(),
  /**
   * Screenshots the agent captured for this finding. Each entry references a
   * file the agent saved into the run's screenshots dir (the prompt tells the
   * agent exactly where). Sinks may upload these somewhere durable
   * (Supabase Storage) or just reference the on-disk path (Markdown).
   *
   * Agents may emit either a bare string ("step1.png") or a full
   * `{ path, caption }` object. Both normalize to `FindingScreenshot[]`.
   * Defaults to an empty array so downstream code never has to null-check.
   */
  screenshots: z
    .array(z.union([z.string().min(1), findingScreenshotSchema]))
    .default([])
    .transform((arr) => arr.map((entry) => (typeof entry === "string" ? { path: entry } : entry))),
});

export const walkPlanStepSchema = z.object({
  step: z.number().int().nonnegative(),
  description: z.string().min(1),
  expected_affordance: z.string().optional(),
});

export const walkPlanSchema = z.object({
  expected_path: z.array(walkPlanStepSchema).min(1),
  expected_step_count: z.number().int().positive(),
  expected_minutes: z.number().positive().optional(),
  biggest_worry: z.string().optional(),
  authored_before_browser_open: z.literal(true),
});

export const SURPRISE_KINDS = [
  "unexpected_detour",
  "affordance_missing",
  "ambiguous_label",
  "hesitation",
  "recovery",
  "dead_end",
  "expectation_mismatch",
] as const;
export type SurpriseKind = (typeof SURPRISE_KINDS)[number];

export const surpriseSchema = z.object({
  kind: z.enum(SURPRISE_KINDS),
  step_index: z.number().int().nonnegative(),
  expected: z.string().min(1),
  observed: z.string().min(1),
  recovered: z.boolean(),
  recovery_cost_steps: z.number().int().nonnegative().optional(),
});

export const reflectionSchema = z.object({
  /**
   * Did the persona accomplish the flow's stated goal?
   *
   * Asked of the agent at the end of every walk. The single most diagnostic
   * signal Rove produces: `goal_reached=false` with `findings.length === 0`
   * is the navigation-maze signature — every page worked, the user never
   * arrived. Optional during the alpha rollout window so pre-existing walks
   * don't fail schema validation; the prompt unconditionally requests it.
   */
  goal_reached: z.boolean(),
  /** Actual number of meaningful steps the walk consumed. */
  actual_step_count: z.number().int().nonnegative().optional(),
  /** One-sentence callout of the biggest plan-vs-actual divergence. */
  largest_expectation_gap: z.string().optional(),
  /**
   * Adversarially-framed confidence: "find the reasons a different user of
   * this persona would fail at this flow, then state how confident you are
   * one would succeed." Per the calibration paper, this phrasing yields a
   * usable signal where naive "rate your confidence" does not.
   */
  confidence_persona_would_succeed: z.number().min(0).max(1).optional(),
});

// ── Change-review (§0 item #5) ───────────────────────────────────────────────

/**
 * The "local design contract" the reviewer infers from a handful of
 * reference routes before judging a changed route. Free-form strings —
 * we don't want to over-constrain the shape, since "primary action
 * pattern" looks different in different app cultures.
 */
export const designContractSchema = z.object({
  layout_pattern: z.string().optional(),
  primary_action_pattern: z.string().optional(),
  form_pattern: z.string().optional(),
  success_pattern: z.string().optional(),
  navigation_pattern: z.string().optional(),
  density: z.string().optional(),
  tone: z.string().optional(),
  /** Free-form notes the reviewer wants to preserve. */
  notes: z.string().optional(),
  /**
   * Per-key provenance — which reference route the line was derived from.
   * Stored so the dashboard can show "this row came from /clients/:id".
   */
  derived_from: z.record(z.string(), z.string()).optional(),
});

export const CHANGE_DELTA_KINDS = [
  "change.navigation_mismatch",
  "change.intent_mismatch",
  "change.design_incoherence",
  "change.pattern_drift",
  "change.primary_action_confusion",
  "change.copy_mismatch",
] as const;
export type ChangeDeltaKind = (typeof CHANGE_DELTA_KINDS)[number];

export const changeDeltaSchema = z.object({
  kind: z.enum(CHANGE_DELTA_KINDS),
  expected: z.string().min(1),
  observed: z.string().min(1),
  why_it_matters: z.string().min(1),
  step_index: z.number().int().nonnegative().optional(),
  /** Severity hint — the sink maps these to finding rows. */
  severity: z.enum(FINDING_SEVERITIES).default("major"),
});

export const changeReviewSchema = z.object({
  changed_routes: z.array(z.string().min(1)).min(1),
  reference_routes: z.array(z.string()).default([]),
  design_contract: designContractSchema,
  deltas: z.array(changeDeltaSchema).default([]),
});

export const findingsPayloadSchema = z.object({
  flow_id: z.string().min(1),
  persona_id: z.string().min(1),
  walked_url: z.string().optional(),
  summary: z.string().optional(),
  findings: z.array(findingSchema),
  plan: walkPlanSchema.optional(),
  surprises: z.array(surpriseSchema).default([]),
  reflection: reflectionSchema.optional(),
  /**
   * Present only on `change_review` walks (kind set by the CLI). The agent
   * inlines its inferred design contract + the deltas it observed against
   * it. Each delta is also auto-promoted into a `findings[]` row by the
   * prompt so the existing finding lifecycle just works.
   */
  change_review: changeReviewSchema.optional(),
});

export type FindingScreenshot = z.infer<typeof findingScreenshotSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type WalkPlanStep = z.infer<typeof walkPlanStepSchema>;
export type WalkPlan = z.infer<typeof walkPlanSchema>;
export type Surprise = z.infer<typeof surpriseSchema>;
export type Reflection = z.infer<typeof reflectionSchema>;
export type DesignContract = z.infer<typeof designContractSchema>;
export type ChangeDelta = z.infer<typeof changeDeltaSchema>;
export type ChangeReview = z.infer<typeof changeReviewSchema>;
export type FindingsPayload = z.infer<typeof findingsPayloadSchema>;
