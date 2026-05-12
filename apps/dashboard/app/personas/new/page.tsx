import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "../../../components/page-header";
import { PersonaWizard } from "./persona-wizard";

export const dynamic = "force-dynamic";

export default function NewPersonaPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href="/flows"
        className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] mb-4"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        flows
      </Link>
      <PageHeader
        eyebrow="author"
        title="New persona"
        description="Describe a user. AI generates structured persona fields — review, edit, and open a draft PR."
      />
      <PersonaWizard />
    </div>
  );
}
