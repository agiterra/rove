"use client";

import { useState } from "react";
import { TopBar } from "@/components/run-detail/TopBar";
import { Hero } from "@/components/run-detail/Hero";
import { Filmstrip } from "@/components/run-detail/Filmstrip";
import { TabBar } from "@/components/run-detail/TabBar";
import { DetailSplit } from "@/components/run-detail/DetailSplit";
import { FindingsStream } from "@/components/run-detail/FindingsStream";
import { Reflection } from "@/components/run-detail/Reflection";
import { NegativeSpaceSection } from "@/components/run-detail/NegativeSpaceSection";
import { RunFooter } from "@/components/run-detail/RunFooter";
import type { RunDetailView } from "@/components/run-detail/types";

type TabId = "filmstrip" | "steps" | "findings" | "reflection";

/**
 * Client wrapper for the public read-only run-detail preview. Same visual
 * primitives the real `/runs/[id]` route uses, but driven entirely by the
 * static fixture so unauthenticated visitors (and agent walkers auditing
 * the deeper surfaces) can read the finished-walk shape.
 */
export function PreviewRunDetail({ view }: { view: RunDetailView }) {
  const [tab, setTab] = useState<TabId>("filmstrip");
  const [selectedIdx, setSelectedIdx] = useState<number | null>(
    view.selectedStepIndex ?? view.steps[view.steps.length - 1]?.index ?? null,
  );
  const selectedStep =
    view.steps.find((s) => s.index === selectedIdx) ?? view.steps[view.steps.length - 1] ?? null;

  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg)" }}>
      <TopBar view={view.topBar} />
      <main className="mx-auto" style={{ maxWidth: 1280, padding: "28px 32px 64px" }}>
        <Hero view={view.hero} />
        <Filmstrip
          steps={view.steps}
          selectedIndex={selectedIdx}
          onSelect={setSelectedIdx}
        />
        <TabBar
          active={tab}
          onChange={(id) => setTab(id as TabId)}
          findingCount={view.findings.length}
        />
        {tab === "filmstrip" ? <DetailSplit step={selectedStep} /> : null}
        {tab === "findings" ? (
          <div className="mt-5">
            <FindingsStream
              findings={view.findings}
              runStatus={view.hero.status}
              lastFiledAt={view.lastFindingAt}
            />
          </div>
        ) : null}
        {tab === "reflection" ? (
          <Reflection view={view.reflection} runStatus={view.hero.status} />
        ) : null}
        <NegativeSpaceSection runId={view.topBar.runId} steps={view.steps} />
        <RunFooter view={view.footer} />
      </main>
    </div>
  );
}
