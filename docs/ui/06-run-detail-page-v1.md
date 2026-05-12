# UI sketch — run detail page v1

Tracks §0 item #6 (minimal version). Shipped early because §0 item #2 needs a home.

Route: `/runs/[id]`.

## Layout

Single page, scrolls vertically. Three regions stacked, each in a `.surface` panel:

```
┌──────────────────────────────────────────────────────────────────┐
│  ← all runs                                                       │
│                                                                   │
│  ┌──────────────── HERO ────────────────────────────────────────┐│
│  │ flow.create_job  ·  novice_end_user · claude-code-cli         ││
│  │                                                                ││
│  │ Goal reached · ✓     7 steps (expected 4)   2 surprises  ··· ││
│  │                                                                ││
│  │ branch: feat/wizard · 4c8e2a1  ·  walked 2 min ago             ││
│  └────────────────────────────────────────────────────────────────┘│
│                                                                   │
│  ┌──────────────── PLAN vs ACTUAL ──────────────────────────────┐│
│  │  (the two-column timeline from 02-plan-and-reflection.md)     ││
│  └────────────────────────────────────────────────────────────────┘│
│                                                                   │
│  ┌──────────────── REFLECTION ─────────────────────────────────┐ │
│  │  Largest expectation gap: …                                   │ │
│  │  ███████░░░  Confidence:  35%                                 │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌──────────────── FINDINGS (4) ───────────────────────────────┐ │
│  │  Reuses the existing /findings list row + FindingDrawer.      │ │
│  └───────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

## What it does NOT have yet

- Per-step ARIA snapshots (§0 item #4).
- Per-step screenshots inline in the timeline (§0 item #4).
- Change-review delta panel (§0 item #5).
- Trajectory metrics strip — snapshots-per-action, dead-clicks (§0 item #4).

These land as #4 and #5 ship; the timeline component is the slot they fill.

## Linking

- `/runs` rows become full-row links to `/runs/[id]`.
- `/flows/[id]` does not link to runs yet — that's a follow-up.

## Empty state

Legacy runs without plan/reflection render the hero (using whatever fields are non-null: goal_reached if present, otherwise just step count and timing), skip plan-vs-actual entirely, render the findings list. The skipped section explains itself with one line of empathetic copy, not a 404.
