/**
 * GitHub backlog adapter — alpha.38c.
 *
 * Connect-existing flow:
 *   - User pastes a Project v2 URL (org or user; any of the supported shapes).
 *   - Adapter parses owner / number, validates via GraphQL, captures the
 *     project node id + title + url + (if present) the Status single-select
 *     field id and its option map.
 *
 * Outbound:
 *   - pushFinding → `addProjectV2DraftIssue` mutation. Title + rich body.
 *   - updateStatus → `updateProjectV2ItemFieldValue` if a Status field was
 *     discovered at install time and its options map onto the Rove
 *     lifecycle; otherwise no-op (the user owns the destination's columns).
 *
 * Webhook (alpha.39), managed-board install (alpha.40), Linear (41) are
 * separate ships.
 */

import "server-only";
import { getInstallationOctokit } from "../../authoring/github-app";
import { buildFindingBody } from "./github-body";
import {
  fetchProjectV2,
  addProjectV2DraftIssue,
  updateProjectV2SingleSelectField,
  type ProjectV2Lookup,
} from "./github-graphql";
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
 * Shape expected in ConnectExistingInput.pick for the Project v2 flow.
 * The picker action posts this after parsing the user's URL.
 */
interface ConnectProjectV2Pick {
  kind: "project_v2";
  ownerType: "organization" | "user";
  owner: string;
  number: number;
}

/**
 * Shape recorded in backlog_connections.destination after a successful
 * installConnectExisting. pushFinding + updateStatus read this back.
 */
interface ProjectV2Destination {
  kind: "project_v2";
  ownerType: "organization" | "user";
  owner: string;
  number: number;
  projectNodeId: string;
  projectTitle: string;
  projectUrl: string;
  /**
   * Status single-select field discovery, when found. Populated only if
   * the board has a field literally named "Status" with single-select
   * options. updateStatus falls back to no-op when this is absent.
   */
  statusField?: {
    fieldId: string;
    options: { id: string; name: string }[];
  };
}

export class GitHubBacklogAdapter implements BacklogAdapter {
  readonly id = "github" as const;

  async installConnectExisting(
    input: ConnectExistingInput,
  ): Promise<{ destination: Record<string, unknown> }> {
    const pick = input.pick as Partial<ConnectProjectV2Pick>;
    if (
      pick.kind !== "project_v2" ||
      !pick.owner ||
      !pick.number ||
      (pick.ownerType !== "organization" && pick.ownerType !== "user")
    ) {
      throw new Error(
        "GitHubBacklogAdapter.installConnectExisting: pick must be { kind:'project_v2', ownerType, owner, number }",
      );
    }
    const octokit = getInstallationOctokit();
    let project: ProjectV2Lookup;
    try {
      project = await fetchProjectV2(octokit, {
        ownerType: pick.ownerType,
        owner: pick.owner,
        number: pick.number,
      });
    } catch (err) {
      throw rewritePermissionError(err, pick);
    }
    const statusField = findStatusField(project);
    const destination: ProjectV2Destination = {
      kind: "project_v2",
      ownerType: pick.ownerType,
      owner: pick.owner,
      number: pick.number,
      projectNodeId: project.id,
      projectTitle: project.title,
      projectUrl: project.url,
      ...(statusField ? { statusField } : {}),
    };
    return { destination: destination as unknown as Record<string, unknown> };
  }

  async installManagedBoard(
    _input: ManagedBoardInput,
  ): Promise<{ destination: Record<string, unknown> }> {
    throw new Error("GitHubBacklogAdapter.installManagedBoard: pending alpha.40");
  }

  async pushFinding(
    conn: BacklogConnection,
    finding: BacklogFinding,
  ): Promise<PushFindingResult> {
    const dest = readDestination(conn);
    const title = buildFindingTitle(finding);
    const body = buildFindingBody(finding);
    const octokit = getInstallationOctokit();
    const item = await addProjectV2DraftIssue(octokit, {
      projectNodeId: dest.projectNodeId,
      title,
      body,
    });
    const externalUrl = buildProjectItemUrl(dest);
    return {
      externalId: item.id,
      externalUrl,
      externalKind: "draft_item",
      markerValue: `rove:finding:${finding.id}`,
    };
  }

  async updateStatus(
    conn: BacklogConnection,
    externalId: string,
    rove: RoveLifecycle,
  ): Promise<void> {
    const dest = readDestination(conn);
    if (!dest.statusField) return; // no Status column discovered — nothing to sync
    const optionId = matchStatusOption(dest.statusField.options, rove);
    if (!optionId) return; // no option name matched — leave alone rather than guess
    const octokit = getInstallationOctokit();
    await updateProjectV2SingleSelectField(octokit, {
      projectNodeId: dest.projectNodeId,
      itemId: externalId,
      fieldId: dest.statusField.fieldId,
      singleSelectOptionId: optionId,
    });
  }

  describeRequiredPermissions(installVia: BacklogInstallVia): PermissionDescription[] {
    if (installVia === "connect_existing") {
      return [
        {
          scope: "projects: read",
          reason:
            "Validate the GitHub Project v2 you select exists and discover its Status column.",
        },
        {
          scope: "projects: write",
          reason:
            "Create draft items for findings and update the Status column when Rove's lifecycle changes.",
        },
      ];
    }
    if (installVia === "managed_board") {
      return [
        {
          scope: "organization_projects: write",
          reason:
            "Create the new 'Rove' Project v2 board in your organization (one-time setup).",
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

/* ────────────────────────────────────────────────────────────────────
 *  Helpers
 * ──────────────────────────────────────────────────────────────────── */

function readDestination(conn: BacklogConnection): ProjectV2Destination {
  const d = conn.destination as Partial<ProjectV2Destination>;
  if (
    d.kind !== "project_v2" ||
    !d.projectNodeId ||
    typeof d.number !== "number" ||
    !d.owner ||
    (d.ownerType !== "organization" && d.ownerType !== "user")
  ) {
    throw new Error(
      "GitHubBacklogAdapter: connection destination is not a Project v2 shape. " +
        "Re-install via /projects/[id] to migrate from an older shape.",
    );
  }
  return d as ProjectV2Destination;
}

function findStatusField(project: ProjectV2Lookup): ProjectV2Destination["statusField"] {
  const status = project.fields.find(
    (f) =>
      f.dataType === "SINGLE_SELECT" && f.name.trim().toLowerCase() === "status",
  );
  if (!status || !status.options || status.options.length === 0) return undefined;
  return {
    fieldId: status.id,
    options: status.options.map((o) => ({ id: o.id, name: o.name })),
  };
}

/**
 * Map a Rove lifecycle to a Status option id by matching common option
 * names case-insensitively. Returns null when nothing maps — we'd rather
 * skip the update than mis-bucket the card.
 */
function matchStatusOption(
  options: { id: string; name: string }[],
  rove: RoveLifecycle,
): string | null {
  const synonyms: Record<RoveLifecycle, string[]> = {
    new: ["todo", "backlog", "new"],
    triaged: ["todo", "backlog", "ready"],
    filed: ["in progress", "in-progress", "doing", "active"],
    fixed: ["done", "complete", "completed", "fixed"],
    dismissed: ["cancelled", "canceled", "won't do", "wontfix", "wont fix"],
  };
  const targets = synonyms[rove];
  for (const opt of options) {
    const norm = opt.name.trim().toLowerCase();
    if (targets.includes(norm)) return opt.id;
  }
  return null;
}

function buildFindingTitle(finding: BacklogFinding): string {
  const sev = finding.severity.toUpperCase();
  const heuristic = finding.heuristic ?? "uncategorized";
  return `[Rove · ${sev}] ${heuristic} — ${finding.title}`;
}

/**
 * Project v2 doesn't return a deep-link to a draft item from the
 * mutation response. The project URL gets the user close — they see
 * their newest card at the top of the default view.
 */
function buildProjectItemUrl(dest: ProjectV2Destination): string {
  return dest.projectUrl;
}

function rewritePermissionError(err: unknown, pick: Partial<ConnectProjectV2Pick>): Error {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  const looksLikeAuthIssue =
    lower.includes("resource not accessible") ||
    lower.includes("not authorized") ||
    lower.includes("forbidden") ||
    lower.includes("must have admin");
  if (looksLikeAuthIssue) {
    return new Error(
      `The Rove GitHub App doesn't have permission to read Project v2 boards on this ${pick.ownerType ?? "owner"}. ` +
        `Grant the App "Projects: read & write" at github.com/settings/apps and reauthorize the installation, then retry. ` +
        `(GitHub said: ${msg})`,
    );
  }
  const looksLikeMissing = lower.includes("could not resolve") || lower.includes("not found");
  if (looksLikeMissing) {
    return new Error(
      `Couldn't find Project v2 #${pick.number ?? "?"} on ${pick.owner ?? "owner"}. ` +
        `Confirm the URL points at an existing Project board the Rove App can see.`,
    );
  }
  return new Error(`GitHub Project v2 lookup failed: ${msg}`);
}
