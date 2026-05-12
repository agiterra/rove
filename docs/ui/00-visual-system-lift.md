# UI sketch — visual system lift, run detail polish

Brian asked: "we are a ui/ux team, we need legit solid ui/ux. Give it some
major love." This is §17.5 in the review doc as a verb: stop building
chrome and start building presence.

## What's wrong with what we have

Everything *works*. Nothing *insists*. The run detail page reads as
"competent dashboard chrome" — same vocabulary as Linear / Vercel /
Supabase. For a product whose entire claim is "we are uniquely opinionated
about UX," that's a credibility tax.

Specifics:

- The Hero's outcome ("Goal reached ✓") is a same-size word among siblings.
  In a product whose only number that matters is whether the goal was reached,
  that line should be the visceral first impression — confident, glowing.
- The trajectory is 30 rows of monochrome text. Functional. Soulless.
  No glance-readable summary of the *shape* of the walk.
- Change-review deltas read as bordered boxes. They are the headline
  content of the (B) pitch — they should feel pinned to a moment, with
  weight.
- The dashboard has no consistent eyebrow/label typography. Each section
  re-invents the same `text-[10px] uppercase tracking-[0.16em]` triplet.
- No depth language. `.surface` is one rounded card recipe; everything
  flattens to the same plane.
- No focus / hover language beyond hover-bg shifts. Doesn't feel kinetic.

## What lifts in this pass

### 1. New primitive utilities in `globals.css`

- `.eyebrow` — the uppercase 11px tracking-wide label, centralized.
- `.surface-elevated` — hero-tier panel with a soft inner top highlight +
  brand-tinted base shadow. Reserve for the page-1 panel of any view.
- `.glow-accent` / `.glow-rose` — outer aura for the outcome pill so
  "Goal reached" / "Goal not reached" reads at 20 ft.
- `.divider-grad` — a 1px line that fades from a brand-tinted center.
- `.kinetic-hover` — composable transform-+-bg transition class for rows
  + cards.

### 2. Hero redesign

Both flow and change-review heroes go from "info card" to "page banner."

```
   ┌───────────────────────────────────────────────────────────────┐
   │  eyebrow: RUN · flow                                           │
   │                                                                │
   │  flow.create_job  ▾  novice_end_user                           │
   │                                                                │
   │      Goal reached ✓                                            │  ← 48-56px display
   │      ─────────────                                             │
   │  7 steps (predicted 5)  ·  1 dead-click  ·  2 surprises        │
   │                                                                │
   │  feat/wizard · 4c8e2a1 · started 2 min ago · rove-agi…/signin  │  ← micro footer
   └───────────────────────────────────────────────────────────────┘
```

- Glow ring on the outcome word (cyan or rose).
- Display-weight 48–56px on outcome line.
- Stat row inline with subtle bullet separators, no boxes around each.
- Metadata becomes a one-line monospace footer ribbon.

### 3. Trajectory filmstrip

A horizontal dot strip above the detailed list. Each dot = one tool call,
colored by kind:

- accent (cyan) — action (navigate/click/type)
- accent-2 (blue) — snapshot
- text-muted — screenshot / passive
- amber — retry / recovery
- rose — error

Dots animate-in on first render. Hovering a dot highlights the matching
row below. The strip is the "shape of the walk" at a glance — for a
30-step walk it's the difference between *reading* the trajectory and
*seeing* it.

### 4. Trajectory row lift

- Replace `font-mono` arg blob with a single legible chip showing the
  most informative arg (url / name / ref).
- Add a thin left-edge tint by tool kind matching the filmstrip.
- Better hover: row lifts on its own surface, not just a bg shift.

### 5. Change-review deltas as moments

Each delta becomes a richer card:

- Severity-tinted ring (not just border)
- Eyebrow row: severity label · step pin · kind
- Two-column expected/observed with a vertical divider
- Why-it-matters as a quoted callout below
- Future: inline screenshot for the step (item #2 from inventory)

### 6. Plan-vs-actual connectors

The current vertical-rail approach is correct conceptually but the rails
fade too much. Brighter rails with a small chip at each connection
point. Curved SVG joiners between columns deferred (cost > value for v1).

### 7. Aurora background on the run detail page

A subtle radial-gradient at the top of the run detail page — same
cyan→navy that the body already has, but stronger near the hero. Makes
the page-1 panel feel atmospheric without being noisy.

### 8. Runs list lift

Keep the table; lift the typography + spacing + add a per-row sparkline
of finding severities. Each row's goal-glyph becomes more present (still
the existing GoalGlyph, just larger).

## What we deliberately don't touch in this pass

- `/findings` drawer (separate dedicated pass when lifecycle controls land).
- `/flows/new` + `/personas/new` wizards (those are Brian's in-flight UI).
- The signin page (already strong).
- Header / nav (functional, doesn't pull focus).
- Mobile breakpoints below `sm:` (we're not mobile-first; the dashboard
  is internal-tool).

## Definition of done

- The run detail page reads as "this product is opinionated" within 2s
  of first glance.
- A 30-step trajectory can be summarized by looking at the filmstrip
  without reading any row.
- The change-review hero + deltas section makes the (B) demo legible
  without speaking.
- Nothing in the dashboard regresses or breaks; new primitives are
  additive.
