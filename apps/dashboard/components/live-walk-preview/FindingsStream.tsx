import { MockThumb } from "./MockThumbs";
import { FINDINGS } from "./mock-data";
import type { MockFinding } from "./mock-data";

const SEV_BG: Record<MockFinding["severity"], string> = {
  critical: "rgba(244,63,94,0.12)",
  major: "rgba(251,146,60,0.12)",
  minor: "rgba(250,204,21,0.10)",
  nit: "rgba(148,163,184,0.10)",
};

const SEV_BORDER: Record<MockFinding["severity"], string> = {
  critical: "rgba(244,63,94,0.45)",
  major: "rgba(251,146,60,0.45)",
  minor: "rgba(250,204,21,0.40)",
  nit: "rgba(148,163,184,0.40)",
};

const SEV_COLOR: Record<MockFinding["severity"], string> = {
  critical: "#fca5b5",
  major: "#fdba8c",
  minor: "#fde68a",
  nit: "#cbd5e1",
};

const SEV_BAR: Record<MockFinding["severity"], string> = {
  critical: "var(--color-severity-critical)",
  major: "var(--color-severity-major)",
  minor: "var(--color-severity-minor)",
  nit: "var(--color-severity-nit)",
};

export function FindingsStream() {
  return (
    <section className="mt-7" aria-label="Findings filed during this walk">
      <div className="flex items-baseline justify-between mb-2.5">
        <p
          className="font-mono uppercase text-[var(--color-text-faint)]"
          style={{ fontSize: 11, letterSpacing: "0.18em" }}
        >
          FINDINGS FILED THIS WALK · {FINDINGS.length}
        </p>
        <span className="font-mono" style={{ fontSize: 11, color: "var(--color-text-faint)" }}>
          filed in last 92s
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {FINDINGS.map((f) => (
          <FindingCard key={f.id} finding={f} />
        ))}
      </div>
    </section>
  );
}

function FindingCard({ finding }: { finding: MockFinding }) {
  return (
    <article
      className="grid items-center kinetic-hover focus-rove relative overflow-hidden"
      style={{
        gridTemplateColumns: "100px 1fr 130px",
        gap: 20,
        background: "var(--color-panel)",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        padding: "16px 18px",
        minHeight: 80,
        cursor: "pointer",
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
          <MockThumb kind={finding.thumb} />
        </div>
        <span
          className="flex items-center gap-1.5 font-mono text-[var(--color-text-muted)]"
          style={{ fontSize: 11.5 }}
        >
          <span>Step {String(finding.stepIndex).padStart(2, "0")}</span>
          <svg viewBox="0 0 16 16" width={12} height={12} strokeWidth={1.8} fill="none" stroke="currentColor">
            <path d="M6 4l4 4-4 4" />
          </svg>
        </span>
      </div>
    </article>
  );
}
