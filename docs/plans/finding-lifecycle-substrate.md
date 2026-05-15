# Finding-lifecycle substrate

**Status**: Proposal · 2026-05-14 · Alex (Brian's agent)
**Sprint**: Next sprint — **Day 1 foundation** (see `_sprint.md`)
**Heuristic family**: N/A — this is substrate, it doesn't produce findings; it lets the others land cleanly.

## Why this is substrate, not a feature

Both next-sprint proposals (`expectation-match.md`, `affordance-gaps.md`) depend on four primitives:

1. The ability to silence / un-silence a finding with a reason (and confirm on critical)
2. The ability to send a finding to a GitHub issue with one click
3. A reusable trend chart parameterized by heuristic prefix
4. Shared empty / loading / error state primitives for finding-bearing surfaces

These were originally drafted across two parallel "UX plan" sections in the downstream proposals. They are the *same four primitives* in each. Building them twice would be the textbook case of the negative-space pathology that `docs/theses/negative-space.md` warns about — the builder doesn't see the duplication because each proposal's positive output looks complete in isolation.

Build the substrate once. Both downstream proposals consume it. The walker audit (`docs/audits/2026-05-14-sprint-plan-walker-audit.md` F2) named this gap explicitly; this doc closes it.

## Mechanism

### 1. Schema migration

```sql
-- infra/supabase/supabase/migrations/20260514100000_finding_lifecycle.sql

alter table public.findings
  add column if not exists silenced_at timestamptz,
  add column if not exists silenced_by uuid references auth.users (id),
  add column if not exists silence_reason text,
  add column if not exists silence_scope text;  -- 'finding' | 'pattern' | 'flow'

create index if not exists findings_silenced_at_idx
  on public.findings (silenced_at)
  where silenced_at is not null;

create index if not exists findings_active_idx
  on public.findings (project_id, severity)
  where silenced_at is null;
```

`silenced_at is null` → finding is active and counts toward dashboard stats / trend charts. Setting `silenced_at = now()` silences. Clearing returns to active.

`silence_scope` semantics:
- `finding` — silence only this row
- `pattern` — silence all findings matching `(heuristic_id, url_prefix)` — applied via a trigger that propagates the silence forward to new findings matching the pattern
- `flow` — silence all findings for `(flow_id, heuristic_id)` regardless of URL

The default scope is `finding`. Pattern and flow scopes are advanced affordances; surface them in the "Silence reason" popover as secondary radio options.

### 2. RPC

```sql
create or replace function public.toggle_finding_silence(
  p_finding_id uuid,
  p_silenced boolean,
  p_reason text default null,
  p_scope text default 'finding'
) returns void
language plpgsql
security definer
as $$
declare
  v_finding public.findings;
begin
  if not is_team_member() then
    raise exception 'not authorized';
  end if;

  select * into v_finding from public.findings where id = p_finding_id;
  if v_finding.id is null then
    raise exception 'finding not found';
  end if;

  if p_silenced then
    update public.findings
       set silenced_at = now(),
           silenced_by = auth.uid(),
           silence_reason = coalesce(p_reason, ''),
           silence_scope = p_scope
     where id = p_finding_id;

    -- Pattern + flow scopes propagate to existing matching findings
    if p_scope = 'pattern' then
      update public.findings
         set silenced_at = now(),
             silenced_by = auth.uid(),
             silence_reason = 'auto-silenced via pattern match (' || coalesce(p_reason, '') || ')',
             silence_scope = 'pattern'
       where project_id = v_finding.project_id
         and heuristic_id = v_finding.heuristic_id
         and url like (split_part(v_finding.url, '?', 1) || '%')
         and silenced_at is null;
    elsif p_scope = 'flow' then
      update public.findings
         set silenced_at = now(),
             silenced_by = auth.uid(),
             silence_reason = 'auto-silenced via flow match (' || coalesce(p_reason, '') || ')',
             silence_scope = 'flow'
       where project_id = v_finding.project_id
         and heuristic_id = v_finding.heuristic_id
         and flow_id = v_finding.flow_id
         and silenced_at is null;
    end if;
  else
    -- Un-silence: clear all four columns. Does NOT un-silence pattern/flow siblings.
    update public.findings
       set silenced_at = null,
           silenced_by = null,
           silence_reason = null,
           silence_scope = null
     where id = p_finding_id;
  end if;
end;
$$;

revoke all on function public.toggle_finding_silence(uuid, boolean, text, text) from public;
grant execute on function public.toggle_finding_silence(uuid, boolean, text, text) to authenticated;
```

### 3. React components

Location: `apps/dashboard/components/finding-lifecycle/`

```
FindingSilenceButton.tsx       — toggle silence; opens popover for reason + scope; confirms on critical
FindingSendToIssueButton.tsx   — opens GitHub via the existing GitHub App; one click
FindingTrendChart.tsx          — generic time-series by heuristic prefix
FindingEmptyState.tsx          — onboarding-friendly empty state; surface-keyed copy
FindingLoading.tsx             — shared loading shell
FindingError.tsx               — shared error shell with retry
index.ts                       — barrel; cap 6 re-exports per coding-standards
```

**Component contracts:**

```tsx
<FindingSilenceButton
  finding={finding}
  onChange={(silenced) => void}
  /** Default true. When false, skips the confirm step entirely. */
  confirmOnCritical?: boolean
/>

<FindingSendToIssueButton
  finding={finding}
  repo={{ owner, name }}   // resolved from project config; pass null to disable
  onCreated={(issueUrl) => void}
/>

<FindingTrendChart
  projectId={string}
  heuristicPrefix={string}   // e.g. "agent.affordance_gap"
  windowDays={number}        // default 30
  bucket={'day' | 'week'}    // default 'day'
/>

<FindingEmptyState
  surface={'affordance_gaps' | 'expectation_match' | 'findings' | 'gaps_rollup' | 'trend'}
  projectId={string}         // for the "run your first walk" CTA
/>

<FindingLoading  hint?={string} />
<FindingError    error={Error}  retry={() => void} />
```

### 4. Send-to-GitHub-issue action

`apps/dashboard/lib/findings/send-to-issue.ts` — server action.

```ts
export async function sendFindingToIssue(input: {
  findingId: string;
  repo: { owner: string; name: string };
}): Promise<{ issueUrl: string }>;
```

Reuses the existing GitHub App credentials (`ROVE_GITHUB_APP_*`). Constructs:

- **title**: `[Rove] ${finding.heuristic_id} on ${finding.url}`
- **body**: structured markdown with severity badge, evidence quote, `suggested_location`, walk back-link, persona, flow context
- **labels**: `rove`, severity-based (`severity:critical` / `severity:high` / `severity:medium` / `severity:minor`), heuristic-family-based (`heuristic:affordance_gap`, etc.) — labels created on first use, idempotent

Errors surface inline in `<FindingSendToIssueButton>` via the `FindingError` shell.

## Dashboard wiring

The substrate components don't render anywhere by themselves. They are dropped into:

- **`/runs/[id]` finding stream**: silence + send-to-issue buttons on each finding card
- **`/findings` (detail drawer)**: silence + send-to-issue buttons in drawer
- **`/projects/[id]/gaps`** (new route from affordance-gaps): trend chart, empty state
- **`/projects/[id]`** (project overview): trend chart for any heuristic family

Wiring lives in each consumer surface; substrate provides only the components and the action.

## Definition of done

- [ ] Migration `20260514100000_finding_lifecycle.sql` applied to local + hosted Supabase
- [ ] `toggle_finding_silence` RPC callable from dashboard with team-member auth
- [ ] All five React components render under populated, empty, loading, and error states (mock data in `mock-data.ts`)
- [ ] `<FindingSilenceButton>` shows a confirm step before silencing a `severity === 'critical'` finding
- [ ] `<FindingSendToIssueButton>` creates a real GitHub issue against `agiterra/rove` test repo with the documented title/body shape, returns the issue URL, surfaces errors inline
- [ ] `<FindingTrendChart>` renders three series (counts by severity) over a 30-day window using mock data — visually correct on dark theme
- [ ] **First-consumer test**: at least one downstream proposal (affordance-gaps OR expectation-match) consumes the substrate before substrate is "done" — the test of substrate is its first user
- [ ] No Rove-on-Rove walker audit findings of severity ≥ high against these components

## Open questions

- **Pattern silence URL match shape** [non-blocking, default: prefix match on `split_part(url, '?', 1)`]: should pattern silence match exact URLs, prefix, or regex? Default prefix. Revisit if false-silencing surfaces in dogfood.
- **Issue export — editable before send?** [non-blocking, default: one-click read-only export, no edit step]: ship one-click; add an edit-before-send overlay only if a consumer asks.
- **Trend chart aggregation** [non-blocking, default: 30 days × daily buckets]: window and granularity are props; defaults set per-page by the consumer surface.
- **Bulk silence / bulk send-to-issue** [deferred to Phase D2]: the downstream proposals' UX plans both mention bulk actions; substrate ships single-finding ops; bulk is a follow-up that composes these primitives.

## Why this exists as a separate doc

Per the walker audit F2: both downstream proposals reference these primitives as if specified somewhere. Specifying them in one place rather than two prevents the "contract lives in three places that almost agree" failure mode. This doc is the single source of truth for the silence + issue + trend + state-shell contracts.

When either downstream proposal wants to change the contract, the change lands here first, then the downstream proposals adopt. Drift is detected by the type system, not by reading three docs and comparing.
