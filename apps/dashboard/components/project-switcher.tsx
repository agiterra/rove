/**
 * Header project switcher. Reads the distinct list of project_ids from the
 * Rove store (server-side via the cookie-bound client, RLS-gated), shows
 * the active project as a pill, and on click reveals a popover listing
 * the others.
 *
 * Server-renders the data, but the click-to-open behavior is a thin
 * client component (./project-switcher-menu.tsx). Cookie write is via
 * a tiny POST route so the URL stays clean.
 */
import { resolveProjectId } from "../lib/project-context";
import { createReadClient } from "../lib/supabase/server";
import { ProjectSwitcherMenu } from "./project-switcher-menu";

interface ProjectOption {
  id: string;
  runCount: number;
}

export async function ProjectSwitcher() {
  const supabase = await createReadClient();
  const active = await resolveProjectId();

  // Pull distinct project_ids from runs + agent_jobs; if both empty, surface
  // the active one anyway so the user can confirm what they're scoped to.
  const [{ data: runRows }, { data: jobRows }] = await Promise.all([
    supabase.from("runs").select("project_id"),
    supabase.from("agent_jobs").select("project_id"),
  ]);
  const counts = new Map<string, number>();
  for (const r of (runRows ?? []) as { project_id: string | null }[]) {
    if (r.project_id) counts.set(r.project_id, (counts.get(r.project_id) ?? 0) + 1);
  }
  for (const r of (jobRows ?? []) as { project_id: string | null }[]) {
    if (r.project_id && !counts.has(r.project_id)) counts.set(r.project_id, 0);
  }
  if (!counts.has(active)) counts.set(active, 0);

  const projects: ProjectOption[] = Array.from(counts.entries())
    .map(([id, runCount]) => ({ id, runCount }))
    .sort((a, b) => b.runCount - a.runCount || a.id.localeCompare(b.id));

  return <ProjectSwitcherMenu active={active} projects={projects} />;
}
