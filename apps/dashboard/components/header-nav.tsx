"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";

const ITEMS = [
  { href: "/runs", label: "Runs" },
  { href: "/findings", label: "Findings" },
  /**
   * Project-scoped overview / backlog-connection settings + the
   * negative-space rollup that lives one segment deeper. Both substitute
   * the `[p]` placeholder via `useProjectAwareHref` below.
   */
  { href: "/projects/[p]", label: "Project" },
  { href: "/projects/[p]/gaps", label: "Gaps" },
  { href: "/flows", label: "Flows" },
  { href: "/workers", label: "Workers" },
] as const;

const NEW_ITEMS = [
  { href: "/projects/new", label: "Project" },
  { href: "/flows/new", label: "Flow" },
  { href: "/personas/new", label: "Persona" },
] as const;

/**
 * Per-item active-state matcher. Encodes two project-scoped quirks:
 *
 * 1. `/projects/[p]` (Project overview) must NOT light up on
 *    `/projects/<slug>/gaps` — otherwise both Project and Gaps would be
 *    marked active on the gaps page. Exact-segment match only.
 * 2. `/projects/[p]/gaps` should light up for any slug, not just the
 *    currently-resolved one (matches the original behavior — we light up
 *    by route shape, not by which slug the user clicked in from).
 */
function isItemActive(itemHref: string, matchBase: string, pathname: string): boolean {
  if (itemHref === "/projects/[p]") {
    return /^\/projects\/[^/]+\/?$/.test(pathname);
  }
  if (itemHref === "/projects/[p]/gaps") {
    return /^\/projects\/[^/]+\/gaps(?:\/|$)/.test(pathname);
  }
  if (pathname === matchBase) return true;
  return pathname.startsWith(matchBase + "/");
}

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
    // Path-segment placeholder: routes like /projects/[p]/gaps substitute
    // the project slug into the URL, not as a ?p= query param.
    if (href.includes("[p]")) {
      const slug = p ?? "tankloop";
      return href.replace("[p]", encodeURIComponent(slug));
    }
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
        const resolved = withProject(it.href);
        const matchBase = resolved.split("?")[0];
        const active = isItemActive(it.href, matchBase, pathname);
        return (
          <Link
            key={it.href}
            href={resolved}
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
