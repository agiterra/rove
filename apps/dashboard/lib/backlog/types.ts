/**
 * Backlog adapter types — the provider-neutral contract that every
 * destination (GitHub Issues, GitHub Project v2, Linear, future X)
 * implements.
 *
 * The dashboard is the canonical store; adapters are downstream
 * projections. Adding a new provider should require ONE new file
 * (a BacklogAdapter implementation) plus extending the provider
 * literal union below.
 *
 * See docs/plans/ci-and-backlog.md §3 for the architecture.
 */

/**
 * Mirrors `FindingSeverity` from `@agiterra/rove-core`. Declared inline
 * to keep the dashboard's adapter layer free of any non-browser-safe
 * imports per the architecture rule.
 */
export type FindingSeverity = "critical" | "major" | "minor" | "nit";

/**
 * Provider identifiers. Keep in sync with the SQL check constraint on
 * `backlog_connections.provider`.
 */
export type BacklogProvider = "dashboard-only" | "github" | "linear";

/**
 * Install path identifiers. Keep in sync with the SQL check constraint
 * on `backlog_connections.installed_via`.
 */
export type BacklogInstallVia = "dashboard_only" | "connect_existing" | "managed_board";

/**
 * Rove-side finding lifecycle. External statuses map INTO this via the
 * connection's `status_map`. Five states keeps the dashboard's existing
 * findings.status column compatible without overfitting to any one
 * provider's column names.
 */
export type RoveLifecycle = "new" | "triaged" | "filed" | "fixed" | "dismissed";

/**
 * A walker's finding as the adapter sees it. The shape is intentionally
 * thin — adapters do not need run_steps, screenshots-as-files, etc.
 * Screenshot URLs (signed, dashboard-resolved) are passed pre-rendered.
 */
export interface BacklogFinding {
  id: string;
  projectId: string;
  flowId: string;
  personaId: string;
  runId: string;
  severity: FindingSeverity;
  heuristic: string | null;
  title: string;
  description: string;
  evidence: string | null;
  contentHash: string;
  stepIndex: number | null;
  /** Pre-signed screenshot URLs (dashboard-resolved). Empty when none. */
  screenshotUrls: { url: string; caption?: string }[];
  /** Optional ownership hints from the flow row. */
  ownerHandle?: string | null;
  teamLabel?: string | null;
  /** Optional link back to the dashboard run page. */
  dashboardRunUrl?: string;
}

/**
 * A connection row hydrated for adapter use. `destination` and
 * `syncPolicy` are provider-specific JSON; the adapter is responsible
 * for understanding its own shape.
 */
export interface BacklogConnection {
  id: string;
  projectId: string;
  provider: BacklogProvider;
  destination: Record<string, unknown>;
  syncPolicy: SyncPolicy;
  statusMap: Record<string, RoveLifecycle>;
  secretRef: string | null;
  installedVia: BacklogInstallVia;
  installedAt: string | null;
  disabledAt: string | null;
}

/**
 * Codex's conservative-default sync policy:
 *   critical → auto
 *   major    → auto-canonical (only when flows.canonical is true)
 *   minor    → manual
 *   nit      → manual
 *   agent_readiness_boost → when true, agent.* heuristics auto-sync
 *     down to minor on canonical flows (protects the product wedge)
 *   recurrence_comment → when true, recurrences add a comment to the
 *     external item without rewriting body
 */
export interface SyncPolicy {
  critical: "auto" | "manual";
  major: "auto" | "auto-canonical" | "manual";
  minor: "auto" | "auto-canonical" | "manual";
  nit: "auto" | "auto-canonical" | "manual";
  agent_readiness_boost: boolean;
  recurrence_comment: boolean;
}

/**
 * Result of pushing a finding to a destination. The adapter is
 * responsible for emitting the external_id + URL + kind that the
 * dashboard records in backlog_items.
 */
export interface PushFindingResult {
  externalId: string;
  externalUrl: string;
  externalKind: "draft_item" | "issue" | "linear_issue";
  markerValue: string;
}

/**
 * Adapter contract. Implementations live in
 * `apps/dashboard/lib/backlog/providers/<name>.ts`.
 */
export interface BacklogAdapter {
  readonly id: BacklogProvider;

  /** Install path: user picks a destination that already exists. */
  installConnectExisting(
    input: ConnectExistingInput,
  ): Promise<{ destination: Record<string, unknown> }>;

  /**
   * Install path: Rove auto-creates a destination (e.g. a GitHub
   * Project v2 named "Rove agent-readiness"). Optional — `dashboard-only`
   * has no install at all; `linear` may skip this initially.
   */
  installManagedBoard?(
    input: ManagedBoardInput,
  ): Promise<{ destination: Record<string, unknown> }>;

  /**
   * Outbound: push a Rove finding to the destination. Returns the
   * external item metadata. Adapter is responsible for marker tagging.
   */
  pushFinding(
    conn: BacklogConnection,
    finding: BacklogFinding,
  ): Promise<PushFindingResult>;

  /**
   * Outbound: push a Rove-side lifecycle change to the destination's
   * status column. Adapter applies the connection's status_map in reverse.
   */
  updateStatus(
    conn: BacklogConnection,
    externalId: string,
    rove: RoveLifecycle,
  ): Promise<void>;

  /**
   * Outbound (optional): record a recurrence as a comment on the
   * external item. Never rewrites the body.
   */
  appendRecurrence?(
    conn: BacklogConnection,
    externalId: string,
    occurrence: { runId: string; seenAt: string; dashboardRunUrl?: string },
  ): Promise<void>;

  /**
   * Inbound (optional): parse an incoming webhook payload and emit the
   * Rove-side lifecycle change to apply. Returns null when the payload
   * is for an item we don't own (no marker, or external_id unknown).
   */
  parseStatusWebhook?(
    payload: unknown,
    rawBody: string,
    signature: string | null,
    conn: BacklogConnection,
  ): Promise<{ externalId: string; rove: RoveLifecycle } | null>;

  /**
   * Describes the permission scope the install path will ask for.
   * The UI renders this so the user sees what they're consenting to
   * BEFORE we open the OAuth flow.
   */
  describeRequiredPermissions(installVia: BacklogInstallVia): PermissionDescription[];
}

export interface PermissionDescription {
  /** e.g. "organization_projects: write" or "linear: workspace:read". */
  scope: string;
  /** One-sentence explanation for the consent screen. */
  reason: string;
}

export interface ConnectExistingInput {
  projectId: string;
  /** Provider-specific destination picker payload. */
  pick: Record<string, unknown>;
  secretRef: string;
}

export interface ManagedBoardInput {
  projectId: string;
  /** Name the user typed at install time. Default suggested by the UI. */
  boardName: string;
  /** GH org / Linear workspace where the board is created. */
  owner: string;
  secretRef: string;
}
