import type { Metadata } from "next";
import Link from "next/link";
import { RUN_META, FINDINGS } from "@/components/run-detail/mock-data";
import { SeverityBadge } from "@/components/page-header";
import { PreviewBanner } from "@/components/preview-banner";

export const metadata: Metadata = {
  title: "Flow detail · preview",
  description:
    "Public read-only preview of a Rove flow's detail page. Static fixture — no live data.",
};

export default function FlowPreviewPage() {
  const findings = FINDINGS;
  const totals = findings.reduce(
    (acc, f) => {
      acc[f.severity] += 1;
      return acc;
    },
    { critical: 0, major: 0, minor: 0, nit: 0 },
  );

  return (
    <>
      <PreviewBanner liveHref="/flows" liveLabel="Browse real flows" />
      <main className="mx-auto max-w-[1240px] px-8 py-10">
        <div className="text-sm text-[var(--color-text-muted)] mb-6">
          <Link href="/preview/findings" className="hover:text-[var(--color-text)]">
            ← preview
          </Link>
        </div>

        <header>
          <p
            className="font-mono uppercase text-[var(--color-text-faint)] m-0 mb-3"
            style={{ fontSize: 11, letterSpacing: "0.18em" }}
          >
            FLOW · {RUN_META.flowId}
          </p>
          <h1
            className="font-semibold tracking-tight m-0"
            style={{ fontSize: 38, lineHeight: 1.1, color: "var(--color-text)" }}
          >
            What this flow asks the walker to do
          </h1>
          <p
            className="mt-3 max-w-2xl m-0"
            style={{ fontSize: 14, color: "var(--color-text-muted)", lineHeight: 1.55 }}
          >
            A flow defines a goal a real user / agent would pursue against the
            target app. Rove walkers attempt the goal as the configured
            persona; everything they find (or don't) gets filed as a finding
            against the heuristics that apply.
          </p>
        </header>

        <section className="mt-8 grid grid-cols-3 gap-4">
          <Stat label="Total runs" value="12" />
          <Stat label="Goal reached" value="83%" accent="var(--color-accent)" />
          <Stat label="Findings filed" value={String(findings.length)} />
        </section>

        <section
          className="mt-6"
          style={{
            background: "var(--color-panel)",
            border: "1px solid var(--color-border)",
            borderRadius: 14,
            padding: 18,
          }}
        >
          <p
            className="font-mono uppercase text-[var(--color-text-faint)] m-0 mb-3"
            style={{ fontSize: 11, letterSpacing: "0.18em" }}
          >
            Goal
          </p>
          <p className="m-0" style={{ fontSize: 16, color: "var(--color-text)", lineHeight: 1.5 }}>
            Land on the dashboard's flows index, find an existing flow, open
            its detail page, locate the Run-walk affordance, and return to
            the index.
          </p>
        </section>

        <section className="mt-6 flex flex-wrap items-center gap-2 text-xs">
          {(["critical", "major", "minor", "nit"] as const).map((s) => (
            <SeverityChip key={s} severity={s} count={totals[s]} />
          ))}
        </section>

        <section
          className="mt-6"
          style={{
            background: "var(--color-panel)",
            border: "1px solid var(--color-border)",
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          <table className="w-full text-sm">
            <thead className="text-[var(--color-text-faint)]">
              <tr className="border-b border-[var(--color-border)]">
                <Th>Sev</Th>
                <Th>Finding</Th>
                <Th>Heuristic</Th>
                <Th>Step</Th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f) => (
                <tr key={f.id} className="border-b border-[var(--color-border)]/40">
                  <td className="px-5 py-3.5">
                    <SeverityBadge severity={f.severity} />
                  </td>
                  <td className="px-5 py-3.5 text-[var(--color-text)]">{f.title}</td>
                  <td className="px-5 py-3.5 font-mono text-[11px] text-[var(--color-text-muted)]">
                    {f.heuristic}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-[11px] text-[var(--color-text-muted)]">
                    step {String(f.stepIndex).padStart(2, "0")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <p
          className="mt-6 text-xs text-[var(--color-text-faint)]"
          style={{ lineHeight: 1.6 }}
        >
          See the same data inside a single run at the{" "}
          <Link
            href="/preview/run-detail"
            className="text-[var(--color-accent)] hover:underline"
          >
            run-detail preview
          </Link>
          . Or{" "}
          <Link href="/signin" className="text-[var(--color-accent)] hover:underline">
            sign in
          </Link>{" "}
          to queue a real walk.
        </p>
      </main>
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      className="text-left px-5 py-2 text-[10px] uppercase tracking-wider font-medium"
      style={{ letterSpacing: "0.14em" }}
    >
      {children}
    </th>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div
      style={{
        background: "var(--color-panel)",
        border: "1px solid var(--color-border)",
        borderRadius: 14,
        padding: 18,
      }}
    >
      <p
        className="font-mono uppercase text-[var(--color-text-faint)] m-0 mb-2"
        style={{ fontSize: 11, letterSpacing: "0.18em" }}
      >
        {label}
      </p>
      <p
        className="font-semibold tracking-tight m-0"
        style={{ fontSize: 30, lineHeight: 1.1, color: accent ?? "var(--color-text)" }}
      >
        {value}
      </p>
    </div>
  );
}

function SeverityChip({
  severity,
  count,
}: {
  severity: "critical" | "major" | "minor" | "nit";
  count: number;
}) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono"
      style={{
        borderColor: "var(--color-border)",
        background: "var(--color-panel)",
        color: "var(--color-text-muted)",
        fontSize: 11,
      }}
    >
      <SeverityBadge severity={severity} />
      <span style={{ color: "var(--color-text)" }}>{count}</span>
    </span>
  );
}
