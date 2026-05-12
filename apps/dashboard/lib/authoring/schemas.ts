/**
 * Zod schemas for the wizard's flow + persona drafts.
 *
 * SYNC NOTE: this file is duplicated at
 *   packages/agentic-ux-evaluator-core/src/authoring-schemas.ts
 * because eval-dashboard deploys to Vercel as a standalone subdir (no
 * workspace deps shipped) and the daemon needs the same shape to validate
 * its Claude output. If you change one, change the other.
 */
import { z } from "zod";

export const FLOW_ID_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,3}$/;
export const PERSONA_ID_PATTERN = /^[a-z][a-z0-9_]*$/;

export const flowDraftSchema = z.object({
  flow_id: z
    .string()
    .min(3)
    .max(80)
    .regex(
      FLOW_ID_PATTERN,
      "flow_id must be lowercase dotted segments, e.g. scheduling.create_job.dispatcher",
    ),
  goal: z.string().min(10).max(500),
  entry_route: z.string().regex(/^\/[A-Za-z0-9/_\-:?=&.~%]*$/, "must start with '/'"),
  success_criteria: z.array(z.string().min(3).max(280)).min(1).max(8),
  template_id: z.string().min(1).max(64).optional(),
});
export type FlowDraft = z.infer<typeof flowDraftSchema>;

export const personaDraftSchema = z.object({
  persona_id: z
    .string()
    .min(3)
    .max(40)
    .regex(PERSONA_ID_PATTERN, "persona_id must be snake_case starting with a letter"),
  expertise: z.enum(["low", "medium", "high"]),
  shortcuts_allowed: z.boolean(),
  hovers_allowed: z.boolean(),
  retries_per_step: z.number().int().min(0).max(5),
  prompt_addendum: z.string().min(8).max(800),
});
export type PersonaDraft = z.infer<typeof personaDraftSchema>;
