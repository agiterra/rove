# Pre-ship check — apply the thesis to your own work

This rule operationalizes the closing instruction of `docs/theses/negative-space.md`. It applies to **anyone shipping a UI change** — human or agent — and should be run before opening or merging a PR.

## Why this exists

The thesis: builder-agents (and humans coding alone) cannot perceive what they did not build. The negative space is, by definition, absent from any positive output they review. So before shipping, you must explicitly enumerate what *should* be present at each surface you touched — and verify that each item is there.

This is the same cognitive operation a Rove walker-persona performs on a UI under audit. We apply it to our own UI before we ship, not because we ship perfect code but because we *cannot perceive* whether we shipped complete code without this step. Skipping it means relying on customer support tickets (or the next walker audit) to discover the gaps.

## The check

For every substantive surface you touched in this change — every page, every form, every state — enumerate what a user with the relevant goal would expect to be able to do there. Then verify each is present in your output. The list of misses is your blind spot **on this task, today**. Fix the misses before merging.

Run through each category and pause on each line. If the answer to "is this addressed" is "doesn't apply here," that is fine — but you must actively reach that conclusion, not skip the line because it didn't occur to you.

### CRUD asymmetry

- [ ] If you added a Create surface, does the user have a Read view of what they created?
- [ ] If you added a Read view, does the user have an Update path from it?
- [ ] If you added an Update path, does the user have a Delete path?
- [ ] If you added a Delete path, is there a Confirm step and an Undo (or at least an audit log)?
- [ ] If the backend has all four CRUD methods, does the UI expose all four?

### State and persistence

- [ ] If you added a form, does it have a save-state indicator or auto-save?
- [ ] If you added a form, does it warn the user if they navigate away mid-fill?
- [ ] If you added user preferences/filters/sorts, do they persist across sessions?
- [ ] If you added a list view, what does the empty state look like? Is there an onboarding CTA?

### Async + recovery

- [ ] If you added an async action, what does the user see while it's loading?
- [ ] If the async action can fail, what does the user see on failure? Is the message human-readable?
- [ ] If the action failed, how does the user retry?
- [ ] If the action succeeded silently (no DOM change, no URL change), how does the user know it worked?

### Navigation and discoverability

- [ ] If you added a route, can the user discover it from somewhere other than a direct URL?
- [ ] If you added a route, can the user get back from it via a clear path?
- [ ] If you added a route, does it export `metadata.title`? (Per `.claude/rules/dashboard.md`)
- [ ] If you added a route, does it filter by `project_id`? (Per `.claude/rules/dashboard.md`)

### Destructive actions

- [ ] If you added a destructive action, is there a confirm step?
- [ ] If you added a destructive action, is there an undo, an audit trail, or both?
- [ ] If the destructive action is gated by `confirm()` rather than an in-page modal, can an agent persona perceive it?

### Accessibility (the persona check)

- [ ] If you added an interactive element, does it have a name (label, aria-label, text content)?
- [ ] If you added an interactive element, can it be reached and operated by keyboard alone?
- [ ] If you added an icon-only button, is the icon `aria-hidden` and the button labeled?
- [ ] If you added a live region (toast, alert, status), is it announced (`role=status` / `aria-live`)?
- [ ] If you added an emoji that is decorative, is it `aria-hidden`?

### The agent-readability check

- [ ] Are selectors stable (data-attrs / aria-roles) or are they CSS classes that may churn?
- [ ] Are URLs predictable + bookmarkable, or do they hide state in client memory?
- [ ] Is the page title specific to the current route, or is it the site default?
- [ ] If you added a custom widget, does it expose a proper aria role?

## How to use this rule

When opening a PR that touches dashboard UI:

1. Walk the categories above against the diff.
2. For any "no" answer, decide: fix in this PR, or file a follow-up.
3. If you file a follow-up, add it to `docs/BACKLOG.md` with a one-line link to the PR.
4. In the PR description, note which categories you actively reviewed and any "doesn't apply" decisions. This isn't paperwork — it forces the cognitive operation.

This rule applies recursively. If you are writing a doc that describes a *future* UI surface (a proposal, a sprint plan, an audit), run the same check against the *plan* — would an engineer arriving cold be able to do everything they need? The audit at `docs/audits/2026-05-14-sprint-plan-walker-audit.md` demonstrates this — the same check applied to our own sprint plan surfaced 14 findings.

## When this rule will save you

You will be tempted to skip this when:

- The change is "just a small fix"
- The user explicitly named only one thing
- The tests pass and the page renders
- You are confident the code is correct

The thesis predicts these are exactly the moments the negative space goes unperceived. Do the enumeration anyway. The cost is 5-15 minutes. The cost of skipping is a half-built feature that ships and gets discovered by a customer.

## See also

- `docs/theses/negative-space.md` — the why
- `docs/plans/expectation-match.md` § "UX plan — applying the thesis to ourselves" — this rule applied to a feature
- `docs/plans/affordance-gaps.md` § "UX plan — applying the thesis to ourselves" — same
- `docs/audits/2026-05-14-sprint-plan-walker-audit.md` — this rule applied recursively to a sprint plan
