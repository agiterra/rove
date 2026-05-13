import type { Metadata } from "next";

// Sibling layout exists purely to provide route-level metadata — the
// signin page itself is "use client" so it can't export Metadata.
export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Rove with GitHub to view runs, browse findings, and queue walks.",
};

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return children;
}
