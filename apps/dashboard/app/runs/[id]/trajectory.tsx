import type { RunStep, TrajectoryMetrics } from "./types";

const SNAPSHOT_TOOLS = new Set(["browser_snapshot", "browser_take_snapshot"]);
const SCREENSHOT_TOOLS = new Set(["browser_take_screenshot"]);
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
      <ol className="mt-5 divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)] overflow-hidden">
        {steps.map((s) => (
          <li key={s.step_index}>
            <StepRow step={s} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function MetricsStrip({ metrics }: { metrics: TrajectoryMetrics }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <MetricTile label="tool calls" value={metrics.actual_tool_calls} />
      <MetricTile label="actions" value={metrics.actions} />
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
}: {
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <div className="rounded-lg bg-[var(--color-bg-2)]/60 border border-[var(--color-border)] px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
        {label}
      </div>
      <div
        className="mt-0.5 text-xl font-semibold tabular-nums"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function StepRow({ step }: { step: RunStep }) {
  const isErr = step.direction === "error";
  const tool = step.tool_name ?? "—";
  const isSnap = step.tool_name ? SNAPSHOT_TOOLS.has(step.tool_name) : false;
  const isShot = step.tool_name ? SCREENSHOT_TOOLS.has(step.tool_name) : false;
  const isAction = step.tool_name ? ACTION_TOOLS.has(step.tool_name) : false;
  const toolColor = isErr
    ? "var(--color-severity-critical)"
    : isAction
      ? "var(--color-accent)"
      : isSnap || isShot
        ? "var(--color-text-muted)"
        : "var(--color-text-faint)";
  return (
    <div className="flex items-baseline gap-4 px-4 py-2.5 hover:bg-[var(--color-panel-2)]/60 transition-colors">
      <span className="font-mono text-[10px] tabular-nums text-[var(--color-text-faint)] w-6 text-right">
        {step.step_index}
      </span>
      <span
        className="font-mono text-[11px] w-44 truncate"
        style={{ color: toolColor }}
        title={tool}
      >
        {tool}
      </span>
      <span
        className="text-[11px] text-[var(--color-text-muted)] flex-1 truncate"
        title={argSummary(step.args)}
      >
        {argSummary(step.args)}
      </span>
      <span className="text-[10px] text-[var(--color-text-faint)] font-mono tabular-nums">
        {step.duration_ms !== null ? `${step.duration_ms}ms` : ""}
      </span>
      <span
        className="text-[10px] text-[var(--color-text-faint)] w-32 truncate text-right"
        title={step.result_summary ?? ""}
      >
        {isErr ? "✗ error" : step.result_summary ?? ""}
      </span>
    </div>
  );
}

function argSummary(args: unknown): string {
  if (args === null || args === undefined) return "";
  if (typeof args !== "object") return String(args);
  const a = args as Record<string, unknown>;
  // Prefer the most informative single field for one-line display.
  const priority = ["url", "name", "ref", "text", "selector", "element", "key"];
  for (const k of priority) {
    if (typeof a[k] === "string") return `${k}=${a[k] as string}`;
  }
  return Object.keys(a).join(", ");
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--color-text-faint)] mb-4">
      {title}
    </h2>
  );
}
