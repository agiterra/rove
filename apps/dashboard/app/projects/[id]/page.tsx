/**
 * /projects/[id] — project overview. Slim landing page: hero + a
 * "Backlog" status card linking to /settings + cross-links to gaps /
 * runs / flows / settings. Actual configuration (install picker,
 * sync policy editor) lives at /projects/[id]/settings.
 *
 * Per .claude/rules/dashboard.md: awaited params + searchParams,
 * generateMetadata for the route-specific title, project_id filtering
 * on every query.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createReadClient } from "@/lib/supabase/server";
import { getActiveConnection } from "@/lib/backlog/connections";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ p?: string }>;
}

interface ProjectRow {
  id: string;
  display_name: string;
  default_target_url: string | null;
  github_repo: string | null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `${id} · Overview`,
    description: `Overview, recent activity, and links into the ${id} project surfaces.`,
  };
}

export default async function ProjectOverviewPage({ params, searchParams }: PageProps) {
  const [{ id: projectIdFromUrl }, sp] = await Promise.all([params, searchParams]);
  if (sp.p && sp.p !== projectIdFromUrl) {
    redirect(`/projects/${encodeURIComponent(sp.p)}`);
  }
  const projectId = projectIdFromUrl;

  const supabase = await createReadClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, display_name, default_target_url, github_repo")
    .eq("id", projectId)
    .maybeSingle<ProjectRow>();

  const connection = await getActiveConnection(projectId);
  const connectionSummary = summarizeConnection(connection);

  return (
    <div className="max-w-5xl flex flex-col gap-8">
      <ProjectHero
        projectId={projectId}
        displayName={project?.display_name ?? projectId}
        targetUrl={project?.default_target_url ?? null}
        githubRepo={project?.github_repo ?? null}
        hasConnection={connectionSummary !== null}
      />

      <BacklogStatusCard projectId={projectId} summary={connectionSummary} />

      <CrossLinks projectId={projectId} />
    </div>
  );
}

interface ConnectionSummary {
  provider: "dashboard-only" | "github" | "linear";
  destinationLabel: string;
  destinationUrl: string | null;
}

function summarizeConnection(
  conn: Awaited<ReturnType<typeof getActiveConnection>>,
): ConnectionSummary | null {
  if (!conn) return null;
  if (conn.provider === "dashboard-only") {
    return { provider: "dashboard-only", destinationLabel: "Rove dashboard only", destinationUrl: null };
  }
  const d = conn.destination as {
    projectTitle?: unknown;
    projectUrl?: unknown;
    owner?: unknown;
    repo?: unknown;
    htmlUrl?: unknown;
  };
  if (conn.provider === "github" && typeof d.projectTitle === "string") {
    return {
      provider: "github",
      destinationLabel: typeof d.owner === "string" ? `${d.owner} · ${d.projectTitle}` : d.projectTitle,
      destinationUrl: typeof d.projectUrl === "string" ? d.projectUrl : null,
    };
  }
  if (conn.provider === "github" && typeof d.owner === "string" && typeof d.repo === "string") {
    return {
      provider: "github",
      destinationLabel: `${d.owner}/${d.repo}`,
      destinationUrl: typeof d.htmlUrl === "string" ? d.htmlUrl : null,
    };
  }
  return { provider: conn.provider, destinationLabel: conn.provider, destinationUrl: null };
}

/* ────────────────────────────────────────────────────────────────────
 *  Hero
 * ──────────────────────────────────────────────────────────────────── */

function ProjectHero({
  projectId,
  displayName,
  targetUrl,
  githubRepo,
  hasConnection,
}: {
  projectId: string;
  displayName: string;
  targetUrl: string | null;
  githubRepo: string | null;
  hasConnection: boolean;
}) {
  return (
    <section className="lw-hero" style={{ padding: "36px 36px 32px" }}>
      <div className="lw-hero-aurora" />
      <div className="lw-hero-streak" />
      <div className="lw-hero-edge" />
      <div className="relative z-[1] flex flex-col gap-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex flex-col gap-3">
            <p
              className="font-mono uppercase text-[var(--color-text-faint)] flex items-center gap-3"
              style={{ fontSize: 10.5, letterSpacing: "0.2em" }}
            >
              <span>PROJECT</span>
              <span aria-hidden className="opacity-40">/</span>
              <span className="text-[var(--color-text-muted)]">{projectId}</span>
            </p>
            <h1
              className="font-semibold tracking-tight text-balance"
              style={{ fontSize: 44, lineHeight: 1.02, letterSpacing: "-0.018em" }}
            >
              {displayName}
            </h1>
          </div>
          <StatusPill hasConnection={hasConnection} />
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-3 pt-1">
          <MetaField label="Target">
            {targetUrl ? (
              <a
                href={targetUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="font-mono text-[13px] text-[var(--color-text)] underline decoration-dotted underline-offset-4 decoration-[var(--color-border-strong)] hover:decoration-[var(--color-accent)] transition-colors"
              >
                {prettyHost(targetUrl)}
              </a>
            ) : (
              <span className="font-mono text-[13px] text-[var(--color-text-faint)]">—</span>
            )}
          </MetaField>
          <MetaField label="Repo">
            {githubRepo ? (
              <a
                href={`https://github.com/${githubRepo}`}
                target="_blank"
                rel="noreferrer noopener"
                className="font-mono text-[13px] text-[var(--color-text)] underline decoration-dotted underline-offset-4 decoration-[var(--color-border-strong)] hover:decoration-[var(--color-accent)] transition-colors"
              >
                {githubRepo}
              </a>
            ) : (
              <span className="font-mono text-[13px] text-[var(--color-text-faint)]">—</span>
            )}
          </MetaField>
          <MetaField label="Slug">
            <span className="font-mono text-[13px] text-[var(--color-text-muted)]">{projectId}</span>
          </MetaField>
        </div>
      </div>
    </section>
  );
}

function StatusPill({ hasConnection }: { hasConnection: boolean }) {
  return (
    <span
      className={
        hasConnection
          ? "inline-flex items-center gap-2 rounded-full border border-[rgba(63,201,203,0.35)] bg-[rgba(63,201,203,0.08)] px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-[var(--color-accent)]"
          : "inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-panel-2)]/40 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-[var(--color-text-faint)]"
      }
    >
      <span
        className={
          hasConnection
            ? "path-pulse"
            : "block w-1.5 h-1.5 rounded-full bg-[var(--color-text-faint)]"
        }
        aria-hidden
      />
      {hasConnection ? "Backlog connected" : "Backlog pending"}
    </span>
  );
}

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="font-mono uppercase text-[var(--color-text-faint)]"
        style={{ fontSize: 9.5, letterSpacing: "0.18em" }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function prettyHost(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname === "/" ? "" : u.pathname);
  } catch {
    return url;
  }
}

/* ────────────────────────────────────────────────────────────────────
 *  Backlog status row — short summary + link to /settings
 * ──────────────────────────────────────────────────────────────────── */

function BacklogStatusCard({
  projectId,
  summary,
}: {
  projectId: string;
  summary: ConnectionSummary | null;
}) {
  const settingsHref = `/projects/${encodeURIComponent(projectId)}/settings`;
  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6 flex items-center justify-between gap-6 flex-wrap">
      <div className="flex flex-col gap-1.5 min-w-0">
        <p
          className="font-mono uppercase text-[var(--color-text-faint)]"
          style={{ fontSize: 10.5, letterSpacing: "0.18em" }}
        >
          BACKLOG
        </p>
        {summary ? (
          <p className="text-sm">
            Findings flow to{" "}
            {summary.destinationUrl ? (
              <a
                href={summary.destinationUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium underline decoration-dotted underline-offset-4 decoration-[var(--color-border-strong)] hover:decoration-[var(--color-accent)] transition-colors"
              >
                {summary.destinationLabel}
              </a>
            ) : (
              <span className="font-medium">{summary.destinationLabel}</span>
            )}
            <span className="text-[var(--color-text-faint)]"> · {providerLabel(summary.provider)}</span>
          </p>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">
            No external backlog connected yet. Findings stay in Rove.
          </p>
        )}
      </div>
      <Link
        href={settingsHref}
        className="focus-rove inline-flex items-center gap-2 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-panel-2)]/60 px-4 py-2 text-xs font-medium hover:bg-[var(--color-panel-2)] transition-colors"
      >
        {summary ? "Manage settings" : "Connect a backlog"}
        <span aria-hidden className="text-[var(--color-text-faint)]">→</span>
      </Link>
    </section>
  );
}

function providerLabel(p: ConnectionSummary["provider"]): string {
  if (p === "github") return "GitHub Project v2";
  if (p === "linear") return "Linear";
  return "Dashboard only";
}

/* ────────────────────────────────────────────────────────────────────
 *  Cross-links
 * ──────────────────────────────────────────────────────────────────── */

function CrossLinks({ projectId }: { projectId: string }) {
  const items: { href: string; label: string; hint: string }[] = [
    {
      href: `/projects/${encodeURIComponent(projectId)}/settings`,
      label: "Settings",
      hint: "Backlog connection, sync policy",
    },
    {
      href: `/projects/${encodeURIComponent(projectId)}/gaps`,
      label: "Affordance gaps",
      hint: "Negative-space rollup",
    },
    {
      href: `/runs?p=${encodeURIComponent(projectId)}`,
      label: "Runs",
      hint: "Every walk against this project",
    },
    {
      href: `/flows?p=${encodeURIComponent(projectId)}`,
      label: "Flows",
      hint: "User journeys to walk",
    },
  ];
  return (
    <nav aria-label="Project surfaces" className="path-crosslinks" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
      {items.map((it) => (
        <Link key={it.href} href={it.href} className="path-crosslink focus-rove">
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-[var(--color-text)]">{it.label}</span>
            <span className="text-[11px] text-[var(--color-text-faint)]">{it.hint}</span>
          </span>
          <span className="path-crosslink-arrow" aria-hidden>→</span>
        </Link>
      ))}
    </nav>
  );
}
