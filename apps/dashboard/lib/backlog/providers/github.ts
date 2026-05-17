/**
 * GitHub backlog adapter — alpha.38c + alpha.39a.
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
 * Inbound (alpha.39a):
 *   - parseStatusWebhook → HMAC-verifies a `projects_v2_item` webhook,
 *     reads the Status field change, maps the new option name back to a
 *     RoveLifecycle. Returns null when the payload isn't ours.
 *
 * Managed-board install (alpha.40), Linear (41) are separate ships.
 */

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getInstallationOctokit } from "../../authoring/github-app";
import { env } from "../../env";
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

  async parseStatusWebhook(
    payload: unknown,
    rawBody: string,
    signature: string | null,
    conn: BacklogConnection,
  ): Promise<{ externalId: string; rove: RoveLifecycle } | null> {
    const secret = env.githubAppWebhookSecret();
    if (!secret) {
      throw new Error(
        "GitHubBacklogAdapter.parseStatusWebhook: ROVE_GITHUB_APP_WEBHOOK_SECRET not configured.",
      );
    }
    if (!verifyGitHubSignature(rawBody, signature, secret)) {
      throw new Error("GitHubBacklogAdapter.parseStatusWebhook: signature mismatch.");
    }

    const event = payload as Partial<ProjectsV2ItemEvent>;
    if (!event || typeof event.action !== "string") return null;
    if (event.action !== "edited") return null; // status changes arrive as "edited"
    const itemNodeId = event.projects_v2_item?.node_id;
    if (!itemNodeId) return null;

    // Verify the project id matches the one we connected to. Webhooks
    // arrive for every Project in the org once the App is subscribed;
    // we only react to our own destination.
    const dest = readDestination(conn);
    if (event.projects_v2_item?.project_node_id !== dest.projectNodeId) return null;

    const change = event.changes?.field_value;
    if (!change || change.field_node_id !== dest.statusField?.fieldId) return null;
    if (change.field_type !== "single_select") return null;

    const toName = change.to?.name;
    if (!toName) return null;
    const rove = matchRoveLifecycle(toName);
    if (!rove) return null;

    return { externalId: itemNodeId, rove };
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
  const targets = ROVE_TO_NAMES[rove];
  for (const opt of options) {
    const norm = opt.name.trim().toLowerCase();
    if (targets.includes(norm)) return opt.id;
  }
  return null;
}

/**
 * Reverse direction — map a GitHub Status option name back to a Rove
 * lifecycle. Webhook events arrive with the new option's name, not the
 * connection's stored id-to-lifecycle map (we'd need a fresh GraphQL
 * lookup), so we match by canonical name family instead. Same synonyms
 * as `matchStatusOption` but inverted.
 */
function matchRoveLifecycle(externalName: string): RoveLifecycle | null {
  const norm = externalName.trim().toLowerCase();
  // Check in priority order so ambiguous names (e.g. "todo" exists in
  // both `new` and `triaged`) resolve to the more specific state.
  // "filed" before "new" means an "In Progress" column maps to filed
  // (engineer is acting on it) before defaulting anything else.
  const order: RoveLifecycle[] = ["fixed", "dismissed", "filed", "triaged", "new"];
  for (const rove of order) {
    if (ROVE_TO_NAMES[rove].includes(norm)) return rove;
  }
  return null;
}

const ROVE_TO_NAMES: Record<RoveLifecycle, string[]> = {
  new: ["new"],
  triaged: ["todo", "backlog", "ready", "next"],
  filed: ["in progress", "in-progress", "doing", "active"],
  fixed: ["done", "complete", "completed", "fixed"],
  dismissed: ["cancelled", "canceled", "won't do", "wontfix", "wont fix"],
};

/* ────────────────────────────────────────────────────────────────────
 *  Webhook helpers (alpha.39a)
 * ──────────────────────────────────────────────────────────────────── */

/**
 * GitHub's `projects_v2_item` webhook payload — only the fields we
 * actually read. The `changes.field_value` block is present on the
 * "edited" action when a single-select column moves.
 */
interface ProjectsV2ItemEvent {
  action: string;
  projects_v2_item?: {
    node_id?: string;
    project_node_id?: string;
    content_type?: string;
  };
  changes?: {
    field_value?: {
      field_node_id?: string;
      field_type?: string;
      from?: { id?: string; name?: string };
      to?: { id?: string; name?: string };
    };
  };
}

/**
 * Verifies GitHub's `x-hub-signature-256` header against the raw body
 * using HMAC-SHA256. Returns false (rather than throwing) on any
 * mismatch so the caller can log a uniform 401.
 */
function verifyGitHubSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
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
  // Always include the raw GitHub message + a deploy marker so we never
  // get stuck staring at a friendly-but-opaque error in production. The
  // friendly prefix routes by error shape; the suffix is the unvarnished
  // truth from GitHub.
  const tag = "[adapter:38c.1]";
  const looksLikeAuthIssue =
    lower.includes("resource not accessible") ||
    lower.includes("not authorized") ||
    lower.includes("forbidden") ||
    lower.includes("must have admin");
  if (looksLikeAuthIssue) {
    return new Error(
      `${tag} The Rove GitHub App can't read Project v2 boards on this ${pick.ownerType ?? "owner"}. ` +
        `Grant the App "Projects: read & write" at github.com/settings/apps and reauthorize the installation. ` +
        `GitHub said: ${msg}`,
    );
  }
  const looksLikeMissing = lower.includes("could not resolve") || lower.includes("not found");
  if (looksLikeMissing) {
    return new Error(
      `${tag} GitHub couldn't resolve Project v2 #${pick.number ?? "?"} on ${pick.owner ?? "owner"}. ` +
        `Raw response: ${msg}`,
    );
  }
  return new Error(`${tag} GitHub Project v2 lookup failed: ${msg}`);
}
