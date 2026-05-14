"use client";

import { useEffect, useRef, useState } from "react";
import { MockThumb } from "./MockThumbs";
import type { FindingView } from "./types";

const SEV_BG: Record<FindingView["severity"], string> = {
  critical: "rgba(244,63,94,0.12)",
  major: "rgba(251,146,60,0.12)",
  minor: "rgba(250,204,21,0.10)",
  nit: "rgba(148,163,184,0.10)",
};

const SEV_BORDER: Record<FindingView["severity"], string> = {
  critical: "rgba(244,63,94,0.45)",
  major: "rgba(251,146,60,0.45)",
  minor: "rgba(250,204,21,0.40)",
  nit: "rgba(148,163,184,0.40)",
};

const SEV_COLOR: Record<FindingView["severity"], string> = {
  critical: "#fca5b5",
  major: "#fdba8c",
  minor: "#fde68a",
  nit: "#cbd5e1",
};

const SEV_BAR: Record<FindingView["severity"], string> = {
  critical: "var(--color-severity-critical)",
  major: "var(--color-severity-major)",
  minor: "var(--color-severity-minor)",
  nit: "var(--color-severity-nit)",
};

interface FindingsStreamProps {
  findings: FindingView[];
  /** Optional href builder for "open finding" navigation. */
  findingHref?: (f: FindingView) => string;
  /** Subline mode: `running` → "filed in last X" when at least one finding; else "sorted by severity". */
  runStatus?: "running" | "done" | "errored" | "pending";
  /** Newest finding's first-seen timestamp (ISO or epoch ms). Drives the "filed in last X" age. */
  lastFiledAt?: string | number | null;
}

export function FindingsStream({ findings, findingHref, runStatus, lastFiledAt }: FindingsStreamProps) {
  const newIds = useNewIds(findings);
  const subline = useSubline(findings.length, runStatus, lastFiledAt);
  return (
    <section className="mt-7" aria-label="Findings filed during this walk">
      <div className="flex items-baseline justify-between mb-2.5">
        <p
          className="font-mono uppercase text-[var(--color-text-faint)]"
          style={{ fontSize: 11, letterSpacing: "0.18em" }}
        >
          FINDINGS FILED THIS WALK · {findings.length}
        </p>
        {subline ? (
          <span className="font-mono" style={{ fontSize: 11, color: "var(--color-text-faint)" }}>
            {subline}
          </span>
        ) : null}
      </div>

      {findings.length === 0 ? (
        <EmptyFindings />
      ) : (
        <div className="flex flex-col gap-2.5">
          {findings.map((f) => (
            <FindingCard
              key={f.id}
              finding={f}
              href={findingHref?.(f)}
              isNew={newIds.has(f.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Returns the set of finding ids that are newly present compared to the
 * previous render. First render returns an empty set so initial load
 * doesn't animate every card. The set clears as soon as the parent's
 * findings prop is re-read on the next render, so an animation fires
 * once per insert.
 */
function useSubline(
  count: number,
  runStatus: FindingsStreamProps["runStatus"],
  lastFiledAt: FindingsStreamProps["lastFiledAt"],
): string | null {
  const [, setTick] = useState(0);
  const isRunning = runStatus === "running";
  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, [isRunning]);

  if (count === 0) return null;
  if (!isRunning) return "sorted by severity";
  if (lastFiledAt == null) return "sorted by severity";

  const ts = typeof lastFiledAt === "string" ? Date.parse(lastFiledAt) : lastFiledAt;
  if (!Number.isFinite(ts)) return "sorted by severity";
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  return `filed in last ${humanAge(seconds)}`;
}

function humanAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function useNewIds(findings: FindingView[]): Set<string> {
  const seenRef = useRef<Set<string> | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const seen = seenRef.current;
    if (seen == null) {
      // Initial mount: prime the seen set without animating any card.
      seenRef.current = new Set(findings.map((f) => f.id));
      return;
    }
    const fresh = new Set<string>();
    for (const f of findings) {
      if (!seen.has(f.id)) fresh.add(f.id);
    }
    seenRef.current = new Set(findings.map((f) => f.id));
    if (fresh.size > 0) setNewIds(fresh);
  }, [findings]);

  return newIds;
}

function EmptyFindings() {
  return (
    <div
      className="grid place-items-center text-center text-[var(--color-text-muted)] py-10 px-6"
      style={{
        border: "1px dashed var(--color-border-strong)",
        borderRadius: 12,
        fontSize: 13,
      }}
    >
      No findings filed in this walk.
    </div>
  );
}

function FindingCard({
  finding,
  href,
  isNew,
}: {
  finding: FindingView;
  href?: string;
  isNew: boolean;
}) {
  const Tag = href ? "a" : "article";
  return (
    <Tag
      {...(href ? { href } : {})}
      className={`grid items-center kinetic-hover focus-rove relative overflow-hidden ${isNew ? "lw-finding-enter" : ""}`}
      style={{
        gridTemplateColumns: "100px 1fr 130px",
        gap: 20,
        background: "var(--color-panel)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        padding: "16px 18px",
        minHeight: 80,
        cursor: href ? "pointer" : "default",
        textDecoration: "none",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 12,
          bottom: 12,
          width: 3,
          borderRadius: "0 3px 3px 0",
          background: SEV_BAR[finding.severity],
        }}
      />

      <div>
        <span
          className="inline-grid place-items-center font-mono font-semibold"
          style={{
            height: 24,
            padding: "0 10px",
            borderRadius: 4,
            fontSize: 11,
            letterSpacing: "0.10em",
            background: SEV_BG[finding.severity],
            color: SEV_COLOR[finding.severity],
            border: `1px solid ${SEV_BORDER[finding.severity]}`,
            width: "fit-content",
          }}
        >
          {finding.severity.toUpperCase()}
        </span>
      </div>

      <div>
        <h3
          className="m-0 mb-2 font-medium text-[var(--color-text)]"
          style={{ fontSize: 15, letterSpacing: "-0.005em" }}
        >
          {finding.title}
        </h3>
        <span
          className="inline-flex items-center font-mono"
          style={{
            height: 22,
            padding: "0 8px",
            borderRadius: 4,
            background: "rgba(63,201,203,0.10)",
            border: "1px solid rgba(63,201,203,0.30)",
            color: "#b4e9ea",
            fontSize: 11,
          }}
        >
          {finding.heuristic}
        </span>
      </div>

      <div className="flex flex-col items-end gap-1.5">
        <div
          className="overflow-hidden"
          style={{
            width: 110,
            height: 62,
            borderRadius: 4,
            border: "1px solid var(--color-border)",
            background: "#fff",
          }}
        >
          <ThumbContent finding={finding} />
        </div>
        {finding.stepIndex != null ? (
          <span
            className="flex items-center gap-1.5 font-mono text-[var(--color-text-muted)]"
            style={{ fontSize: 11.5 }}
          >
            <span>Step {String(finding.stepIndex).padStart(2, "0")}</span>
            <svg viewBox="0 0 16 16" width={12} height={12} strokeWidth={1.8} fill="none" stroke="currentColor">
              <path d="M6 4l4 4-4 4" />
            </svg>
          </span>
        ) : null}
      </div>
    </Tag>
  );
}

function ThumbContent({ finding }: { finding: FindingView }) {
  if (finding.thumb.kind === "mock") return <MockThumb kind={finding.thumb.name} />;
  if (finding.thumb.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={finding.thumb.src}
        alt={finding.thumb.alt ?? `Screenshot for ${finding.title}`}
        className="block h-full w-full object-cover"
      />
    );
  }
  return (
    <div
      className="h-full w-full grid place-items-center text-[10px]"
      style={{
        background:
          "repeating-linear-gradient(135deg, #eef0f5 0px, #eef0f5 6px, #f4f5f8 6px, #f4f5f8 12px)",
        color: "#9aa2b1",
        fontFamily: "var(--font-mono)",
      }}
    >
      no shot
    </div>
  );
}
