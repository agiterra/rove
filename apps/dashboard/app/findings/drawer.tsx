import Link from "next/link";
import { relativeTime, severityColor } from "../../lib/format";
import type { LifecycleFinding } from "../../components/finding-lifecycle/types";
import { FindingSendToIssueButton } from "../../components/finding-lifecycle";

export interface DrawerFinding {
  id: string;
  title: string;
  severity: string;
  description: string;
  status: string;
  github_issue_url: string | null;
  flow_id: string | null;
  persona_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
  content_hash: string;
  heuristic: string | null;
}

export function FindingDrawer({
  finding,
  screenshots,
  closeHref,
  githubRepo,
}: {
  finding: DrawerFinding;
  screenshots: { storage_key: string; url: string; caption: string | null }[];
  closeHref: string;
  githubRepo: { owner: string; name: string } | null;
}) {
  const lifecycleFinding: LifecycleFinding = {
    id: finding.id,
    severity: normalizeSeverity(finding.severity),
    title: finding.title,
    heuristicId: finding.heuristic ?? "uncategorized",
    url: "",
    evidence: null,
    suggestedLocation: null,
    runId: "",
    flowId: finding.flow_id,
    personaId: finding.persona_id,
    personaLabel: null,
    silencedAt: null,
    silenceReason: null,
    silenceScope: null,
    githubIssueUrl: finding.github_issue_url,
  };
  return (
    <>
      <Link href={closeHref} aria-label="Close drawer" className="fixed inset-0 bg-black/60 z-40" />
      <aside className="fixed top-0 right-0 h-full w-full max-w-2xl bg-[var(--color-panel)] border-l border-[var(--color-border)] z-50 overflow-y-auto">
        <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-start gap-3">
          <span
            className="px-2 py-0.5 text-xs rounded border self-start"
            style={{
              color: severityColor(finding.severity),
              borderColor: `color-mix(in srgb, ${severityColor(finding.severity)} 40%, transparent)`,
              background: `color-mix(in srgb, ${severityColor(finding.severity)} 12%, transparent)`,
            }}
          >
            {finding.severity}
          </span>
          <div className="flex-1">
            <h2 className="text-lg font-semibold leading-tight">{finding.title}</h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {finding.flow_id ?? "—"} · {finding.persona_id ?? "—"}
            </p>
          </div>
          <Link
            href={closeHref}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-sm"
            aria-label="Close"
          >
            ✕
          </Link>
        </div>

        <div className="px-6 pt-4 flex items-center justify-end gap-2">
          <FindingSendToIssueButton finding={lifecycleFinding} repo={githubRepo} />
        </div>

        <div className="px-6 py-5 space-y-6">
          <section>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{finding.description}</p>
          </section>

          <section className="grid grid-cols-2 gap-3 text-xs">
            <Meta label="Status" value={finding.status} />
            <Meta
              label="GitHub"
              value={
                finding.github_issue_url ? (
                  <a
                    href={finding.github_issue_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--color-accent-2)] hover:underline"
                  >
                    open
                  </a>
                ) : (
                  "—"
                )
              }
            />
            <Meta label="First seen" value={relativeTime(finding.first_seen_at)} />
            <Meta label="Last seen" value={relativeTime(finding.last_seen_at)} />
            <Meta
              label="content_hash"
              value={
                <code className="font-mono text-[10px] break-all">
                  {finding.content_hash.slice(0, 24)}…
                </code>
              }
            />
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] mb-3">
              Screenshots ({screenshots.length})
            </h3>
            {screenshots.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                No screenshots attached to this finding.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {screenshots.map((s) => (
                  <figure
                    key={s.storage_key}
                    className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-bg)]"
                  >
                    <img
                      src={s.url}
                      alt={s.caption ?? s.storage_key}
                      className="w-full max-h-[480px] object-contain bg-black/40"
                    />
                    <figcaption className="px-3 py-2 text-xs text-[var(--color-text-muted)] flex items-center justify-between">
                      <span>{s.caption ?? s.storage_key.split("/").pop()}</span>
                      <a href={s.url} target="_blank" rel="noreferrer" className="hover:underline">
                        open ↗
                      </a>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}

function normalizeSeverity(s: string): LifecycleFinding["severity"] {
  if (s === "critical" || s === "major" || s === "minor" || s === "nit") return s;
  return "minor";
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-[var(--color-panel-2)] border border-[var(--color-border)] rounded-md px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">
        {label}
      </div>
      <div className="text-sm">{value}</div>
    </div>
  );
}
