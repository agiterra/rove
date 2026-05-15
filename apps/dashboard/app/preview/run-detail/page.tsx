import type { Metadata } from "next";
import { buildMockRunDetailView } from "@/components/run-detail/mock-data";
import { PreviewBanner } from "@/components/preview-banner";
import { PreviewRunDetail } from "./PreviewRunDetail";

export const metadata: Metadata = {
  title: "Run detail · preview",
  description:
    "Public read-only preview of the Rove run-detail page. Static fixture — no live data; nothing to sign into.",
};

export default function RunDetailPreviewPage() {
  // Patch the mock view into a "completed" run state so the preview shows
  // the canonical finished-walk surface rather than the live-ticker form
  // already covered by /preview/live-walk.
  const base = buildMockRunDetailView();
  const view = {
    ...base,
    hero: {
      ...base.hero,
      status: "done" as const,
      headline: "Goal reached",
      statusPill: { label: "Completed", pulsing: false },
      nowDoing: null,
      finishedAtMs: Date.now(),
    },
  };

  return (
    <>
      <PreviewBanner liveHref="/runs" liveLabel="Browse real runs" />
      <PreviewRunDetail view={view} />
    </>
  );
}
