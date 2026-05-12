import Link from "next/link";
import { ExternalLink, Image as ImageIcon } from "lucide-react";
import { createReadClient, createServiceRoleSupabase } from "../../lib/supabase/server";
import { relativeTime } from "../../lib/format";
import { EmptyState, PageHeader, SeverityBadge } from "../../components/page-header";
import { resolveProjectId } from "../../lib/project-context";
import { FindingDrawer } from "./drawer";

export const dynamic = "force-dynamic";

const SEVERITIES = ["critical", "major", "minor", "nit"] as const;

interface FindingRow {
  id: string;
  run_id: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  heuristic: string | null;
  github_issue_url: string | null;
  first_seen_at: string;
  last_seen_at: string;
  content_hash: string;
  runs: { flow_id: string; persona_id: string; branch: string | null } | null;
  finding_screenshots: { id: string; storage_key: string; caption: string | null }[];
}

interface SearchParams {
  severity?: string;
  status?: string;
  flow?: string;
  run?: string;
  persona?: string;
  /** 'agent' | 'human' — splits the list by heuristic prefix `agent.*`. */
  lens?: string;
  open?: string;
  p?: string;
}

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function FindingsPage({ searchParams: sp }: PageProps) {
  const searchParams = await sp;
  const projectId = await resolveProjectId(searchParams);
  const supabase = await createReadClient();

  let q = supabase
    .from("findings")
    .select(
      "id, run_id, severity, title, description, status, heuristic, github_issue_url, first_seen_at, last_seen_at, content_hash, runs(flow_id, persona_id, branch), finding_screenshots(id, storage_key, caption)",
    )
    .eq("project_id", projectId)
    .order("last_seen_at", { ascending: false })
    .limit(200);

  if (searchParams.severity && SEVERITIES.includes(searchParams.severity as never)) {
    q = q.eq("severity", searchParams.severity);
  }
  if (searchParams.status) q = q.eq("status", searchParams.status);
  if (searchParams.run) q = q.eq("run_id", searchParams.run);
  if (searchParams.lens === "agent") {
    q = q.like("heuristic", "agent.%");
  } else if (searchParams.lens === "human") {
    q = q.or("heuristic.is.null,heuristic.not.like.agent.%");
  }

  const { data, error } = await q;
  if (error) return <ErrorState message={error.message} />;

  let findings = (data ?? []) as unknown as FindingRow[];
  if (searchParams.flow) {
    findings = findings.filter((f) => f.runs?.flow_id === searchParams.flow);
  }
  if (searchParams.persona) {
    findings = findings.filter((f) => f.runs?.persona_id === searchParams.persona);
  }

  // Build a fresh signed-URL set for any screenshots referenced by the
  // opened finding's drawer. Service-role is server-only and is the
  // cheapest way to mint signed URLs without coupling the dashboard to
  // a separate storage route.
  let drawerFinding: FindingRow | null = null;
  let drawerSignedUrls: { storage_key: string; url: string; caption: string | null }[] = [];
  if (searchParams.open) {
    drawerFinding = findings.find((f) => f.id === searchParams.open) ?? null;
    if (drawerFinding && drawerFinding.finding_screenshots.length > 0) {
      const service = createServiceRoleSupabase();
      for (const s of drawerFinding.finding_screenshots) {
        const { data: signed } = await service.storage
          .from("walks")
          .createSignedUrl(s.storage_key, 60 * 10);
        if (signed?.signedUrl) {
          drawerSignedUrls.push({
            storage_key: s.storage_key,
            url: signed.signedUrl,
            caption: s.caption,
          });
        }
      }
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="evidence"
        title="Findings"
        description="Every UX issue the agents flagged across all runs. Click a row to read the full description and see screenshots."
      />

      <Filters current={searchParams} />

      {findings.length === 0 ? (
        <EmptyState
          emoji="🐛"
          title="No findings match"
          description="Either your filters are too narrow, or the agents are happy. Adjust the severity / status chips above."
        />
      ) : (
        <>
          <p className="text-xs text-[var(--color-text-faint)] mb-3">{findings.length} findings</p>
          <div className="surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-left text-[10px] uppercase tracking-[0.12em] text-[var(--color-text-faint)] bg-[var(--color-panel-2)]/60">
                <tr>
                  <th className="px-5 py-3 font-medium w-20">Severity</th>
                  <th className="px-5 py-3 font-medium">Title</th>
                  <th className="px-5 py-3 font-medium">Flow / persona</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-center">GH</th>
                  <th className="px-5 py-3 font-medium text-center">
                    <ImageIcon className="w-3.5 h-3.5 inline" aria-label="Screenshots" />
                  </th>
                  <th className="px-5 py-3 font-medium text-right">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {findings.map((f) => (
                  <tr key={f.id} className="hover:bg-[var(--color-panel-2)]/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <SeverityBadge severity={f.severity} />
                    </td>
                    <td className="px-5 py-3.5 max-w-md">
                      <Link
                        href={mergeSearch(searchParams, { open: f.id })}
                        className="font-medium text-[var(--color-text)] hover:text-[var(--color-accent)] transition-colors line-clamp-2"
                      >
                        {f.heuristic?.startsWith("agent.") ? (
                          <span
                            className="mr-1.5 text-[10px] align-middle"
                            title="Agent-readability finding"
                          >
                            🤖
                          </span>
                        ) : null}
                        {f.title}
                      </Link>
                      {f.heuristic ? (
                        <div className="mt-0.5 text-[10px] font-mono text-[var(--color-text-faint)]">
                          {f.heuristic}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-5 py-3.5 text-[11px] font-mono">
                      <div className="text-[var(--color-text-muted)]">{f.runs?.flow_id ?? "—"}</div>
                      <div className="text-[var(--color-text-faint)]">
                        {f.runs?.persona_id ?? "—"}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
                      {f.status}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {f.github_issue_url ? (
                        <a
                          href={f.github_issue_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center text-[var(--color-accent-2)] hover:opacity-80"
                          title="Open GitHub issue"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <span className="text-[var(--color-text-faint)] text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-center tabular-nums text-xs text-[var(--color-text-muted)]">
                      {f.finding_screenshots.length || ""}
                    </td>
                    <td className="px-5 py-3.5 text-right text-[var(--color-text-faint)] text-[11px]">
                      {relativeTime(f.last_seen_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {drawerFinding ? (
        <FindingDrawer
          finding={{
            title: drawerFinding.title,
            severity: drawerFinding.severity,
            description: drawerFinding.description,
            status: drawerFinding.status,
            github_issue_url: drawerFinding.github_issue_url,
            flow_id: drawerFinding.runs?.flow_id ?? null,
            persona_id: drawerFinding.runs?.persona_id ?? null,
            first_seen_at: drawerFinding.first_seen_at,
            last_seen_at: drawerFinding.last_seen_at,
            content_hash: drawerFinding.content_hash,
          }}
          screenshots={drawerSignedUrls}
          closeHref={mergeSearch(searchParams, { open: undefined })}
        />
      ) : null}
    </div>
  );
}

function Filters({ current }: { current: SearchParams }) {
  function link(key: string, value: string | undefined) {
    return mergeSearch(current, { [key]: value, open: undefined });
  }
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <FilterGroup label="severity" value={current.severity}>
        {SEVERITIES.map((s) => (
          <FilterChip key={s} href={link("severity", s)} active={current.severity === s}>
            {s}
          </FilterChip>
        ))}
        <FilterChip href={link("severity", undefined)} active={!current.severity}>
          all
        </FilterChip>
      </FilterGroup>
      <FilterGroup label="status" value={current.status}>
        {(["new", "filed", "dismissed", "fixed"] as const).map((s) => (
          <FilterChip key={s} href={link("status", s)} active={current.status === s}>
            {s}
          </FilterChip>
        ))}
        <FilterChip href={link("status", undefined)} active={!current.status}>
          all
        </FilterChip>
      </FilterGroup>
      <FilterGroup label="lens" value={current.lens}>
        <FilterChip href={link("lens", "human")} active={current.lens === "human"}>
          🧑 human
        </FilterChip>
        <FilterChip href={link("lens", "agent")} active={current.lens === "agent"}>
          🤖 agent
        </FilterChip>
        <FilterChip href={link("lens", undefined)} active={!current.lens}>
          both
        </FilterChip>
      </FilterGroup>
      {current.run ? (
        <FilterChip href={link("run", undefined)} active>
          run:{current.run.slice(0, 8)}… ✕
        </FilterChip>
      ) : null}
      {current.flow ? (
        <FilterChip href={link("flow", undefined)} active>
          flow:{current.flow} ✕
        </FilterChip>
      ) : null}
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  value: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mr-1">
        {label}
      </span>
      {children}
    </div>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  const cls = active
    ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] border-[var(--color-accent)]/40"
    : "bg-[var(--color-panel)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:text-[var(--color-text)]";
  return (
    <Link href={href} className={`px-2 py-1 text-xs rounded border ${cls}`}>
      {children}
    </Link>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="bg-red-950/30 border border-red-800/40 text-red-200 rounded-xl p-6">
      <p className="font-medium mb-1">Could not load findings</p>
      <p className="text-sm font-mono">{message}</p>
    </div>
  );
}

function mergeSearch(current: SearchParams, patch: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  const merged: Record<string, string | undefined> = { ...current, ...patch };
  for (const [k, v] of Object.entries(merged)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `/findings?${qs}` : "/findings";
}
