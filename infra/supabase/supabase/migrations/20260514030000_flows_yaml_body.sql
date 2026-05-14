-- ─────────────────────────────────────────────────────────────────────────
-- flows.yaml_body — the canonical YAML text of a flow, mirrored into the
-- DB so workers installed via /setup (no repo checkout) can fetch the
-- spec at run time.
--
-- Before this: `rove run` walked up from cwd looking for rove.config.ts +
-- a flowsDir of *.flow.yaml files. That assumption is fine for in-repo
-- pnpm-driven walks, but a LaunchAgent daemon installed via /setup has
-- no checkout — it lived at ~/.rove/lib and was launched from /.
--
-- After this: `rove sync` writes yaml_body alongside yaml_sha256. The
-- run command's workspace-less branch fetches flows.yaml_body, writes
-- it to a synthesized temp workspace under ~/.rove/run/<runId>/, and
-- proceeds with the existing in-repo walk pipeline unchanged.
--
-- Idempotent: add-if-missing.
-- ─────────────────────────────────────────────────────────────────────────

alter table public.flows
  add column if not exists yaml_body text;

comment on column public.flows.yaml_body is
  'Full canonical YAML text of the flow. Populated by `rove sync` (and the dashboard auto-upsert during walks). Workers installed via /setup fetch this to reconstitute a workspace.';
