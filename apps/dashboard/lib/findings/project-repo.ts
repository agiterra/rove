import "server-only";
import { createReadClient } from "../supabase/server";

export interface ProjectRepo {
  owner: string;
  name: string;
}

/**
 * Resolve a project's `github_repo` binding to a `{ owner, name }` pair.
 * Returns null when the project doesn't exist, has no binding, or the
 * stored value doesn't parse. Powers the "Send to GitHub issue" button —
 * a null result disables the button with a "connect a repo" tooltip.
 */
export async function resolveProjectRepo(projectId: string): Promise<ProjectRepo | null> {
  const supabase = await createReadClient();
  const { data, error } = await supabase
    .from("projects")
    .select("github_repo")
    .eq("id", projectId)
    .maybeSingle<{ github_repo: string | null }>();
  if (error || !data?.github_repo) return null;
  return parseOwnerRepo(data.github_repo);
}

export function parseOwnerRepo(raw: string): ProjectRepo | null {
  const m = raw.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!m) return null;
  return { owner: m[1], name: m[2] };
}
