export type FindingSeverity = "critical" | "major" | "minor" | "nit";

export type SilenceScope = "finding" | "pattern" | "flow";

export type EmptyStateSurface =
  | "affordance_gaps"
  | "expectation_match"
  | "findings"
  | "gaps_rollup"
  | "trend";

export interface LifecycleFinding {
  id: string;
  severity: FindingSeverity;
  title: string;
  /**
   * Heuristic identifier, e.g. "agent.affordance_gap.missing_delete".
   * Maps to findings.heuristic in the DB; named heuristicId here to match
   * substrate-proposal vocabulary that the downstream proposals use.
   */
  heuristicId: string;
  /** Best-effort URL where the finding was observed. May be empty. */
  url: string;
  evidence: string | null;
  /** Optional, for the issue body's "suggested location" section. */
  suggestedLocation: string | null;
  /** UUID of the run that produced the finding — used for the back-link. */
  runId: string;
  flowId: string | null;
  personaId: string | null;
  personaLabel: string | null;
  silencedAt: string | null;
  silenceReason: string | null;
  silenceScope: SilenceScope | null;
  githubIssueUrl: string | null;
}

export interface TrendBucket {
  /** ISO date for daily buckets, ISO week-start for weekly. */
  at: string;
  critical: number;
  major: number;
  minor: number;
}

export interface TrendChartData {
  buckets: TrendBucket[];
  /** Total count across all buckets in the window. */
  total: number;
}
