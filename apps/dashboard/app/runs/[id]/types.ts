/**
 * Local mirrors of the plan/surprise shapes from packages/core. Mirrored
 * rather than imported to keep the dashboard bundle free of any non-browser
 * code path through @agiterra/rove-core's main entry (per dashboard.md).
 * Keep in sync with packages/core/src/types.ts.
 */

export interface WalkPlanStep {
  step: number;
  description: string;
  expected_affordance?: string;
}

export interface WalkPlan {
  expected_path: WalkPlanStep[];
  expected_step_count: number;
  expected_minutes?: number;
  biggest_worry?: string;
  authored_before_browser_open: true;
}

export type SurpriseKind =
  | "unexpected_detour"
  | "affordance_missing"
  | "ambiguous_label"
  | "hesitation"
  | "recovery"
  | "dead_end"
  | "expectation_mismatch";

export interface Surprise {
  kind: SurpriseKind;
  step_index: number;
  expected: string;
  observed: string;
  recovered: boolean;
  recovery_cost_steps?: number;
}

export interface TrajectoryMetrics {
  actual_tool_calls: number;
  snapshots: number;
  actions: number;
  screenshots: number;
  snapshots_per_action: number | null;
  recovery_count: number;
  errors: number;
  time_to_first_action_ms: number | null;
  parsed_at: string;
}

export interface RunStep {
  step_index: number;
  direction: "result" | "error" | "call";
  tool_name: string | null;
  args: unknown;
  result_summary: string | null;
  aria_snapshot: string | null;
  url_after: string | null;
  duration_ms: number | null;
  screenshot_key?: string | null;
  dialog_payload?: unknown;
  affordance_gaps?: unknown;
  affordance_enum_phase?: boolean | null;
}

export type WalkKind = "flow" | "change_review";

export type ChangeDeltaKind =
  | "change.navigation_mismatch"
  | "change.intent_mismatch"
  | "change.design_incoherence"
  | "change.pattern_drift"
  | "change.primary_action_confusion"
  | "change.copy_mismatch";

export interface ChangeDelta {
  kind: ChangeDeltaKind;
  expected: string;
  observed: string;
  why_it_matters: string;
  step_index?: number;
  severity?: "critical" | "major" | "minor" | "nit";
}

export interface DesignContract {
  layout_pattern?: string;
  primary_action_pattern?: string;
  form_pattern?: string;
  success_pattern?: string;
  navigation_pattern?: string;
  density?: string;
  tone?: string;
  notes?: string;
  derived_from?: Record<string, string>;
}

export interface RunDetail {
  id: string;
  project_id: string;
  flow_id: string;
  persona_id: string;
  dispatcher: string;
  status: string;
  branch: string | null;
  commit_sha: string | null;
  started_at: string;
  finished_at: string | null;
  initiator_label: string | null;
  walked_url: string | null;
  summary: string | null;
  goal_reached: boolean | null;
  plan: WalkPlan | null;
  surprises: Surprise[] | null;
  predicted_step_count: number | null;
  actual_step_count: number | null;
  largest_expectation_gap: string | null;
  persona_success_confidence: number | null;
  metrics: TrajectoryMetrics | null;
  kind: WalkKind;
  changed_routes: string[] | null;
  reference_routes: string[] | null;
  design_contract: DesignContract | null;
  deltas: ChangeDelta[] | null;
}

export interface RunFinding {
  id: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  heuristic: string | null;
  github_issue_url: string | null;
  first_seen_at: string;
  last_seen_at: string;
  content_hash: string;
}
