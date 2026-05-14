import {
  MetricsStrip,
  PlanPanel,
  ReflectionPanel,
  SurprisesPanel,
  panelStyle,
} from "./Reflection.parts";
import type { ReflectionView } from "./types";

interface ReflectionProps {
  view: ReflectionView;
  runStatus: "running" | "done" | "errored" | "pending";
}

export function Reflection({ view, runStatus }: ReflectionProps) {
  if (!view.hasContent) {
    return <EmptyState runStatus={runStatus} />;
  }
  return (
    <div className="mt-5 flex flex-col gap-5">
      {view.plan ? <PlanPanel plan={view.plan} /> : null}
      {view.surprises.length > 0 ? <SurprisesPanel surprises={view.surprises} /> : null}
      {view.largestExpectationGap || view.personaSuccessConfidence != null ? (
        <ReflectionPanel
          gap={view.largestExpectationGap}
          confidence={view.personaSuccessConfidence}
        />
      ) : null}
      {view.metrics ? <MetricsStrip metrics={view.metrics} /> : null}
    </div>
  );
}

function EmptyState({ runStatus }: { runStatus: ReflectionProps["runStatus"] }) {
  const copy =
    runStatus === "running"
      ? "Walk in progress — reflection populates when the agent finishes its plan-vs-actual pass."
      : runStatus === "pending"
        ? "This walk hasn't started yet."
        : "No reflection captured for this walk. (Walks predating the plan-and-reflection rollout will be empty here.)";
  return (
    <div className="mt-5 px-7 py-6" style={panelStyle}>
      <p
        className="font-mono uppercase text-[var(--color-text-faint)] m-0"
        style={{ fontSize: 11, letterSpacing: "0.18em" }}
      >
        AGENT REFLECTION
      </p>
      <p
        style={{ color: "#c9d2e5", fontSize: 15, lineHeight: 1.6, maxWidth: 760, marginTop: 12 }}
      >
        {copy}
      </p>
    </div>
  );
}
