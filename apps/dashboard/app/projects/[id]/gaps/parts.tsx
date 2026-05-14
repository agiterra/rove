/**
 * Render parts + helpers for /projects/[id]/gaps. Extracted from page.tsx
 * to keep the main file under the React-component line limit.
 */
import Link from "next/link";

export type Severity = "critical" | "high" | "medium" | "minor";

export type GapKind =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "undo"
  | "recover"
  | "navigate"
  | "status"
  | "confirm"
  | "save_state"
  | "empty"
  | "error";

export interface GapJson {
  kind: GapKind;
  severity: Severity;
  expected_for: string;
  evidence: string;
  suggested_location: string;
}

export interface RunStepRow {
  run_id: string;
  step_index: number;
  url_after: string | null;
  affordance_gaps: GapJson[] | null;
  runs: { flow_id: string | null; persona_id: string | null; started_at: string | null } | null;
}

export interface FlatGap {
  gap: GapJson;
  runId: string;
  stepIndex: number;
  url: string;
  flowId: string | null;
  personaId: string | null;
  startedAt: string | null;
}

export const KIND_LABEL: Record<GapKind, string> = {
  create: "Create",
  read: "Read",
  update: "Update",
  delete: "Delete",
  undo: "Undo",
  recover: "Recover",
  navigate: "Navigate",
  status: "Status / loading",
  confirm: "Confirm",
  save_state: "Save state",
  empty: "Empty state",
  error: "Error",
};

export const SEVERITY_COLOR: Record<Severity, string> = {
  critical: "rgb(239 68 68)",
  high: "rgb(251 146 60)",
  medium: "rgb(250 204 21)",
  minor: "rgb(148 163 184)",
};

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  minor: 3,
};

export const VALID_KINDS = new Set<GapKind>([
  "create",
  "read",
  "update",
  "delete",
  "undo",
  "recover",
  "navigate",
  "status",
  "confirm",
  "save_state",
  "empty",
  "error",
]);

export const VALID_SEVERITIES = new Set<Severity>([
  "critical",
  "high",
  "medium",
  "minor",
]);

export function flattenGaps(rows: RunStepRow[]): FlatGap[] {
  const out: FlatGap[] = [];
  for (const row of rows) {
    if (!Array.isArray(row.affordance_gaps)) continue;
    for (const g of row.affordance_gaps) {
      if (!g || typeof g !== "object") continue;
      if (!VALID_KINDS.has(g.kind)) continue;
      if (!VALID_SEVERITIES.has(g.severity)) continue;
      out.push({
        gap: g,
        runId: row.run_id,
        stepIndex: row.step_index,
        url: row.url_after ?? "",
        flowId: row.runs?.flow_id ?? null,
        personaId: row.runs?.persona_id ?? null,
        startedAt: row.runs?.started_at ?? null,
      });
    }
  }
  return out;
}

export function kindCounts(gaps: FlatGap[]): Partial<Record<GapKind, number>> {
  const out: Partial<Record<GapKind, number>> = {};
  for (const g of gaps) {
    out[g.gap.kind] = (out[g.gap.kind] ?? 0) + 1;
  }
  return out;
}

export function GapsHeader({
  projectId,
  totalCount,
}: {
  projectId: string;
  totalCount?: number;
}) {
  return (
    <header>
      <p
        className="font-mono uppercase text-[var(--color-text-faint)] m-0 mb-3"
        style={{ fontSize: 11, letterSpacing: "0.18em" }}
      >
        NEGATIVE SPACE <span className="opacity-60">·</span> {projectId}
      </p>
      <h1
        className="font-semibold tracking-tight m-0"
        style={{ fontSize: 38, lineHeight: 1.1, color: "var(--color-text)" }}
      >
        Affordance gaps
      </h1>
      <p
        className="mt-3 max-w-2xl m-0"
        style={{ fontSize: 14, color: "var(--color-text-muted)", lineHeight: 1.55 }}
      >
        Every affordance a Rove walker expected on a substantive page in this
        project but didn't find. Grouped by kind, sorted by severity. The list
        is the project's negative space, surfaced for triage.
      </p>
      {totalCount != null ? (
        <p
          className="mt-2 m-0 font-mono text-[var(--color-text-faint)]"
          style={{ fontSize: 12 }}
        >
          {totalCount} {totalCount === 1 ? "gap" : "gaps"} tracked
        </p>
      ) : null}
    </header>
  );
}

export function GapsFilters({
  current,
  projectId,
  counts,
}: {
  current: { kind: GapKind | null; severity: Severity | null };
  projectId: string;
  counts: Partial<Record<GapKind, number>>;
}) {
  const base = `/projects/${encodeURIComponent(projectId)}/gaps`;
  function href(patch: Partial<{ kind: string | null; severity: string | null }>) {
    const params = new URLSearchParams();
    const next = {
      kind: patch.kind === undefined ? current.kind : patch.kind,
      severity: patch.severity === undefined ? current.severity : patch.severity,
    };
    if (next.kind) params.set("kind", next.kind);
    if (next.severity) params.set("severity", next.severity);
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }
  const kinds: GapKind[] = [
    "delete",
    "undo",
    "save_state",
    "confirm",
    "empty",
    "error",
    "create",
    "update",
    "recover",
    "navigate",
    "status",
    "read",
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 mt-6">
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mr-1">
          kind
        </span>
        <Chip href={href({ kind: null })} active={current.kind == null}>
          all
        </Chip>
        {kinds.map((k) =>
          counts[k] ? (
            <Chip key={k} href={href({ kind: k })} active={current.kind === k}>
              {k} <span className="opacity-60">·{counts[k]}</span>
            </Chip>
          ) : null,
        )}
      </div>
      <div className="flex items-center gap-1 ml-2">
        <span className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mr-1">
          sev
        </span>
        <Chip href={href({ severity: null })} active={current.severity == null}>
          all
        </Chip>
        {(["critical", "high", "medium", "minor"] as Severity[]).map((s) => (
          <Chip
            key={s}
            href={href({ severity: s })}
            active={current.severity === s}
            color={SEVERITY_COLOR[s]}
          >
            {s}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function Chip({
  href,
  active,
  color,
  children,
}: {
  href: string;
  active: boolean;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`px-2 py-1 text-xs rounded border ${
        active
          ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] border-[var(--color-accent)]/40"
          : "bg-[var(--color-panel)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:text-[var(--color-text)]"
      }`}
      style={color && active ? { color, borderColor: `${color}80` } : undefined}
    >
      {children}
    </Link>
  );
}

export function GapCard({ g }: { g: FlatGap }) {
  return (
    <article
      style={{
        background: "var(--color-panel-2)",
        border: "1px solid var(--color-border)",
        borderRadius: 10,
        padding: 14,
        display: "grid",
        gap: 8,
      }}
    >
      <header className="flex items-center gap-2 flex-wrap">
        <span
          aria-hidden
          className="inline-block rounded-full"
          style={{
            width: 8,
            height: 8,
            background: SEVERITY_COLOR[g.gap.severity],
          }}
        />
        <span
          className="font-mono uppercase"
          style={{
            fontSize: 11,
            letterSpacing: "0.14em",
            color: "var(--color-text-faint)",
          }}
        >
          agent.affordance_gap.{g.gap.kind}
        </span>
        <span
          className="font-mono"
          style={{ fontSize: 11, color: SEVERITY_COLOR[g.gap.severity] }}
        >
          · {g.gap.severity}
        </span>
        <span className="text-[var(--color-text-muted)]" style={{ fontSize: 13 }}>
          {KIND_LABEL[g.gap.kind]}
        </span>
        <Link
          href={`/runs/${g.runId}`}
          className="ml-auto font-mono text-[var(--color-text-faint)] hover:text-[var(--color-text)] transition-colors"
          style={{ fontSize: 11 }}
        >
          run {g.runId.slice(0, 8)} step {String(g.stepIndex).padStart(2, "0")} →
        </Link>
      </header>
      <p
        className="m-0"
        style={{ fontSize: 13, color: "var(--color-text)", lineHeight: 1.45 }}
      >
        {g.gap.expected_for}
      </p>
      <p
        className="m-0 font-mono text-[var(--color-text-muted)] truncate"
        style={{ fontSize: 11.5 }}
      >
        {g.url || "—"}
        {g.flowId ? ` · flow=${g.flowId}` : ""}
        {g.personaId ? ` · persona=${g.personaId}` : ""}
      </p>
      {g.gap.suggested_location ? (
        <p className="m-0" style={{ fontSize: 12, color: "var(--color-accent)" }}>
          → {g.gap.suggested_location}
        </p>
      ) : null}
    </article>
  );
}
