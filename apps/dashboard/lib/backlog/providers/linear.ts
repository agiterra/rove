/**
 * Linear backlog adapter — STUB for alpha.38a.
 *
 * Real implementation lands in alpha.41. This stub keeps the registry
 * compiling so the install UX can list "linear" as a connectable
 * provider (greyed out as "coming soon" until alpha.41).
 */

import type {
  BacklogAdapter,
  BacklogConnection,
  BacklogFinding,
  BacklogInstallVia,
  ConnectExistingInput,
  PermissionDescription,
  PushFindingResult,
  RoveLifecycle,
} from "../types";

export class LinearBacklogAdapter implements BacklogAdapter {
  readonly id = "linear" as const;

  async installConnectExisting(
    _input: ConnectExistingInput,
  ): Promise<{ destination: Record<string, unknown> }> {
    throw new Error("LinearBacklogAdapter: pending alpha.41");
  }

  async pushFinding(
    _conn: BacklogConnection,
    _finding: BacklogFinding,
  ): Promise<PushFindingResult> {
    throw new Error("LinearBacklogAdapter: pending alpha.41");
  }

  async updateStatus(
    _conn: BacklogConnection,
    _externalId: string,
    _rove: RoveLifecycle,
  ): Promise<void> {
    throw new Error("LinearBacklogAdapter: pending alpha.41");
  }

  describeRequiredPermissions(_installVia: BacklogInstallVia): PermissionDescription[] {
    return [
      {
        scope: "linear: workspace: read",
        reason: "List the workspace/team/project the user picks as a destination.",
      },
      {
        scope: "linear: issues: write",
        reason: "Create issues for findings and update their workflow state.",
      },
    ];
  }
}
