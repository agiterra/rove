import { z } from "zod";

// ── Personas ──────────────────────────────────────────────────────────────────

export type PersonaCategory =
  | "end-user"
  | "internal-user"
  | "admin"
  | "mobile"
  | "accessibility"
  | "agent"
  | "custom";

export type PersonaExpertise = "novice" | "intermediate" | "expert";

export type AgentRuntime =
  | "claude_computer_use"
  | "chatgpt_operator"
  | "browser_use"
  | "playwright_codegen";

export interface PersonaConstraints {
  shortcuts_allowed: boolean;
  hovers_allowed: boolean;
  keyboard_navigation_only?: boolean;
  retries_per_step: number;
  /**
   * Agent personas only — which agent runtime this persona simulates.
   * The walk prompt injects different "what an agent of this shape can
   * actually do" guidance based on the runtime.
   */
  agent_runtime?: AgentRuntime;
}

export interface Persona {
  id: string;
  label: string;
  description: string;
  category: PersonaCategory;
  expertise: PersonaExpertise;
  constraints: PersonaConstraints;
  promptAddendum: string;
  isBuiltIn: boolean;
  icon?: string;
}

// ── Flows ─────────────────────────────────────────────────────────────────────

export interface FlowInfo {
  flowId: string;
  goal: string;
  filePath: string;
}

// ── Findings (the contract between agent stdout and the sink) ─────────────────

export const FINDING_SEVERITIES = ["critical", "major", "minor", "nit"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const findingScreenshotSchema = z.object({
  /** Path relative to the per-run screenshots dir, e.g. "step3-empty-state.png". */
  path: z.string().min(1),
  /** Optional human-readable caption the agent attaches. */
  caption: z.string().optional(),
});

export const findingSchema = z.object({
  id: z.string().min(1),
  severity: z.enum(FINDING_SEVERITIES),
  title: z.string().min(1),
  description: z.string().min(1),
  step_index: z.number().int().nonnegative().optional(),
  heuristic: z.string().optional(),
  evidence: z.string().optional(),
  /**
   * Screenshots the agent captured for this finding. Each entry references a
   * file the agent saved into the run's screenshots dir (the prompt tells the
   * agent exactly where). Sinks may upload these somewhere durable
   * (Supabase Storage) or just reference the on-disk path (Markdown).
   *
   * Agents may emit either a bare string ("step1.png") or a full
   * `{ path, caption }` object. Both normalize to `FindingScreenshot[]`.
   * Defaults to an empty array so downstream code never has to null-check.
   */
  screenshots: z
    .array(z.union([z.string().min(1), findingScreenshotSchema]))
    .default([])
    .transform((arr) => arr.map((entry) => (typeof entry === "string" ? { path: entry } : entry))),
});

export const findingsPayloadSchema = z.object({
  flow_id: z.string().min(1),
  persona_id: z.string().min(1),
  walked_url: z.string().optional(),
  summary: z.string().optional(),
  findings: z.array(findingSchema),
});

export type FindingScreenshot = z.infer<typeof findingScreenshotSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type FindingsPayload = z.infer<typeof findingsPayloadSchema>;
