-- Phase 11a fix: agent_jobs UPDATE events must include the full new row,
-- not just the changed columns + PK. The dashboard's wait-for-job
-- subscription filters on id=eq.<job_id> and reads `status` + `result` +
-- `error` from `payload.new` — without REPLICA IDENTITY FULL the daemon's
-- UPDATE writes propagate but the wizard never sees the result and stays
-- on "Waiting for daemon…" until the 90s timeout fires.

alter table public.agent_jobs replica identity full;
alter table public.daemon_heartbeats replica identity full;
