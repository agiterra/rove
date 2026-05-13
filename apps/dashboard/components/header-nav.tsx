"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";

const ITEMS = [
  { href: "/runs", label: "Runs" },
  { href: "/findings", label: "Findings" },
  { href: "/flows", label: "Flows" },
  { href: "/workers", label: "Workers" },
] as const;

const NEW_ITEMS = [
  { href: "/flows/new", label: "Flow" },
  { href: "/personas/new", label: "Persona" },
] as const;

/**
 * Append the current `?p=<project>` query param to internal hrefs so the
 * user doesn't lose their project context across navigation. The
 * middleware will redirect missing-`p` URLs to the cookie-resolved value
 * anyway, but doing it client-side avoids the bounce.
 */
function useProjectAwareHref(): (href: string) => string {
  const search = useSearchParams();
  const p = search.get("p");
  return (href: string) => {
    if (!p) return href;
    return href.includes("?") ? `${href}&p=${p}` : `${href}?p=${p}`;
  };
}

export function HeaderNav() {
  const pathname = usePathname();
  const withProject = useProjectAwareHref();
  return (
    <nav className="flex items-center gap-1">
      {ITEMS.map((it) => {
        const active = pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={withProject(it.href)}
            aria-current={active ? "page" : undefined}
            className={`relative px-3 py-1.5 text-sm rounded-md transition-colors ${
              active
                ? "text-[var(--color-text)] bg-[var(--color-panel-2)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-panel-2)]/50"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function HeaderAuthorMenu() {
  const pathname = usePathname();
  const withProject = useProjectAwareHref();
  return (
    <span className="inline-flex items-center divide-x divide-[var(--color-border)] rounded-md border border-[var(--color-border)] overflow-hidden text-[12px]">
      <span className="px-2 py-1 text-[var(--color-text-faint)] inline-flex items-center gap-1">
        <Plus className="w-3 h-3" />
        new
      </span>
      {NEW_ITEMS.map((it) => {
        const active = pathname === it.href;
        return (
          <Link
            key={it.href}
            href={withProject(it.href)}
            className={`px-2 py-1 transition-colors ${
              active
                ? "text-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-panel-2)]/60"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </span>
  );
}
