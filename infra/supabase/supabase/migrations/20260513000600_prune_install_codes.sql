-- Install codes — daily prune sweep.
--
-- /api/install/mint inserts one row per /setup paste; /api/install/exchange
-- marks it consumed_at on first use. Codes are short-lived (5min TTL), so
-- consumed rows older than a day — and never-exchanged rows whose TTL
-- lapsed more than a day ago — carry no value and would otherwise
-- accumulate forever.
--
-- A Vercel cron hits /api/install/codes/prune nightly (apps/dashboard/
-- vercel.json) and that route calls this function via the service-role
-- key. service_role is the only role granted execute; anonymous and
-- authenticated cannot reach it.

create or replace function public.prune_install_codes()
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count bigint;
begin
  with deleted as (
    delete from public.install_codes
     where (consumed_at is not null and consumed_at < now() - interval '1 day')
        or (consumed_at is null     and expires_at  < now() - interval '1 day')
    returning 1
  )
  select count(*) into v_count from deleted;
  return v_count;
end;
$$;

revoke all on function public.prune_install_codes() from public;
grant execute on function public.prune_install_codes() to service_role;
