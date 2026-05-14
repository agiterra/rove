"use client";

import { useEffect, useRef } from "react";
import { StepThumbArtifact } from "./StepArtifact";
import { VerdictChip } from "./VerdictChip";
import type { StepView } from "./types";

interface FilmstripProps {
  steps: StepView[];
  selectedIndex: number | null;
  onSelect?: (n: number) => void;
  /** Render a dashed "+ awaiting next step" tile at the end. */
  showAwaitingTile?: boolean;
}

export function Filmstrip({ steps, selectedIndex, onSelect, showAwaitingTile = false }: FilmstripProps) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const runningTileRef = useRef<HTMLButtonElement | null>(null);

  const scrollBy = (dir: number) => {
    stripRef.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  };

  const doneCount = steps.filter((s) => s.status === "done").length;
  const errCount = steps.filter((s) => s.status === "errored").length;
  const runCount = steps.filter((s) => s.status === "running").length;
  const runningIndex = steps.find((s) => s.status === "running")?.index ?? null;

  // Auto-scroll the running tile into view (centered) whenever its index
  // changes. Honors reduced-motion via scroll-behavior CSS on the strip.
  useEffect(() => {
    if (runningIndex == null) return;
    runningTileRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [runningIndex]);

  return (
    <section aria-label="Step filmstrip" className="mt-7">
      <div className="flex items-center justify-between mb-3.5 whitespace-nowrap">
        <p
          className="font-mono uppercase text-[var(--color-text-faint)]"
          style={{ fontSize: 11, letterSpacing: "0.18em" }}
        >
          STEP FILMSTRIP · {steps.length} STEP{steps.length === 1 ? "" : "S"}
          {runCount > 0 ? <span style={{ marginLeft: 12 }}>{runCount} running</span> : null}
          {errCount > 0 ? <span style={{ marginLeft: 12, color: "#fca5b5" }}>{errCount} errored</span> : null}
        </p>
        <p
          className="font-mono text-[var(--color-text-faint)]"
          style={{ fontSize: 11 }}
        >
          {doneCount} done
        </p>
      </div>

      {steps.length === 0 ? (
        <EmptyStrip />
      ) : (
        <div className="relative">
          <Arrow side="left" onClick={() => scrollBy(-1)} />
          <Arrow side="right" onClick={() => scrollBy(1)} />
          <div
            ref={stripRef}
            className="flex gap-3 overflow-x-auto pt-1.5 pb-4 px-0.5"
            style={{
              scrollSnapType: "x mandatory",
              scrollbarWidth: "thin",
              scrollbarColor: "var(--color-border-strong) transparent",
              scrollBehavior: "smooth",
            }}
          >
            {steps.map((step) => (
              <Tile
                key={step.index}
                step={step}
                isSelected={step.index === selectedIndex}
                onClick={() => onSelect?.(step.index)}
                tileRef={step.status === "running" ? runningTileRef : undefined}
              />
            ))}
            {showAwaitingTile ? <AwaitingTile /> : null}
          </div>
        </div>
      )}
    </section>
  );
}

function EmptyStrip() {
  return (
    <div
      className="flex items-center justify-center font-mono text-[var(--color-text-faint)]"
      style={{
        height: 184,
        borderRadius: 12,
        border: "1px dashed var(--color-border-strong)",
        fontSize: 12,
      }}
    >
      No steps recorded yet for this walk.
    </div>
  );
}

function Tile({
  step,
  isSelected,
  onClick,
  tileRef,
}: {
  step: StepView;
  isSelected: boolean;
  onClick?: () => void;
  tileRef?: React.Ref<HTMLButtonElement>;
}) {
  const running = step.status === "running";
  const errored = step.status === "errored";

  return (
    <button
      ref={tileRef}
      type="button"
      onClick={onClick}
      aria-label={`Step ${step.index}, ${step.toolName}, ${step.status}`}
      aria-current={isSelected ? "true" : undefined}
      className={`focus-rove text-left ${running ? "lw-tile-running" : ""}`}
      style={{
        flex: "0 0 154px",
        height: 184,
        borderRadius: 12,
        background: "var(--color-panel)",
        border: borderForState(step.status, isSelected),
        padding: 8,
        scrollSnapAlign: "start",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        position: "relative",
        boxShadow: shadowForState(step.status, isSelected),
        transition: "border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease",
      }}
    >
      <div
        className="overflow-hidden relative"
        style={{
          width: "100%",
          height: 100,
          borderRadius: 6,
          border: "1px solid var(--color-border)",
          background: "var(--color-panel-2)",
        }}
      >
        <ThumbContent step={step} />
      </div>
      <div className="flex flex-col gap-1 px-0.5" style={{ lineHeight: 1 }}>
        <div className="flex items-center gap-1.5 font-mono text-[var(--color-text)]" style={{ fontSize: 11.5 }}>
          <span>#{String(step.index).padStart(2, "0")}</span>
          <StatusDot status={step.status} />
          <StatusText status={step.status} />
        </div>
        {step.dialog ? <DialogChip dialog={step.dialog} /> : null}
        {step.planDelta ? (
          <VerdictChip verdict={step.planDelta.verdict} whatRevised={step.planDelta.whatRevised} />
        ) : null}
        <div className="flex items-center justify-between gap-1.5 font-mono text-[var(--color-text-muted)]" style={{ fontSize: 11 }}>
          <span className="truncate">{step.toolName}</span>
          <span className="text-[var(--color-text-faint)] shrink-0">
            {step.status === "running" ? "live" : step.durationLabel}
          </span>
        </div>
      </div>
      {errored ? null : null}
    </button>
  );
}

function DialogChip({ dialog }: { dialog: NonNullable<StepView["dialog"]> }) {
  const label = `\u{1F6D1} fired ${dialog.type}()`;
  const tooltip = dialog.personaPerceived
    ? `Native ${dialog.type}() dialog: "${dialog.message}"`
    : `Native ${dialog.type}() dialog (agent never saw it): "${dialog.message}"`;
  return (
    <div
      title={tooltip}
      className="font-mono truncate"
      style={{
        fontSize: 10.5,
        color: dialog.personaPerceived ? "var(--color-text-muted)" : "#fca5b5",
        opacity: 0.95,
      }}
    >
      {label}
    </div>
  );
}

function ThumbContent({ step }: { step: StepView }) {
  return <StepThumbArtifact step={step} />;
}

function borderForState(status: StepView["status"], selected: boolean): string {
  if (status === "errored") {
    return `1px solid ${selected ? "rgba(244,63,94,0.55)" : "rgba(244,63,94,0.30)"}`;
  }
  if (selected) {
    return "1px solid rgba(63,201,203,0.55)";
  }
  return "1px solid var(--color-border)";
}

function shadowForState(status: StepView["status"], selected: boolean): string | undefined {
  if (status === "errored" && selected) {
    return "0 0 0 1px rgba(244,63,94,0.22)";
  }
  if (selected) {
    return "0 0 0 1px rgba(63,201,203,0.28), 0 0 24px -6px rgba(63,201,203,0.45)";
  }
  return undefined;
}

function StatusDot({ status }: { status: StepView["status"] }) {
  if (status === "running") return <span aria-label="running" className="lw-dot lw-pulse" />;
  if (status === "errored") return <span aria-label="errored" className="lw-dot lw-rose" />;
  return <span aria-label="done" className="lw-dot" />;
}

function StatusText({ status }: { status: StepView["status"] }) {
  const label = status === "running" ? "Running" : status === "errored" ? "Error" : "Complete";
  const color = status === "errored" ? "var(--color-severity-critical)" : "#6ee2e4";
  return <span style={{ fontSize: 11, color }}>{label}</span>;
}

function AwaitingTile() {
  return (
    <div
      aria-label="Awaiting next step"
      className="flex flex-col items-center justify-center gap-2 font-mono text-[var(--color-text-faint)]"
      style={{
        flex: "0 0 154px",
        height: 184,
        borderRadius: 12,
        border: "1px dashed var(--color-border-strong)",
        scrollSnapAlign: "start",
        fontSize: 12,
        textAlign: "center",
        lineHeight: 1.5,
      }}
    >
      <svg viewBox="0 0 16 16" width={20} height={20} strokeWidth={1.5} fill="none" stroke="currentColor">
        <path d="M8 3v10M3 8h10" />
      </svg>
      <div>
        awaiting
        <br />
        next step
      </div>
    </div>
  );
}

function Arrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Scroll ${side}`}
      className="focus-rove grid place-items-center backdrop-blur"
      style={{
        position: "absolute",
        top: "50%",
        [side]: -16,
        transform: "translateY(calc(-50% - 12px))",
        width: 36,
        height: 36,
        borderRadius: 999,
        background: "rgba(15,20,34,0.85)",
        border: "1px solid var(--color-border-strong)",
        color: "var(--color-text-muted)",
        zIndex: 5,
        transition: "color 160ms ease, border-color 160ms ease",
      }}
    >
      <svg viewBox="0 0 16 16" width={16} height={16} strokeWidth={1.8} fill="none" stroke="currentColor">
        {side === "left" ? <path d="M10 4l-4 4 4 4" /> : <path d="M6 4l4 4-4 4" />}
      </svg>
    </button>
  );
}
