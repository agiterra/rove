"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";

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
  const [open, setOpen] = useState(false);

  function pick(id: string) {
    setProjectCookie(id);
    // Stamp ?p=<new> on the URL directly so the new project is the active
    // tenant immediately — no double-redirect bounce through the middleware.
    const url = new URL(window.location.href);
    url.searchParams.set("p", id);
    window.location.href = url.toString();
  }

  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-bg-2)] border border-[var(--color-border)] text-[11px] text-[var(--color-text-muted)] font-mono hover:border-[var(--color-border-strong)] transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Switch project"
      >
        <span className="text-[var(--color-text-faint)]">project</span>
        <span className="text-[var(--color-text)]">{active}</span>
        <ChevronDown className="w-3 h-3 text-[var(--color-text-faint)]" />
      </button>

      {open ? (
        <>
          {/* dismiss layer */}
          <span className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <ul
            role="listbox"
            className="absolute right-0 mt-1 min-w-[14rem] z-50 surface-raised p-1 text-sm shadow-[0_24px_60px_-24px_rgba(0,0,0,0.6)]"
          >
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={p.id === active}
                  onClick={() => pick(p.id)}
                  className={`w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-md font-mono text-[12px] transition-colors ${
                    p.id === active
                      ? "bg-[var(--color-panel-2)] text-[var(--color-text)]"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--color-panel-2)]/60 hover:text-[var(--color-text)]"
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {p.id === active ? (
                      <Check className="w-3 h-3 text-[var(--color-accent)] shrink-0" />
                    ) : (
                      <span className="w-3 inline-block" />
                    )}
                    <span className="truncate">{p.id}</span>
                  </span>
                  <span className="text-[10px] text-[var(--color-text-faint)] shrink-0 tabular-nums">
                    {p.runCount} {p.runCount === 1 ? "run" : "runs"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </span>
  );
}
