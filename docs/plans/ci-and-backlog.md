# CI + backlog adapters — the next-after-walker-hardening plan

**Status:** v3 (post-Codex review + Brian's user-picks-install-path pushback). Implementation starting on alpha.38a (2026-05-16).
**Owner:** Alex (Brian Sweet's agent).
**Supersedes:** The CI-integration sketch in `docs/plans/multi-walk-consensus.md` §4c.
**Companion reads:**
- Codex's adversarial review + competing plan at `docs/reviews/2026-05-16-codex-ci-and-backlog.md`.
- HTML overview at `/tmp/rove-ci-plan.html` (rendered, not checked in).

## v3 changes from v2 (TL;DR)

| Layer | v2 | v3 (this doc) |
|---|---|---|
| Cardinality | One Rove Project per GH org with views | **One connection per Rove `project_id`** — match the tenancy primitive |
| Install UX | Auto-provision a managed "Rove" board on install | **Three user-picked paths**: dashboard-only / connect-to-existing / set-up-new-Rove-board. Permission scope tied to the choice. |
| Schema | `projects.backlog_provider` + `projects.backlog_config jsonb` | First-class **`backlog_connections` + `backlog_items` + `finding_occurrences`** tables |
| Sync policy | Severity threshold only | Codex's conservative shape: critical auto; major auto on canonical flows; agent-readiness regressions boost; recurrences never rewrite |
| Ownership | unspecified | `flows.owner_handle` + `flows.team_label` populate assignee/team on destination |
| Estimates | ~10 hr | **~34 hr** realistic (install + webhooks + retries + permissions + field discovery + two providers) |
| Migration of existing findings | unspecified | Opt-in checkbox at install time — runs `pushFinding` against existing rows; reuses runtime sync path |

## Agiterra concretes (post-Brian-clarification 2026-05-16)

Each Rove `project_id` connects independently to its own destination. Codex's per-Rove-project cardinality was right.

| `project_id` | Install path | Destination | Migration |
|---|---|---|---|
| `tankloop` | ② Connect to existing | Team picks (UI/UX project on `agiterra/tankloop`, or wherever they already triage UX work) | **Delete existing tankloop findings** — they're dogfood noise; start fresh |
| `rove-dogfood` | ③ Set up new board | Auto-create Project v2 in `agiterra/rove` (default name `Rove agent-readiness`, user editable at install) | **Migrate existing rove findings** as seed cards |

## 0. Why this plan exists

After the alpha.29 → alpha.37 walker-hardening session, Codex pushed back on "ship consensus next." His argument: trust only matters if anyone's looking, and right now nothing forces them to. The original v1 of this plan answered that with a GitHub Action that posts PR comments. Brian pushed back on PR comments — too noisy ($450/week at 50 PRs), wrong moment (4:55pm Friday merge-review is not when you triage missing-affordance findings), wrong surface (PR review is already a politicized comment space).

This v2 puts the findings where engineers already triage: **a per-project GitHub Project v2 board (or Linear, configurable), auto-provisioned on install**. The dashboard stays canonical. The Project v2 board is a downstream mirror with a two-way status sync, so the surfaces compose: act on findings in the tool you triage in, review evidence in the tool that gathered them.

This plan also explicitly defers consensus until after the backlog adapter ships. Consensus solves the noise the backlog surface exposes — building consensus first is building a better dashboard for a workflow nobody has adopted.

## 1. The user story

A consumer (Agiterra, tankloop, or any future Rove user) installs Rove and connects their GitHub org. As part of that connect flow, **Rove programmatically creates a GitHub Project v2 called "Rove" in their org**, pre-configured with custom fields (Severity, Heuristic, Persona, Flow, Status, Run, Dashboard Link) and pre-created views (one per Rove `project_id`, plus "Critical only" and "Agent walks" filters).

From that moment on:
- Every Rove finding above the project's severity threshold lands in the Project v2 board as a draft item with all custom fields populated, screenshots embedded, and a link to the dashboard run-detail.
- Engineers triage in GitHub Projects — drag cards between columns, optionally promote drafts to real issues, add the assignee, link a PR.
- Status changes in the Project board propagate back to Rove (Todo→In Progress→Done maps to findings.status new→filed→fixed; cancelled-as-not-planned maps to dismissed).
- Content (title, description, evidence, screenshots) stays one-way Rove→GH. Rove owns the content; GitHub owns the workflow state.

Linear is the configurable alternative. Same shape, different destination. Per-project setting picks one.

## 2. The premise reframing (post-Codex)

Internal doctrine: negative space (`docs/theses/negative-space.md`). Keep.

Buyer-facing line: **"Can a human, screen reader, or AI agent complete this workflow on your preview deploy?"** Concrete, names the three personas Rove already covers, anchors at deploy time, lists the immediate pain.

Defensibility: per Codex, "system of record for agent-readiness regressions across flows, personas, and time." Project v2's grid view IS that system of record — pre-built, native to where engineers already work, free for us to use. Cross-runtime consensus (Sonnet × Codex × browser-use) is the deeper moat, queued for alpha.42+.

## 3. Architecture

### 3a. Data flow

```
  walk (rove change-review / run)
    → Supabase sink (canonical store: findings, run_steps, screenshots)
      → backlog adapter (per-project, configurable)
        → GitHub Project v2  ← the destination 99% of consumers see
                              ← engineer triages here
                              ↓
        ← (webhook) projects_v2_item status change
      ← finding.status synced back to Rove
```

### 3b. The backlog adapter interface

```ts
// apps/dashboard/lib/backlog/adapter.ts
export interface BacklogAdapter {
  readonly id: "dashboard-only" | "github-project-v2" | "linear";

  /** Push a new Rove finding into the backlog. Returns the destination item id. */
  pushFinding(input: PushFindingInput): Promise<{ external_id: string; external_url: string }>;

  /** Push a status change from Rove into the backlog. */
  updateFindingStatus(external_id: string, status: FindingStatus): Promise<void>;

  /** Optional: handle a status webhook FROM the backlog. Returns the matched finding id + new status. */
  handleStatusWebhook?(payload: unknown): Promise<{ finding_id: string; status: FindingStatus } | null>;

  /** One-time setup that an operator triggers from /projects/[id]/page.tsx. */
  install(opts: AdapterInstallOpts): Promise<AdapterInstallResult>;
}
```

The dashboard ships three concrete implementations:
- `DashboardOnlyAdapter` — no-op, the default.
- `GitHubProjectV2Adapter` — GraphQL, the first-class.
- `LinearAdapter` — REST + GraphQL, the configurable opt-in.

### 3c. Per-project config (schema)

```sql
alter table projects
  add column backlog_provider text not null default 'dashboard-only',
  add column backlog_config jsonb,            -- adapter-specific (project node id, field ids, team id, etc.)
  add column backlog_secret_ref text,         -- reference to Supabase Vault secret (API key / installation token)
  add column backlog_severity_min text not null default 'major',  -- 'critical' | 'major' | 'minor' | 'nit' | 'all' | 'manual'
  add column backlog_installed_at timestamptz; -- non-null after install() succeeds

alter table findings
  add column backlog_external_id text,
  add column backlog_external_url text,
  add column backlog_synced_at timestamptz;

-- existing column kept for back-compat; not used by new code
-- findings.github_issue_url (back-compat only)
```

No secrets in the database. `backlog_secret_ref` points to a Supabase Vault key; the adapter resolves it server-side. For GitHub Project v2, the "secret" is really the GitHub App installation token (refreshed by our existing App infra).

### 3d. GitHub Project v2 install flow

Triggered from a button on `/projects/[id]/page.tsx` ("Set up GitHub Project"). Server action runs the orchestration:

1. Resolve the consumer's GH org from the GitHub App installation.
2. **Check whether a "Rove" project already exists.** If yes, link to it (don't make a second). If no, `createProjectV2(ownerId, "Rove")`.
3. **Create custom fields** (idempotent — query first, create only what's missing):
   - `Severity` — single-select: Critical, Major, Minor, Nit
   - `Heuristic` — single-select: dynamically extended as new heuristics appear (`agent.semantic_html`, `nielsen-1`, `change.copy_mismatch`, etc.)
   - `Persona` — single-select
   - `Flow` — text
   - `Run ID` — text (clickable to dashboard via the next field)
   - `Dashboard link` — URL
   - `Status` — built-in (Todo / In Progress / Done / Cancelled) — we don't create this, just discover its node id.
4. **Pre-create views**:
   - "All findings" (default)
   - One view per Rove `project_id` filtered by Flow prefix
   - "Critical only" filtered by Severity = Critical
   - "Agent walks" filtered by Persona category = agent
5. **Subscribe to webhooks**: `projects_v2_item` events (created, edited, deleted) routed to `/api/backlog/github/webhook`.
6. Store the project node id + all field node ids in `projects.backlog_config`.
7. Set `projects.backlog_installed_at = now()`.

If any step fails partway, the install is idempotent — re-running picks up where it left off.

### 3e. GitHub App permission deltas

The existing `agiterra/rove` GitHub App needs broader scope:

| Permission | Today | Needed | Why |
|---|---|---|---|
| `issues: write` | yes | keep | back-compat path |
| `contents: read` | yes | keep | PR authoring wizard |
| `metadata: read` | yes | keep | org/repo info |
| `repository_projects: write` | no | **add** | (legacy projects — drop after migration) |
| `organization_projects: write` | no | **add** | create the Rove project + draft items |
| `projects_v2_item: read/write` | no | **add** | edit cards, receive webhooks |

This is a meaningful permission grant. The install flow's consent screen needs to state plainly: "Rove will create one Project called 'Rove' in your organization and write findings to it. Rove will not modify Projects it did not create."

Mitigation: every draft item Rove creates carries a hidden marker (a unique field value or a `rove:` prefix in the body). The adapter refuses to edit any item missing that marker.

### 3f. Two-way sync rules (narrowed)

| What | Direction | Trigger |
|---|---|---|
| Content (title, body, evidence, screenshots, severity, heuristic, persona, flow) | Rove → GH (one-way) | New finding sync, or finding edited in dashboard |
| Custom-field values that mirror columns above | Rove → GH (one-way) | Same |
| Status (Todo/In Progress/Done/Cancelled) | **Two-way** | GH → Rove via webhook; Rove → GH via dashboard's silence/dismiss/fixed buttons |
| Draft → Issue promotion | GH → Rove (one-way capture) | webhook stores `issue_node_id` + URL on the finding |
| Body edits AFTER draft→issue promotion | not synced | engineer's local edits stay in GH; Rove never overwrites or re-pulls |
| Assignee, labels (other than Rove's auto-tags), PR links | not synced | GH-only metadata |

This avoids the merge-conflict swamp. The rule is: **Rove owns content. GitHub owns workflow state.** Once a draft becomes an issue, GH owns the body too.

### 3g. Webhook receiver

New route `apps/dashboard/app/api/backlog/github/webhook/route.ts`:

1. Verify HMAC signature using the App's webhook secret.
2. Parse `projects_v2_item` event.
3. Look up the corresponding finding via `findings.backlog_external_id`.
4. If the event is a Status field change, update `findings.status`:
   - "Todo" → no change (matches `new` or `filed`, ambiguous; leave it).
   - "In Progress" → `filed`.
   - "Done" → `fixed`.
   - "Cancelled" → `dismissed`.
5. If the event is a `converted` (draft→issue) action, capture the new `issue_node_id` and URL.

### 3h. The triggers — when walks fire (no PR comments)

Per Brian's pushback, the triggers are:

| Trigger | Where it runs | What it walks | Default in alpha.40 |
|---|---|---|---|
| **Manual** | engineer's CLI | specific routes the engineer is changing | always available |
| **Post-merge** | GitHub Action on `deployment_status` for production | flows whose `entry_route` matches the merged diff | opt-in per project |
| **Scheduled** | dashboard cron / Supabase scheduled function | all canonical flows in the project | opt-in per project, default weekly |

No `--pr-comment` flag, no PR-comment sink. Findings flow only to dashboard + adapter.

## 4. Sequencing

| Alpha | What | Size |
|---|---|---|
| **38a** | `BacklogAdapter` interface + `projects` table migration + `/projects/[id]/page.tsx` page (which doesn't exist yet) with config UI | ~3 hr |
| **38b** | GitHub Project v2 adapter — install flow (create project, fields, views, webhook subscription) | ~4 hr |
| **38c** | GitHub Project v2 adapter — `pushFinding` + `updateFindingStatus` (Rove → GH) | ~3 hr |
| **39a** | Webhook receiver + `handleStatusWebhook` (GH → Rove) | ~2 hr |
| **39b** | Replace `<FindingSendToIssueButton>` with `<FindingSendToBacklogButton>` dispatching on `backlog_provider` | ~1 hr |
| **40** | Post-merge walk trigger — GitHub Action template + scheduled cron via Supabase pg_cron | ~3 hr |
| **41** | Linear adapter (mirror of GH, different destination) | ~4 hr |
| **42** | Multi-walk consensus (with Codex's 5 corrections from `docs/reviews/2026-05-16-codex-consensus-and-premise.md`) | ~6 hr |
| later | Cross-runtime consensus, Slack notifier, Jira adapter | TBD |

## 5. The four open questions (the things I want Codex to push on hardest)

### 5a. Is "one Rove Project per GH org with views" the right cardinality?

The plan picks **one project per org**, with views split by Rove `project_id`. An alternative is **one project per Rove `project_id`** (so tankloop has its own GH project, rove-dogfood has its own). Pros of one-per-org: a single grid view that shows agent-readiness across all the consumer's apps — that's the killer demo. Cons: a monorepo with five product lines has 200 cards in one project that the team has to mentally re-slice every time. Pros of one-per-Rove-project: cleaner mental model. Cons: feels less like a system-of-record and more like five separate tools, and the marketing line "single source of truth" weakens.

**My pick: one per org with views.** Codex — pushback?

### 5b. Is "Rove owns content, GH owns workflow state" actually clean?

The plan says content edits in GitHub after draft→issue promotion stay in GitHub. What happens when a Rove walk re-files the same finding (same `content_hash`) a week later? Does it overwrite the now-edited issue body? Does it skip the update? Does it create a sibling issue? My current answer is **skip the content update if `backlog_external_id` is set and the item was promoted to a real issue**, but still update the Status field if the Rove-side lifecycle changed. Is that the right rule, or does it need to be sharper?

### 5c. Is auto-sync at severity threshold the right default?

The plan defaults `backlog_severity_min = 'major'` — sync critical + major automatically, leave minor + nit for manual "send to backlog" clicks. The concern Codex raised: rare-but-real findings (consensus_count = 1 in a future consensus group) might be the expensive insight, and auto-syncing only major+ might bury them. But auto-syncing everything floods the triage backlog and trains engineers to ignore Rove. Where's the right line for v1 before we have consensus to lean on?

### 5d. The GitHub App permission ask — is it acceptable, or a wall?

Adding `organization_projects: write` is a meaningful permission grant. The mitigation (Rove only edits items it tagged) is real but invisible to the consumer at install time. Two questions: (i) is this an adoption killer for security-conscious teams? (ii) is there a smaller-scope alternative — e.g. a per-repo project rather than an org project — that we should fall back to as a "minimal install" option?

## 6. What I want Codex to do with this

Two outputs, clearly separated in your response:

1. **Adversarial review of this plan.** Same format as the consensus review at `docs/reviews/2026-05-16-codex-consensus-and-premise.md`: answer each open question in §5 directly (quote → answer), then call out the single biggest miss, then state any premise-level objection. Limit: 1500 words.

2. **Your own competing plan from scratch.** Don't iterate on mine. Start blank. Imagine you are the engineer brought in to ship "Rove findings flow to a per-project backlog (Linear or GH Project v2) with two-way status sync." What would you build, in what order, with what trade-offs? You may agree with me on some choices and disagree on others — be explicit about which. Limit: 1500 words. Title it "Codex's plan" so it's clearly the second artifact.

Wrap each section with markers so the response is easy to parse:

```
===CODEX-REVIEW-BEGIN===
... your review ...
===CODEX-REVIEW-END===

===CODEX-PLAN-BEGIN===
... your competing plan ...
===CODEX-PLAN-END===
```

End your response with the literal marker line `===CODEX-COMPLETE===` after both blocks.
