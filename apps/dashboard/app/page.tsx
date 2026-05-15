import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const metadata = {
  title: "Rove — agentic UX evaluation",
};

export default async function HomePage() {
  // Signed-in users go straight to the runs view (the working dashboard).
  // Unauthed visitors — humans AND agent walkers — get a substantive public
  // landing instead of bouncing off the signin wall. This page is itself a
  // Rove-on-Rove dogfood surface: every affordance here should be one an
  // agent walker can perceive and act on without auth.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: async () => (await cookies()).getAll(),
        setAll: () => {},
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/runs");

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <section aria-labelledby="hero-heading" className="mb-16">
        <p
          className="font-mono uppercase text-[var(--color-text-faint)] mb-3"
          style={{ fontSize: 11, letterSpacing: "0.18em" }}
        >
          Rove · agentic UX evaluation
        </p>
        <h1
          id="hero-heading"
          className="text-4xl md:text-5xl font-semibold tracking-tight text-balance max-w-3xl"
        >
          Walks. Findings.{" "}
          <span className="text-brand-gradient">
            Real bugs your tests missed.
          </span>
        </h1>
        <p
          className="mt-4 text-[var(--color-text-muted)] max-w-2xl"
          style={{ fontSize: 16, lineHeight: 1.6 }}
        >
          Rove walks your app as both human personas (Nielsen, WCAG, ISO) and
          agent personas (semantic HTML, stable selectors, accessibility-tree
          completeness). It files findings — not pass/fail assertions — about
          how usable your product is for the humans and agents that will
          increasingly use it on their behalf.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/signin"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--color-text)] text-[var(--color-bg)] font-medium px-5 py-2.5 hover:opacity-90 transition-opacity"
          >
            Sign in with GitHub
          </Link>
          <Link
            href="/preview/live-walk"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-[var(--color-border)] text-[var(--color-text)] font-medium px-5 py-2.5 hover:bg-[var(--color-panel-2)] transition-colors"
          >
            View an example walk
          </Link>
        </div>
      </section>

      <section
        aria-labelledby="how-heading"
        className="mb-16 grid gap-6 md:grid-cols-3"
      >
        <h2 id="how-heading" className="sr-only">
          How Rove works
        </h2>
        <Card
          title="Two-sided readiness"
          body="The same flow walked under a human persona (Nielsen / WCAG / ISO) and an agent persona (agent.* heuristics). Parity is the wedge."
        />
        <Card
          title="Negative-space findings"
          body="Walkers enumerate what a user with a goal would expect on each page, then report what's missing. The diff is the finding."
        />
        <Card
          title="Plan vs reality"
          body="Every agent forms a prior plan before the first tool call. Rove captures that plan and verdicts each step against it."
        />
      </section>

      <section aria-labelledby="explore-heading" className="mb-16">
        <h2
          id="explore-heading"
          className="font-mono uppercase text-[var(--color-text-faint)] mb-4"
          style={{ fontSize: 11, letterSpacing: "0.18em" }}
        >
          Explore
        </h2>
        <ul role="list" className="grid gap-3 md:grid-cols-2">
          <ExploreLink
            href="/preview/live-walk"
            title="Example live walk"
            body="A complete agent walk with filmstrip, findings stream, and reflection — no auth required."
          />
          <ExploreLink
            href="/signin"
            title="Sign in to walk your app"
            body="Team members continue with GitHub to queue walks against your own targets."
          />
        </ul>
      </section>

      <footer className="text-[var(--color-text-faint)] border-t border-[var(--color-border)] pt-6">
        <p style={{ fontSize: 12 }}>
          Rove is in early alpha. This landing page is itself a Rove-on-Rove
          dogfood surface — when our walkers find something missing here,
          that's a finding too.
        </p>
      </footer>
    </main>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <article
      className="rounded-[14px] border border-[var(--color-border)] bg-[var(--color-panel)] p-5"
      style={{ minHeight: 140 }}
    >
      <h3 className="font-semibold mb-2" style={{ fontSize: 15 }}>
        {title}
      </h3>
      <p className="text-[var(--color-text-muted)]" style={{ fontSize: 13.5, lineHeight: 1.55 }}>
        {body}
      </p>
    </article>
  );
}

function ExploreLink({
  href,
  title,
  body,
}: {
  href: string;
  title: string;
  body: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="block rounded-[14px] border border-[var(--color-border)] bg-[var(--color-panel)] p-5 hover:bg-[var(--color-panel-2)] transition-colors"
      >
        <p className="font-semibold mb-1" style={{ fontSize: 15 }}>
          {title} →
        </p>
        <p
          className="text-[var(--color-text-muted)]"
          style={{ fontSize: 13, lineHeight: 1.55 }}
        >
          {body}
        </p>
      </Link>
    </li>
  );
}
