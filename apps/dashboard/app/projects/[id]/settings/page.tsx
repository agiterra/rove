/**
 * /projects/[id]/settings — project-level configuration. Houses the
 * backlog connection + sync policy editor + (future) project metadata
 * editors. The /projects/[id] route stays a slim overview that links
 * here for actual edits.
 *
 * Same project-context-resolution + metadata pattern as the parent
 * overview page (awaited params + searchParams, ?p= override redirects
 * to canonical URL).
 */
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createReadClient } from "@/lib/supabase/server";
import { getActiveConnection } from "@/lib/backlog/connections";
import { env } from "@/lib/env";
import { BacklogPanel } from "../BacklogPanel";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ p?: string }>;
}

interface ProjectRow {
  id: string;
  display_name: string;
  github_repo: string | null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `${id} · Settings`,
    description: `Backlog connection, sync policy, and configuration for the ${id} project.`,
  };
}

export default async function ProjectSettingsPage({ params, searchParams }: PageProps) {
  const [{ id: projectIdFromUrl }, sp] = await Promise.all([params, searchParams]);
  if (sp.p && sp.p !== projectIdFromUrl) {
    redirect(`/projects/${encodeURIComponent(sp.p)}/settings`);
  }
  const projectId = projectIdFromUrl;

  const supabase = await createReadClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, display_name, github_repo")
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

  return (
    <div className="max-w-5xl flex flex-col gap-8">
      <SettingsHero
        projectId={projectId}
        displayName={project?.display_name ?? projectId}
      />

      <section>
        <BacklogPanel
          projectId={projectId}
          connection={connectionForClient}
          defaultOwner={deriveDefaultOwner(project?.github_repo ?? null)}
          defaultTemplateUrl={env.defaultBacklogTemplateUrl() ?? ""}
        />
      </section>
    </div>
  );
}

function SettingsHero({
  projectId,
  displayName,
}: {
  projectId: string;
  displayName: string;
}) {
  return (
    <section className="lw-hero" style={{ padding: "32px 32px 28px" }}>
      <div className="lw-hero-aurora" />
      <div className="lw-hero-edge" />
      <div className="relative z-[1] flex flex-col gap-2.5">
        <p
          className="font-mono uppercase text-[var(--color-text-faint)] flex items-center gap-3"
          style={{ fontSize: 10.5, letterSpacing: "0.2em" }}
        >
          <a
            href={`/projects/${encodeURIComponent(projectId)}`}
            className="hover:text-[var(--color-text-muted)] transition-colors"
          >
            {projectId}
          </a>
          <span aria-hidden className="opacity-40">
            /
          </span>
          <span>SETTINGS</span>
        </p>
        <h1
          className="font-semibold tracking-tight"
          style={{ fontSize: 36, lineHeight: 1.05, letterSpacing: "-0.015em" }}
        >
          {displayName} settings
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] max-w-xl mt-1">
          Backlog destination, sync policy, and project configuration.
          Walks file findings into the backlog you pick here.
        </p>
      </div>
    </section>
  );
}

function deriveDefaultOwner(githubRepo: string | null): string {
  if (githubRepo && githubRepo.includes("/")) return githubRepo.split("/")[0];
  return "agiterra";
}
