/**
 * Pre-built flow templates surfaced on /flows/new.
 * Adapted from the eight templates listed in the team-usability plan
 * (Phase 10 § Templates) — they cover the most common UX shapes.
 *
 * Each template populates the form; the user MUST edit `flow_id`, `goal`,
 * and `entry_route` before submitting (the literal strings here all start
 * with "feature.*" / "/admin/feature" sentinels so a forgotten edit is
 * obvious in the resulting PR).
 */
import type { FlowDraft } from "./schemas";

export interface FlowTemplate {
  id: string;
  label: string;
  emoji: string;
  description: string;
  draft: Omit<FlowDraft, "template_id">;
}

export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: "form_based",
    label: "Form-based",
    emoji: "📝",
    description: "Single page with required fields, validation, submit + confirm.",
    draft: {
      flow_id: "feature.action.dispatcher",
      goal: "Fill and submit a single-page form to create a record",
      entry_route: "/admin/feature/new",
      success_criteria: [
        "Submit button enables once required fields are valid",
        "Toast confirms creation within 2s of submit",
        "New record appears in the relevant list view",
      ],
    },
  },
  {
    id: "multi_step_wizard",
    label: "Multi-step wizard",
    emoji: "🧭",
    description: "Sequential steps with progress, back/next, summary before commit.",
    draft: {
      flow_id: "feature.setup.user",
      goal: "Complete a multi-step wizard from start to confirmation",
      entry_route: "/setup/feature",
      success_criteria: [
        "Progress indicator updates at each step",
        "Back button preserves previously entered data",
        "Final step shows a summary before commit",
        "Confirmation lands within 3s of completion",
      ],
    },
  },
  {
    id: "mobile_first",
    label: "Mobile-first",
    emoji: "📱",
    description: "Touch-only flow with large targets, no hover, on-device camera.",
    draft: {
      flow_id: "feature.action.tech",
      goal: "Complete the action from a phone in the field with touch only",
      entry_route: "/m/feature",
      success_criteria: [
        "All interactive targets are at least 44x44 px",
        "Primary CTA is reachable without horizontal scroll",
        "Photo upload completes from the device camera",
      ],
    },
  },
  {
    id: "data_grid_with_filters",
    label: "Data grid with filters",
    emoji: "📊",
    description: "Table view with sort + filter + pagination affordances.",
    draft: {
      flow_id: "feature.find.dispatcher",
      goal: "Locate a specific record in a large list using search and filters",
      entry_route: "/admin/feature",
      success_criteria: [
        "Search returns results within 500ms of typing",
        "Filters can be combined and visibly stack",
        "Result detail opens without losing filter state",
      ],
    },
  },
  {
    id: "auth_wall_recovery",
    label: "Auth wall + recovery",
    emoji: "🔐",
    description: "Sign-in, forgot password, recovery loops handled gracefully.",
    draft: {
      flow_id: "auth.recover.user",
      goal: "Recover account access via the forgot-password flow",
      entry_route: "/sign-in",
      success_criteria: [
        "Forgot-password link is obvious from sign-in",
        "Reset email arrives and link works exactly once",
        "After reset, the user lands signed-in on the original destination",
      ],
    },
  },
  {
    id: "empty_state_first",
    label: "Empty state first",
    emoji: "🪹",
    description: "Page with no data — does it teach the user the next action?",
    draft: {
      flow_id: "feature.empty.dispatcher",
      goal: "Land on the page with zero records and discover the create action",
      entry_route: "/admin/feature",
      success_criteria: [
        "Empty-state copy explains what this page is for",
        "Primary CTA to create the first record is unmissable",
        "No broken summary widgets / NaN counters / 0% donut charts",
      ],
    },
  },
  {
    id: "error_recovery",
    label: "Error recovery",
    emoji: "🚧",
    description: "What does the user see when the network fails mid-flow?",
    draft: {
      flow_id: "feature.action.network_error",
      goal: "Submit the action while the network drops, then recover cleanly",
      entry_route: "/admin/feature/new",
      success_criteria: [
        "User-visible error explains what went wrong, not a stack trace",
        "Form data is preserved — no silent loss of input",
        "Retry succeeds without re-entering data",
      ],
    },
  },
  {
    id: "setup_first_run",
    label: "Setup / first run",
    emoji: "🌱",
    description: "Onboarding from a cold account — what's the first 5 minutes?",
    draft: {
      flow_id: "onboarding.first_run.user",
      goal: "Complete the first-run onboarding from a brand new account",
      entry_route: "/onboarding",
      success_criteria: [
        "User reaches a usable state in under 5 minutes",
        "No required step is hidden behind a non-obvious affordance",
        "Skipping an optional step does not trap the user",
      ],
    },
  },
];
