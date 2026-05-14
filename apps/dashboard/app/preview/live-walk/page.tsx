import type { Metadata } from "next";
import { buildMockRunDetailView } from "@/components/run-detail/mock-data";
import { ProjectSwitcher } from "@/components/project-switcher";
import { PreviewLiveWalk } from "./PreviewLiveWalk";

export const metadata: Metadata = {
  title: "Live walk · preview",
  description:
    "Visual preview of the live walk run-detail page. Hard-coded fixtures — no live data.",
};

export default function LiveWalkPreviewPage() {
  return <PreviewLiveWalk view={buildMockRunDetailView()} projectSwitcher={<ProjectSwitcher />} />;
}
