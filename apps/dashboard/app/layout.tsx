import type { Metadata } from "next";
import Link from "next/link";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { env } from "../lib/env";
import { createReadClient } from "../lib/supabase/server";
import { AppMark } from "../components/app-mark";
import { DaemonStatusPill } from "../components/daemon-status-pill";
import { HeaderAuthorMenu, HeaderNav } from "../components/header-nav";

export const metadata: Metadata = {
  title: "Rove",
  description: "Rove — Explore. Observe. Report. Agentic UX evaluation for the agent-readable web.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const bypassActive = env.devBypassAuth() && !env.isProduction();

  // Only show nav + daemon pill once the visitor is signed in. Pre-auth
  // visitors saw a row of dead-end nav links that all bounced back to
  // /signin (dogfood-found bug).
  const supabase = await createReadClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const signedIn = Boolean(user) || bypassActive;

  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen">
        <header className="sticky top-0 z-30 backdrop-blur-md bg-[var(--color-bg)]/75 border-b border-[var(--color-border)]">
          <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-6">
            <Link
              href={signedIn ? "/runs" : "/signin"}
              className="hover:opacity-90 transition-opacity"
            >
              <AppMark />
            </Link>
            {signedIn ? <HeaderNav /> : null}
            <div className="ml-auto flex items-center gap-3 text-xs">
              {bypassActive ? (
                <span className="px-2 py-1 rounded-full bg-yellow-900/30 text-yellow-300 border border-yellow-700/40 text-[11px]">
                  DEV_BYPASS_AUTH
                </span>
              ) : null}
              {signedIn ? <HeaderAuthorMenu /> : null}
              {signedIn ? <DaemonStatusPill /> : null}
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
