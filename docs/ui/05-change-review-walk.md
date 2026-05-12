# UI sketch — change-review walk

Tracks §0 item #5 — the (B) headline. Walks a *changed* route under a local
design contract inferred from neighbors, then reports coherence/intent/nav
deltas as findings.

## CLI surface (v1)

```bash
rove change-review \
  --changed-route /clients/new \
  --reference-route /clients \
  --reference-route /clients/:id \
  --goal "Create a new client" \
  --persona first_time_user \
  [--target-url https://your-app.com]
```

- `--changed-route` (1+): routes that were modified, evaluated against the contract.
- `--reference-route` (0+): neighbors the evaluator inspects to *infer* the
  local design contract before judging the changed route. Defaults: the
  parent path of each changed route (e.g. `/clients` for `/clients/new`).
- `--goal`: the persona's stated goal at the changed route.
- Persona defaults to `first_time_internal_user` — a sympathetic but
  uninitiated reviewer.

Run is persisted with `runs.kind = 'change_review'`. The standard `rove run`
command continues to set `kind = 'flow'`.

## Walk phases (in prompt)

1. **Phase 0 — Reference scan.** Navigate to each reference route, take an
   ARIA snapshot, summarize the page's shape in 2–3 sentences (layout,
   primary affordance position, form pattern, density, tone).
2. **Phase 1 — Synthesize the contract.** From those observations, emit a
   `design_contract` JSON: layout_pattern, primary_action_pattern,
   form_pattern, success_pattern, density, tone, navigation_pattern.
3. **Phase 2 — Walk the changed route.** Follow the persona as in any flow
   walk, trying to accomplish `goal`.
4. **Phase 3 — Compare.** Emit `deltas` — one entry per material divergence
   between the contract and what the changed route shows. Each delta is also
   a finding with `heuristic = 'change.<kind>'` so the existing pipeline
   (severity, dedup, GH issues) just works.

## Schema additions

```sql
alter table public.runs
  add column kind             text not null default 'flow'
    check (kind in ('flow', 'change_review')),
  add column changed_routes   jsonb,
  add column reference_routes jsonb,
  add column design_contract  jsonb,
  add column deltas           jsonb;
```

`deltas` shape: `{ kind: 'change.<…>', expected, observed, why_it_matters }[]`.

## New finding category prefix: `change.*`

- `change.navigation_mismatch` — discoverable, but not from where users expect.
- `change.intent_mismatch` — code-correct, product-wrong.
- `change.design_incoherence` — layout/density diverges from neighbors.
- `change.pattern_drift` — new interaction pattern where a local convention exists.
- `change.primary_action_confusion` — main action de-emphasized vs neighbors.
- `change.copy_mismatch` — labels diverge from surrounding vocabulary.

## Dashboard surface

### Hero variant

Change-review runs show:

```
   CHANGE REVIEW    /clients/new
   reference: /clients · /clients/:id          first_time_user
   3 coherence deltas · 2 findings · ✓ goal reachable
```

Style: same `.surface` panel as the flow Hero, but with a "Change Review"
eyebrow instead of "run". Changed routes monospace, reference routes
secondary text below.

### Design Contract section

Renders the inferred contract as a compact two-column readout:

```
   layout_pattern        app shell · compact header · content below
   primary_action        top-right filled button
   form_pattern          labeled inputs in vertical groups, save bottom-right
   success_pattern       toast + redirect to created record
   navigation_pattern    reachable from /clients
   density               dashboard-dense
   tone                  plain operational copy
```

Each row hover-reveals which reference route it was derived from.

### Deltas list

Above (or replacing — TBD) the findings list when `runs.kind = 'change_review'`:

```
✗ change.primary_action_confusion       step 2
  Expected: Top-right filled "Save" button matching /clients/:id
  Observed: Centered "Submit" link below a marketing banner
  Why it matters: A first-time user scans the top-right edge first.

▲ change.navigation_mismatch            step 1
  Expected: "New client" reachable from /clients via a toolbar button
  Observed: Only discoverable via Settings → Accounts → New
```

Each delta links to the matching finding row (`change.<kind>` heuristic) so
the existing drawer + lifecycle controls just work.

## Out of scope for v1

- Inferring `--reference-route` from `git diff` against `main`.
- Auto-running on every PR (Phase E).
- Visual-diff rendering of contract-vs-route (we measure semantic deltas,
  not pixel deltas).
- Multi-changed-route batching with a single design contract (v2: shared
  contract across all changed routes in the same "section").
