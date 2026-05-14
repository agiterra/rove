"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TopBar } from "./TopBar";
import { Hero } from "./Hero";
import { Filmstrip } from "./Filmstrip";
import { TabBar } from "./TabBar";
import { DetailSplit } from "./DetailSplit";
import { FindingsStream } from "./FindingsStream";
import { Reflection } from "./Reflection";
import { RunFooter } from "./RunFooter";
import { useLiveRun } from "./useLiveRun";
import { formatElapsed } from "./adapters";
import type { HeroView, RunDetailView } from "./types";

interface RunDetailLiveProps {
  runId: string;
  projectId: string;
  initialView: RunDetailView;
}

type TabId = "filmstrip" | "steps" | "findings" | "reflection";

/**
 * Client wrapper for the live run-detail page. Holds:
 *   - selected step index (filmstrip click)
 *   - current tab
 *   - realtime subscription on runs / run_steps / findings for this run
 *
 * The server component (`/runs/[id]/page.tsx`) builds the initial
 * RunDetailView from a one-shot read; this component subscribes to
 * Realtime updates and replaces the view as new rows arrive.
 */
export function RunDetailLive({ runId, projectId, initialView }: RunDetailLiveProps) {
  const liveView = useLiveRun({ runId, projectId, initialView });
  const baseView = liveView ?? initialView;
  const view = useTickingView(baseView);

  const [tab, setTab] = useState<TabId>("filmstrip");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(
    view.selectedStepIndex ?? view.steps[view.steps.length - 1]?.index ?? null,
  );

  // Auto-follow the running tile if the user hasn't manually picked a step.
  const [stickToRunning, setStickToRunning] = useState(true);
  const runningStep = view.steps.find((s: { status: string }) => s.status === "running");
  const effectiveSelected =
    stickToRunning && runningStep ? runningStep.index : selectedIdx;

  const selectedStep =
    view.steps.find((s: { index: number }) => s.index === effectiveSelected) ??
    view.steps[view.steps.length - 1] ??
    null;

  const findingHref = useMemo(
    () => (f: { id: string }) => `/findings?run=${runId}&open=${f.id}`,
    [runId],
  );

  function onPickStep(idx: number) {
    setStickToRunning(false);
    setSelectedIdx(idx);
    setTab("filmstrip");
  }

  return (
    <div
      className="fixed inset-0 overflow-y-auto"
      style={{ background: "var(--color-bg)", zIndex: 100 }}
    >
      <BackgroundAurora />
      <TopBar view={view.topBar} />
      <main
        className="mx-auto relative"
        style={{ maxWidth: 1280, padding: "28px 32px 64px", zIndex: 1 }}
      >
        <BreadcrumbRow />
        <Hero view={view.hero} />
        <Filmstrip
          steps={view.steps}
          selectedIndex={effectiveSelected}
          onSelect={onPickStep}
          showAwaitingTile={view.hero.status === "running"}
        />
        <TabBar
          active={tab}
          onChange={(id) => setTab(id as TabId)}
          findingCount={view.findings.length}
        />
        {tab === "filmstrip" ? (
          <DetailSplit step={selectedStep} />
        ) : null}
        {tab === "steps" ? <StepsList view={view} onPick={onPickStep} selectedIndex={effectiveSelected} /> : null}
        {tab === "findings" ? (
          <div className="mt-5">
            <FindingsStream
            findings={view.findings}
            findingHref={findingHref}
            runStatus={view.hero.status}
            lastFiledAt={view.lastFindingAt}
          />
          </div>
        ) : null}
        {tab === "reflection" ? (
          <Reflection view={view.reflection} runStatus={view.hero.status} />
        ) : null}
        {tab !== "findings" ? <FindingsStream
            findings={view.findings}
            findingHref={findingHref}
            runStatus={view.hero.status}
            lastFiledAt={view.lastFindingAt}
          /> : null}
        <RunFooter view={view.footer} />
      </main>
    </div>
  );
}

function BreadcrumbRow() {
  return (
    <div className="mb-4 -mt-1">
      <Link
        href="/runs"
        className="inline-flex items-center gap-1 text-[12px] font-mono text-[var(--color-text-muted)] hover:text-[var(--color-text)] focus-rove rounded-[6px] px-1 py-0.5 transition-colors"
      >
        ← all runs
      </Link>
    </div>
  );
}

/**
 * 1Hz ticker. While a walk is running (no `finishedAtMs`), re-derive
 * hero `elapsedLabel` and `timerLabel` from `now() - startedAtMs` every
 * second. Once `finishedAtMs` is set, the labels freeze.
 */
function useTickingView(view: RunDetailView): RunDetailView {
  const { startedAtMs, finishedAtMs } = view.hero;
  const isLive = finishedAtMs == null;
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!isLive) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [isLive]);

  if (!isLive) return view;
  const elapsedSec = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
  const label = formatElapsed(elapsedSec);
  const hero: HeroView = { ...view.hero, elapsedLabel: label, timerLabel: label };
  return { ...view, hero };
}

function BackgroundAurora() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        zIndex: 0,
        background:
          "radial-gradient(700px 360px at 8% 4%, rgba(63,201,203,0.08), transparent 60%), radial-gradient(1000px 500px at 60% -8%, rgba(16,44,87,0.45), transparent 65%)",
      }}
    />
  );
}

function StepsList({
  view,
  onPick,
  selectedIndex,
}: {
  view: RunDetailView;
  onPick: (n: number) => void;
  selectedIndex: number | null;
}) {
  if (view.steps.length === 0) {
    return (
      <div
        className="mt-5 text-center text-[var(--color-text-muted)] py-10"
        style={{
          border: "1px dashed var(--color-border-strong)",
          borderRadius: 12,
          fontSize: 13,
        }}
      >
        No steps recorded for this walk.
      </div>
    );
  }
  return (
    <div
      className="mt-5 overflow-hidden"
      style={{
        background: "var(--color-panel)",
        border: "1px solid var(--color-border)",
        borderRadius: 14,
      }}
    >
      <div
        className="grid font-mono"
        style={{
          gridTemplateColumns: "56px 1fr 280px 80px 90px",
          fontSize: 12.5,
        }}
      >
        <Head>#</Head>
        <Head>TOOL</Head>
        <Head>URL</Head>
        <Head right>DUR</Head>
        <Head right>STATUS</Head>
        {view.steps.map((s) => {
          const isSelected = s.index === selectedIndex;
          const bg = isSelected ? "rgba(63,201,203,0.06)" : "transparent";
          return (
            <button
              key={s.index}
              type="button"
              onClick={() => onPick(s.index)}
              className="contents focus-rove"
              style={{ display: "contents" }}
            >
              <Cell bg={bg} color="var(--color-text)">
                {String(s.index).padStart(2, "0")}
              </Cell>
              <Cell bg={bg} color="#c9d2e5">
                {s.toolName}
              </Cell>
              <Cell bg={bg} color="var(--color-text-muted)" truncate>
                {s.url || "—"}
              </Cell>
              <Cell bg={bg} color="var(--color-text-faint)" right>
                {s.durationLabel}
              </Cell>
              <Cell bg={bg} color={s.status === "errored" ? "#fca5b5" : "#6ee2e4"} right>
                {s.status}
              </Cell>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Head({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <div
      style={{
        padding: "10px 14px",
        color: "var(--color-text-faint)",
        letterSpacing: "0.12em",
        borderBottom: "1px solid var(--color-border)",
        fontSize: 11,
        textAlign: right ? "right" : "left",
      }}
    >
      {children}
    </div>
  );
}

function Cell({
  children,
  bg,
  color,
  right = false,
  truncate = false,
}: {
  children: React.ReactNode;
  bg: string;
  color: string;
  right?: boolean;
  truncate?: boolean;
}) {
  return (
    <div
      style={{
        padding: "14px",
        borderBottom: "1px solid #161c2e",
        background: bg,
        color,
        textAlign: right ? "right" : "left",
        overflow: truncate ? "hidden" : undefined,
        textOverflow: truncate ? "ellipsis" : undefined,
        whiteSpace: truncate ? "nowrap" : undefined,
        cursor: "pointer",
      }}
    >
      {children}
    </div>
  );
}

