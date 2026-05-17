/**
 * /projects/[id] — project overview + backlog connection settings.
 *
 * Server component. Reads the canonical project row + the active backlog
 * connection (if any), then renders the marquee install picker or the
 * connected-state showpiece via BacklogPanel.
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
import { BacklogPanel } from "./BacklogPanel";

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
    description: `Backlog, gaps, and connection settings for the ${id} project.`,
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

  const connectionForClient = connection
    ? {
        provider: connection.provider,
        installedVia: connection.installedVia,
        installedAt: connection.installedAt,
        destination: connection.destination,
        syncPolicy: connection.syncPolicy,
      }
    : null;

  const hasConnection = connectionForClient !== null;

  return (
    <div className="max-w-5xl flex flex-col gap-10">
      <ProjectHero
        projectId={projectId}
        displayName={project?.display_name ?? projectId}
        targetUrl={project?.default_target_url ?? null}
        githubRepo={project?.github_repo ?? null}
        hasConnection={hasConnection}
      />

      <section>
        <BacklogPanel
          projectId={projectId}
          connection={connectionForClient}
          defaultOwner={deriveDefaultOwner(project?.github_repo ?? null)}
        />
      </section>

      <CrossLinks projectId={projectId} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
 *  Hero — atmospheric lw-hero treatment scaled up, with a status pill
 *  on the right when a backlog is connected.
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
              <span aria-hidden className="opacity-40">
                /
              </span>
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
              <span className="font-mono text-[13px] text-[var(--color-text-faint)]">
                —
              </span>
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
              <span className="font-mono text-[13px] text-[var(--color-text-faint)]">
                —
              </span>
            )}
          </MetaField>
          <MetaField label="Slug">
            <span className="font-mono text-[13px] text-[var(--color-text-muted)]">
              {projectId}
            </span>
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

function MetaField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
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

/**
 * Default GitHub owner prefilled in the managed-board install form.
 * Derived from the project's github_repo binding when present (the
 * "owner/repo" string the PR-authoring wizard already uses), falling
 * back to "agiterra" — the alpha-stage hard-coded org.
 */
function deriveDefaultOwner(githubRepo: string | null): string {
  if (githubRepo && githubRepo.includes("/")) return githubRepo.split("/")[0];
  return "agiterra";
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
 *  Cross-links — hairline-separated row, hover-reveal arrows.
 * ──────────────────────────────────────────────────────────────────── */

function CrossLinks({ projectId }: { projectId: string }) {
  const items: { href: string; label: string; hint: string }[] = [
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
    <nav aria-label="Project surfaces" className="path-crosslinks">
      {items.map((it) => (
        <Link key={it.href} href={it.href} className="path-crosslink focus-rove">
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-[var(--color-text)]">
              {it.label}
            </span>
            <span className="text-[11px] text-[var(--color-text-faint)]">
              {it.hint}
            </span>
          </span>
          <span className="path-crosslink-arrow" aria-hidden>
            →
          </span>
        </Link>
      ))}
    </nav>
  );
}
