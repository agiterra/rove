# Negative-space wedge sprint (historical)

**Sprint goal**: ship the operationalization of [`docs/theses/negative-space.md`](../theses/negative-space.md) so that a Rove walker can perceive negative space in any app, and so that consumers can triage / silence / ship the resulting findings.

**Status**: ✅ **Shipped 2026-05-14** (alpha.17). Validated end-to-end by run `849bc08b` — `prior_plan_captured_at` populated AND `agent.affordance_gap.navigate` finding filed.
**Owner**: Brian + Alex.
**Read first** (still relevant): [`docs/theses/negative-space.md`](../theses/negative-space.md). The pre-ship check at [`.claude/rules/pre-ship-check.md`](../../.claude/rules/pre-ship-check.md) codifies the closing instruction of the thesis.

This was the kickoff entry point for the sprint. All six items below shipped. Document retained as a historical record + per-item link tree.

---

## Items in build order

### Day 1 — Substrate (foundation)
**Doc**: [`finding-lifecycle-substrate.md`](finding-lifecycle-substrate.md)
**Why first**: both downstream proposals consume the silence / send-to-issue / trend-chart / state-shell primitives this provides. Building them downstream would duplicate the contract in three places.
**Delivers**:
- Migration `20260514100000_finding_lifecycle.sql` (silence columns + RPC)
- 5 components in `apps/dashboard/components/finding-lifecycle/`
- Server action `apps/dashboard/lib/findings/send-to-issue.ts`
**DoD**: see substrate doc.

### Day 2-3 — Affordance gaps (page-level wedge)
**Doc**: [`affordance-gaps.md`](affordance-gaps.md)
**Why second**: page-level is more concrete than journey-level; debugging on real walks is easier.
**Delivers**:
- Migration `20260514110000_affordance_gaps.sql`
- Walk-prompt per-substantive-page enumeration phase
- `<DetailSplit>` Affordance inventory section
- Reflection tab Negative space section
- **New route** `apps/dashboard/app/projects/[id]/gaps/page.tsx` + `layout.tsx`
- Top-nav entry for `/projects/[id]/gaps`
- Flow YAML `affordance_exclusions` + zod schema
- Dogfood walk: `examples/flows/dashboard-find-and-delete-run.flow.yaml`
**DoD**: see affordance-gaps doc.

### Day 4-5 — Expectation match (journey-level wedge)
**Doc**: [`expectation-match.md`](expectation-match.md)
**Why third**: builds on the substrate AND on patterns established in affordance-gaps (same component reuse, same dogfood discipline).
**Delivers**:
- Migration `20260514120000_expectation_match.sql`
- Plan-capture phase in walk prompt before first `browser_navigate`
- Per-step verdict emission
- Filmstrip verdict chips
- Reflection tab Plan vs reality section
- Archetype configurator on `/projects/[id]`
- Flow YAML `prior_overrides`
- Dogfood walk: `examples/flows/dashboard-setup-new-project.flow.yaml`
**DoD**: see expectation-match doc.

### Day 5.5 — `browser_press_key` for accessibility + agent personas
**BACKLOG line**: see Next sprint section.
**Why fits here**: small surgical change; lives after the big two so we don't burn focus on it during foundation work.
**Delivers**:
- `browser_press_key` exposed via walk prompt (persona-conditional guidance)
- Flow YAML `expected_keyboard_navigation`
- Auto-finding when focus disappears or tab order skips a stated step

### Day 6 — Native dialogs as first-class run artifacts
**BACKLOG line**: see Next sprint section.
**Why last**: useful but lower-leverage than the negative-space wedge; ship after the main work is solid.
**Delivers**:
- MCP proxy registers `page.on("dialog", …)`
- Persona constraint `native_dialog_policy`
- Flow YAML `expectations.native_dialog`
- Filmstrip dialog chip + reflection-tab surprise category

---

## Migration order

The four migrations don't have hard SQL dependencies on each other, but the substrate **must ship first** because it adds the `findings.silenced_at` column that both downstream UIs rely on. Numbered timestamps lock the order:

| Order | Filename | Owner |
|---|---|---|
| 1 | `20260514100000_finding_lifecycle.sql` | substrate |
| 2 | `20260514110000_affordance_gaps.sql` | affordance-gaps |
| 3 | `20260514120000_expectation_match.sql` | expectation-match |
| 4 | `20260514130000_native_dialogs.sql` | native dialogs |

(`browser_press_key` requires no migration — `expected_keyboard_navigation` lives in flow YAML.)

Run with `supabase db push` from `infra/supabase/` after each lands.

---

## `Persona.constraints` union — one planned diff

This sprint adds two fields to `PersonaConstraints` in `packages/core/src/types.ts`. Plan the diff once; apply twice:

```ts
export interface PersonaConstraints {
  // existing
  shortcuts_allowed: boolean;
  hovers_allowed: boolean;
  retries_per_step: number;
  agent_runtime?: AgentRuntime;

  // NEW — from expectation-match
  prior_archetype?:
    | "shopify-style-commerce"
    | "doordash-style-aggregator"
    | "single-restaurant-direct"
    | "saas-dashboard"
    | "marketplace"
    | "auto";

  // NEW — from native dialogs
  native_dialog_policy?:
    | "perceive_and_act"   // humans — surface dialog text as observation
    | "perceive_blind"     // agent personas — agent does not perceive; finding fires automatically
    | "dismiss_silently";  // replay/scripted mode
}
```

Companion files that must update in the same sprint to keep the schema honest:

- `packages/core/src/personas/built-in.ts` — set sensible defaults on built-in personas (`accessibility` and `agent` personas get `perceive_blind`; humans get `perceive_and_act`)
- `.claude/rules/personas-and-flows.md` — document the new fields in the persona block

---

## File-creation checklist

**New files this sprint** (in order of creation):

```
docs/plans/_sprint.md                                                       ✅ (this file)
docs/plans/finding-lifecycle-substrate.md                                   ✅
.claude/rules/pre-ship-check.md                                                 (Day 1)
infra/supabase/supabase/migrations/20260514100000_finding_lifecycle.sql         (Day 1)
infra/supabase/supabase/migrations/20260514110000_affordance_gaps.sql           (Day 2)
infra/supabase/supabase/migrations/20260514120000_expectation_match.sql         (Day 4)
infra/supabase/supabase/migrations/20260514130000_native_dialogs.sql            (Day 6)
apps/dashboard/components/finding-lifecycle/FindingSilenceButton.tsx            (Day 1)
apps/dashboard/components/finding-lifecycle/FindingSendToIssueButton.tsx        (Day 1)
apps/dashboard/components/finding-lifecycle/FindingTrendChart.tsx               (Day 1)
apps/dashboard/components/finding-lifecycle/FindingEmptyState.tsx               (Day 1)
apps/dashboard/components/finding-lifecycle/FindingLoading.tsx                  (Day 1)
apps/dashboard/components/finding-lifecycle/FindingError.tsx                    (Day 1)
apps/dashboard/components/finding-lifecycle/index.ts                            (Day 1)
apps/dashboard/lib/findings/send-to-issue.ts                                    (Day 1)
apps/dashboard/app/projects/[id]/gaps/page.tsx                                  (Day 3)
apps/dashboard/app/projects/[id]/gaps/layout.tsx                                (Day 3)
examples/flows/dashboard-find-and-delete-run.flow.yaml                          (Day 3)
examples/flows/dashboard-setup-new-project.flow.yaml                            (Day 5)
```

**Existing files modified**:

```
packages/core/src/types.ts                                  — PersonaConstraints union
packages/core/src/personas/built-in.ts                      — defaults for new constraint fields
packages/core/src/prompt.ts                                 — plan-capture phase, per-page enumeration phase, press_key advert, dialog hint
packages/core/src/authoring-schemas.ts                      — affordance_exclusions, prior_overrides, expected_keyboard_navigation, expectations.native_dialog
packages/cli/bin/playwright-mcp-proxy.mjs                   — dialog listener
apps/dashboard/components/run-detail/DetailSplit.tsx        — Affordance inventory section
apps/dashboard/components/run-detail/RunDetailLive.tsx      — reflection-tab additions
apps/dashboard/components/run-detail/Filmstrip.tsx          — verdict chips, dialog chips
apps/dashboard/components/run-detail/mock-data.ts           — mock plan_delta, affordance_gaps, dialog payloads
apps/dashboard/components/header-nav.tsx                    — /projects/[id]/gaps entry
.claude/rules/personas-and-flows.md                         — persona constraint docs
docs/ROADMAP.md                                             — Phase D progress
```

---

## Open questions resolution

All [non-blocking] questions across all four proposals adopt their stated default for sprint start. Re-evaluate after each dogfood walk. **Blocking questions**: none identified at sprint kickoff.

Per-doc open-question status:
- `finding-lifecycle-substrate.md` — 4 open Qs, all [non-blocking] or [deferred]
- `affordance-gaps.md` — open Qs to be tagged in the proposal in this same sprint (see audit F8)
- `expectation-match.md` — same

---

## Sprint-level Definition of Done

- [ ] All four migrations applied to hosted Supabase
- [ ] Substrate components consumed by both downstream proposals (substrate's "first-consumer test")
- [ ] **Affordance-gaps dogfood**: walk produces ≥3 findings on Rove's own dashboard, including ≥1 `agent.affordance_gap.delete` (we don't ship "Delete this run") and ≥1 of any other kind
- [ ] **Expectation-match dogfood**: walk produces ≥1 `agent.expectation_match.deviation` + ≥1 `agent.expectation_match.affordance`; `prior_plan` is captured + rendered in the reflection tab
- [ ] **`press_key` walk**: a deliberate WCAG 2.1.1 walk produces ≥1 finding the mouse-driven persona missed
- [ ] **Native-dialog test**: an `agent` persona on a page that fires `confirm()` produces a `run_dialogs` row + finding; a `human` persona on the same page produces no finding when the dialog copy is clear (severity gated on the copy)
- [ ] **Walker re-audit**: a fresh subagent walk of these four proposal docs surfaces no findings of severity ≥ high (we close our own audit's leftovers)
- [ ] Versions bumped, tagged `v0.0.0-alpha.17`, published to GH Packages
- [ ] `docs/ROADMAP.md` updated to reflect Phase D progress
- [ ] `.claude/rules/pre-ship-check.md` is referenced from `coding-standards.md` and has been used at least once during this sprint

---

## How to start

```bash
# 1. Re-read the thesis (it's short, ~10 min)
$EDITOR docs/theses/negative-space.md

# 2. Read the substrate doc end-to-end
$EDITOR docs/plans/finding-lifecycle-substrate.md

# 3. Start the substrate migration
$EDITOR infra/supabase/supabase/migrations/20260514100000_finding_lifecycle.sql

# 4. Push the migration locally before shipping any UI consumer of it
cd infra/supabase && supabase db push

# 5. Build the five React components against mock data first; wire to live data once the RPC is callable
```

Everything else flows from there. If you find a gap that's not in this doc, file it as `docs/audits/<date>-<topic>.md` and commit it before continuing.
