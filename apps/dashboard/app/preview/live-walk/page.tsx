import type { Metadata } from "next";
import { TopBar } from "@/components/run-detail/TopBar";
import { Hero } from "@/components/run-detail/Hero";
import { Filmstrip } from "@/components/run-detail/Filmstrip";
import { TabBar } from "@/components/run-detail/TabBar";
import { DetailSplit } from "@/components/run-detail/DetailSplit";
import { FindingsStream } from "@/components/run-detail/FindingsStream";
import { RunFooter } from "@/components/run-detail/RunFooter";
import { buildMockRunDetailView, NOW_DOING } from "@/components/run-detail/mock-data";

export const metadata: Metadata = {
  title: "Live walk · preview",
  description:
    "Visual preview of the live walk run-detail page. Hard-coded fixtures — no live data.",
};

export default function LiveWalkPreviewPage() {
  const view = buildMockRunDetailView();
  const selectedStep =
    view.steps.find((s) => s.index === view.selectedStepIndex) ?? view.steps[view.steps.length - 1] ?? null;
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
        <Filmstrip steps={view.steps} selectedIndex={view.selectedStepIndex} showAwaitingTile />
        <TabBar active="filmstrip" />
        <DetailSplit
          step={selectedStep}
          inlineTankloop
          liveVerb={NOW_DOING.verb.toLowerCase()}
          liveTarget={NOW_DOING.target.replace(/"/g, "")}
        />
        <FindingsStream findings={view.findings} />
        <RunFooter view={view.footer} />
      </main>
    </div>
  );
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
