import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Affordance gaps",
  description:
    "Project-wide rollup of negative-space findings — what each persona expected to find on each page but didn't.",
};

export default function GapsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
