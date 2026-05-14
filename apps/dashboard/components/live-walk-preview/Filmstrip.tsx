import { MockBrowserShot } from "./MockBrowserShot";
import { STEPS, SELECTED_STEP_INDEX } from "./mock-data";
import type { MockStep, StepStatus } from "./mock-data";

export function Filmstrip() {
  return (
    <section aria-label="Filmstrip of walk steps">
      <div className="flex items-center justify-between mb-3">
        <p className="eyebrow-lg">FILMSTRIP · LIVE</p>
        <p className="text-[11px] font-mono text-[var(--color-text-faint)]">
          {STEPS.filter((s) => s.status === "done").length} done ·{" "}
          {STEPS.filter((s) => s.status === "errored").length} errored · 1 running
        </p>
      </div>
      <div
        className="-mx-1 overflow-x-auto pb-1"
        role="list"
        aria-label="Filmstrip tiles"
      >
        <div className="flex gap-3 px-1 min-w-max snap-x snap-mandatory">
          {STEPS.map((step) => (
            <StepTile
              key={step.index}
              step={step}
              isSelected={step.index === SELECTED_STEP_INDEX}
            />
          ))}
          <AwaitingTile />
        </div>
      </div>
    </section>
  );
}

function StepTile({ step, isSelected }: { step: MockStep; isSelected: boolean }) {
  const running = step.status === "running";
  const errored = step.status === "errored";

  return (
    <button
      type="button"
      role="listitem"
      aria-current={isSelected ? "true" : undefined}
      aria-label={`Step ${step.index} — ${step.caption}`}
      className={[
        "snap-start text-left rounded-[12px] kinetic-hover focus-rove",
        "w-[220px] shrink-0 overflow-hidden",
        "border bg-[var(--color-panel)]",
        running
          ? "border-[color-mix(in_srgb,var(--color-accent)_55%,var(--color-border-strong))] shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-accent)_25%,transparent),0_18px_44px_-28px_rgba(63,201,203,0.55)]"
          : isSelected
            ? "border-[var(--color-border-strong)] shadow-[0_18px_44px_-28px_rgba(16,44,87,0.5)]"
            : "border-[var(--color-border)]",
        errored ? "border-[color-mix(in_srgb,var(--color-severity-critical)_45%,var(--color-border-strong))]" : "",
      ].join(" ")}
    >
      <div className="relative aspect-[16/10] border-b border-[var(--color-border)] bg-[var(--color-bg-2)] overflow-hidden">
        <MockBrowserShot kind={step.shotKind} label={step.caption} />
        {running ? <RunningOverlay /> : null}
        {errored ? <ErroredOverlay /> : null}
      </div>
      <div className="p-2.5 flex items-center gap-2.5">
        <span className="text-[10px] font-mono text-[var(--color-text-faint)]">
          #{step.index.toString().padStart(2, "0")}
        </span>
        <StatusDot status={step.status} />
        <span className="text-[11px] font-mono text-[var(--color-text-muted)] truncate flex-1" title={step.toolName}>
          {step.toolName}
        </span>
        <span className="text-[10px] font-mono text-[var(--color-text-faint)] tabular-nums shrink-0">
          {step.status === "running" ? "…" : `${(step.durationMs / 1000).toFixed(1)}s`}
        </span>
      </div>
    </button>
  );
}

function AwaitingTile() {
  return (
    <div
      role="listitem"
      aria-label="Awaiting next step"
      className="snap-start w-[220px] shrink-0 rounded-[12px] border border-dashed border-[var(--color-border-strong)] bg-transparent flex items-center justify-center text-[11px] font-mono text-[var(--color-text-faint)] py-10"
    >
      <span className="inline-flex items-center gap-2">
        <span className="inline-block h-1 w-1 rounded-full bg-[var(--color-text-faint)] animate-livedot-pulse" />
        awaiting next step
      </span>
    </div>
  );
}

function StatusDot({ status }: { status: StepStatus }) {
  if (status === "running") {
    return (
      <span className="relative inline-flex h-1.5 w-1.5 shrink-0" aria-label="running">
        <span className="absolute inset-0 rounded-full bg-[var(--color-accent)] opacity-75 animate-livedot-ping" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
      </span>
    );
  }
  if (status === "errored") {
    return (
      <span
        aria-label="errored"
        className="inline-block h-1.5 w-1.5 rounded-full shrink-0 bg-[var(--color-severity-critical)]"
      />
    );
  }
  if (status === "pending") {
    return (
      <span
        aria-label="pending"
        className="inline-block h-1.5 w-1.5 rounded-full shrink-0 bg-[var(--color-text-faint)] opacity-50"
      />
    );
  }
  return (
    <span
      aria-label="done"
      className="inline-block h-1.5 w-1.5 rounded-full shrink-0 bg-[var(--color-accent)] opacity-90"
    />
  );
}

function RunningOverlay() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{
        boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 38%, transparent)",
      }}
    />
  );
}

function ErroredOverlay() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none bg-[color-mix(in_srgb,var(--color-severity-critical)_10%,transparent)]"
    />
  );
}
