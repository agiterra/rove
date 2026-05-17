/**
 * No-op adapter. The dashboard is the destination; nothing else is
 * pushed anywhere. Exists so the registry has something to return for
 * the default install path without special-casing the call sites.
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

export class DashboardOnlyAdapter implements BacklogAdapter {
  readonly id = "dashboard-only" as const;

  async installConnectExisting(
    _input: ConnectExistingInput,
  ): Promise<{ destination: Record<string, unknown> }> {
    return { destination: {} };
  }

  async pushFinding(
    _conn: BacklogConnection,
    _finding: BacklogFinding,
  ): Promise<PushFindingResult> {
    // No-op adapter must not be called from the sync pipeline; the
    // caller guards on `provider === 'dashboard-only'` and skips.
    throw new Error("DashboardOnlyAdapter.pushFinding called — caller should have short-circuited.");
  }

  async updateStatus(
    _conn: BacklogConnection,
    _externalId: string,
    _rove: RoveLifecycle,
  ): Promise<void> {
    throw new Error("DashboardOnlyAdapter.updateStatus called — caller should have short-circuited.");
  }

  describeRequiredPermissions(_installVia: BacklogInstallVia): PermissionDescription[] {
    return [];
  }
}
