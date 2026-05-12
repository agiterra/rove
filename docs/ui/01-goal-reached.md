# UI sketch — `goal_reached`

Tracks §0 item #1. Wireframe before code, per §17.4.

## Walk-time output

Agent emits, as part of the findings JSON, a new `reflection` block:

```json
{
  "flow_id": "...",
  "persona_id": "...",
  "findings": [...],
  "reflection": {
    "goal_reached": true
  }
}
```

`reflection.goal_reached` is the canonical home; item #2 (plan + reflection) adds siblings under it later.

## Dashboard surfaces

### `/runs` — list table

Add one column between **Findings** and **Status**: header **Goal**. Cell is one of:

```
✓   (emerald, when reflection.goal_reached === true)
✗   (rose,    when reflection.goal_reached === false)
—   (faint,   when null / legacy row)
```

Wrap the glyph in a `<span title="...">` so the hover surfaces "Goal reached" / "Goal not reached" / "Pre-`goal_reached` walk".

### `/flows/[flowId]` — hero stat strip

Insert one new tile, leftmost, in the existing 5-up grid (becomes 6-up; the strip already wraps on small screens).

```
goals reached
   7 / 9
    78%
```

- Big number: reached / total over the loaded run window.
- Sub-label: percent.
- Null walks excluded from both numerator and denominator.
- Color: emerald when ≥ 80%, amber 50–79%, rose < 50%, faint when zero non-null walks.

### Run detail page (item #6, not now)

When that page lands it gets the hero line: "Goal reached in 7 steps." For now, `/runs` and `/flows/[id]` carry the signal.

## Empty / null behavior

Existing rows have no `goal_reached` value — they render `—` with the hover explanation. We do not backfill; the gap is honest signal that walks pre-date the measurement.
