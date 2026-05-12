import type { RunStep, TrajectoryMetrics } from "./types";

const SNAPSHOT_TOOLS = new Set(["browser_snapshot", "browser_take_snapshot"]);
const SCREENSHOT_TOOLS = new Set(["browser_take_screenshot"]);
const RECOVERY_TOOLS = new Set(["browser_navigate_back"]);
const ACTION_TOOLS = new Set([
  "browser_navigate",
  "browser_navigate_back",
  "browser_click",
  "browser_type",
  "browser_press_key",
  "browser_hover",
  "browser_drag",
  "browser_fill",
  "browser_fill_form",
  "browser_select_option",
  "browser_file_upload",
  "browser_handle_dialog",
]);

type StepKind = "action" | "snapshot" | "screenshot" | "recovery" | "error" | "other";

function kindOf(step: RunStep): StepKind {
  if (step.direction === "error") return "error";
  const t = step.tool_name ?? "";
  if (RECOVERY_TOOLS.has(t)) return "recovery";
  if (ACTION_TOOLS.has(t)) return "action";
  if (SNAPSHOT_TOOLS.has(t)) return "snapshot";
  if (SCREENSHOT_TOOLS.has(t)) return "screenshot";
  return "other";
}

const KIND_COLOR: Record<StepKind, string> = {
  action: "var(--color-accent)",
  snapshot: "var(--color-accent-2)",
  screenshot: "var(--color-text-muted)",
  recovery: "var(--color-severity-major)",
  error: "var(--color-severity-critical)",
  other: "var(--color-text-faint)",
};

const KIND_LABEL: Record<StepKind, string> = {
  action: "actions",
  snapshot: "snapshots",
  screenshot: "screenshots",
  recovery: "recoveries",
  error: "errors",
  other: "other",
};

export function TrajectorySection({
  steps,
  metrics,
}: {
  steps: RunStep[];
  metrics: TrajectoryMetrics | null;
}) {
  if (steps.length === 0 && !metrics) {
    return (
      <section className="surface p-6 md:p-8">
        <SectionHeader title="trajectory" />
        <p className="text-sm text-[var(--color-text-muted)] italic max-w-2xl">
          No trajectory captured for this walk. (Walks predating the MCP-proxy rollout, or
          walks where the proxy wasn&apos;t in the dispatch path, will show empty here.)
        </p>
      </section>
    );
  }

  return (
    <section className="surface p-6 md:p-8">
      <SectionHeader title="trajectory" />
      {metrics ? <MetricsStrip metrics={metrics} /> : null}
      {steps.length > 0 ? (
        <Filmstrip steps={steps} />
      ) : null}
      <ol className="mt-1 rounded-md border border-[var(--color-border)] overflow-hidden">
        {steps.map((s, i) => (
          <li key={s.step_index} className={i > 0 ? "border-t border-[var(--color-border)]" : ""}>
            <StepRow step={s} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function MetricsStrip({ metrics }: { metrics: TrajectoryMetrics }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      <MetricTile label="tool calls" value={metrics.actual_tool_calls} />
      <MetricTile label="actions" value={metrics.actions} accent={metrics.actions > 0} />
      <MetricTile label="snapshots" value={metrics.snapshots} />
      <MetricTile
        label="snaps / action"
        value={
          metrics.snapshots_per_action !== null
            ? metrics.snapshots_per_action.toFixed(2)
            : "—"
        }
      />
      <MetricTile
        label="recoveries"
        value={metrics.recovery_count}
        color={metrics.recovery_count > 0 ? "var(--color-severity-major)" : undefined}
      />
      <MetricTile
        label="errors"
        value={metrics.errors}
        color={metrics.errors > 0 ? "var(--color-severity-critical)" : undefined}
      />
    </div>
  );
}

function MetricTile({
  label,
  value,
  color,
  accent,
}: {
  label: string;
  value: number | string;
  color?: string;
  accent?: boolean;
}) {
  const finalColor = color ?? (accent ? "var(--color-accent)" : undefined);
  return (
    <div className="rounded-lg bg-[var(--color-bg-2)]/60 border border-[var(--color-border)] px-3 py-3">
      <div className="eyebrow">{label}</div>
      <div
        className="mt-1.5 text-xl font-semibold tabular-nums"
        style={finalColor ? { color: finalColor } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Filmstrip — one dot per tool call, colored by kind. Makes the "shape of
 * the walk" legible at a glance: a long blue run of snapshots followed
 * by a cluster of cyan actions reads instantly as "agent was probing,
 * then committed."
 */
function Filmstrip({ steps }: { steps: RunStep[] }) {
  // Aggregate counts by kind for the legend.
  const counts = new Map<StepKind, number>();
  for (const s of steps) {
    const k = kindOf(s);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const legendOrder: StepKind[] = ["action", "snapshot", "screenshot", "recovery", "error", "other"];
  const legend = legendOrder.filter((k) => (counts.get(k) ?? 0) > 0);
  return (
    <div className="mb-6">
      <div className="eyebrow mb-2">shape of the walk</div>
      <div className="flex items-center gap-[3px] flex-wrap py-1">
        {steps.map((s) => {
          const kind = kindOf(s);
          const color = KIND_COLOR[kind];
          return (
            <a
              key={s.step_index}
              href={`#step-${s.step_index}`}
              title={`${s.step_index} · ${s.tool_name ?? "—"}`}
              className="block h-5 w-2 rounded-[2px] transition-transform hover:scale-y-125"
              style={{
                background: color,
                opacity: kind === "snapshot" || kind === "other" ? 0.6 : 1,
              }}
            />
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-3 flex-wrap text-[10px]">
        {legend.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5 text-[var(--color-text-faint)]">
            <span
              className="inline-block h-2 w-2 rounded-[2px]"
              style={{
                background: KIND_COLOR[k],
                opacity: k === "snapshot" || k === "other" ? 0.6 : 1,
              }}
            />
            {counts.get(k)} {KIND_LABEL[k]}
          </span>
        ))}
      </div>
    </div>
  );
}

function StepRow({ step }: { step: RunStep }) {
  const kind = kindOf(step);
  const color = KIND_COLOR[kind];
  const tool = step.tool_name ?? "—";
  const args = argSummary(step.args);
  return (
    <div
      id={`step-${step.step_index}`}
      className="flex items-baseline gap-3 px-4 py-2.5 kinetic-hover border-l-2"
      style={{ borderLeftColor: color }}
    >
      <span className="font-mono text-[10px] tabular-nums text-[var(--color-text-faint)] w-6 text-right shrink-0">
        {step.step_index}
      </span>
      <span
        className="font-mono text-[11px] w-44 truncate shrink-0"
        style={{ color }}
        title={tool}
      >
        {tool}
      </span>
      {args ? (
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--color-bg-2)]/70 text-[var(--color-text-muted)] truncate max-w-md"
          title={args}
        >
          {args}
        </span>
      ) : (
        <span className="text-[10px] text-[var(--color-text-faint)] flex-1">—</span>
      )}
      <span className="text-[10px] text-[var(--color-text-faint)] font-mono tabular-nums ml-auto shrink-0">
        {step.duration_ms !== null ? `${step.duration_ms}ms` : ""}
      </span>
      <span
        className="text-[10px] text-[var(--color-text-faint)] w-32 truncate text-right shrink-0"
        title={step.result_summary ?? ""}
      >
        {step.direction === "error" ? "✗ error" : step.result_summary ?? ""}
      </span>
    </div>
  );
}

function argSummary(args: unknown): string {
  if (args === null || args === undefined) return "";
  if (typeof args !== "object") return String(args);
  const a = args as Record<string, unknown>;
  const priority = ["url", "name", "ref", "text", "selector", "element", "key"];
  for (const k of priority) {
    if (typeof a[k] === "string") return `${k} = ${a[k] as string}`;
  }
  const keys = Object.keys(a);
  return keys.length > 0 ? keys.join(", ") : "";
}

function SectionHeader({ title }: { title: string }) {
  return <h2 className="eyebrow-lg mb-5">{title}</h2>;
}
