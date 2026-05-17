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

const GhRepoSchema = z.object({
  owner: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_.-]+$/, "invalid GitHub owner"),
  repo: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9_.-]+$/, "invalid GitHub repo"),
});

/**
 * Accepts either separate owner+repo form fields OR a single repoUrl
 * field (e.g. "https://github.com/agiterra/tankloop" or "agiterra/tankloop").
 * Parses to {owner, repo}, validates the repo via the adapter (which hits
 * the Rove GitHub App), then persists the connection.
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

  const parsed = parseRepoFromForm(formData);
  if (!parsed.ok) return parsed;

  try {
    const adapter = await getBacklogAdapter("github");
    const { destination } = await adapter.installConnectExisting({
      projectId: parsedId.data,
      pick: { kind: "repo_issues", owner: parsed.owner, repo: parsed.repo },
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

type ParseRepoResult =
  | { ok: true; owner: string; repo: string }
  | { ok: false; error: string };

function parseRepoFromForm(formData: FormData): ParseRepoResult {
  const repoUrl = (formData.get("repoUrl") ?? "").toString().trim();
  if (repoUrl) {
    const fromUrl = parseRepoUrl(repoUrl);
    if (!fromUrl) {
      return {
        ok: false,
        error: "Couldn't parse owner/repo from that input. Try `agiterra/tankloop` or the GitHub URL.",
      };
    }
    const parsed = GhRepoSchema.safeParse(fromUrl);
    if (!parsed.success) return { ok: false, error: parsed.error.message };
    return { ok: true, owner: parsed.data.owner, repo: parsed.data.repo };
  }
  const owner = (formData.get("owner") ?? "").toString().trim();
  const repo = (formData.get("repo") ?? "").toString().trim();
  const parsed = GhRepoSchema.safeParse({ owner, repo });
  if (!parsed.success) {
    return {
      ok: false,
      error: "owner and repo are required (or paste a `owner/repo` shorthand into the URL field).",
    };
  }
  return { ok: true, owner: parsed.data.owner, repo: parsed.data.repo };
}

function parseRepoUrl(input: string): { owner: string; repo: string } | null {
  const trimmed = input.replace(/\.git$/, "").trim();
  // Shorthand: "owner/repo"
  const shorthand = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(trimmed);
  if (shorthand) return { owner: shorthand[1], repo: shorthand[2] };
  // Full URL: "https://github.com/owner/repo" with optional trailing path.
  try {
    const url = new URL(trimmed);
    if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;
    const [, owner, repo] = url.pathname.split("/");
    if (!owner || !repo) return null;
    return { owner, repo: repo.replace(/\.git$/, "") };
  } catch {
    return null;
  }
}
