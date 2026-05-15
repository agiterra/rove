import Link from "next/link";

/**
 * Banner rendered at the top of every `/preview/*` route. Tells visitors
 * (humans + agent walkers) they're looking at a static fixture, and links
 * to the real signed-in view. Stays out of the way visually so screenshots
 * of preview pages remain useful as walker-audit material.
 */
export function PreviewBanner({
  liveHref,
  liveLabel = "Sign in for live data",
}: {
  liveHref?: string;
  liveLabel?: string;
}) {
  return (
    <div
      className="border-b border-[var(--color-border)] bg-[var(--color-panel-2)]/80"
      style={{ backdropFilter: "blur(6px)" }}
      role="status"
    >
      <div className="max-w-7xl mx-auto px-6 h-9 flex items-center justify-between text-[11px]">
        <p
          className="font-mono uppercase text-[var(--color-text-faint)] m-0"
          style={{ letterSpacing: "0.18em" }}
        >
          PREVIEW · static fixture · no live data
        </p>
        <Link
          href={liveHref ?? "/signin"}
          className="text-[var(--color-accent)] hover:underline"
        >
          {liveLabel} →
        </Link>
      </div>
    </div>
  );
}
