import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "../../../components/page-header";
import { FlowWizard } from "./flow-wizard";

export const dynamic = "force-dynamic";

export default function NewFlowPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href="/flows"
        className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] mb-4"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        flows
      </Link>
      <PageHeader
        eyebrow="author"
        title="New flow"
        description="Pick a template or describe what the user is trying to do. Submitting opens a draft PR — nothing lands until a teammate reviews + merges."
      />
      <FlowWizard />
    </div>
  );
}
