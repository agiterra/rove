import Link from "next/link";
import { createReadClient } from "../../lib/supabase/server";
import { relativeTime, shortSha } from "../../lib/format";
import { EmptyState, PageHeader } from "../../components/page-header";

export const dynamic = "force-dynamic";

interface RunRow {
  id: string;
  flow_id: string;
  persona_id: string;
  dispatcher: string;
  status: string;
  branch: string | null;
  commit_sha: string | null;
  started_at: string;
  finished_at: string | null;
  initiator_label: string | null;
  findings: { count: number }[];
}

export default async function RunsPage() {
  const supabase = await createReadClient();
  const { data, error } = await supabase
    .from("runs")
    .select(
      "id, flow_id, persona_id, dispatcher, status, branch, commit_sha, started_at, finished_at, initiator_label, findings(count)",
    )
    .order("started_at", { ascending: false })
    .limit(50);

  if (error) {
    return (
      <div className="bg-red-950/30 border border-red-800/40 text-red-200 rounded-xl p-6">
        <p className="font-medium mb-1">Could not load runs</p>
        <p className="text-sm font-mono">{error.message}</p>
      </div>
    );
  }
  const runs = (data ?? []) as unknown as RunRow[];

  return (
    <div>
      <PageHeader
        eyebrow="activity"
        title="Recent runs"
        description="Each row is one walk by one persona on one commit. Click a flow to see its trend."
      />

      {runs.length === 0 ? (
        <EmptyState
          emoji="🛰"
          title="No runs yet"
          description="Click into any flow and hit Run walk, or kick one off from your terminal."
        />
      ) : (
        <div className="surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-[10px] uppercase tracking-[0.12em] text-[var(--color-text-faint)] bg-[var(--color-panel-2)]/60">
              <tr>
                <th className="px-5 py-3 font-medium">Flow / persona</th>
                <th className="px-5 py-3 font-medium">By</th>
                <th className="px-5 py-3 font-medium">Branch · SHA</th>
                <th className="px-5 py-3 font-medium text-right">Findings</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {runs.map((r) => {
                const count = r.findings?.[0]?.count ?? 0;
                return (
                  <tr
                    key={r.id}
                    className="hover:bg-[var(--color-panel-2)]/60 transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/flows/${encodeURIComponent(r.flow_id)}`}
                        className="font-mono text-[13px] text-[var(--color-text)] hover:text-[var(--color-accent)] transition-colors"
                      >
                        {r.flow_id}
                      </Link>
                      <div className="text-[11px] text-[var(--color-text-faint)] mt-0.5">
                        {r.persona_id} · {r.dispatcher}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-[var(--color-text-muted)] text-[13px]">
                      {r.initiator_label ?? "—"}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-[11px] text-[var(--color-text-faint)]">
                      {r.branch ?? "—"}
                      <span className="mx-1.5">·</span>
                      {shortSha(r.commit_sha)}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        href={`/findings?run=${r.id}`}
                        className="tabular-nums text-[var(--color-text)] hover:text-[var(--color-accent)] transition-colors"
                      >
                        {count}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-5 py-3.5 text-right text-[var(--color-text-faint)] text-[11px]">
                      {relativeTime(r.started_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    running: "bg-sky-500/10 text-sky-300 border-sky-500/30",
    failed: "bg-rose-500/10 text-rose-300 border-rose-500/30",
  };
  const cls = map[status] ?? "bg-slate-500/10 text-slate-300 border-slate-500/30";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium rounded-full border ${cls}`}
    >
      {status}
    </span>
  );
}
