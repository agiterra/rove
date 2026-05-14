/**
 * Header project switcher. Reads from public.projects (the canonical
 * registry) and joins run counts from public.runs for the badge label.
 * Renders the active slug as a pill; the click-to-open menu lives in the
 * thin client component ./project-switcher-menu.tsx.
 *
 * If projects is empty (fresh deploy, no migration backfill yet), falls
 * back to surfacing the active slug so the page never renders an empty
 * dropdown.
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

  const [{ data: projectRows }, { data: runRows }] = await Promise.all([
    supabase.from("projects").select("id, display_name"),
    supabase.from("runs").select("project_id"),
  ]);

  const counts = new Map<string, number>();
  for (const r of (runRows ?? []) as { project_id: string | null }[]) {
    if (r.project_id) counts.set(r.project_id, (counts.get(r.project_id) ?? 0) + 1);
  }

  const slugs = new Set<string>();
  for (const p of (projectRows ?? []) as { id: string }[]) slugs.add(p.id);
  // Always surface the active slug, even if projects didn't return it
  // (could happen on a fresh deploy before the user creates anything).
  slugs.add(active);

  const projects: ProjectOption[] = Array.from(slugs)
    .map((id) => ({ id, runCount: counts.get(id) ?? 0 }))
    .sort((a, b) => b.runCount - a.runCount || a.id.localeCompare(b.id));

  return <ProjectSwitcherMenu active={active} projects={projects} />;
}
