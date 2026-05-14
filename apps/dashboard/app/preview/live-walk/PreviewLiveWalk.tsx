"use client";

import { useEffect, useState } from "react";
import { TopBar } from "@/components/run-detail/TopBar";
import { Hero } from "@/components/run-detail/Hero";
import { Filmstrip } from "@/components/run-detail/Filmstrip";
import { TabBar } from "@/components/run-detail/TabBar";
import { DetailSplit } from "@/components/run-detail/DetailSplit";
import { FindingsStream } from "@/components/run-detail/FindingsStream";
import { Reflection } from "@/components/run-detail/Reflection";
import { RunFooter } from "@/components/run-detail/RunFooter";
import { formatElapsed } from "@/components/run-detail/adapters";
import { NOW_DOING } from "@/components/run-detail/mock-data";
import type { HeroView, RunDetailView } from "@/components/run-detail/types";

type TabId = "filmstrip" | "steps" | "findings" | "reflection";

interface PreviewLiveWalkProps {
  view: RunDetailView;
}

export function PreviewLiveWalk({ view: initialView }: PreviewLiveWalkProps) {
  const view = useTickingView(initialView);
  const [tab, setTab] = useState<TabId>("filmstrip");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(
    view.selectedStepIndex ?? view.steps[view.steps.length - 1]?.index ?? null,
  );
  const selectedStep =
    view.steps.find((s) => s.index === selectedIdx) ?? view.steps[view.steps.length - 1] ?? null;

  function onPickStep(idx: number) {
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
        <Hero view={view.hero} />
        <Filmstrip
          steps={view.steps}
          selectedIndex={selectedIdx}
          onSelect={onPickStep}
          showAwaitingTile
        />
        <TabBar
          active={tab}
          onChange={(id) => setTab(id as TabId)}
          findingCount={view.findings.length}
        />
        {tab === "filmstrip" ? (
          <DetailSplit
            step={selectedStep}
            inlineTankloop
            liveVerb={NOW_DOING.verb.toLowerCase()}
            liveTarget={NOW_DOING.target.replace(/"/g, "")}
          />
        ) : null}
        {tab === "steps" ? <StepsPreviewList view={view} onPick={onPickStep} selectedIndex={selectedIdx} /> : null}
        {tab === "findings" ? (
          <div className="mt-5">
            <FindingsStream
            findings={view.findings}
            runStatus={view.hero.status}
            lastFiledAt={view.lastFindingAt}
          />
          </div>
        ) : null}
        {tab === "reflection" ? <Reflection view={view.reflection} runStatus={view.hero.status} /> : null}
        {tab !== "findings" ? <FindingsStream
            findings={view.findings}
            runStatus={view.hero.status}
            lastFiledAt={view.lastFindingAt}
          /> : null}
        <RunFooter view={view.footer} />
      </main>
    </div>
  );
}

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
  const sec = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
  const label = formatElapsed(sec);
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

function StepsPreviewList({
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
  const cols = "56px 1fr 280px 80px 90px";
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
        style={{ gridTemplateColumns: cols, fontSize: 11, color: "var(--color-text-faint)" }}
      >
        <Head>#</Head>
        <Head>TOOL</Head>
        <Head>URL</Head>
        <Head right>DUR</Head>
        <Head right>STATUS</Head>
      </div>
      {view.steps.map((s) => {
        const isSelected = s.index === selectedIndex;
        const bg = isSelected ? "rgba(63,201,203,0.06)" : "transparent";
        return (
          <button
            key={s.index}
            type="button"
            onClick={() => onPick(s.index)}
            className="focus-rove font-mono w-full text-left grid"
            style={{
              gridTemplateColumns: cols,
              fontSize: 12.5,
              background: bg,
              border: 0,
              borderBottom: "1px solid #161c2e",
              cursor: "pointer",
            }}
          >
            <RowCell color="var(--color-text)">{String(s.index).padStart(2, "0")}</RowCell>
            <RowCell color="#c9d2e5">{s.toolName}</RowCell>
            <RowCell color="var(--color-text-muted)" truncate>
              {s.url || "—"}
            </RowCell>
            <RowCell color="var(--color-text-faint)" right>
              {s.durationLabel}
            </RowCell>
            <RowCell color={s.status === "errored" ? "#fca5b5" : "#6ee2e4"} right>
              {s.status}
            </RowCell>
          </button>
        );
      })}
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

function RowCell({
  children,
  color,
  right = false,
  truncate = false,
}: {
  children: React.ReactNode;
  color: string;
  right?: boolean;
  truncate?: boolean;
}) {
  return (
    <span
      style={{
        padding: "14px",
        color,
        textAlign: right ? "right" : "left",
        overflow: truncate ? "hidden" : undefined,
        textOverflow: truncate ? "ellipsis" : undefined,
        whiteSpace: truncate ? "nowrap" : undefined,
      }}
    >
      {children}
    </span>
  );
}
