import { FindingEmptyState } from "@/components/finding-lifecycle";
import type { PlanDelta, PriorPlan, StepView } from "./types";

interface PlanVsRealitySectionProps {
  projectId: string;
  priorPlan: PriorPlan | null | undefined;
  priorPlanCapturedAt: string | null | undefined;
  steps: StepView[];
}

export function PlanVsRealitySection({
  projectId,
  priorPlan,
  priorPlanCapturedAt,
  steps,
}: PlanVsRealitySectionProps) {
  if (!priorPlan) {
    return (
      <section
        aria-label="Plan vs reality"
        className="grid mt-5 gap-3 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-panel)] p-4"
      >
        <SectionTitle />
        <FindingEmptyState surface="expectation_match" projectId={projectId} />
      </section>
    );
  }

  const verdictCounts = countVerdicts(steps);
  const deltas = steps
    .filter((s): s is StepView & { planDelta: PlanDelta } => Boolean(s.planDelta))
    .map((s) => ({ step: s, delta: s.planDelta }));

  return (
    <section
      aria-label="Plan vs reality"
      className="grid mt-5 gap-4 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-panel)] p-4"
    >
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <SectionTitle />
        <VerdictCountStrip counts={verdictCounts} />
      </header>

      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <PriorPlanCol plan={priorPlan} capturedAt={priorPlanCapturedAt ?? null} />
        <ObservedCol deltas={deltas} />
      </div>
    </section>
  );
}

function SectionTitle() {
  return (
    <p
      className="font-mono uppercase text-[var(--color-text-faint)]"
      style={{ fontSize: 11, letterSpacing: "0.18em" }}
    >
      PLAN VS REALITY
    </p>
  );
}

function countVerdicts(steps: StepView[]) {
  return steps.reduce(
    (acc, s) => {
      const v = s.planDelta?.verdict;
      if (v) acc[v] = (acc[v] ?? 0) + 1;
      return acc;
    },
    { match: 0, extension: 0, surprise: 0, deviation: 0 } as Record<PlanDelta["verdict"], number>,
  );
}

function VerdictCountStrip({ counts }: { counts: Record<PlanDelta["verdict"], number> }) {
  const items: Array<[PlanDelta["verdict"], string]> = [
    ["match", "#6ee2e4"],
    ["extension", "#fcd34d"],
    ["surprise", "#fb923c"],
    ["deviation", "#fca5b5"],
  ];
  return (
    <div className="flex gap-2 flex-wrap font-mono" style={{ fontSize: 11 }}>
      {items.map(([v, color]) => (
        <span key={v} className="inline-flex items-center gap-1.5">
          <span style={{ width: 6, height: 6, borderRadius: 3, background: color }} aria-hidden />
          <span style={{ color: "var(--color-text-faint)" }}>{v}</span>
          <span style={{ color: "var(--color-text)" }}>{counts[v]}</span>
        </span>
      ))}
    </div>
  );
}

function PriorPlanCol({ plan, capturedAt }: { plan: PriorPlan; capturedAt: string | null }) {
  return (
    <div
      style={{
        background: "var(--color-panel-2)",
        border: "1px solid var(--color-border)",
        borderRadius: 10,
        padding: "12px 14px",
      }}
    >
      <p
        className="font-mono uppercase mb-2 text-[var(--color-text-faint)]"
        style={{ fontSize: 10, letterSpacing: "0.16em" }}
      >
        prior plan
        {capturedAt ? (
          <span className="ml-2 text-[var(--color-text-faint)] normal-case">
            captured {new Date(capturedAt).toLocaleTimeString()}
          </span>
        ) : null}
      </p>
      <KV k="archetype" v={plan.archetypeAssumed ?? "auto"} />
      <KV k="route pattern" v={plan.expectedRoutePattern.join(" → ") || "—"} />
      <KV k="expected steps" v={plan.expectedStepCount == null ? "—" : String(plan.expectedStepCount)} />
      {plan.anticipatedFriction.length > 0 ? (
        <KV k="friction" v={plan.anticipatedFriction.join(", ")} />
      ) : null}
      {plan.affordanceAssumptions.length > 0 ? (
        <KV k="assumptions" v={plan.affordanceAssumptions.join("; ")} />
      ) : null}
    </div>
  );
}

function ObservedCol({
  deltas,
}: {
  deltas: Array<{ step: StepView; delta: PlanDelta }>;
}) {
  if (deltas.length === 0) {
    return (
      <div
        className="grid place-items-center text-[var(--color-text-faint)] font-mono"
        style={{
          background: "var(--color-panel-2)",
          border: "1px solid var(--color-border)",
          borderRadius: 10,
          padding: "12px 14px",
          fontSize: 12,
        }}
      >
        no deltas captured yet
      </div>
    );
  }
  const noteworthy = deltas.filter(({ delta }) => delta.verdict !== "match");
  return (
    <div
      style={{
        background: "var(--color-panel-2)",
        border: "1px solid var(--color-border)",
        borderRadius: 10,
        padding: "12px 14px",
      }}
    >
      <p
        className="font-mono uppercase mb-2 text-[var(--color-text-faint)]"
        style={{ fontSize: 10, letterSpacing: "0.16em" }}
      >
        observed reality — {noteworthy.length} delta{noteworthy.length === 1 ? "" : "s"}
      </p>
      <ul className="grid gap-1.5">
        {noteworthy.slice(0, 6).map(({ step, delta }) => (
          <li
            key={step.index}
            className="font-mono text-[var(--color-text)]"
            style={{ fontSize: 12, lineHeight: 1.45 }}
          >
            <span
              className="inline-block mr-2 text-[var(--color-text-faint)]"
              style={{ width: 28 }}
            >
              #{String(step.index).padStart(2, "0")}
            </span>
            <VerdictTag verdict={delta.verdict} />{" "}
            {delta.whatRevised ?? delta.observed ?? "—"}
          </li>
        ))}
      </ul>
      {noteworthy.length > 6 ? (
        <p
          className="font-mono text-[var(--color-text-faint)] mt-2"
          style={{ fontSize: 11 }}
        >
          + {noteworthy.length - 6} more in the filmstrip below
        </p>
      ) : null}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2 mb-1 font-mono" style={{ fontSize: 12, lineHeight: 1.5 }}>
      <span
        className="text-[var(--color-text-faint)]"
        style={{ width: 110, flexShrink: 0 }}
      >
        {k}
      </span>
      <span className="text-[var(--color-text)]">{v}</span>
    </div>
  );
}

function VerdictTag({ verdict }: { verdict: PlanDelta["verdict"] }) {
  const color =
    verdict === "deviation"
      ? "#fca5b5"
      : verdict === "surprise"
        ? "#fb923c"
        : verdict === "extension"
          ? "#fcd34d"
          : "var(--color-text-faint)";
  return (
    <span
      className="inline-flex items-center font-mono uppercase mr-1"
      style={{
        fontSize: 9,
        letterSpacing: "0.14em",
        padding: "1px 5px",
        borderRadius: 3,
        color,
        background: "rgba(255,255,255,0.03)",
      }}
    >
      {verdict}
    </span>
  );
}
