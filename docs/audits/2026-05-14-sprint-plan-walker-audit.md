# Walker audit of Rove's next-sprint plan

**Auditor**: subagent acting as a walker-persona
**Date**: 2026-05-14
**Initiated by**: Brian — "Spin up a subagent and have them act like a walker would on our plan"
**Artifact under audit**: `docs/theses/negative-space.md`, `docs/proposals/expectation-match.md`, `docs/proposals/affordance-gaps.md`, `docs/BACKLOG.md` (Next sprint section)

## Goal-shape inhabited

> "I am an engineer arriving cold on Monday morning, intending to start building this sprint. Can I do everything I need to do?"

## Findings

### F1 — No entry point. The plan has no `/`.

- **heuristic_id**: `agent.affordance_gap.navigate`
- **severity**: critical
- **surface**: `docs/BACKLOG.md` § "Next sprint"; absence of `docs/proposals/_sprint.md` or equivalent
- **evidence**: BACKLOG lists six bullets in reverse-chronological "newest at top" order (per the file's own "Add to the top" rule). The bullets are: thesis, finding-lifecycle substrate, affordance-gaps, expectation-match, press_key, native dialogs. There is no document that says "for this sprint, start here, then this, then this." The two proposals each declare themselves "Next sprint" but neither references the other as predecessor or successor. An engineer reading BACKLOG top-down would conclude `press_key` and `native dialogs` are in-sprint too — both bullets sit under the "Next sprint" heading with no demarcation. Six items, no ordering at the index level.
- **suggested_location**: `docs/proposals/_sprint.md` (new) — a one-page "Monday morning" index that names the six items, orders them, and links each. Alternative: collapse BACKLOG's "Next sprint" bullets into a numbered list with explicit "Day N" headers.

### F2 — Substrate has no proposal doc; only a BACKLOG bullet.

- **heuristic_id**: `agent.expectation_match.affordance`
- **severity**: critical
- **surface**: BACKLOG line 19 vs. `docs/proposals/`
- **evidence**: The two proposals both say "build the shared finding-lifecycle substrate first." `expectation-match.md` § "Shared primitives" enumerates four substrate items. `affordance-gaps.md` § "Reuse contract" enumerates the same four. BACKLOG line 19 is the only place the substrate is described as a sprint item — and it is a single bullet, no schema, no API, no acceptance criteria. The two proposals reference it as if it were specified somewhere. It is not. Both downstream proposals depend on a contract that does not exist as a document.
- **suggested_location**: `docs/proposals/finding-lifecycle-substrate.md` — must include: schema migration for `findings.silenced_at`/`silence_reason`, RPC signature, `<FindingTrendChart>` props, `<FindingEmptyState>` / `<FindingLoading>` / `<FindingError>` component contracts, GitHub-issue export action signature.

### F3 — Migration ordering and timestamps unspecified.

- **heuristic_id**: `agent.expectation_match.route`
- **severity**: high
- **surface**: `expectation-match.md` § Schema; `affordance-gaps.md` § Schema; missing substrate migration
- **evidence**: Both proposals write `<timestamp>_*.sql` as a literal placeholder. There are three migrations implied this sprint (substrate, expectation-match, affordance-gaps). Their relative order is not stated. The substrate's `findings.silenced_at` column must precede the silence-affordance UI in either proposal, but the dependency is not called out. An engineer Monday morning will pick an arbitrary timestamp ordering and we'll discover the conflict on `supabase db push`.
- **suggested_location**: A "Migration order" section in `_sprint.md` (per F1) listing the three migration filenames in order, or include order as a comment block at the top of each migration when written.

### F4 — `Persona.constraints` extensions are scattered and may collide.

- **heuristic_id**: `agent.expectation_match.affordance`
- **severity**: high
- **surface**: `expectation-match.md` § 4 "Persona-level priors"; `affordance-gaps.md` § 4 "Persona-aware enumeration"; BACKLOG line 23 (native dialogs proposes `native_dialog_policy`)
- **evidence**: Three additions to `Persona.constraints` are proposed across the docs: `prior_archetype` (expectation-match), no new field but uses `prior_archetype` (affordance-gaps), and `native_dialog_policy` (BACKLOG line 23). No doc shows the union. `packages/core/src/types.ts` will need one coherent diff. `.claude/rules/personas-and-flows.md` will need updating in the same sprint to keep the documented persona schema accurate — neither proposal mentions this.
- **suggested_location**: `_sprint.md` "Persona contract delta" section, plus a single planned edit to `packages/core/src/types.ts` and `.claude/rules/personas-and-flows.md` listed as a sprint deliverable.

### F5 — Estimates disagree across documents.

- **heuristic_id**: `agent.expectation_match.step_count`
- **severity**: medium
- **surface**: BACKLOG line 20 vs. `affordance-gaps.md` § "What this adds to the sequencing"; BACKLOG line 21 vs. `expectation-match.md` § "What this adds to the sequencing"
- **evidence**: BACKLOG line 20 says affordance-gaps is "~2-3 days"; the proposal's own revised estimate is "4-6 days." BACKLOG line 21 says expectation-match is "~2-3 days"; the proposal's revised estimate is "3-5 days." The substrate (BACKLOG line 19) is "~1 day if treated as substrate work." Sum of in-proposal revised estimates: 8-12 days. Sum of BACKLOG estimates: 5-7 days. A reader trusting BACKLOG will under-plan by roughly a factor of two.
- **suggested_location**: Reconcile in BACKLOG line 19/20/21; mark BACKLOG estimates as "headline" and the proposals as authoritative.

### F6 — Definition of done is absent for every item.

- **heuristic_id**: `agent.affordance_gap.confirm`
- **severity**: high
- **surface**: All four artifacts
- **evidence**: Neither proposal has a "Done" section. The "Sequencing" sections end at "Day 3 — dogfood." Dogfood is not done-ness; it is verification. There is no acceptance gate that says "X must produce a finding when Y is true." There is no demo target ("show this run on the dashboard and these chips render"). When item 3 says "auto-finding emission with severity inference per kind" — what severities, for which kinds, is the inference correct? No table.
- **suggested_location**: Append "## Definition of done" to both proposals with: (a) which test fixture must produce which finding, (b) which dashboard surfaces must render which sections with mock data, (c) the dogfood walk's expected output (we know one already from `affordance-gaps.md`: "we ship a 'Delete this run' gap somewhere" — make that a literal acceptance check).

### F7 — Thesis-to-build bridge is implicit.

- **heuristic_id**: `agent.expectation_match.affordance`
- **severity**: medium
- **surface**: `docs/theses/negative-space.md` § "What this thesis implies for every agent who reads it"
- **evidence**: The thesis closes with a practical pre-ship check (CRUD-asymmetric backend? Form with no save state? Error handler that logs but says nothing? Async with no loading state? Destructive without confirm/undo/audit?). The two proposals BOTH have UX-plan sections that perform this check on themselves — which is correct dogfooding. But there is no operationalization for the consumer or for ongoing work: no template, no checklist file, no PR-template change, no hook. The thesis-as-instruction sits in prose. Future Alex (or anyone else) building feature #7 will not be prompted to perform the check.
- **suggested_location**: `.claude/rules/pre-ship-check.md` (new) — codify the closing list as an explicit rule. Reference it from `.claude/rules/coding-standards.md`. Optionally add a PR template stub at `.github/pull_request_template.md` with the same checklist.

### F8 — Open questions are not classified.

- **heuristic_id**: `agent.affordance_gap.status`
- **severity**: medium
- **surface**: `expectation-match.md` § "Open questions"; `affordance-gaps.md` § "Open questions"
- **evidence**: Expectation-match has four open questions with "Recommendation:" baked in for three of them. Affordance-gaps has four open questions, three with mitigations stated, one ("Cross-persona aggregation") explicitly punted to D2. None are marked **blocking** vs **non-blocking**. An engineer reading "should the agent be allowed to fully rewrite the plan mid-walk?" cannot tell whether they must answer this before Day 1 or whether the recommendation is the working default.
- **suggested_location**: Add a `[blocking]` / `[non-blocking, default: X]` / `[deferred to Phase D2]` tag to each open question in both proposals.

### F9 — Dogfood lacks owner and exit criteria.

- **heuristic_id**: `agent.affordance_gap.confirm`
- **severity**: medium
- **surface**: `expectation-match.md` § Sequencing Day 3; `affordance-gaps.md` § Sequencing Day 3 afternoon
- **evidence**: Both proposals end at "dogfood on Rove's dashboard." Neither says: which flow YAML, which persona, what number of findings means "good enough to ship," what we do if the walk surfaces zero findings (was the feature broken or is our dashboard already complete?). The single concrete prediction — "Expected: we ship a 'Delete this run' gap somewhere" in `affordance-gaps.md` — is buried in parentheses. Dogfood currently reads as a vibe, not an exit gate.
- **suggested_location**: Per F6's "Definition of done": specify dogfood flow YAML filename, persona id, expected minimum finding count, expected at least one finding of each new heuristic kind.

### F10 — `/projects/[id]/gaps` is a new route that requires page/layout/metadata wiring not mentioned.

- **heuristic_id**: `agent.affordance_gap.navigate`
- **severity**: medium
- **surface**: `affordance-gaps.md` § "Required affordances per surface"
- **evidence**: The UX plan introduces a brand-new route `/projects/[id]/gaps`. `.claude/rules/dashboard.md` requires every page to export `metadata`, await `params`/`searchParams` Promises, and filter by `project_id`. The proposal lists the route but does not flag the new top-nav entry, the metadata export, or the resolveProjectId pattern as deliverables. Easy to forget on Day 3 afternoon when the engineer is racing to dogfood.
- **suggested_location**: Add a "New routes" sub-section to `affordance-gaps.md` § Sequencing listing exact file paths: `apps/dashboard/app/projects/[id]/gaps/page.tsx` + layout, plus the top-nav edit location.

### F11 — Substantive-page detection algorithm is unspecified.

- **heuristic_id**: `agent.expectation_match.affordance`
- **severity**: high
- **surface**: `affordance-gaps.md` § 1 "Per-page enumeration phase" and § Open questions "Enumeration cost"
- **evidence**: The proposal hinges on "first arrival to each substantive page." Substantive is defined parenthetically as "page with non-trivial DOM content; excludes loading states, transient redirects, 404s, sign-in walls." Later: "passes a 'substantive' check (≥ N nodes, has primary content region, not a redirect/loading state)." `N` is a placeholder. There is no detection function specified, no test fixture, no fallback when detection misfires (false negatives = enumeration skipped on real pages; false positives = cost blowout). This is on the critical path of the proposal and is the open question most likely to ambush Day 2 morning.
- **suggested_location**: Add a "Substantive page detection" sub-section to `affordance-gaps.md` § Mechanism specifying the threshold (e.g., DOM node count ≥ 20, has a `<main>` or `[role="main"]`, response status 200, not a known auth route).

### F12 — Schema for `affordance_gaps` jsonb has an inconsistency with its index.

- **heuristic_id**: `agent.expectation_match.affordance`
- **severity**: medium
- **surface**: `affordance-gaps.md` § Mechanism § 2 vs § Schema
- **evidence**: § 2 creates an index `using gin ((affordance_gaps -> 'kinds'))`, implying the jsonb has a `kinds` field. The Schema section creates a different index `using gin (affordance_gaps)` on the whole column. And the example payload above shows the jsonb as an *array* of `{kind, expected_for, severity, evidence, suggested_location}` with no top-level `kinds` key. Three places, three shapes. Whichever an engineer copy-pastes first will diverge from the other two.
- **suggested_location**: Pick one shape (array-of-objects is the natural one) and fix both the index definition (`using gin (affordance_gaps jsonb_path_ops)` likely) and remove the stale `'kinds'` reference.

### F13 — The audit itself has no place to land.

- **heuristic_id**: `agent.affordance_gap.create`
- **severity**: high
- **surface**: This walker run; absence of a Rove-on-Rove findings drop-zone
- **evidence**: The thesis at line 83 says: "Once it is a token, it can be matched, filed, surfaced, and shipped to the consumer's dev team as a finding." This audit produced 14 findings about the sprint plan. There is no Rove-on-Rove findings table, no `docs/audits/`, no GitHub issue scaffold, no agent_jobs row for "review the audit." The walker-on-walker mechanism is a tool result that will end up in a chat transcript. The thesis's own prediction — "findings die on the dashboard" — applies recursively to its own audit apparatus.
- **suggested_location**: Either (a) commit the audit to `docs/audits/2026-05-14-sprint-plan-walker-audit.md` and open one GitHub issue per critical/high finding, or (b) treat this audit as the dogfood payload for the substrate's GitHub-issue export feature and use it as the first acceptance test.

### F14 — `_sprint.md` does not exist but is implied by both proposals' "Sprint: Next sprint" header.

- **heuristic_id**: `agent.affordance_gap.empty`
- **severity**: minor
- **surface**: Both proposals' frontmatter; BACKLOG
- **evidence**: Each proposal lists `**Sprint**: Next sprint (see docs/BACKLOG.md)`. BACKLOG's "Next sprint" section is six bullets with no overview. The cross-reference is an empty signpost.
- **suggested_location**: Same as F1.

## Affordance inventory by surface (presence/absence summary)

| Surface | Required affordances | Present | Absent |
|---|---|---|---|
| BACKLOG § Next sprint | overview, ordering, count, in/out demarcation, estimate reconciliation | bullets exist; thesis is callout-styled | overview prose, explicit Day 1→N order, sprint scope vs. backlog overflow, reconciled estimates |
| `_sprint.md` (entry point) | exist as a file; name Day 1 starting point; list migration order; list persona delta; reference substrate doc | — | entire file |
| `finding-lifecycle-substrate.md` | proposal doc; schema; RPC; component contracts; DoD | — | entire file |
| `expectation-match.md` | wedge, schema, mechanism, UX plan, sequencing, open Qs, **DoD**, dogfood spec, open-Q classification | first six present | DoD, dogfood spec, open-Q tags, persona-contract union |
| `affordance-gaps.md` | same as above + substantive-page algorithm + new-route checklist + consistent index schema | first six present | substantive-page algorithm, new-route checklist, index/schema consistency, DoD, dogfood spec, open-Q tags |
| `negative-space.md` | thesis + actionable pre-ship check operationalized | thesis + pre-ship list | check not codified into a rule file or PR template |
| Walker-on-walker audit | findings → durable artifact → action | this report exists in-chat | no `docs/audits/` directory, no GH-issue handoff, no Rove findings row |

## Verdict

This sprint is **not walkable on Monday morning** without one missing surface: a `_sprint.md` index that names six items in order, points to the substrate proposal that does not yet exist, reconciles the estimate gap (5-7 days in BACKLOG vs 8-12 days in the proposals), and tags each open question as blocking or not. The single biggest gap is **F2 (no substrate proposal doc)** — both downstream proposals reference a shared contract whose only specification is a paragraph-long BACKLOG bullet, which is exactly the kind of "the contract lives in three places that almost agree" failure mode the proposals themselves are designed to catch. Close F1, F2, F6 and the sprint goes from "ambitious vibe" to "ordered checklist an engineer can execute against." Everything else here is fixable inside the proposal docs themselves in under an hour each. The thesis is correct that builders cannot perceive what they did not build — and the sprint plan demonstrates the thesis on itself: the negative space is the absent index, the absent contract, the absent DoD, and the absent return path for this very audit.
