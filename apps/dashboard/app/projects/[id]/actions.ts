"use server";

/**
 * Server actions for /projects/[id]: backlog install / disconnect.
 *
 * Three install paths, matching the v3 plan at docs/plans/ci-and-backlog.md:
 *   ① dashboard_only — no-op; just records the choice.
 *   ② connect_existing — user supplies a destination (today: a GH repo).
 *   ③ managed_board — alpha.40 (no action wired here yet).
 *
 * Each action is team-gated. On success, revalidate the page so the UI
 * reflects the new connection state on the next render.
 */

import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTeamMember } from "@/lib/authoring/require-team-member";
import {
  createConnection,
  disableConnection,
  getActiveConnection,
} from "@/lib/backlog/connections";
import { getBacklogAdapter } from "@/lib/backlog/registry";
import { createServiceRoleSupabase } from "@/lib/supabase/server";
import type { SyncPolicy } from "@/lib/backlog/types";

export type BacklogActionResult =
  | { ok: true }
  | { ok: false; error: string };

const ProjectIdSchema = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z][a-z0-9-]*$/, "invalid project id");

export async function installDashboardOnlyAction(
  projectId: string,
): Promise<BacklogActionResult> {
  const parsedId = ProjectIdSchema.safeParse(projectId);
  if (!parsedId.success) return { ok: false, error: "invalid project id" };
  try {
    await requireTeamMember();
  } catch {
    return { ok: false, error: "Not signed in." };
  }
  try {
    await createConnection({
      projectId: parsedId.data,
      provider: "dashboard-only",
      destination: {},
      installedVia: "dashboard_only",
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath(`/projects/${parsedId.data}`);
  return { ok: true };
}

const GhOwnerSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_.-]+$/, "invalid GitHub owner");

/**
 * Parses a GitHub Project v2 URL like:
 *   https://github.com/orgs/agiterra/projects/3
 *   https://github.com/users/somebody/projects/12
 * Validates via the adapter (GraphQL Project v2 lookup against the
 * Rove GitHub App), then persists the connection with the discovered
 * project node id + title + url + Status field map.
 */
export async function installConnectExistingGitHubAction(
  projectId: string,
  formData: FormData,
): Promise<BacklogActionResult> {
  const parsedId = ProjectIdSchema.safeParse(projectId);
  if (!parsedId.success) return { ok: false, error: "invalid project id" };
  try {
    await requireTeamMember();
  } catch {
    return { ok: false, error: "Not signed in." };
  }

  const parsed = parseProjectUrlFromForm(formData);
  if (!parsed.ok) return parsed;

  try {
    const adapter = await getBacklogAdapter("github");
    const { destination } = await adapter.installConnectExisting({
      projectId: parsedId.data,
      pick: {
        kind: "project_v2",
        ownerType: parsed.ownerType,
        owner: parsed.owner,
        number: parsed.number,
      },
      secretRef: "github_app_installation",
    });
    await createConnection({
      projectId: parsedId.data,
      provider: "github",
      destination,
      installedVia: "connect_existing",
      secretRef: "github_app_installation",
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath(`/projects/${parsedId.data}`);
  return { ok: true };
}

/**
 * Managed-board install — Rove creates the Project v2 board itself
 * (with the canonical custom fields, plus views inherited via the
 * optional template). Templates are the workaround for the GitHub
 * API limitation that views can't be created programmatically.
 */
export async function installManagedBoardGitHubAction(
  projectId: string,
  formData: FormData,
): Promise<BacklogActionResult> {
  const parsedId = ProjectIdSchema.safeParse(projectId);
  if (!parsedId.success) return { ok: false, error: "invalid project id" };
  try {
    await requireTeamMember();
  } catch {
    return { ok: false, error: "Not signed in." };
  }

  const owner = (formData.get("owner") ?? "").toString().trim();
  const boardName = (formData.get("boardName") ?? "").toString().trim();
  const templateProjectUrl = (formData.get("templateProjectUrl") ?? "").toString().trim();

  const ownerValid = GhOwnerSchema.safeParse(owner);
  if (!ownerValid.success) return { ok: false, error: "GitHub owner is required" };
  if (!boardName || boardName.length > 80) {
    return { ok: false, error: "Board name is required (max 80 chars)" };
  }

  try {
    const adapter = await getBacklogAdapter("github");
    if (!adapter.installManagedBoard) {
      return { ok: false, error: "Managed-board install not supported by adapter" };
    }
    const pickInput = {
      projectId: parsedId.data,
      boardName,
      owner: ownerValid.data,
      secretRef: "github_app_installation",
      ...(templateProjectUrl ? { templateProjectUrl } : {}),
    };
    const { destination } = await adapter.installManagedBoard(pickInput as never);
    await createConnection({
      projectId: parsedId.data,
      provider: "github",
      destination,
      installedVia: "managed_board",
      secretRef: "github_app_installation",
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath(`/projects/${parsedId.data}`);
  return { ok: true };
}

const SyncPolicySchema = z.object({
  critical: z.enum(["auto", "manual"]),
  major: z.enum(["auto", "auto-canonical", "manual"]),
  minor: z.enum(["auto", "auto-canonical", "manual"]),
  nit: z.enum(["auto", "auto-canonical", "manual"]),
  agent_readiness_boost: z.boolean(),
  recurrence_comment: z.boolean(),
});

/**
 * Replace the active connection's sync_policy. Per-severity dropdowns
 * + two toggles map straight onto the SyncPolicy shape. No partial
 * updates — the editor always submits the full policy.
 */
export async function updateSyncPolicyAction(
  projectId: string,
  rawPolicy: unknown,
): Promise<BacklogActionResult> {
  const parsedId = ProjectIdSchema.safeParse(projectId);
  if (!parsedId.success) return { ok: false, error: "invalid project id" };
  try {
    await requireTeamMember();
  } catch {
    return { ok: false, error: "Not signed in." };
  }

  const parsed = SyncPolicySchema.safeParse(rawPolicy);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }
  const policy: SyncPolicy = parsed.data;

  try {
    const conn = await getActiveConnection(parsedId.data);
    if (!conn) {
      return { ok: false, error: "No active backlog connection to update." };
    }
    const writer = createServiceRoleSupabase();
    const { error } = await writer
      .from("backlog_connections")
      .update({ sync_policy: policy })
      .eq("id", conn.id);
    if (error) return { ok: false, error: error.message };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath(`/projects/${parsedId.data}`);
  return { ok: true };
}

export async function disconnectBacklogAction(
  projectId: string,
): Promise<BacklogActionResult> {
  const parsedId = ProjectIdSchema.safeParse(projectId);
  if (!parsedId.success) return { ok: false, error: "invalid project id" };
  try {
    await requireTeamMember();
  } catch {
    return { ok: false, error: "Not signed in." };
  }
  try {
    const conn = await getActiveConnection(parsedId.data);
    if (!conn) return { ok: true };
    await disableConnection(conn.id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath(`/projects/${parsedId.data}`);
  return { ok: true };
}

type ParseProjectUrlResult =
  | { ok: true; ownerType: "organization" | "user"; owner: string; number: number }
  | { ok: false; error: string };

function parseProjectUrlFromForm(formData: FormData): ParseProjectUrlResult {
  const projectUrl = (formData.get("projectUrl") ?? "").toString().trim();
  if (!projectUrl) {
    return { ok: false, error: "Project v2 URL is required." };
  }
  const parsed = parseProjectV2Url(projectUrl);
  if (!parsed) {
    return {
      ok: false,
      error:
        "Couldn't parse a Project v2 URL from that input. " +
        "Try https://github.com/orgs/<org>/projects/<n> or .../users/<user>/projects/<n>.",
    };
  }
  const ownerValidation = GhOwnerSchema.safeParse(parsed.owner);
  if (!ownerValidation.success) return { ok: false, error: "invalid owner in URL" };
  return parsed;
}

function parseProjectV2Url(
  input: string,
): { ok: true; ownerType: "organization" | "user"; owner: string; number: number } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;
  // Expected paths:
  //   /orgs/<owner>/projects/<n>[/...]
  //   /users/<owner>/projects/<n>[/...]
  const m = /^\/(orgs|users)\/([A-Za-z0-9_.-]+)\/projects\/(\d+)(?:\/|$)/.exec(url.pathname);
  if (!m) return null;
  const ownerType: "organization" | "user" = m[1] === "orgs" ? "organization" : "user";
  const number = parseInt(m[3], 10);
  if (!Number.isFinite(number) || number <= 0) return null;
  return { ok: true, ownerType, owner: m[2], number };
}
