"use client";

import { useState } from "react";
import { createBrowserSupabase } from "../../lib/supabase/client";

export default function SignInPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signInWithGitHub() {
    setBusy(true);
    setErr(null);
    const supabase = createBrowserSupabase();
    const redirectTo = new URL("/auth/callback", window.location.origin);
    if (searchParams.next) redirectTo.searchParams.set("next", searchParams.next);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: redirectTo.toString() },
    });
    if (error) {
      setErr(error.message);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
            Rove · agentic UX evaluation
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance">
            Walks. Findings.
            <br />
            <span className="text-[var(--color-accent)]">Real bugs your tests missed.</span>
          </h1>
          <p className="mt-3 text-sm text-[var(--color-text-muted)] max-w-sm mx-auto">
            Sign in to view runs, browse findings, and queue agentic walks against the
            your app.
          </p>
        </div>

        <div className="surface-raised p-6 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.6)]">
          <button
            onClick={signInWithGitHub}
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-[var(--color-text)] text-[var(--color-bg)] font-medium py-2.5 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <GitHubMark />
            {busy ? "Redirecting…" : "Continue with GitHub"}
          </button>
          <p className="mt-4 text-xs text-[var(--color-text-faint)] text-center">
            Team members of your workspace only.
          </p>
          {err ? <p className="mt-4 text-sm text-red-300 text-center">{err}</p> : null}
        </div>

        <div className="mt-8 grid grid-cols-3 gap-3 text-center">
          <Hint emoji="🧭" label="Browse flows" />
          <Hint emoji="🤖" label="Queue walks" />
          <Hint emoji="🐛" label="Read findings" />
        </div>
      </div>
    </div>
  );
}

function Hint({ emoji, label }: { emoji: string; label: string }) {
  return (
    <div className="text-[11px] text-[var(--color-text-muted)]">
      <div className="text-base mb-1">{emoji}</div>
      {label}
    </div>
  );
}

function GitHubMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2 .37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}
