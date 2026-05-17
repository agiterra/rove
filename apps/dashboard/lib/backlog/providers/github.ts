/**
 * GitHub backlog adapter.
 *
 * Status: alpha.38b ships `installConnectExisting` (validates the
 * destination repo via the shared App installation and records the
 * connection). `pushFinding` / `updateStatus` still throw; outbound
 * sync lands in alpha.38c, webhook inbound in alpha.39, managed-board
 * install in alpha.40.
 */

import "server-only";
import { getInstallationOctokit } from "../../authoring/github-app";
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

/**
 * Shape we expect in `ConnectExistingInput.pick` for the GitHub
 * connect-existing path. The page form posts these fields; the action
 * normalizes them before calling the adapter.
 */
interface GitHubConnectExistingPick {
  kind: "repo_issues";
  owner: string;
  repo: string;
}

export class GitHubBacklogAdapter implements BacklogAdapter {
  readonly id = "github" as const;

  async installConnectExisting(
    input: ConnectExistingInput,
  ): Promise<{ destination: Record<string, unknown> }> {
    const pick = input.pick as Partial<GitHubConnectExistingPick>;
    if (pick.kind !== "repo_issues" || !pick.owner || !pick.repo) {
      throw new Error(
        "GitHubBacklogAdapter.installConnectExisting: pick must be { kind: 'repo_issues', owner, repo }",
      );
    }
    const octokit = getInstallationOctokit();
    try {
      const { data } = await octokit.rest.repos.get({ owner: pick.owner, repo: pick.repo });
      return {
        destination: {
          kind: "repo_issues",
          owner: data.owner.login,
          repo: data.name,
          repoNodeId: data.node_id,
          htmlUrl: data.html_url,
          defaultBranch: data.default_branch,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Couldn't reach ${pick.owner}/${pick.repo} via the Rove GitHub App. ` +
          `Install the App on that repo (or check the spelling), then retry. (${msg})`,
      );
    }
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
