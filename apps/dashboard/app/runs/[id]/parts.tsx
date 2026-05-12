import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { relativeTime, shortSha } from "../../../lib/format";
import { SeverityBadge } from "../../../components/page-header";
import { PlanVsActual } from "./plan-vs-actual";
import type { RunDetail, RunFinding } from "./types";

export function Hero({ run, findingCount }: { run: RunDetail; findingCount: number }) {
  const surpriseCount = run.surprises?.length ?? 0;
  return (
    <div className="surface-elevated px-7 py-8 md:px-10 md:py-10">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="eyebrow-lg">run · flow</p>
        <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-faint)] font-mono">
          <span>{run.dispatcher}</span>
        </div>
      </div>

      <div className="mt-4 flex items-baseline gap-3 flex-wrap">
        <Link
          href={`/flows/${encodeURIComponent(run.flow_id)}`}
          className="font-mono text-lg md:text-xl text-[var(--color-text)] hover:text-[var(--color-accent)] transition-colors break-all"
        >
          {run.flow_id}
        </Link>
        <span className="text-[var(--color-text-faint)] text-base">▸</span>
        <span className="font-mono text-sm text-[var(--color-text-muted)]">{run.persona_id}</span>
      </div>

      <div className="mt-10">
        <GoalStatement value={run.goal_reached} />
      </div>
      <div className="divider-grad mt-6 mb-5 max-w-md" />
      <StatRow
        items={[
          stepDeltaItem(run.predicted_step_count, run.actual_step_count),
          surpriseCount > 0
            ? { label: `${surpriseCount} surprise${surpriseCount === 1 ? "" : "s"}`, tone: "amber" as const }
            : null,
          { label: `${findingCount} finding${findingCount === 1 ? "" : "s"}`, tone: "neutral" as const },
        ]}
      />

      {run.summary ? (
        <p className="mt-7 text-sm text-[var(--color-text)] leading-relaxed max-w-3xl">
          {run.summary}
        </p>
      ) : null}

      <div className="mt-7 flex items-center gap-3 text-[11px] text-[var(--color-text-faint)] font-mono flex-wrap">
        <span>{run.branch ?? "no branch"}</span>
        <span>·</span>
        <span>{shortSha(run.commit_sha)}</span>
        <span>·</span>
        <span>started {relativeTime(run.started_at)}</span>
        {run.walked_url ? (
          <>
            <span>·</span>
            <a
              href={run.walked_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-[var(--color-accent)] transition-colors"
            >
              {prettyUrl(run.walked_url)}
              <ExternalLink className="w-3 h-3" />
            </a>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function PlanSection({ run }: { run: RunDetail }) {
  if (!run.plan) {
    return (
      <SectionEmpty
        title="plan vs actual"
        message="This walk predates the plan-and-reflection rollout. Plan and surprises were not captured."
      />
    );
  }
  return (
    <section className="surface p-6 md:p-8">
      <SectionHeader title="plan vs actual" />
      <PlanVsActual
        plan={run.plan}
        surprises={run.surprises ?? []}
        actualStepCount={run.actual_step_count}
      />
      {run.plan.biggest_worry ? (
        <p className="mt-6 text-xs text-[var(--color-text-faint)] max-w-2xl">
          <span className="uppercase tracking-wider mr-2">Biggest worry going in:</span>
          <span className="text-[var(--color-text-muted)] italic">{run.plan.biggest_worry}</span>
        </p>
      ) : null}
    </section>
  );
}

export function ReflectionSection({ run }: { run: RunDetail }) {
  const hasGap = !!run.largest_expectation_gap;
  const hasConfidence = run.persona_success_confidence !== null;
  if (!hasGap && !hasConfidence) return null;

  return (
    <section className="surface p-6 md:p-8 space-y-5">
      <SectionHeader title="reflection" />
      {hasGap ? (
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-faint)] mb-1.5">
            largest expectation gap
          </p>
          <p className="text-sm text-[var(--color-text)] leading-relaxed max-w-3xl">
            {run.largest_expectation_gap}
          </p>
        </div>
      ) : null}
      {hasConfidence ? <ConfidenceBar value={run.persona_success_confidence!} /> : null}
    </section>
  );
}

export function FindingsSection({ runId, findings }: { runId: string; findings: RunFinding[] }) {
  return (
    <section className="surface overflow-hidden">
      <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-baseline justify-between">
        <SectionHeader title={`findings (${findings.length})`} />
        {findings.length > 0 ? (
          <Link
            href={`/findings?run=${runId}`}
            className="text-xs text-[var(--color-accent)] hover:opacity-80"
          >
            Open in findings →
          </Link>
        ) : null}
      </div>
      {findings.length === 0 ? (
        <p className="px-6 py-8 text-sm text-[var(--color-text-muted)] text-center">
          No findings on this run. (Zero findings is itself a signal — pair with the goal/outcome
          above.)
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {findings.map((f) => (
            <li key={f.id}>
              <Link
                href={`/findings?run=${runId}&open=${f.id}`}
                className="block px-6 py-4 hover:bg-[var(--color-panel-2)]/60 transition-colors"
              >
                <div className="flex items-baseline gap-3">
                  <SeverityBadge severity={f.severity} />
                  <span className="font-medium text-[var(--color-text)] flex-1">{f.title}</span>
                  {f.heuristic ? (
                    <span className="font-mono text-[10px] text-[var(--color-text-faint)]">
                      {f.heuristic}
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GoalStatement({ value }: { value: boolean | null }) {
  if (value === true) {
    return (
      <h2 className="text-[40px] md:text-[56px] font-semibold tracking-tight leading-[1.05] text-[var(--color-accent)] glow-accent">
        Goal reached{" "}✓
      </h2>
    );
  }
  if (value === false) {
    return (
      <h2 className="text-[40px] md:text-[56px] font-semibold tracking-tight leading-[1.05] text-[var(--color-severity-critical)] glow-rose">
        Goal not reached{" "}✗
      </h2>
    );
  }
  return (
    <p className="text-2xl text-[var(--color-text-muted)] italic">Outcome not recorded</p>
  );
}

interface StatItem {
  label: React.ReactNode;
  tone: Tone;
}

function StatRow({ items }: { items: Array<StatItem | null> }) {
  const visible = items.filter((i): i is StatItem => i !== null);
  return (
    <div className="flex items-baseline gap-x-5 gap-y-2 flex-wrap text-sm">
      {visible.map((item, i) => (
        <span key={i} className="inline-flex items-baseline gap-1.5" style={{ color: toneColor(item.tone) }}>
          {i > 0 ? (
            <span className="text-[var(--color-text-faint)] mr-3" aria-hidden="true">
              ·
            </span>
          ) : null}
          {item.label}
        </span>
      ))}
    </div>
  );
}

function stepDeltaItem(predicted: number | null, actual: number | null): StatItem | null {
  if (predicted === null && actual === null) return null;
  if (predicted !== null && actual !== null) {
    const delta = actual - predicted;
    const tone: Tone = delta <= 0 ? "good" : delta <= predicted * 0.5 ? "amber" : "rose";
    const arrow = delta === 0 ? null : delta > 0 ? "↑" : "↓";
    return {
      tone,
      label: (
        <>
          <span className="font-semibold tabular-nums text-[var(--color-text)]">{actual}</span>
          <span className="text-[var(--color-text-faint)]">/</span>
          <span className="font-semibold tabular-nums text-[var(--color-text-faint)]">
            {predicted}
          </span>
          <span className="ml-1 text-[var(--color-text-muted)]">steps</span>
          {arrow ? (
            <span className="ml-1 text-xs font-medium" style={{ color: toneColor(tone) }}>
              {arrow} {Math.abs(delta)}
            </span>
          ) : null}
        </>
      ),
    };
  }
  const single = actual ?? predicted!;
  const label = actual !== null ? "steps taken" : "steps planned";
  return {
    tone: "neutral",
    label: (
      <>
        <span className="font-semibold tabular-nums">{single}</span>
        <span className="ml-1 text-[var(--color-text-muted)]">{label}</span>
      </>
    ),
  };
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone: Tone = value >= 0.7 ? "good" : value >= 0.4 ? "amber" : "rose";
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-faint)]">
          confidence another user of this persona would succeed
        </p>
        <p className="text-sm font-semibold tabular-nums" style={{ color: toneColor(tone) }}>
          {pct}%
        </p>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--color-bg-2)] overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: toneColor(tone) }}
        />
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--color-text-faint)] mb-4">
      {title}
    </h2>
  );
}

function SectionEmpty({ title, message }: { title: string; message: string }) {
  return (
    <section className="surface p-6 md:p-8">
      <SectionHeader title={title} />
      <p className="text-sm text-[var(--color-text-muted)] italic max-w-2xl">{message}</p>
    </section>
  );
}

type Tone = "good" | "amber" | "rose" | "neutral";

function toneColor(tone: Tone): string {
  switch (tone) {
    case "good":
      return "var(--color-accent)";
    case "amber":
      return "var(--color-severity-major)";
    case "rose":
      return "var(--color-severity-critical)";
    case "neutral":
      return "var(--color-text-faint)";
  }
}

function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host + u.pathname;
  } catch {
    return url;
  }
}
