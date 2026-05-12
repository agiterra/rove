import type { Surprise, SurpriseKind, WalkPlan } from "./types";

const SURPRISE_LABEL: Record<SurpriseKind, string> = {
  unexpected_detour: "detour",
  affordance_missing: "missing affordance",
  ambiguous_label: "ambiguous label",
  hesitation: "hesitation",
  recovery: "recovered",
  dead_end: "dead end",
  expectation_mismatch: "mismatch",
};

type LaneTone = "match" | "recovered" | "diverged" | "neutral";

const TONE: Record<LaneTone, { dot: string; ring: string; rail: string }> = {
  match: {
    dot: "var(--color-accent)",
    ring: "color-mix(in srgb, var(--color-accent) 35%, transparent)",
    rail: "color-mix(in srgb, var(--color-accent) 55%, transparent)",
  },
  recovered: {
    dot: "var(--color-severity-major)",
    ring: "color-mix(in srgb, var(--color-severity-major) 35%, transparent)",
    rail: "color-mix(in srgb, var(--color-severity-major) 55%, transparent)",
  },
  diverged: {
    dot: "var(--color-severity-critical)",
    ring: "color-mix(in srgb, var(--color-severity-critical) 35%, transparent)",
    rail: "color-mix(in srgb, var(--color-severity-critical) 55%, transparent)",
  },
  neutral: {
    dot: "var(--color-text-faint)",
    ring: "var(--color-border)",
    rail: "var(--color-border)",
  },
};

export function PlanVsActual({
  plan,
  surprises,
  actualStepCount,
}: {
  plan: WalkPlan;
  surprises: Surprise[];
  actualStepCount: number | null;
}) {
  const surprisesByStep = new Map<number, Surprise[]>();
  for (const s of surprises) {
    const arr = surprisesByStep.get(s.step_index) ?? [];
    arr.push(s);
    surprisesByStep.set(s.step_index, arr);
  }

  const expected = plan.expected_path;
  const actualCount = actualStepCount ?? expected.length;
  const actualSteps = Array.from({ length: actualCount }, (_, i) => {
    const stepIndex = i + 1;
    return {
      step: stepIndex,
      surprises: surprisesByStep.get(stepIndex) ?? [],
    };
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-3">
      <ColumnHeader label="expected" subLabel={`${expected.length} steps planned`} />
      <ColumnHeader
        label="actual"
        subLabel={
          actualStepCount === null
            ? "step count not recorded"
            : `${actualStepCount} step${actualStepCount === 1 ? "" : "s"} taken`
        }
      />

      <div className="space-y-2">
        {expected.map((step) => {
          const tone = toneForExpectedStep(step.step, surprises);
          return (
            <ExpectedStep
              key={step.step}
              step={step.step}
              description={step.description}
              affordance={step.expected_affordance}
              tone={tone}
              isLast={step.step === expected.length}
            />
          );
        })}
      </div>

      <div className="space-y-2">
        {actualSteps.map((s) => (
          <ActualStep
            key={s.step}
            step={s.step}
            surprises={s.surprises}
            tone={toneForActualStep(s.surprises)}
            isLast={s.step === actualSteps.length}
          />
        ))}
        {actualSteps.length === 0 ? (
          <p className="text-xs text-[var(--color-text-faint)] italic">
            No step-by-step trajectory recorded for this walk.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function toneForExpectedStep(step: number, surprises: Surprise[]): LaneTone {
  const onStep = surprises.filter((s) => s.step_index === step);
  if (onStep.length === 0) return "match";
  if (onStep.every((s) => s.recovered)) return "recovered";
  return "diverged";
}

function toneForActualStep(surprises: Surprise[]): LaneTone {
  if (surprises.length === 0) return "match";
  if (surprises.every((s) => s.recovered)) return "recovered";
  return "diverged";
}

function ColumnHeader({ label, subLabel }: { label: string; subLabel: string }) {
  return (
    <div className="pb-2 border-b border-[var(--color-border)]">
      <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-text-faint)]">
        {label}
      </p>
      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{subLabel}</p>
    </div>
  );
}

function ExpectedStep({
  step,
  description,
  affordance,
  tone,
  isLast,
}: {
  step: number;
  description: string;
  affordance?: string;
  tone: LaneTone;
  isLast: boolean;
}) {
  return (
    <div className="relative pl-9">
      <StepDot tone={tone} step={step} />
      {!isLast ? <StepRail tone={tone} /> : null}
      <div className="text-sm text-[var(--color-text)] leading-snug">{description}</div>
      {affordance ? (
        <div className="mt-0.5 font-mono text-[10px] text-[var(--color-text-faint)]">
          {affordance}
        </div>
      ) : null}
    </div>
  );
}

function ActualStep({
  step,
  surprises,
  tone,
  isLast,
}: {
  step: number;
  surprises: Surprise[];
  tone: LaneTone;
  isLast: boolean;
}) {
  return (
    <div className="relative pl-9">
      <StepDot tone={tone} step={step} />
      {!isLast ? <StepRail tone={tone} /> : null}
      {surprises.length === 0 ? (
        <div className="text-sm text-[var(--color-text-muted)] leading-snug">
          step {step}{tone === "match" ? " · on plan" : ""}
        </div>
      ) : (
        <div className="space-y-1.5">
          {surprises.map((s, i) => (
            <SurprisePill key={i} surprise={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function StepDot({ tone, step }: { tone: LaneTone; step: number }) {
  const t = TONE[tone];
  return (
    <span
      aria-hidden="true"
      className="absolute left-0 top-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums"
      style={{
        color: t.dot,
        background: `color-mix(in srgb, ${t.dot} 12%, transparent)`,
        border: `1px solid ${t.ring}`,
      }}
    >
      {step}
    </span>
  );
}

function StepRail({ tone }: { tone: LaneTone }) {
  const t = TONE[tone];
  return (
    <span
      aria-hidden="true"
      className="absolute left-[11px] top-7 bottom-[-12px] w-px"
      style={{ background: `linear-gradient(to bottom, ${t.rail}, transparent)` }}
    />
  );
}

function SurprisePill({ surprise }: { surprise: Surprise }) {
  const t = TONE[surprise.recovered ? "recovered" : "diverged"];
  return (
    <div
      className="rounded-md px-2.5 py-1.5 text-xs leading-snug"
      style={{
        background: `color-mix(in srgb, ${t.dot} 8%, transparent)`,
        border: `1px solid ${t.ring}`,
      }}
    >
      <div
        className="text-[10px] uppercase tracking-wider mb-0.5"
        style={{ color: t.dot }}
      >
        {SURPRISE_LABEL[surprise.kind]}
        {surprise.recovered ? " · recovered" : ""}
        {surprise.recovery_cost_steps
          ? ` · +${surprise.recovery_cost_steps} step${surprise.recovery_cost_steps === 1 ? "" : "s"}`
          : ""}
      </div>
      <div className="text-[var(--color-text)]">
        Expected: <span className="text-[var(--color-text-muted)]">{surprise.expected}</span>
      </div>
      <div className="text-[var(--color-text)]">
        Observed: <span className="text-[var(--color-text-muted)]">{surprise.observed}</span>
      </div>
    </div>
  );
}
