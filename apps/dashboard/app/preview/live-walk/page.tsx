import type { Metadata } from "next";
import { Hero } from "@/components/live-walk-preview/Hero";
import { Filmstrip } from "@/components/live-walk-preview/Filmstrip";
import { TabBar } from "@/components/live-walk-preview/TabBar";
import { DetailSplit } from "@/components/live-walk-preview/DetailSplit";
import { FindingsStream } from "@/components/live-walk-preview/FindingsStream";
import { RunFooter } from "@/components/live-walk-preview/RunFooter";

export const metadata: Metadata = {
  title: "Live walk · preview",
  description:
    "Visual preview of the live walk run-detail page. Hard-coded fixtures — no live data.",
};

export default function LiveWalkPreviewPage() {
  return (
    <div className="space-y-10 pb-16">
      <div className="-mt-2 mb-2 flex items-center gap-3 text-[11px]">
        <span className="rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)] border border-[color-mix(in_srgb,var(--color-accent)_30%,transparent)] px-2 py-0.5 font-mono">
          PREVIEW
        </span>
        <span className="text-[var(--color-text-faint)]">
          Hard-coded fixtures. No live data. Visual review of the live-walk plan
          (docs/plans/live-walk.md).
        </span>
      </div>
      <Hero />
      <Filmstrip />
      <div>
        <TabBar active="filmstrip" />
        <DetailSplit />
      </div>
      <FindingsStream />
      <RunFooter />
    </div>
  );
}
