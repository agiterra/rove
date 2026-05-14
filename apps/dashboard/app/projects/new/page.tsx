/**
 * /projects/new — create a new project.
 *
 * Team-member gated. Inserts a row in public.projects (the canonical
 * project registry) and redirects to /runs?p=<slug>. The new project
 * appears immediately in the ProjectSwitcher.
 */
import "server-only";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireTeamMember } from "@/lib/authoring/require-team-member";
import { NewProjectForm } from "./NewProjectForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New project",
  description: "Create a new Rove project (a slug other tables key on).",
};

export default async function NewProjectPage() {
  try {
    await requireTeamMember();
  } catch {
    redirect("/signin?next=/projects/new");
  }

  return (
    <div className="max-w-2xl">
      <Hero />
      <NewProjectForm />
    </div>
  );
}

function Hero() {
  return (
    <section className="lw-hero mb-7">
      <div className="lw-hero-aurora" />
      <div className="lw-hero-edge" />
      <div className="relative z-[1]">
        <p
          className="font-mono uppercase text-[var(--color-text-faint)] mb-3"
          style={{ fontSize: 11, letterSpacing: "0.18em" }}
        >
          PROJECTS <span className="opacity-60">·</span> NEW
        </p>
        <h1 className="font-semibold tracking-tight" style={{ fontSize: 32, lineHeight: 1.1 }}>
          Add a project
        </h1>
        <p className="mt-3 text-sm text-[var(--color-text-muted)] max-w-xl">
          A project is a tenancy boundary — runs, findings, workers, and flows
          are all keyed on the slug. After creation, install a worker via
          <code className="ml-1 px-1.5 py-0.5 rounded bg-[var(--color-panel-2)] text-[var(--color-text)]">/setup?p=…</code>
          and queue walks from the flow detail page.
        </p>
      </div>
    </section>
  );
}
