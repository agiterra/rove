-- ─────────────────────────────────────────────────────────────────────────
-- flows.budget — mirror the YAML `budget:` block so the dashboard can
-- render the remaining-budget chunk in the run-detail hero subline.
--
-- Idempotent: add-if-missing.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.flows
  add column if not exists budget jsonb;

comment on column public.flows.budget is
  'Shape: { "max_steps": int|null, "max_seconds": int|null }. Sourced from YAML budget: block by `rove sync` / SupabaseSink auto-upsert.';
