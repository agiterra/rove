# UI sketch — trajectory (tool-call telemetry)

Tracks §0 item #4. The actual measurement layer. Persists what the agent *did*,
not what it *said it did*.

## Capture layer (no UI)

A small Node script (`packages/cli/bin/playwright-mcp-proxy.mjs`) fronts
`@playwright/mcp` over stdio. It pipes JSON-RPC between Claude (parent) and
the real MCP server (child), tee-ing every line to a per-walk JSONL log at:

```
<reportsDir>/agentic-walks/<runId>/trajectory.jsonl
```

The dispatcher always writes its MCP config pointing at this proxy. After the
walk completes the sink reads the JSONL, derives one `run_steps` row per
*tool call*, and updates `runs.metrics`.

## Schema additions

```sql
create table public.run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs(id) on delete cascade,
  project_id text not null,
  step_index int not null,
  direction text not null check (direction in ('call','result','error')),
  tool_name text,        -- e.g. 'browser_click'; null for non-tool messages
  args jsonb,            -- request params for direction='call'
  result_summary text,   -- short string version of result (full text in aria_snapshot etc.)
  aria_snapshot text,    -- for browser_snapshot results
  screenshot_key text,   -- storage key if a screenshot was captured this step
  url_after text,
  duration_ms int,
  created_at timestamptz not null default now()
);

alter table public.runs add column metrics jsonb;
-- { actual_tool_calls, snapshots, actions, dead_clicks, recovery_count,
--   snapshots_per_action, time_to_first_action_ms }
```

`actual_tool_calls` becomes the canonical actual step count — distinct from
the agent's self-reported `actual_step_count` which becomes a sanity check.

## Run detail surface

A new section on `/runs/[id]`, slotted between **plan vs actual** and
**reflection**:

```
─── TRAJECTORY ──────────────────────────────────────────────────────────
   28 tool calls · 11 snapshots · 9 actions · 0.81 snapshots/action
   ───────────────────────────────────────────────────────────────────────
    1  navigate     http://localhost:3000                     CONN_REFUSED
    2  navigate     http://localhost:3030                     200
    3  snapshot                                               9.2 KB
    4  click        button name='Continue with GitHub'        no nav
    5  snapshot                                               9.2 KB
    …
```

- Compact monospace, one row per tool call.
- Columns: step #, tool name, target/args summary, outcome shorthand.
- Hover reveals the full args + result.
- Click expands to show the full ARIA snapshot inline (for the side-by-side
  view that lands in a follow-up).
- The aggregate stat strip above the list mirrors the §11.3 metrics table.

## What it does NOT yet do

- Dead-click classification (requires diffing consecutive ARIA snapshots —
  follow-up).
- Side-by-side ARIA + screenshot per step (the §11.1 demo — built on this
  data layer next).
- Selector retries inference (consecutive click→snapshot→click on the same
  target — follow-up).

## Empty / null

Walks predating this rollout (or that bypass the proxy somehow) render:

> _No trajectory captured for this walk._

— honest, not a 404.
