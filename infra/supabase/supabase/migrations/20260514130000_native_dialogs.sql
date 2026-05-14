-- ─────────────────────────────────────────────────────────────────────────
-- run_steps.dialog_payload — native browser dialogs as first-class artifacts.
--
-- The walker is blind to alert()/confirm()/prompt() because @playwright/mcp
-- surfaces them as a "Modal state" line in tool responses, but a real agent
-- runtime (Claude computer-use, Operator) cannot perceive native chrome.
-- The proxy intercepts the modal-state line, dismisses the dialog with a
-- safe default action, files a finding gated by persona policy, and stamps
-- the dialog metadata onto the run_step that triggered it.
--
-- Schema decision: a single jsonb column on run_steps (not a new table).
-- A dialog event is intrinsically tied to the step that triggered it; the
-- 1:1 cardinality matches a column, and the filmstrip + reflection-tab
-- queries already select run_steps.
--
-- Payload shape:
--   {
--     "type": "alert" | "confirm" | "prompt" | "beforeunload",
--     "message": "Are you sure?",
--     "default_value": "" | "prompt default",
--     "default_action_taken": "accept" | "dismiss",
--     "fired_at": "2026-05-14T13:00:00.000Z",
--     "dismissed_at": "2026-05-14T13:00:00.012Z",
--     "persona_perceived": false
--   }
--
-- Idempotent: add-if-missing.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.run_steps
  add column if not exists dialog_payload jsonb;

comment on column public.run_steps.dialog_payload is
  'Native browser dialog (alert/confirm/prompt/beforeunload) intercepted while this step was active. Set by the MCP proxy when @playwright/mcp surfaces a Modal state. persona_perceived=false means the agent never saw the dialog (perceive_blind policy) — that absence is the finding.';
