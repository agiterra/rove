/**
 * Sync-policy evaluator. Pure function — given a connection's policy
 * + a finding + the flow's canonical flag, decide whether to push the
 * finding to the external backlog automatically.
 *
 * The policy shape encodes Codex's conservative-default review:
 *   - critical → always auto
 *   - major    → auto on canonical flows, manual on non-canonical
 *   - minor    → manual unless the agent-readiness boost applies
 *   - nit      → manual
 *   - agent.* heuristics on canonical flows → boost down to minor
 *
 * The function is intentionally narrow: it does NOT decide WHAT to
 * push (the adapter does that). It only answers "should this finding
 * land in the backlog automatically right now?"
 */

import type { FindingSeverity, SyncPolicy } from "./types";

export interface SyncPolicyInput {
  policy: SyncPolicy;
  severity: FindingSeverity;
  /** The finding's heuristic id (e.g. "agent.semantic_html"). Null when unset. */
  heuristic: string | null;
  /** Whether the flow this finding belongs to is marked canonical. */
  flowCanonical: boolean;
}

export type SyncDecision =
  | {
      auto: true;
      reason:
        | "critical"
        | "major_canonical"
        | "agent_readiness_boost"
        | "operator_override";
    }
  | { auto: false; reason: "non_canonical" | "manual_severity" | "below_threshold" };

/**
 * Returns whether to push this finding to the backlog automatically.
 * Manual sends from the dashboard's "Send to backlog" button bypass
 * this evaluator entirely.
 */
export function shouldAutoSync(input: SyncPolicyInput): SyncDecision {
  const { policy, severity, heuristic, flowCanonical } = input;

  // Critical is always auto unless the operator turned it off.
  if (severity === "critical" && policy.critical === "auto") {
    return { auto: true, reason: "critical" };
  }

  // Major: auto on canonical flows, manual elsewhere.
  if (severity === "major") {
    if (policy.major === "auto") return { auto: true, reason: "major_canonical" };
    if (policy.major === "auto-canonical" && flowCanonical) {
      return { auto: true, reason: "major_canonical" };
    }
    return { auto: false, reason: flowCanonical ? "manual_severity" : "non_canonical" };
  }

  // Agent-readiness boost — agent.* heuristics on canonical flows
  // sync even at minor severity. Protects the product wedge from being
  // buried under "headline copy is a nit" noise.
  const isAgentReadiness =
    typeof heuristic === "string" && heuristic.startsWith("agent.") && severity === "minor";
  if (isAgentReadiness && policy.agent_readiness_boost && flowCanonical) {
    return { auto: true, reason: "agent_readiness_boost" };
  }

  // Minor / nit: rarely auto. Allow operators to flip per severity if
  // they really want noisy boards.
  const perSev = severity === "minor" ? policy.minor : severity === "nit" ? policy.nit : "manual";
  if (perSev === "auto") return { auto: true, reason: "operator_override" };
  if (perSev === "auto-canonical" && flowCanonical) {
    return { auto: true, reason: "operator_override" };
  }
  return { auto: false, reason: "below_threshold" };
}

/**
 * Default sync policy when a connection is created without one.
 * Mirrors the SQL default on backlog_connections.sync_policy.
 */
export const DEFAULT_SYNC_POLICY: SyncPolicy = {
  critical: "auto",
  major: "auto-canonical",
  minor: "manual",
  nit: "manual",
  agent_readiness_boost: true,
  recurrence_comment: true,
};
