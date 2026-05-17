/**
 * GitHub backlog adapter — STUB for alpha.38a.
 *
 * Real implementation lands in alpha.38c (outbound push) + alpha.39
 * (webhook inbound) + alpha.40 (managed-board install). This stub is
 * here so the registry compiles and the install UX can list "github"
 * as a connectable provider; calling any method throws.
 */

import type {
  BacklogAdapter,
  BacklogConnection,
  BacklogFinding,
  BacklogInstallVia,
  ConnectExistingInput,
  ManagedBoardInput,
  PermissionDescription,
  PushFindingResult,
  RoveLifecycle,
} from "../types";

export class GitHubBacklogAdapter implements BacklogAdapter {
  readonly id = "github" as const;

  async installConnectExisting(
    _input: ConnectExistingInput,
  ): Promise<{ destination: Record<string, unknown> }> {
    throw new Error("GitHubBacklogAdapter.installConnectExisting: pending alpha.38c");
  }

  async installManagedBoard(
    _input: ManagedBoardInput,
  ): Promise<{ destination: Record<string, unknown> }> {
    throw new Error("GitHubBacklogAdapter.installManagedBoard: pending alpha.40");
  }

  async pushFinding(
    _conn: BacklogConnection,
    _finding: BacklogFinding,
  ): Promise<PushFindingResult> {
    throw new Error("GitHubBacklogAdapter.pushFinding: pending alpha.38c");
  }

  async updateStatus(
    _conn: BacklogConnection,
    _externalId: string,
    _rove: RoveLifecycle,
  ): Promise<void> {
    throw new Error("GitHubBacklogAdapter.updateStatus: pending alpha.38c");
  }

  describeRequiredPermissions(installVia: BacklogInstallVia): PermissionDescription[] {
    if (installVia === "connect_existing") {
      return [
        {
          scope: "repository_projects: write (on selected repo)",
          reason: "Push finding cards into the existing Project v2 or Issues board the user selects.",
        },
        {
          scope: "projects_v2_item: read/write",
          reason: "Update status fields and receive status webhooks for items Rove created.",
        },
      ];
    }
    if (installVia === "managed_board") {
      return [
        {
          scope: "organization_projects: write",
          reason: "Create the new 'Rove' Project v2 board in your organization (one-time setup).",
        },
        {
          scope: "projects_v2_item: read/write",
          reason: "Push finding cards and sync status changes for items Rove created.",
        },
      ];
    }
    return [];
  }
}
