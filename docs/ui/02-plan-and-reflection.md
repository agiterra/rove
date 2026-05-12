# UI sketch — pre-walk plan + post-walk reflection + surprises

Tracks §0 item #2. Surfaces live in §0 item #6 (run detail page, also shipped this round at v1).

## Walk-time output

The agent emits the same `<<<FINDINGS_JSON>>>` block as today, with three new top-level fields:

```json
{
  "plan": {
    "expected_path": [
      { "step": 1, "description": "Click 'New job' on the dashboard.", "expected_affordance": "button name='New job'" },
      { "step": 2, "description": "Pick a property from the searchable list." },
      { "step": 3, "description": "Pick a date + time." },
      { "step": 4, "description": "Hit Submit and land on the new job's detail page." }
    ],
    "expected_step_count": 4,
    "expected_minutes": 2,
    "biggest_worry": "Property pickers are often the friction point — search may not find by partial name.",
    "authored_before_browser_open": true
  },
  "surprises": [
    {
      "kind": "affordance_missing",
      "step_index": 1,
      "expected": "Primary 'New job' button visible from the dashboard.",
      "observed": "Only a kebab menu in the toolbar exposed it.",
      "recovered": true,
      "recovery_cost_steps": 2
    }
  ],
  "reflection": {
    "goal_reached": false,
    "actual_step_count": 9,
    "largest_expectation_gap": "Expected a primary CTA; spent four clicks discovering the kebab.",
    "confidence_persona_would_succeed": 0.35
  }
}
```

`plan` must be authored before any browser tool call — this is enforced by prompt instruction, not by the parser. `confidence_persona_would_succeed` is asked adversarially per §11.4 ("find the reasons this persona would fail").

## Run detail surface (v1 — see also `06-run-detail-page-v1.md`)

### Hero

```
Goal reached · ✓                 [or]  Goal not reached · ✗
Took 7 steps (expected 4) · 1 dead-click · 2 surprises
```

- Big status word in emerald/rose.
- Step count: predicted-vs-actual with delta arrow.

### Plan-vs-actual two-column timeline

```
  EXPECTED                          ACTUAL
  1. Click "New job" CTA   ───┐
                              ╲       1. Click "New job"      ✓ green
                               ╲      2. … kebab menu         ▲ recovered (amber)
  2. Pick a property       ────┘     3. Type partial name     ✓
  3. Pick date+time         ───────  4. Pick date              ✓
  4. Submit, land on detail  ───┐
                                ╲    5. Submit                ✓
                                 ╲   6. Bounced to list       ✗ unrecovered (rose)
                                  ╲  7. Search list           ✗
```

Implementation:
- Two columns, left = expected steps, right = actual steps (rendered from surprises + a "steps observed" fallback when no surprise pins to a step).
- Curved connector lines drawn with inline SVG between matching expected step and the first actual step that fulfilled it.
- Connector color: emerald when matched cleanly, amber when matched after recovery, rose when matched only by detour, gray when no clean match.
- Each actual-side step is a small chip; surprises attach as pills underneath the step they happened on.

### Reflection paragraph

A short, plain text block under the timeline:

> The novice persona reached the submission, but couldn't tell from the resulting screen that the job was actually created. The biggest gap was the discoverability of "New job" — the persona expected a primary CTA but had to find it in a kebab menu.

This is `reflection.largest_expectation_gap` formatted with the persona's id and the goal_reached state.

### Confidence band

```
   Confidence another novice user would succeed:  ████░░░░░░  35%
```

Single thin bar across the bottom. Emerald above 70%, amber 40–70%, rose below 40%.

## Empty / null behavior

Walks that predate the rollout (no `plan` / `surprises` / extended `reflection`) render:

> _This walk predates the plan-and-reflection rollout. Only findings are available._

Plus the existing findings list. No retrofit, no synthesized plan.
