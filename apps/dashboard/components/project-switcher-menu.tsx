"use client";

import { ChevronDown } from "lucide-react";

export interface ProjectOption {
  id: string;
  runCount: number;
}

const COOKIE_NAME = "rove_project";

function setProjectCookie(projectId: string) {
  // 30-day cookie scoped to root.
  const maxAge = 30 * 24 * 60 * 60;
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(projectId)}; path=/; max-age=${maxAge}; samesite=lax`;
}

export function ProjectSwitcherMenu({
  active,
  projects,
}: {
  active: string;
  projects: ProjectOption[];
}) {
  function pick(id: string) {
    if (id === active) return;
    setProjectCookie(id);
    // Stamp ?p=<new> on the URL directly so the new project is the active
    // tenant immediately — no double-redirect bounce through the middleware.
    const url = new URL(window.location.href);
    url.searchParams.set("p", id);
    window.location.href = url.toString();
  }

  return (
    <label className="relative inline-flex items-center rounded-full bg-[var(--color-bg-2)] border border-[var(--color-border)] text-[11px] font-mono hover:border-[var(--color-border-strong)] transition-colors">
      <span className="pl-2.5 pr-1 text-[var(--color-text-faint)] pointer-events-none">
        project
      </span>
      <select
        aria-label="Switch project"
        value={active}
        onChange={(e) => pick(e.target.value)}
        className="appearance-none bg-transparent py-1 pl-1 pr-7 text-[var(--color-text)] outline-none cursor-pointer"
        title="Switch project"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.id} ({p.runCount} {p.runCount === 1 ? "run" : "runs"})
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-text-faint)]"
        aria-hidden="true"
      />
    </label>
  );
}
