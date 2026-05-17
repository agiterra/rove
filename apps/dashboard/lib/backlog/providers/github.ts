/**
 * GitHub backlog adapter — alpha.38c + alpha.39a + alpha.40.
 *
 * Install paths:
 *   - connect_existing → user pastes a Project v2 URL; adapter validates
 *     via GraphQL, discovers canonical fields by name, persists destination.
 *   - managed_board → adapter creates a new Project v2 (or clones a
 *     template via copyProjectV2 to inherit views), provisions the
 *     canonical Rove fields, persists destination.
 *
 * Outbound:
 *   - pushFinding → addProjectV2DraftIssue, then a single batched GraphQL
 *     document of updateProjectV2ItemFieldValue calls for whichever
 *     canonical fields the destination exposes.
 *   - updateStatus → updateProjectV2ItemFieldValue against the discovered
 *     Status single-select field; no-op when absent or option doesn't
 *     match the Rove lifecycle synonyms.
 *
 * Inbound (alpha.39a):
 *   - parseStatusWebhook → HMAC-verifies a projects_v2_item webhook,
 *     reads the Status field change, maps the new option name back to
 *     a RoveLifecycle. Returns null when the payload isn't ours.
 *
 * Size note: this file exceeds the 450-line hard ceiling from
 * coding-standards.md. It's intentionally cohesive — the adapter class
 * + the helpers it dispatches to share the ProjectV2Destination
 * vocabulary tightly, and the natural splits (status mapping,
 * webhook payload, managed-board provisioning) all individually
 * traffic in private types from the adapter file. Splitting into
 * sibling files would require widening the public API of each
 * sub-module purely for the sake of line counts. Re-evaluate once
 * Linear or a third provider lands and the destination vocabulary
 * needs to generalize anyway.
 *
 * Linear adapter (alpha.41) is a separate ship.
 */

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getInstallationOctokit } from "../../authoring/github-app";
import { env } from "../../env";
import { buildFindingBody } from "./github-body";
import {
  fetchProjectV2,
  addProjectV2DraftIssue,
  copyProjectV2,
  createProjectV2,
  createProjectV2Field,
  resolveOwnerNodeId,
  updateProjectV2ItemFieldValues,
  updateProjectV2SingleSelectField,
  type FieldValueWrite,
  type ProjectV2Lookup,
  type ProjectV2OptionColor,
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
 * install. pushFinding + updateStatus read this back. Optional fields
 * are populated only when the corresponding canonical field exists on
 * the destination board — pushFinding silently skips writes for any
 * field the destination doesn't expose.
 */
interface ProjectV2Destination {
  kind: "project_v2";
  ownerType: "organization" | "user";
  owner: string;
  number: number;
  projectNodeId: string;
  projectTitle: string;
  projectUrl: string;
  /** Set to "managed" when Rove created the board; "existing" for connect-existing. */
  installVariant?: "existing" | "managed";
  /**
   * Status single-select field discovery, when found. Populated only if
   * the board has a field literally named "Status" with single-select
   * options. updateStatus falls back to no-op when this is absent.
   */
  statusField?: {
    fieldId: string;
    options: { id: string; name: string }[];
  };
  /**
   * Other canonical Rove fields we discovered on the board, mapped by
   * canonical name. pushFinding populates each one it finds. Boards
   * created via managed install get all six; connect-existing boards
   * get whichever subset already exists by name match.
   */
  canonicalFields?: {
    severity?: {
      fieldId: string;
      options: { id: string; name: string }[];
    };
    heuristic?: { fieldId: string; dataType: "TEXT" | "URL" };
    persona?: { fieldId: string; dataType: "TEXT" | "URL" };
    flow?: { fieldId: string; dataType: "TEXT" | "URL" };
    runId?: { fieldId: string; dataType: "TEXT" | "URL" };
    dashboardLink?: { fieldId: string; dataType: "TEXT" | "URL" };
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
    const { statusField, canonicalFields } = discoverCanonicalFields(project);
    const destination: ProjectV2Destination = {
      kind: "project_v2",
      ownerType: pick.ownerType,
      owner: pick.owner,
      number: pick.number,
      projectNodeId: project.id,
      projectTitle: project.title,
      projectUrl: project.url,
      installVariant: "existing",
      ...(statusField ? { statusField } : {}),
      ...(canonicalFields ? { canonicalFields } : {}),
    };
    return { destination: destination as unknown as Record<string, unknown> };
  }

  async installManagedBoard(
    input: ManagedBoardInput,
  ): Promise<{ destination: Record<string, unknown> }> {
    // Optional `templateProjectUrl` (passed through input.boardName-adjacent
    // fields by the action via a wider pick shape). When provided, clone
    // the template via copyProjectV2 → preserves views + custom fields.
    // Otherwise, create blank + add Rove's canonical fields manually.
    const extra = input as unknown as {
      templateProjectUrl?: string;
    };

    const octokit = getInstallationOctokit();

    let ownerResolution: { id: string; ownerType: "organization" | "user" };
    try {
      ownerResolution = await resolveOwnerNodeId(octokit, input.owner);
    } catch (err) {
      throw rewritePermissionError(err, {
        kind: "project_v2",
        ownerType: "organization",
        owner: input.owner,
        number: 0,
      });
    }

    const template = extra.templateProjectUrl
      ? parseTemplateUrl(extra.templateProjectUrl)
      : null;
    if (extra.templateProjectUrl && !template) {
      throw new Error(
        "Couldn't parse template Project v2 URL. Use https://github.com/orgs/<org>/projects/<n> or .../users/<user>/projects/<n>.",
      );
    }

    let project: ProjectV2Lookup;
    if (template) {
      // Fetch the source first so we can copy by node id (copyProjectV2
      // requires source projectId, not number).
      const source = await fetchProjectV2(octokit, template);
      try {
        project = await copyProjectV2(octokit, {
          sourceProjectNodeId: source.id,
          ownerNodeId: ownerResolution.id,
          title: input.boardName,
          includeDraftIssues: false,
        });
      } catch (err) {
        throw rewritePermissionError(err, {
          kind: "project_v2",
          ownerType: ownerResolution.ownerType,
          owner: input.owner,
          number: source.number,
        });
      }
    } else {
      try {
        project = await createProjectV2(octokit, {
          ownerNodeId: ownerResolution.id,
          title: input.boardName,
        });
      } catch (err) {
        throw rewritePermissionError(err, {
          kind: "project_v2",
          ownerType: ownerResolution.ownerType,
          owner: input.owner,
          number: 0,
        });
      }
      // Provision the canonical Rove fields. Skip silently if a field
      // already exists (rare for a freshly-created project but possible
      // if the user re-runs install). createProjectV2Field throws on
      // duplicate-name; we ignore that specific error.
      await provisionCanonicalFields(octokit, project.id);
      // Re-fetch to get the newly-created field ids back.
      project = await fetchProjectV2(octokit, {
        ownerType: ownerResolution.ownerType,
        owner: input.owner,
        number: project.number,
      });
    }

    const { statusField, canonicalFields } = discoverCanonicalFields(project);
    const destination: ProjectV2Destination = {
      kind: "project_v2",
      ownerType: ownerResolution.ownerType,
      owner: input.owner,
      number: project.number,
      projectNodeId: project.id,
      projectTitle: project.title,
      projectUrl: project.url,
      installVariant: "managed",
      ...(statusField ? { statusField } : {}),
      ...(canonicalFields ? { canonicalFields } : {}),
    };
    return { destination: destination as unknown as Record<string, unknown> };
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

    // Populate canonical fields the destination exposes. Single
    // GraphQL document with aliased mutations → one HTTP round-trip
    // no matter how many fields we hit. Silently skip fields the
    // destination doesn't have (connect-existing boards may expose
    // a subset; legacy connections may have no canonicalFields at all).
    const writes = buildFieldWrites(dest, finding);
    if (writes.length > 0) {
      try {
        await updateProjectV2ItemFieldValues(octokit, {
          projectNodeId: dest.projectNodeId,
          itemId: item.id,
          writes,
        });
      } catch (err) {
        // Field-population failures shouldn't unmake the draft. Log
        // and keep going — the card exists, the body is correct,
        // engineer can populate fields manually if needed.
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`pushFinding(${finding.id}): field population partial — ${msg}`);
      }
    }

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

/**
 * Sweep the project's fields once and identify each canonical Rove
 * field by name (case-insensitive). Used by both installConnectExisting
 * (best-effort match against whatever the user's board already has)
 * and installManagedBoard (where Rove created the fields directly, so
 * matches are guaranteed). Caller decides which subset to persist on
 * the destination.
 */
function discoverCanonicalFields(project: ProjectV2Lookup): {
  statusField?: ProjectV2Destination["statusField"];
  canonicalFields?: NonNullable<ProjectV2Destination["canonicalFields"]>;
} {
  const byName = new Map<string, (typeof project.fields)[number]>();
  for (const f of project.fields) byName.set(f.name.trim().toLowerCase(), f);

  const status = byName.get("status");
  const statusField =
    status &&
    status.dataType === "SINGLE_SELECT" &&
    status.options &&
    status.options.length > 0
      ? {
          fieldId: status.id,
          options: status.options.map((o) => ({ id: o.id, name: o.name })),
        }
      : undefined;

  const canonicalFields: NonNullable<ProjectV2Destination["canonicalFields"]> = {};

  const severity = byName.get("severity");
  if (severity && severity.dataType === "SINGLE_SELECT" && severity.options?.length) {
    canonicalFields.severity = {
      fieldId: severity.id,
      options: severity.options.map((o) => ({ id: o.id, name: o.name })),
    };
  }

  for (const [canonicalKey, columnNames] of [
    ["heuristic", ["heuristic"]],
    ["persona", ["persona"]],
    ["flow", ["flow"]],
    ["runId", ["run id", "run", "rove run"]],
    ["dashboardLink", ["dashboard link", "dashboard", "rove link"]],
  ] as const) {
    for (const name of columnNames) {
      const f = byName.get(name);
      if (f && (f.dataType === "TEXT" || f.dataType === "URL")) {
        canonicalFields[canonicalKey] = {
          fieldId: f.id,
          dataType: f.dataType as "TEXT" | "URL",
        };
        break;
      }
    }
  }

  return {
    statusField,
    canonicalFields: Object.keys(canonicalFields).length > 0 ? canonicalFields : undefined,
  };
}

/**
 * Parses a Project v2 URL the user pasted in the managed-board install
 * form's "template" field. Same parser as the connect-existing path
 * uses; lives here so the adapter doesn't import the route layer.
 */
function parseTemplateUrl(
  input: string,
): { ownerType: "organization" | "user"; owner: string; number: number } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;
  const m = /^\/(orgs|users)\/([A-Za-z0-9_.-]+)\/projects\/(\d+)(?:\/|$)/.exec(url.pathname);
  if (!m) return null;
  return {
    ownerType: m[1] === "orgs" ? "organization" : "user",
    owner: m[2],
    number: parseInt(m[3], 10),
  };
}

const CANONICAL_FIELD_SPECS: {
  name: string;
  body:
    | { dataType: "TEXT" | "NUMBER" | "DATE" }
    | {
        dataType: "SINGLE_SELECT";
        options: { name: string; color: ProjectV2OptionColor; description?: string }[];
      };
}[] = [
  {
    name: "Severity",
    body: {
      dataType: "SINGLE_SELECT",
      options: [
        { name: "Critical", color: "RED", description: "Blocks the user from completing the goal" },
        { name: "Major", color: "ORANGE", description: "Significant friction" },
        { name: "Minor", color: "YELLOW", description: "Nuisance; doesn't block" },
        { name: "Nit", color: "GRAY", description: "Stylistic / cosmetic" },
      ],
    },
  },
  { name: "Heuristic", body: { dataType: "TEXT" } },
  { name: "Persona", body: { dataType: "TEXT" } },
  { name: "Flow", body: { dataType: "TEXT" } },
  { name: "Run ID", body: { dataType: "TEXT" } },
  { name: "Dashboard link", body: { dataType: "TEXT" } },
];

/**
 * Creates the canonical Rove fields on a freshly-created Project v2.
 * Skips any field whose creation fails with a duplicate-name error
 * (re-runs of install on a board the user already partially populated
 * shouldn't blow up). Other errors propagate.
 */
async function provisionCanonicalFields(
  octokit: ReturnType<typeof getInstallationOctokit>,
  projectNodeId: string,
): Promise<void> {
  for (const spec of CANONICAL_FIELD_SPECS) {
    try {
      if (spec.body.dataType === "SINGLE_SELECT") {
        await createProjectV2Field(octokit, projectNodeId, {
          name: spec.name,
          dataType: "SINGLE_SELECT",
          options: spec.body.options,
        });
      } else {
        await createProjectV2Field(octokit, projectNodeId, {
          name: spec.name,
          dataType: spec.body.dataType,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
      if (msg.includes("already exists") || msg.includes("name has already been taken")) {
        continue;
      }
      throw err;
    }
  }
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

/**
 * Translate a BacklogFinding into the list of single-mutation field
 * writes pushFinding will batch. Only emits writes for fields the
 * destination actually has — order doesn't matter (each is an aliased
 * mutation), but Severity goes first for readability in error logs.
 */
function buildFieldWrites(
  dest: ProjectV2Destination,
  finding: BacklogFinding,
): FieldValueWrite[] {
  const writes: FieldValueWrite[] = [];
  const cf = dest.canonicalFields;
  if (!cf) return writes;

  if (cf.severity) {
    const target = finding.severity.toLowerCase();
    const opt = cf.severity.options.find(
      (o) => o.name.trim().toLowerCase() === target,
    );
    if (opt) {
      writes.push({
        fieldId: cf.severity.fieldId,
        kind: "single_select",
        singleSelectOptionId: opt.id,
      });
    }
  }
  if (cf.heuristic && finding.heuristic) {
    writes.push({ fieldId: cf.heuristic.fieldId, kind: "text", text: finding.heuristic });
  }
  if (cf.persona) {
    writes.push({ fieldId: cf.persona.fieldId, kind: "text", text: finding.personaId });
  }
  if (cf.flow) {
    writes.push({ fieldId: cf.flow.fieldId, kind: "text", text: finding.flowId });
  }
  if (cf.runId) {
    writes.push({ fieldId: cf.runId.fieldId, kind: "text", text: finding.runId });
  }
  if (cf.dashboardLink && finding.dashboardRunUrl) {
    writes.push({
      fieldId: cf.dashboardLink.fieldId,
      kind: "text",
      text: finding.dashboardRunUrl,
    });
  }
  return writes;
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
