/**
 * YAML rendering for the wizard. Uses the `yaml` package's Document API so
 * scalar quoting, line wrapping, and key order are deterministic — this
 * matters because the resulting file is opened as a PR diff that humans
 * review.
 */
import { Document, type ToStringOptions } from "yaml";
import type { FlowDraft, PersonaDraft } from "./schemas";

const OUTPUT_OPTIONS: ToStringOptions = {
  lineWidth: 0,
  defaultStringType: "QUOTE_DOUBLE",
  defaultKeyType: "PLAIN",
};

const FLOW_FILE_HEADER = (flowId: string) =>
  `# ${flowId}\n# Authored via rove dashboard on ${new Date().toISOString().slice(0, 10)}\n# Reviewer: add steps + scenarios after this lands.\n\n`;

export function renderFlowYaml(draft: FlowDraft): string {
  const doc = new Document({
    flow_id: draft.flow_id,
    goal: draft.goal,
    entry_route: draft.entry_route,
    budget: { max_steps: 30, max_seconds: 120 },
    success_predicate: draft.success_criteria,
    steps: [],
  });
  return FLOW_FILE_HEADER(draft.flow_id) + doc.toString(OUTPUT_OPTIONS);
}

const PERSONAS_FILE_HEADER = (personaId: string) =>
  `# Personas — ${personaId}\n# Authored via rove dashboard on ${new Date().toISOString().slice(0, 10)}\n\n`;

export function renderPersonaYaml(draft: PersonaDraft): string {
  const doc = new Document({
    personas: {
      [draft.persona_id]: {
        expertise: draft.expertise,
        shortcuts_allowed: draft.shortcuts_allowed,
        hovers_allowed: draft.hovers_allowed,
        retries_per_step: draft.retries_per_step,
        prompt_addendum: draft.prompt_addendum,
      },
    },
  });
  return PERSONAS_FILE_HEADER(draft.persona_id) + doc.toString(OUTPUT_OPTIONS);
}

/**
 * Where in the repo each artifact lives. Mirrors the existing convention
 * under `e2e/ui-overhaul/agentic/flows/` (see plan §10).
 */
export function flowYamlPath(flowId: string): string {
  return `e2e/ui-overhaul/agentic/flows/${flowId}.flow.yaml`;
}

export function personaYamlPath(personaId: string): string {
  return `e2e/ui-overhaul/agentic/flows/${personaId}.personas.yaml`;
}
