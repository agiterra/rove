import type { Metadata } from "next";
import { TopBar } from "@/components/live-walk-preview/TopBar";
import { Hero } from "@/components/live-walk-preview/Hero";
import { Filmstrip } from "@/components/live-walk-preview/Filmstrip";
import { TabBar } from "@/components/live-walk-preview/TabBar";
import { DetailSplit } from "@/components/live-walk-preview/DetailSplit";
import { FindingsStream } from "@/components/live-walk-preview/FindingsStream";
import { RunFooter } from "@/components/live-walk-preview/RunFooter";

export const metadata: Metadata = {
  title: "Live walk · preview",
  description:
    "Visual preview of the live walk run-detail page. Ported from Claude Design's Live Walk.html handoff bundle.",
};

export default function LiveWalkPreviewPage() {
  return (
    <div className="lw-preview-root" style={{ marginLeft: "calc(50% - 50vw)", marginRight: "calc(50% - 50vw)" }}>
      <BackgroundAurora />
      <TopBar />
      <main
        className="mx-auto"
        style={{ maxWidth: 1280, padding: "28px 32px 64px", position: "relative", zIndex: 1 }}
      >
        <Hero />
        <Filmstrip />
        <TabBar active="filmstrip" />
        <DetailSplit />
        <FindingsStream />
        <RunFooter />
      </main>
    </div>
  );
}

function BackgroundAurora() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0"
      style={{
        zIndex: 0,
        background:
          "radial-gradient(700px 360px at 8% 4%, rgba(63,201,203,0.08), transparent 60%), radial-gradient(1000px 500px at 60% -8%, rgba(16,44,87,0.45), transparent 65%)",
      }}
    />
  );
}
