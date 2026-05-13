import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Set up worker",
  description: "Install a Rove daemon on your machine with a single terminal command.",
};

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
