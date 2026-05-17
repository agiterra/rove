/**
 * /projects/[id] — project overview + backlog connection settings.
 *
 * Server component. Reads the canonical project row + the active backlog
 * connection (if any), then renders the 3-path install picker or the
 * connected-state card. All wiring through to alpha.38c (real outbound
 * push) goes through the same `backlog_connections` substrate this page
 * persists into.
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
  // Honor ?p=<slug> override when present so the page stays consistent
  // with the dashboard's project-context resolution. Redirect throws,
  // so anything below is reached only when the URL segment is authoritative.
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
      }
    : null;

  return (
    <div className="max-w-5xl flex flex-col gap-8">
      <Hero
        projectId={projectId}
        displayName={project?.display_name ?? projectId}
        targetUrl={project?.default_target_url ?? null}
      />

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6">
        <BacklogPanel projectId={projectId} connection={connectionForClient} />
      </section>

      <CrossLinks projectId={projectId} />
    </div>
  );
}

function Hero({
  projectId,
  displayName,
  targetUrl,
}: {
  projectId: string;
  displayName: string;
  targetUrl: string | null;
}) {
  return (
    <section className="lw-hero">
      <div className="lw-hero-aurora" />
      <div className="lw-hero-edge" />
      <div className="relative z-[1]">
        <p
          className="font-mono uppercase text-[var(--color-text-faint)] mb-3"
          style={{ fontSize: 11, letterSpacing: "0.18em" }}
        >
          PROJECT <span className="opacity-60">·</span>{" "}
          <span className="font-mono">{projectId}</span>
        </p>
        <h1 className="font-semibold tracking-tight" style={{ fontSize: 32, lineHeight: 1.1 }}>
          {displayName}
        </h1>
        {targetUrl ? (
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Default target ·{" "}
            <a
              href={targetUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="font-mono underline decoration-dotted underline-offset-2"
            >
              {targetUrl}
            </a>
          </p>
        ) : null}
      </div>
    </section>
  );
}

function CrossLinks({ projectId }: { projectId: string }) {
  const items: { href: string; label: string; hint: string }[] = [
    {
      href: `/projects/${encodeURIComponent(projectId)}/gaps`,
      label: "Affordance gaps",
      hint: "Negative-space rollup — what walkers expected to find but didn't.",
    },
    {
      href: `/runs?p=${encodeURIComponent(projectId)}`,
      label: "Runs",
      hint: "Every walk that's executed against this project.",
    },
    {
      href: `/flows?p=${encodeURIComponent(projectId)}`,
      label: "Flows",
      hint: "User journeys this project walks personas through.",
    },
  ];
  return (
    <section className="grid gap-3 md:grid-cols-3">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4 hover:bg-[var(--color-panel-2)] transition-colors focus-rove"
        >
          <p className="text-sm font-medium">{it.label}</p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">{it.hint}</p>
        </Link>
      ))}
    </section>
  );
}
