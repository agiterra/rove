/**
 * Header pill showing the active project_id. Read-only in alpha — a
 * dropdown switcher arrives once we have a second project's data in
 * the store. For now this just tells the visitor which project's data
 * they're looking at, since the dashboard's queries scope to it.
 */
import { resolveProjectId } from "../lib/project-context";

export async function ProjectPill() {
  const projectId = await resolveProjectId();
  return (
    <span
      title={`Showing data for project ${projectId}. Append ?p=<slug> to a URL to view a different project.`}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-bg-2)] border border-[var(--color-border)] text-[11px] text-[var(--color-text-muted)] font-mono"
    >
      <span className="text-[var(--color-text-faint)]">project</span>
      <span className="text-[var(--color-text)]">{projectId}</span>
    </span>
  );
}
