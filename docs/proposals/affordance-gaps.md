# Affordance Gaps — the agent perceives negative space

**Status**: Proposal · 2026-05-14 · Alex (Brian's agent)
**Heuristic family**: `agent.affordance_gap.*`
**Sprint**: Next sprint (see `docs/BACKLOG.md`)

## The wedge

Agents that *build* apps cannot see negative space. The page they wrote
EXISTS to them; the missing Delete button DOES NOT EXIST to them.
There is no token in their output that represents *absence*. This is
why the same agent can ship a polished `DELETE /api/properties/:id`
endpoint and a property detail page with no Delete button. The backend
has C, R, U, D because the data model has C, R, U, D. The UI has C and
R because the user *named* C and R in the request.

This is not an LLM-specific failure mode. Humans coding alone do it
too — the difference is that humans use the app afterward and notice.
Agents don't. So as agents take over more of app construction, the
gap widens.

Agents that *walk* apps, however, can perceive negative space — if
prompted correctly. A persona walking onto a page with a goal in mind
can enumerate "what should a user with this goal be able to do here?"
Compared against what is actually possible on the page, the missing
items ARE the negative space. We capture that as findings.

This is the most direct counter-attack on the "agent built it, agent
shipped it, user gets a half-finished UI" pathology that increasingly
defines AI-assisted app development.

## Heuristic family

```
agent.affordance_gap.create     — list page has no "+ New" or equivalent
agent.affordance_gap.read       — created entity has no detail view
agent.affordance_gap.update     — detail page has no Edit affordance
agent.affordance_gap.delete     — most common gap; CRUD-asymmetry
agent.affordance_gap.undo       — destructive action with no Undo / revert
agent.affordance_gap.recover    — error state with no retry / clear-error path
agent.affordance_gap.navigate   — page with no obvious way back / out
agent.affordance_gap.status     — async action with no loading / progress / outcome
agent.affordance_gap.confirm    — destructive action with no confirmation step
agent.affordance_gap.save_state — long form with no auto-save / loss-of-work warning
agent.affordance_gap.empty      — empty list with no onboarding CTA
agent.affordance_gap.error      — error with no human-readable cause
```

Severity per gap is a function of (a) reversibility of the missing
operation and (b) what a user with this goal would feel. Missing
Delete on the only place that data appears = `critical`. Missing
auto-save on a 12-field form = `high`. Empty state without CTA =
`medium`. Missing Undo on a soft-toggle = `minor`.

## What distinguishes this from `expectation-match`

`expectation-match` operates at **journey** granularity — "I expected
the route to go `/menu → /cart`; instead I got `/menu → /sign-in →
/cart`." It captures route shape, archetype, friction-anticipation.

`affordance-gap` operates at **page** granularity — "I am on the
property detail page; I expected to be able to delete this property
from here; I cannot." It captures completeness of the affordance set
at each station in the journey.

The two compose. A walk can have perfect plan-vs-reality (every step
matched the prior journey) and still surface affordance gaps at each
station. They are different cognitive moments for the persona and
different prompt phases.

| | `expectation-match` | `affordance-gap` |
|---|---|---|
| Granularity | Journey-level (between pages) | Page-level (within a page) |
| Captured when | Plan emitted once before walk; verdicts per step | At each substantive page |
| Question asked | "Did the shape match my prior?" | "Is everything I'd need to do here possible?" |
| Best at finding | Route-archetype mismatches, surprise friction, copy-divergence | Missing buttons, missing undo, no save-state, empty states |
| Storage | `runs.prior_plan` + `run_steps.plan_delta` | `run_steps.affordance_gaps` |

## What the agent already produces (and we throw away)

When a persona arrives at a substantive page with a goal, the agent
*already* internally evaluates "what can I do here?" — that's how it
chooses its next tool call. But the evaluation is *narrow*: it scans
for the affordance that advances its current step, not for the full
inventory a user would need.

The unlock is asking the agent, ONCE per substantive page, to broaden
the question. "Forget your current step for a moment. As this persona,
on this page, with this goal — enumerate the affordances a user would
need here. Then check which are present." The work is mostly already
done; we just direct it at completeness rather than at the next click.

## Mechanism

### 1. Per-page enumeration phase (new prompt instruction)

At the first arrival to each substantive page (defined: page with
non-trivial DOM content; excludes loading states, transient redirects,
404s, sign-in walls already flagged elsewhere), the walk prompt
inserts:

> Before continuing your task, take stock of where you are. You are
> on `<URL>` as the `<persona>` persona pursuing `<goal>`.
>
> Enumerate the affordances a user with this goal would expect to be
> able to perform on this page. For each one, indicate whether it is
> present (give the aria target) or absent (explain what's missing).
> Include create, read, update, delete, undo, recover, navigate,
> status, confirm, save_state, empty, and error affordances *to the
> extent each is relevant for your current page and goal*. Do not
> force-fit categories that don't apply.
>
> When done, return to your task.

The persona returns a structured `affordance_gaps` list (only the
gaps, not the matches — matches are silent):

```yaml
affordance_gaps:
  - kind: "delete"
    expected_for: "internal-user managing the property they just created"
    severity: "critical"
    evidence: "Detail page exposes Edit (button[ref=e42]) and Share (button[ref=e44]) in the toolbar; no Delete affordance found in toolbar, overflow menu, or settings panel. The destructive operation appears unsupported from this view."
    suggested_location: "Toolbar overflow menu next to Share, with confirmation"
```

### 2. Per-step storage

```sql
alter table public.run_steps
  add column if not exists affordance_gaps jsonb;

create index if not exists run_steps_affordance_gap_kinds_idx
  on public.run_steps using gin ((affordance_gaps -> 'kinds'));
```

The `affordance_gaps` jsonb is `[{kind, expected_for, severity,
evidence, suggested_location}]`. Each entry auto-files a finding
under `agent.affordance_gap.<kind>` with severity inherited and
evidence pasted.

### 3. Throttling

Re-arriving at the same URL within the same walk does NOT trigger
re-enumeration. The first arrival captures the inventory; subsequent
visits skip the phase. A `run_steps.affordance_enum_phase boolean`
column tracks whether the phase ran. Same flow walked again across
runs DOES re-enumerate (catches changes).

### 4. Persona-aware enumeration

The persona's `category` + `expertise` + `prior_archetype` (see
`expectation-match.md`) directly affect what the persona expects:

- An `accessibility` persona enumerates the keyboard-equivalent of
  each affordance (e.g. "Delete via Shift+Del or via toolbar
  button"); missing keyboard path is itself a gap.
- A `mobile` persona expects affordances at thumb-reachable positions
  and flags affordances that exist only on hover.
- An `agent` persona enumerates affordances that are programmatically
  identifiable (stable selectors, semantic roles) and flags
  affordances that exist visually but lack accessibility-tree presence.
- A `novice` end-user expects discovery-friendly placement; an
  `expert` end-user accepts keyboard-shortcut-only access.

The same page surfaces different gap sets per persona. That diff is
itself useful intelligence.

### 5. Flow-author overrides

Flow YAML grows optional `affordance_exclusions`:

```yaml
affordance_exclusions:
  - url_pattern: "/properties/[id]"
    do_not_expect: ["delete"]
    reason: "Delete is intentionally only available from the list view"
  - url_pattern: "/checkout"
    do_not_expect: ["navigate"]
    reason: "Checkout deliberately suppresses navigation chrome"
```

Author-asserted exclusions silence the auto-finding but log a note
("affordance silenced by flow override") so a future reviewer can
re-evaluate.

## Schema

**Migration**:
`infra/supabase/supabase/migrations/<timestamp>_affordance_gaps.sql`

```sql
alter table public.run_steps
  add column if not exists affordance_enum_phase boolean default false,
  add column if not exists affordance_gaps jsonb;

create index if not exists run_steps_affordance_gap_kinds_idx
  on public.run_steps using gin (affordance_gaps);
```

Findings table needs no change — `heuristic_id text` already accepts
`agent.affordance_gap.<kind>` values; the lens filter on
`/findings?lens=agent` already groups by `agent.*` prefix.

## Dashboard surface

**`/runs/[id]` per-step detail pane**: a new "Affordance inventory"
section, below the aria-tree pane. Two columns: "expected here"
(checkmark for present, X for absent) and "evidence." Absences are
colored by severity. This is the most direct in-context view of why
a finding fired.

**`/runs/[id]` Reflection tab**: a "Negative space" section listing
all gaps surfaced during the walk, grouped by `kind`. Hero-level
stat: "Walk surfaced N affordance gaps across M substantive pages."

**`/findings`**: existing `agent` lens already includes these. Add a
secondary chip filter `affordance_gap` for direct access. Findings
detail pane shows the `suggested_location` field prominently — this
is the part most actionable for the consumer's dev team.

## Sequencing

1. **Day 1** — migration + per-step `affordance_gaps` column; mock
   data integration in `mock-data.ts`; UI section in DetailSplit.
2. **Day 2 morning** — prompt instruction in `packages/core/src/prompt.ts`;
   wire the enumeration phase to substantive-page detection.
3. **Day 2 afternoon** — auto-finding emission from the per-step
   jsonb; severity inference per kind; Reflection-tab "Negative space"
   section.
4. **Day 3 morning** — persona-aware enumeration nuances per category;
   `affordance_exclusions` flow-YAML field + schema validation.
5. **Day 3 afternoon** — dogfood on Rove's dashboard: walk
   `/projects/new` → `/runs` → `/runs/[id]`, see what gaps a fresh
   persona surfaces about *our own* product. (Expected: we ship a
   "Delete this run" gap somewhere.)

## Open questions

- **Enumeration cost**: ~400-700 tokens per substantive page. Walks
  with 30 substantive pages get expensive. Mitigation: only enumerate
  on the first arrival per URL per walk (throttling above), and only
  when the page passes a "substantive" check (≥ N nodes, has primary
  content region, not a redirect/loading state). Estimated worst-case
  walk cost increase: 30-40%.
- **False-positive gaps**: the persona will sometimes hallucinate an
  expectation that the consumer intentionally excludes. The flow-YAML
  `affordance_exclusions` is the primary mitigation; we also add a
  "downvote this expectation" affordance in the dashboard that
  contributes to a learned `affordance_corrections` table for future
  walks of the same project.
- **Interaction with `expectation-match`**: at the per-page granularity,
  a missing affordance might already be captured as an
  `expectation-match.affordance` deviation. De-duplicate by route+kind
  at finding-emission time.
- **Cross-persona aggregation**: should we surface "this gap was
  flagged by 3 of 5 personas walking this page"? Phase D2 — not in v1.

## Why this is the wedge

The category-defining failure mode of AI-assisted app development is
*the back-end exists, the front-end is incomplete*. The Delete
function ships; the Delete button does not. The auto-save logic could
trivially be added; the save-state indicator is not. The error
handler logs; the user sees nothing.

This pattern is going to define the next five years of "agents built
my product." Rove can be the system that catches it because Rove
deploys agents AS USERS — and a user perceives negative space, while
a builder agent does not.

No deterministic test framework can produce these findings. The
inventory is goal-shaped, persona-shaped, archetype-shaped. Scripts
don't carry those. Agents do — they just need to be asked.

This is the most direct expression of Rove's wedge: **two-sided
readiness, measured by the apparatus that can actually feel the
gaps.**
