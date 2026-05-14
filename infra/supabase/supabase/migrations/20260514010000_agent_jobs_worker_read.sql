-- ─────────────────────────────────────────────────────────────────────────
-- agent_jobs — workers must be able to SELECT rows in their own project.
--
-- Why: realtime postgres_changes payloads are gated by RLS on the receiving
-- JWT. Without a worker-aware SELECT policy, a worker daemon subscribing to
-- INSERT events on agent_jobs never sees them — so it can't react to fresh
-- jobs and depends entirely on its 30s recovery sweep (or the missing one).
--
-- Surfaced by dogfooding the install flow on 2026-05-14: daemon installed
-- via /setup, subscribed to realtime, but a queued walk never triggered.
--
-- Scope: SELECT only, only when the JWT is a worker token (kind='worker')
-- AND the row's project_id matches the JWT's project_id claim. Workers
-- still cannot read other projects' queues; they still cannot UPDATE
-- (RPCs are the only mutation path).
-- ─────────────────────────────────────────────────────────────────────────

drop policy if exists agent_jobs_worker_read on public.agent_jobs;
create policy agent_jobs_worker_read on public.agent_jobs
  for select using (
    public.is_worker_jwt()
    and project_id = public.jwt_project_id()
  );
