"use client";

import { useMemo } from "react";
import { FindingEmptyState } from "@/components/finding-lifecycle";
import type {
  AffordanceGap,
  AffordanceGapKind,
  AffordanceGapSeverity,
  StepView,
} from "./types";

interface NegativeSpaceSectionProps {
  runId: string;
  steps: StepView[];
  projectId?: string;
}

const SEVERITY_ORDER: Record<AffordanceGapSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  minor: 3,
};

const KIND_COPY: Record<AffordanceGapKind, string> = {
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

const SEVERITY_COLOR: Record<AffordanceGapSeverity, string> = {
  critical: "rgb(239 68 68)",
  high: "rgb(251 146 60)",
  medium: "rgb(250 204 21)",
  minor: "rgb(148 163 184)",
};

interface GapWithContext {
  gap: AffordanceGap;
  stepIndex: number;
  url: string;
}

export function NegativeSpaceSection({
  runId: _runId,
  steps,
  projectId = "tankloop",
}: NegativeSpaceSectionProps) {
  const all = useMemo<GapWithContext[]>(() => collectGaps(steps), [steps]);
  const substantivePageCount = useMemo(
    () => new Set(steps.filter((s) => s.affordance_gaps !== undefined).map((s) => s.url)).size,
    [steps],
  );

  if (all.length === 0) {
    return (
      <section
        aria-labelledby="negative-space-title"
        className="px-7 py-6"
        style={{
          background: "var(--color-panel)",
          border: "1px solid var(--color-border)",
          borderRadius: 14,
        }}
      >
        <Eyebrow id="negative-space-title">NEGATIVE SPACE</Eyebrow>
        <div className="mt-4">
          <FindingEmptyState surface="affordance_gaps" projectId={projectId} />
        </div>
      </section>
    );
  }

  const byKind = groupByKind(all);
  const kinds = (Object.keys(byKind) as AffordanceGapKind[]).sort((a, b) => {
    // Sort by max severity (critical first), then by count desc.
    const sa = byKind[a]!.maxSeverityRank;
    const sb = byKind[b]!.maxSeverityRank;
    if (sa !== sb) return sa - sb;
    return byKind[b]!.items.length - byKind[a]!.items.length;
  });

  return (
    <section
      aria-labelledby="negative-space-title"
      className="px-7 py-6"
      style={{
        background: "var(--color-panel)",
        border: "1px solid var(--color-border)",
        borderRadius: 14,
      }}
    >
      <Eyebrow id="negative-space-title">NEGATIVE SPACE</Eyebrow>
      <HeroLine count={all.length} pages={Math.max(1, substantivePageCount)} />
      <ul className="mt-5 grid gap-4 m-0 p-0 list-none">
        {kinds.map((kind) => (
          <li key={kind}>
            <KindBlock kind={kind} items={byKind[kind]!.items} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function HeroLine({ count, pages }: { count: number; pages: number }) {
  return (
    <p
      className="mt-3 m-0"
      style={{ fontSize: 15, color: "#c9d2e5", lineHeight: 1.55, maxWidth: 760 }}
    >
      Walk surfaced <strong style={{ color: "var(--color-text)" }}>{count}</strong> affordance
      {count === 1 ? " gap" : " gaps"} across{" "}
      <strong style={{ color: "var(--color-text)" }}>{pages}</strong> substantive{" "}
      {pages === 1 ? "page" : "pages"}. These are negative-space findings — affordances a user
      with the persona's goal would have expected to find here but didn't.
    </p>
  );
}

function KindBlock({ kind, items }: { kind: AffordanceGapKind; items: GapWithContext[] }) {
  const counts = items.reduce(
    (acc, it) => {
      acc[it.gap.severity] += 1;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, minor: 0 } as Record<AffordanceGapSeverity, number>,
  );
  return (
    <div
      style={{
        background: "var(--color-panel-2)",
        border: "1px solid var(--color-border)",
        borderRadius: 10,
        padding: "14px 16px",
      }}
    >
      <header className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span style={{ color: "var(--color-text)", fontSize: 15, fontWeight: 500 }}>
            {KIND_COPY[kind]}
          </span>
          <span
            className="font-mono"
            style={{
              fontSize: 11,
              color: "var(--color-text-faint)",
              letterSpacing: "0.06em",
            }}
          >
            agent.affordance_gap.{kind}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <CountChip n={counts.critical} severity="critical" />
          <CountChip n={counts.high} severity="high" />
          <CountChip n={counts.medium} severity="medium" />
          <CountChip n={counts.minor} severity="minor" />
        </div>
      </header>
      <ul className="grid gap-2 m-0 p-0 list-none">
        {items
          .slice()
          .sort((a, b) => SEVERITY_ORDER[a.gap.severity] - SEVERITY_ORDER[b.gap.severity])
          .map((it, i) => (
            <li key={`${it.stepIndex}-${i}`}>
              <GapRow it={it} />
            </li>
          ))}
      </ul>
    </div>
  );
}

function GapRow({ it }: { it: GapWithContext }) {
  return (
    <div
      className="grid gap-1"
      style={{
        gridTemplateColumns: "auto 1fr",
        alignItems: "start",
        padding: "8px 4px",
        borderTop: "1px dashed var(--color-border)",
      }}
    >
      <div className="flex items-center gap-2 pr-3 pt-0.5">
        <span
          aria-hidden
          className="inline-block rounded-full"
          style={{
            width: 8,
            height: 8,
            background: SEVERITY_COLOR[it.gap.severity],
          }}
        />
        <span
          className="font-mono text-[var(--color-text-faint)]"
          style={{ fontSize: 11 }}
        >
          step {String(it.stepIndex).padStart(2, "0")}
        </span>
      </div>
      <div className="grid gap-1">
        <p
          className="m-0"
          style={{ fontSize: 13, color: "var(--color-text)", lineHeight: 1.45 }}
        >
          {it.gap.expected_for}
        </p>
        <p
          className="m-0 font-mono text-[var(--color-text-faint)] truncate"
          style={{ fontSize: 11 }}
        >
          {it.url || "—"}
        </p>
        {it.gap.suggested_location ? (
          <p
            className="m-0"
            style={{ fontSize: 12, color: "var(--color-accent)" }}
          >
            → {it.gap.suggested_location}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CountChip({ n, severity }: { n: number; severity: AffordanceGapSeverity }) {
  if (n === 0) return null;
  return (
    <span
      className="font-mono"
      style={{
        fontSize: 11,
        color: SEVERITY_COLOR[severity],
        border: `1px solid ${SEVERITY_COLOR[severity]}55`,
        borderRadius: 6,
        padding: "1px 6px",
      }}
    >
      {n} {severity}
    </span>
  );
}

function Eyebrow({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p
      id={id}
      className="font-mono uppercase text-[var(--color-text-faint)] m-0"
      style={{ fontSize: 11, letterSpacing: "0.18em" }}
    >
      {children}
    </p>
  );
}

function collectGaps(steps: StepView[]): GapWithContext[] {
  const out: GapWithContext[] = [];
  for (const s of steps) {
    if (!s.affordance_gaps) continue;
    for (const g of s.affordance_gaps) {
      out.push({ gap: g, stepIndex: s.index, url: s.url });
    }
  }
  return out;
}

function groupByKind(
  all: GapWithContext[],
): Partial<Record<AffordanceGapKind, { items: GapWithContext[]; maxSeverityRank: number }>> {
  const out: Partial<
    Record<AffordanceGapKind, { items: GapWithContext[]; maxSeverityRank: number }>
  > = {};
  for (const it of all) {
    const bucket = out[it.gap.kind] ?? { items: [], maxSeverityRank: 99 };
    bucket.items.push(it);
    bucket.maxSeverityRank = Math.min(bucket.maxSeverityRank, SEVERITY_ORDER[it.gap.severity]);
    out[it.gap.kind] = bucket;
  }
  return out;
}
