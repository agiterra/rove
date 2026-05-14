-- ─────────────────────────────────────────────────────────────────────────
-- worker_heartbeat() — also clear stopped_at on every heartbeat.
--
-- Before this change: graceful shutdown stamped workers.stopped_at via
-- worker_mark_stopped(). The new daemon process — started by launchd
-- auto-restart, `launchctl kickstart -k`, or any other relaunch — only
-- called worker_heartbeat(), which updated last_heartbeat_at but left
-- stopped_at non-null. claim_next_job's `stopped_at is null` filter
-- therefore rejected the worker permanently after one clean exit.
--
-- After this change: the act of heartbeating implicitly says "I am alive
-- and not stopped." A fresh daemon picks up where the previous one left
-- off without any extra RPC call. worker_mark_stopped() is still the
-- correct way to record a clean shutdown.
--
-- Found by dogfooding the web-driven install flow on 2026-05-14: the
-- LaunchAgent restart left the worker stuck stopped, and the queued
-- walk never claimed.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.worker_heartbeat()
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if public.is_worker_jwt() then
    if not public.jwt_is_valid_worker_token() then
      raise exception 'worker token rejected' using errcode = '42501';
    end if;
    update public.workers
       set last_heartbeat_at = now(),
           stopped_at        = null
     where id = public.jwt_worker_id();
  elsif auth.role() = 'service_role' then
    raise exception 'worker_heartbeat() called with service_role but no worker_id arg';
  else
    raise exception 'worker_heartbeat() called without worker JWT or service_role';
  end if;
end;
$$;
