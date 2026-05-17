/**
 * Server-side helper: resolve a thin connection summary the
 * FindingSendToBacklogButton can pass to the client without leaking
 * the full BacklogConnection row (which carries secret_ref + provider-
 * internal destination metadata).
 *
 * Returns null when the project has no active connection OR when the
 * active connection is dashboard-only (UI treats those equivalently —
 * no external destination to send to).
 */
import "server-only";
import { getActiveConnection } from "@/lib/backlog/connections";
import type { BacklogProvider } from "@/lib/backlog/types";

export interface ProjectBacklogConnectionSummary {
  provider: Exclude<BacklogProvider, "dashboard-only">;
  /** A user-facing destination name (e.g. project title for Project v2). */
  destinationLabel: string;
  /** Public URL of the destination (Project v2 url, Linear board, etc.). */
  destinationUrl: string | null;
}

export async function resolveProjectBacklogConnection(
  projectId: string,
): Promise<ProjectBacklogConnectionSummary | null> {
  const conn = await getActiveConnection(projectId);
  if (!conn || conn.provider === "dashboard-only") return null;

  if (conn.provider === "github") {
    const d = conn.destination as {
      projectTitle?: unknown;
      projectUrl?: unknown;
      repo?: unknown;
      owner?: unknown;
      htmlUrl?: unknown;
    };
    if (typeof d.projectTitle === "string") {
      return {
        provider: "github",
        destinationLabel: d.projectTitle,
        destinationUrl: typeof d.projectUrl === "string" ? d.projectUrl : null,
      };
    }
    // Back-compat: legacy alpha.38b connections recorded `repo` shape.
    if (typeof d.owner === "string" && typeof d.repo === "string") {
      return {
        provider: "github",
        destinationLabel: `${d.owner}/${d.repo}`,
        destinationUrl: typeof d.htmlUrl === "string" ? d.htmlUrl : null,
      };
    }
  }

  if (conn.provider === "linear") {
    return {
      provider: "linear",
      destinationLabel: "Linear",
      destinationUrl: null,
    };
  }

  return null;
}
