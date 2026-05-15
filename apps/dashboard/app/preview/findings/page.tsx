import type { Metadata } from "next";
import Link from "next/link";
import { FINDINGS } from "@/components/run-detail/mock-data";
import { SeverityBadge } from "@/components/page-header";
import { PreviewBanner } from "@/components/preview-banner";

export const metadata: Metadata = {
  title: "Findings · preview",
  description:
    "Public read-only preview of the Rove findings list. Static fixture — no live data.",
};

export default function FindingsPreviewPage() {
  const sevCounts = FINDINGS.reduce(
    (acc, f) => {
      acc[f.severity] += 1;
      return acc;
    },
    { critical: 0, major: 0, minor: 0, nit: 0 },
  );

  return (
    <>
      <PreviewBanner liveHref="/findings" liveLabel="Open real findings" />
      <main className="mx-auto max-w-[1240px] px-8 py-10">
        <header>
          <p
            className="font-mono uppercase text-[var(--color-text-faint)] m-0 mb-3"
            style={{ fontSize: 11, letterSpacing: "0.18em" }}
          >
            FINDINGS · preview · {FINDINGS.length} fixtures
          </p>
          <h1
            className="font-semibold tracking-tight m-0"
            style={{ fontSize: 38, lineHeight: 1.1, color: "var(--color-text)" }}
          >
            What the persona flagged
          </h1>
          <p
            className="mt-3 max-w-2xl m-0"
            style={{ fontSize: 14, color: "var(--color-text-muted)", lineHeight: 1.55 }}
          >
            Each row is a finding a Rove walker filed against the app it was
            evaluating — the heuristic it violated, the persona of record,
            and a click-through into the run it came from. Sample data.
          </p>
        </header>

        <section className="mt-6 flex flex-wrap items-center gap-2 text-xs">
          {(["critical", "major", "minor", "nit"] as const).map((s) => (
            <Stat key={s} severity={s} count={sevCounts[s]} />
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
                <Th>Severity</Th>
                <Th>Finding</Th>
                <Th>Heuristic</Th>
                <Th>Step</Th>
              </tr>
            </thead>
            <tbody>
              {FINDINGS.map((f) => (
                <tr
                  key={f.id}
                  className="border-b border-[var(--color-border)]/40 hover:bg-[var(--color-panel-2)]/40"
                >
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
          Real findings include screenshots, evidence, and a Send-to-Issue
          action. <Link href="/signin" className="text-[var(--color-accent)] hover:underline">Sign in</Link>{" "}
          to see live data, or visit the{" "}
          <Link href="/preview/run-detail" className="text-[var(--color-accent)] hover:underline">
            run-detail preview
          </Link>{" "}
          to see how a single run's findings render in context.
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

function Stat({
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
