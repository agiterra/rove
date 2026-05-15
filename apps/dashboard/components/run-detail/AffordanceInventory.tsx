"use client";

import {
  FindingEmptyState,
  FindingError,
  FindingLoading,
  FindingSendToIssueButton,
  FindingSilenceButton,
} from "@/components/finding-lifecycle";
import type { LifecycleFinding } from "@/components/finding-lifecycle/types";
import type {
  AffordanceGap,
  AffordanceGapSeverity,
  StepView,
} from "./types";

interface AffordanceInventoryProps {
  step: StepView | null;
  /**
   * Optional project slug for the substrate's empty state CTA. The
   * run-detail page already knows it; threading it down keeps the
   * substrate consumer self-contained.
   */
  projectId?: string;
  /** Surface-level error from upstream (adapter) — wires to FindingError shell. */
  error?: Error | null;
  /** Loading state — wired in case a future caller fetches gaps asynchronously. */
  loading?: boolean;
  /** Retry handler when an error shell is shown. */
  onRetry?: () => void;
}

const SEVERITY_COLOR: Record<AffordanceGapSeverity, string> = {
  critical: "rgb(239 68 68)",
  major: "rgb(251 146 60)",
  minor: "rgb(250 204 21)",
  nit: "rgb(148 163 184)",
};

const KIND_LABEL: Record<AffordanceGap["kind"], string> = {
  create: "create",
  read: "read",
  update: "update",
  delete: "delete",
  undo: "undo",
  recover: "recover",
  navigate: "navigate",
  status: "status",
  confirm: "confirm",
  save_state: "save state",
  empty: "empty state",
  error: "error",
};

export function AffordanceInventory({
  step,
  projectId = "tankloop",
  error,
  loading,
  onRetry,
}: AffordanceInventoryProps) {
  if (error) {
    return (
      <Section>
        <FindingError error={error} retry={onRetry ?? (() => undefined)} />
      </Section>
    );
  }
  if (loading) {
    return (
      <Section>
        <FindingLoading hint="Enumerating affordances…" />
      </Section>
    );
  }
  if (!step) {
    return null;
  }
  // `affordance_gaps` is undefined when the step is transient (loading, auth,
  // 4xx) — i.e., the persona didn't enumerate. Empty array means enumeration
  // ran and found no gaps. The two states have different copy.
  if (step.affordance_gaps === undefined) {
    return (
      <Section>
        <FindingEmptyState surface="affordance_gaps" projectId={projectId} />
      </Section>
    );
  }
  if (step.affordance_gaps.length === 0) {
    return (
      <Section>
        <div
          className="text-[12.5px] text-[var(--color-text-muted)]"
          style={{ padding: "10px 4px" }}
        >
          Affordance enumeration ran on this page; the persona found nothing
          missing for the goal. (Silent matches; only gaps are recorded.)
        </div>
      </Section>
    );
  }
  return (
    <Section>
      <HeaderRow gaps={step.affordance_gaps} stepIndex={step.index} url={step.url} />
      <ul className="grid gap-3 m-0 p-0 list-none">
        {step.affordance_gaps.map((g, i) => (
          <li key={`${g.kind}-${i}`}>
            <GapCard
              gap={g}
              stepIndex={step.index}
              url={step.url}
            />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-labelledby="affordance-inventory-title"
      style={{
        background: "var(--color-panel)",
        border: "1px solid var(--color-border)",
        borderRadius: 14,
        padding: 18,
      }}
    >
      <p
        id="affordance-inventory-title"
        className="font-mono uppercase mb-4 text-[var(--color-text-faint)] m-0"
        style={{ fontSize: 11, letterSpacing: "0.18em" }}
      >
        AFFORDANCE INVENTORY — WHAT A USER WOULD EXPECT HERE
      </p>
      {children}
    </section>
  );
}

function HeaderRow({
  gaps,
  stepIndex,
  url,
}: {
  gaps: AffordanceGap[];
  stepIndex: number;
  url: string;
}) {
  const critical = gaps.filter((g) => g.severity === "critical").length;
  return (
    <div
      className="flex flex-wrap items-center gap-2 mb-3 text-[12px] text-[var(--color-text-muted)] font-mono"
    >
      <span>
        step {String(stepIndex).padStart(2, "0")} ·
      </span>
      <span style={{ color: "var(--color-text)" }}>{gaps.length} missing</span>
      {critical > 0 ? (
        <span
          style={{
            color: SEVERITY_COLOR.critical,
            border: `1px solid ${SEVERITY_COLOR.critical}55`,
            borderRadius: 6,
            padding: "1px 6px",
            fontSize: 11,
          }}
        >
          {critical} critical
        </span>
      ) : null}
      <span className="text-[var(--color-text-faint)] truncate max-w-[40ch]">{url || "—"}</span>
    </div>
  );
}

function GapCard({
  gap,
  stepIndex,
  url,
}: {
  gap: AffordanceGap;
  stepIndex: number;
  url: string;
}) {
  const heuristicId = `agent.affordance_gap.${gap.kind}`;
  const synthetic: LifecycleFinding = {
    id: syntheticFindingId(stepIndex, gap.kind, url),
    severity: mapSeverityToFindingSeverity(gap.severity),
    title: `Missing ${KIND_LABEL[gap.kind]} affordance on ${shortUrl(url)}`,
    heuristicId,
    url,
    evidence: gap.evidence,
    suggestedLocation: gap.suggested_location,
    runId: "",
    flowId: null,
    personaId: null,
    personaLabel: null,
    silencedAt: null,
    silenceReason: null,
    silenceScope: null,
    githubIssueUrl: null,
  };
  return (
    <article
      data-rove-affordance-gap-kind={gap.kind}
      data-rove-affordance-gap-severity={gap.severity}
      style={{
        background: "var(--color-panel-2)",
        border: "1px solid var(--color-border)",
        borderRadius: 10,
        padding: 14,
        display: "grid",
        gap: 10,
      }}
    >
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <SeverityDot severity={gap.severity} />
          <span
            className="font-mono uppercase"
            style={{
              fontSize: 11,
              letterSpacing: "0.14em",
              color: "var(--color-text-faint)",
            }}
          >
            {heuristicId}
          </span>
          <span
            className="font-mono"
            style={{
              fontSize: 11,
              color: SEVERITY_COLOR[gap.severity],
            }}
          >
            · {gap.severity}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <FindingSilenceButton finding={synthetic} />
          <FindingSendToIssueButton finding={synthetic} repo={null} />
        </div>
      </header>
      <p
        className="m-0"
        style={{ fontSize: 13.5, color: "var(--color-text)", lineHeight: 1.45 }}
      >
        Expected for: {gap.expected_for}
      </p>
      <p
        className="m-0"
        style={{ fontSize: 12.5, color: "var(--color-text-muted)", lineHeight: 1.55 }}
      >
        {gap.evidence}
      </p>
      {gap.suggested_location ? (
        <p
          className="m-0 font-mono"
          style={{ fontSize: 12, color: "var(--color-accent)" }}
        >
          → {gap.suggested_location}
        </p>
      ) : null}
    </article>
  );
}

function SeverityDot({ severity }: { severity: AffordanceGapSeverity }) {
  return (
    <span
      aria-hidden
      className="inline-block rounded-full"
      style={{
        width: 8,
        height: 8,
        background: SEVERITY_COLOR[severity],
        boxShadow:
          severity === "critical" ? `0 0 8px ${SEVERITY_COLOR[severity]}` : undefined,
      }}
    />
  );
}

function mapSeverityToFindingSeverity(
  s: AffordanceGapSeverity,
): LifecycleFinding["severity"] {
  return s;
}

function syntheticFindingId(stepIndex: number, kind: string, url: string): string {
  // Stable per-run identifier so the silence button can later be wired to a
  // real DB row. For preview / mock paths this never reaches Supabase; the
  // RPC will 404 and FindingSilenceButton surfaces the error inline.
  const safe = url.replace(/[^a-z0-9]/gi, "-").slice(0, 40);
  return `gap-${stepIndex}-${kind}-${safe}`;
}

function shortUrl(url: string): string {
  if (!url) return "this page";
  const stripped = url.replace(/^https?:\/\//, "");
  return stripped.length > 40 ? stripped.slice(0, 37) + "…" : stripped;
}
