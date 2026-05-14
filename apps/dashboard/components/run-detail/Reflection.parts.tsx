import type { MetricsView, PlanStepView, ReflectionView, SurpriseView } from "./types";

const SURPRISE_LABEL: Record<SurpriseView["kind"], string> = {
  unexpected_detour: "Unexpected detour",
  affordance_missing: "Affordance missing",
  ambiguous_label: "Ambiguous label",
  hesitation: "Hesitation",
  recovery: "Recovery",
  dead_end: "Dead end",
  expectation_mismatch: "Expectation mismatch",
};

export const panelStyle: React.CSSProperties = {
  background: "var(--color-panel)",
  border: "1px solid var(--color-border)",
  borderRadius: 14,
};

export function PlanPanel({ plan }: { plan: NonNullable<ReflectionView["plan"]> }) {
  return (
    <section className="px-7 py-6" style={panelStyle}>
      <Eyebrow>PRE-WALK PLAN</Eyebrow>
      <h2
        className="font-semibold"
        style={{
          fontSize: 28,
          letterSpacing: "-0.015em",
          marginTop: 10,
          marginBottom: 6,
          color: "var(--color-text)",
        }}
      >
        Expected {plan.expectedStepCount} step{plan.expectedStepCount === 1 ? "" : "s"}
      </h2>
      {plan.biggestWorry ? (
        <p
          className="italic"
          style={{
            color: "var(--color-text-muted)",
            fontSize: 14,
            lineHeight: 1.55,
            maxWidth: 760,
            marginTop: 6,
          }}
        >
          Biggest worry going in: {plan.biggestWorry}
        </p>
      ) : null}
      {plan.expectedPath.length > 0 ? <PlanTable steps={plan.expectedPath} /> : null}
    </section>
  );
}

function PlanTable({ steps }: { steps: PlanStepView[] }) {
  return (
    <div
      className="mt-5 overflow-hidden"
      style={{ border: "1px solid var(--color-border)", borderRadius: 10 }}
    >
      <div
        className="grid font-mono"
        style={{ gridTemplateColumns: "44px 1fr 1fr", fontSize: 12.5 }}
      >
        <Head>#</Head>
        <Head>STEP</Head>
        <Head>EXPECTED AFFORDANCE</Head>
        {steps.map((s, i) => (
          <PlanRow key={`${s.step}-${i}`} step={s} isLast={i === steps.length - 1} />
        ))}
      </div>
    </div>
  );
}

function PlanRow({ step, isLast }: { step: PlanStepView; isLast: boolean }) {
  const border = isLast ? "none" : "1px solid #161c2e";
  return (
    <>
      <Cell color="var(--color-text-faint)" border={border}>
        {String(step.step).padStart(2, "0")}
      </Cell>
      <Cell color="var(--color-text)" border={border}>
        <span className="font-mono" style={{ fontSize: 13 }}>{step.description}</span>
      </Cell>
      <Cell color="var(--color-text-muted)" border={border}>
        <span className="font-mono" style={{ fontSize: 12.5 }}>
          {step.expectedAffordance ?? "—"}
        </span>
      </Cell>
    </>
  );
}

export function SurprisesPanel({ surprises }: { surprises: SurpriseView[] }) {
  return (
    <section className="px-7 py-6" style={panelStyle}>
      <Eyebrow>SURPRISES · {surprises.length}</Eyebrow>
      <div className="mt-4 flex flex-col gap-3">
        {surprises.map((s, i) => (
          <SurpriseCard key={`${s.stepIndex}-${s.kind}-${i}`} surprise={s} />
        ))}
      </div>
    </section>
  );
}

function SurpriseCard({ surprise }: { surprise: SurpriseView }) {
  return (
    <article
      className="grid"
      style={{
        gridTemplateColumns: "170px 1fr 1fr 110px",
        gap: 16,
        padding: "14px 16px",
        background: "rgba(20,26,42,0.55)",
        border: "1px solid var(--color-border)",
        borderRadius: 10,
        alignItems: "start",
      }}
    >
      <div className="flex flex-col gap-1.5 min-w-0">
        <span
          className="inline-grid place-items-center font-mono font-semibold"
          style={{
            height: 22,
            padding: "0 9px",
            borderRadius: 4,
            fontSize: 10.5,
            letterSpacing: "0.10em",
            background: "rgba(251,146,60,0.12)",
            color: "#fdba8c",
            border: "1px solid rgba(251,146,60,0.45)",
            textTransform: "uppercase",
            width: "fit-content",
          }}
        >
          {SURPRISE_LABEL[surprise.kind]}
        </span>
        <span className="font-mono" style={{ fontSize: 11, color: "var(--color-text-faint)" }}>
          Step {String(surprise.stepIndex).padStart(2, "0")}
        </span>
      </div>
      <Column label="expected" body={surprise.expected} />
      <Column label="observed" body={surprise.observed} />
      <div className="flex justify-end">
        <span
          className="inline-flex items-center font-mono"
          style={{
            height: 22,
            padding: "0 9px",
            borderRadius: 4,
            fontSize: 11,
            background: surprise.recovered
              ? "rgba(63,201,203,0.10)"
              : "rgba(244,63,94,0.10)",
            color: surprise.recovered ? "#b4e9ea" : "#fca5b5",
            border: surprise.recovered
              ? "1px solid rgba(63,201,203,0.30)"
              : "1px solid rgba(244,63,94,0.32)",
          }}
        >
          {surprise.recovered ? "recovered" : "not recovered"}
        </span>
      </div>
    </article>
  );
}

function Column({ label, body }: { label: string; body: string }) {
  return (
    <div className="min-w-0">
      <p
        className="font-mono uppercase"
        style={{
          fontSize: 10.5,
          letterSpacing: "0.16em",
          color: "var(--color-text-faint)",
          marginBottom: 4,
        }}
      >
        {label}
      </p>
      <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--color-text)", margin: 0 }}>{body}</p>
    </div>
  );
}

export function ReflectionPanel({
  gap,
  confidence,
}: {
  gap: string | null;
  confidence: number | null;
}) {
  return (
    <section className="px-7 py-6" style={panelStyle}>
      <Eyebrow>REFLECTION</Eyebrow>
      <div
        className="mt-4 grid items-start gap-8"
        style={{ gridTemplateColumns: confidence != null ? "1fr 220px" : "1fr" }}
      >
        {gap ? (
          <div>
            <p
              className="font-mono uppercase"
              style={{
                fontSize: 10.5,
                letterSpacing: "0.16em",
                color: "var(--color-text-faint)",
                marginBottom: 6,
              }}
            >
              largest expectation gap
            </p>
            <p
              style={{
                color: "var(--color-text)",
                fontSize: 14.5,
                lineHeight: 1.6,
                maxWidth: 760,
                margin: 0,
              }}
            >
              {gap}
            </p>
          </div>
        ) : (
          <div />
        )}
        {confidence != null ? <ConfidenceTile value={confidence} /> : null}
      </div>
    </section>
  );
}

function ConfidenceTile({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.7 ? "#6ee2e4" : value >= 0.4 ? "#fdba8c" : "#fca5b5";
  return (
    <div
      className="rounded-xl px-4 py-4"
      style={{ background: "rgba(20,26,42,0.55)", border: "1px solid var(--color-border)" }}
    >
      <div
        className="font-mono uppercase"
        style={{ fontSize: 10.5, letterSpacing: "0.16em", color: "var(--color-text-faint)" }}
      >
        agent&apos;s self-rated confidence
      </div>
      <div
        className="font-semibold tabular-nums"
        style={{ fontSize: 36, lineHeight: 1.05, marginTop: 8, color }}
      >
        {pct}%
      </div>
      <div
        className="mt-3 h-1.5 rounded-full"
        style={{ background: "rgba(255,255,255,0.06)", overflow: "hidden" }}
      >
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999 }} />
      </div>
    </div>
  );
}

export function MetricsStrip({ metrics }: { metrics: MetricsView }) {
  return (
    <section className="px-7 py-6" style={panelStyle}>
      <Eyebrow>TRAJECTORY METRICS</Eyebrow>
      <div className="mt-4 grid gap-3 grid-cols-2 sm:grid-cols-4">
        <MetricTile label="tool calls" value={metrics.toolCalls} />
        <MetricTile label="actions" value={metrics.actions} accent={metrics.actions > 0} />
        <MetricTile label="snapshots" value={metrics.snapshots} />
        <MetricTile label="screenshots" value={metrics.screenshots} />
        <MetricTile
          label="snaps / action"
          value={metrics.snapshotsPerAction != null ? metrics.snapshotsPerAction.toFixed(2) : "—"}
        />
        <MetricTile
          label="recoveries"
          value={metrics.recoveryCount}
          color={metrics.recoveryCount > 0 ? "#fdba8c" : undefined}
        />
        <MetricTile
          label="errors"
          value={metrics.errors}
          color={metrics.errors > 0 ? "#fca5b5" : undefined}
        />
        <MetricTile
          label="time to 1st action"
          value={
            metrics.timeToFirstActionMs != null
              ? `${(metrics.timeToFirstActionMs / 1000).toFixed(1)}s`
              : "—"
          }
        />
      </div>
    </section>
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
  const finalColor = color ?? (accent ? "var(--color-accent)" : "var(--color-text)");
  return (
    <div
      className="rounded-lg px-3.5 py-3.5"
      style={{ background: "rgba(20,26,42,0.55)", border: "1px solid var(--color-border)" }}
    >
      <div
        className="font-mono uppercase"
        style={{ fontSize: 10.5, letterSpacing: "0.16em", color: "var(--color-text-faint)" }}
      >
        {label}
      </div>
      <div
        className="tabular-nums font-semibold mt-1.5"
        style={{ fontSize: 22, lineHeight: 1.05, color: finalColor }}
      >
        {value}
      </div>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="font-mono uppercase text-[var(--color-text-faint)] m-0"
      style={{ fontSize: 11, letterSpacing: "0.18em" }}
    >
      {children}
    </p>
  );
}

function Head({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "10px 14px",
        color: "var(--color-text-faint)",
        letterSpacing: "0.12em",
        borderBottom: "1px solid var(--color-border)",
        fontSize: 11,
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function Cell({
  children,
  color,
  border,
}: {
  children: React.ReactNode;
  color: string;
  border: string;
}) {
  return (
    <div style={{ padding: "12px 14px", borderBottom: border, color }}>{children}</div>
  );
}
