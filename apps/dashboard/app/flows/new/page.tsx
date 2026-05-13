import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "../../../components/page-header";
import { resolveProjectId } from "../../../lib/project-context";
import { createReadClient } from "../../../lib/supabase/server";
import { FlowWizard } from "./flow-wizard";

export const dynamic = "force-dynamic";

const DAEMON_STALE_AFTER_MS = 2 * 60_000;

export const metadata: import("next").Metadata = {
  title: "New flow",
  description: "Author a new Rove flow from a template or AI-generated draft.",
};

interface PageProps {
  searchParams: Promise<{ p?: string }>;
}

export default async function NewFlowPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const projectId = await resolveProjectId(sp);
  const daemonOnline = await checkDaemonOnlineForProject(projectId);
  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href="/flows"
        className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] mb-4"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        flows
      </Link>
      <PageHeader
        eyebrow="author"
        title="New flow"
        description="Describe what a real user is trying to do, in plain English. Templates available too. Submitting opens a draft PR — nothing lands until a teammate reviews + merges."
      />
      <FlowWizard daemonOnline={daemonOnline} projectId={projectId} />
    </div>
  );
}

/**
 * Daemon-online check scoped to the queued job's project. A daemon
 * running for project X will NOT claim a job stamped project Y — daemon
 * runner filters in packages/cli/src/daemon/runner.ts. So "daemon online"
 * must mean "a daemon for *this* project has heartbeated recently."
 */
async function checkDaemonOnlineForProject(projectId: string): Promise<boolean> {
  const supabase = await createReadClient();
  const { data } = await supabase
    .from("daemon_heartbeats")
    .select("last_seen_at, project_id")
    .eq("project_id", projectId);
  if (!data) return false;
  const cutoff = Date.now() - DAEMON_STALE_AFTER_MS;
  return data.some((h: { last_seen_at: string }) => new Date(h.last_seen_at).getTime() > cutoff);
}
