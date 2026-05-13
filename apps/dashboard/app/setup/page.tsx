/**
 * /setup — install a Rove daemon on the current machine.
 *
 * Server component: resolves auth, project, and worker-name default, then
 * hands them to SetupForm (client) for form state + realtime subscription.
 * Auth-gated: unauthenticated visitors are redirected to /signin?next=/setup.
 */
import "server-only";
import { redirect } from "next/navigation";
import { hostname as osHostname } from "node:os";
import { requireTeamMember } from "@/lib/authoring/require-team-member";
import { resolveProjectId } from "@/lib/project-context";
import { PageHeader } from "@/components/page-header";
import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ p?: string }>;
}

export default async function SetupPage({ searchParams }: PageProps) {
  let me: Awaited<ReturnType<typeof requireTeamMember>>;
  try {
    me = await requireTeamMember();
  } catch {
    redirect("/signin?next=/setup");
  }

  const sp = await searchParams;
  const projectId = await resolveProjectId(sp);

  // Default worker name: <hostname>-<github_handle>. Both segments are
  // sanitised to lowercase + hyphens only so the name is DB-safe.
  const rawHost = (() => {
    try {
      return osHostname();
    } catch {
      return "machine";
    }
  })();
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const handle = me.githubHandle ?? me.displayName ?? "user";
  const defaultWorkerName = `${slug(rawHost)}-${slug(handle)}`.slice(0, 64);

  return (
    <div>
      <PageHeader
        eyebrow="Workers"
        title="Set up worker"
        description="Install the Rove daemon on this machine. Paste one command — the daemon starts automatically and stays running across reboots."
      />
      <SetupForm
        defaultWorkerName={defaultWorkerName}
        projectId={projectId}
      />
    </div>
  );
}
