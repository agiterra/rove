-- Finding-lifecycle substrate (proposal: docs/plans/finding-lifecycle-substrate.md).
--
-- Adds silence-state columns to public.findings + a SECURITY DEFINER RPC
-- `toggle_finding_silence` so dashboard team members can silence / un-silence
-- a finding without granting table-level UPDATE on the silence columns.
--
-- silenced_at is null  → finding is active and counts toward dashboard stats.
-- silenced_at = now()  → finding is silenced; render dimmed; exclude from totals.
--
-- silence_scope semantics:
--   'finding' → silence only this row (default)
--   'pattern' → propagate to existing findings with same (project_id, heuristic)
--               whose run_steps.url_after starts with the same path prefix
--               (split_part(url_after, '?', 1)). Future findings matching the
--               same pattern are NOT auto-silenced — substrate ships single-pass
--               propagation; recurring-silence is a follow-up.
--   'flow'    → propagate to existing findings with same (project_id, heuristic)
--               whose run.flow_id matches the source finding's run.flow_id.
--
-- Un-silencing always clears all four columns on the target row only — it does
-- NOT un-silence pattern/flow siblings. Explicit, because pattern/flow scopes
-- represent a deliberate "this whole family is noise" decision; reversing it
-- should be deliberate too.

alter table public.findings
  add column if not exists silenced_at     timestamptz,
  add column if not exists silenced_by     uuid references auth.users(id) on delete set null,
  add column if not exists silence_reason  text,
  add column if not exists silence_scope   text
    check (silence_scope is null or silence_scope in ('finding', 'pattern', 'flow'));

create index if not exists findings_silenced_at_idx
  on public.findings (silenced_at)
  where silenced_at is not null;

create index if not exists findings_active_idx
  on public.findings (project_id, severity)
  where silenced_at is null;

-- ── toggle_finding_silence RPC ───────────────────────────────────────────────

create or replace function public.toggle_finding_silence(
  p_finding_id uuid,
  p_silenced   boolean,
  p_reason     text default null,
  p_scope      text default 'finding'
) returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_finding   public.findings;
  v_flow_id   text;
  v_url_path  text;
begin
  if not public.is_team_member() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_scope not in ('finding', 'pattern', 'flow') then
    raise exception 'invalid scope: %', p_scope using errcode = '22023';
  end if;

  select * into v_finding from public.findings where id = p_finding_id;
  if v_finding.id is null then
    raise exception 'finding not found' using errcode = 'P0002';
  end if;

  if p_silenced then
    update public.findings
       set silenced_at    = now(),
           silenced_by    = auth.uid(),
           silence_reason = coalesce(p_reason, ''),
           silence_scope  = p_scope
     where id = p_finding_id;

    if p_scope = 'pattern' then
      select split_part(rs.url_after, '?', 1) into v_url_path
        from public.run_steps rs
       where rs.run_id = v_finding.run_id
         and rs.step_index = v_finding.step_index
       limit 1;

      if v_url_path is not null and v_url_path <> '' then
        update public.findings f
           set silenced_at    = now(),
               silenced_by    = auth.uid(),
               silence_reason = 'auto-silenced via pattern match (' || coalesce(p_reason, '') || ')',
               silence_scope  = 'pattern'
          from public.run_steps rs
         where f.run_id      = rs.run_id
           and f.step_index  = rs.step_index
           and f.project_id  = v_finding.project_id
           and f.heuristic   = v_finding.heuristic
           and f.id          <> p_finding_id
           and f.silenced_at is null
           and split_part(rs.url_after, '?', 1) like v_url_path || '%';
      end if;

    elsif p_scope = 'flow' then
      select r.flow_id into v_flow_id
        from public.runs r
       where r.id = v_finding.run_id;

      if v_flow_id is not null then
        update public.findings f
           set silenced_at    = now(),
               silenced_by    = auth.uid(),
               silence_reason = 'auto-silenced via flow match (' || coalesce(p_reason, '') || ')',
               silence_scope  = 'flow'
          from public.runs r
         where f.run_id      = r.id
           and r.flow_id     = v_flow_id
           and f.project_id  = v_finding.project_id
           and f.heuristic   = v_finding.heuristic
           and f.id          <> p_finding_id
           and f.silenced_at is null;
      end if;
    end if;

  else
    update public.findings
       set silenced_at    = null,
           silenced_by    = null,
           silence_reason = null,
           silence_scope  = null
     where id = p_finding_id;
  end if;
end;
$$;

revoke all on function public.toggle_finding_silence(uuid, boolean, text, text) from public;
grant execute on function public.toggle_finding_silence(uuid, boolean, text, text) to authenticated;
grant execute on function public.toggle_finding_silence(uuid, boolean, text, text) to service_role;
