I’ll read the plan and prior review first, then produce the two requested artifacts only. No code edits.
===CODEX-REVIEW-BEGIN===
> **5a. Is "one Rove Project per GH org with views" the right cardinality?**

No. Default to one backlog destination per Rove `project_id`, with an optional org-level rollup later. The plan says the killer demo is "a single grid view that shows agent-readiness across all the consumer's apps," but that is demo logic, not operator logic. Engineers triage by team, repo, product, service, sprint, and ownership boundary. A single org project makes Rove look centralized while making ownership fuzzier. If tankloop and rove-dogfood share a board, the first admin question is "who owns this card?" not "wow, single source of truth."

Also, GitHub Project views are not a hard tenancy model. They are filters. If Rove `project_id` is the product's tenancy primitive everywhere else, the backlog mirror should not collapse it at the destination boundary.

> **5b. Is "Rove owns content, GH owns workflow state" actually clean?**

Mostly, but the rule needs to be stricter. Your proposed answer - "skip the content update if `backlog_external_id` is set and the item was promoted to a real issue" - is the right direction, but incomplete.

Use this rule: Rove may create content once, and may append machine-generated evidence updates only to Rove-owned draft items. Once promoted to an issue, Rove stops mutating title/body entirely. Future matching findings should update Rove's canonical record, add an occurrence count / latest seen timestamp in Rove, and only sync workflow fields outward if the destination item still has the Rove marker. Do not create a sibling unless the original is closed as fixed/dismissed and the finding recurs after a defined grace window. Otherwise you will train teams that Rove reopens the same conversation forever.

> **5c. Is auto-sync at severity threshold the right default?**

No, not as a single rule. `backlog_severity_min = 'major'` is a reasonable safety valve, but severity alone is the wrong sync policy. Severity is model-assigned, unstable, and pre-consensus. A rare minor finding can be more valuable than a generic major finding.

Default v1 should be: auto-sync critical findings, auto-sync major findings only for canonical flows, and keep minor/nit in Rove unless manually sent. Add one exception: agent-readiness regressions on configured deploy flows should sync even at minor if they map to the core wedge, such as `agent.accessibility_tree_completeness`, `agent.stable_selectors`, or missing affordance categories. That keeps the board from filling with copy quibbles while preserving the differentiated product signal.

> **5d. The GitHub App permission ask - is it acceptable, or a wall?**

It is a wall for some teams. The plan says, "Rove will create one Project called 'Rove' in your organization and write findings to it. Rove will not modify Projects it did not create." That is good copy, but the permission prompt will still look broad. `organization_projects: write` is an org-level trust ask for an alpha tool.

Ship a minimal path first: user selects an existing project or installs per repo where possible, and Rove writes only draft items / issues within that selected destination. Then offer "managed org board" as the higher-convenience mode. The permission ask becomes progressive: dashboard-only -> selected existing backlog -> managed Rove board. Do not force the broadest GitHub permission to prove the product.

**The biggest miss in this plan**

The weakest assumption is that GitHub Project v2 is a reliable universal backlog surface. The plan says "Project v2's grid view IS that system of record - pre-built, native to where engineers already work, free for us to use." That is too strong. GitHub Projects is where some GitHub-native teams triage. Linear is where many product teams triage. Jira is where many larger teams triage. Some teams use Issues without Projects. Others use Projects as reporting, not daily work.

So the abstraction should be "backlog item destination," not "Project v2 as the default system of record." If you overfit to Project v2 early, you risk baking GitHub-specific concepts into Rove's lifecycle: draft items, field IDs, view creation, issue promotion, project item webhooks. Then Linear becomes a second-class translation layer instead of a real adapter.

**Premise-level objection**

The framing still over-corrects toward "where engineers already triage" and under-specifies what decision Rove is supposed to drive. The plan says PR comments are the "wrong moment" because "4:55pm Friday merge-review is not when you triage missing-affordance findings." Fair. But a backlog board can become the opposite failure mode: findings arrive somewhere less noisy, but no one feels immediate ownership.

Rove should not just file findings into a backlog. It should answer: "Does this deployment introduce a fix-worthy workflow regression?" The backlog is the persistence layer for that answer, not the primary product moment. If the plan treats backlog sync as adoption by itself, it repeats the dashboard problem in a different UI. The missing bridge is assignment and routing: which flow changed, which team owns it, whether this blocks release, and whether this is a recurrence.
===CODEX-REVIEW-END===

===CODEX-PLAN-BEGIN===
# Codex's plan

I would build the backlog feature around one product invariant: Rove owns findings and evidence; external tools own team workflow. The external backlog is a projection, not the canonical record.

First, I would define a provider-neutral backlog model in Rove:

- `backlog_connections`: one row per Rove `project_id`, provider, installation/account metadata, selected destination, sync policy, and installed state.
- `backlog_items`: one row per finding-to-external-item link, with provider, external ID, external URL, lifecycle state, last synced timestamps, promoted/issue metadata, and a marker/version.
- `finding_occurrences` or equivalent recurrence metadata so re-found issues update Rove's history without necessarily mutating the external item.

I agree with Alex that `findings.github_issue_url` should become legacy. I disagree with putting adapter config as loose JSON directly on `projects` as the main model. It is okay for provider-specific metadata, but connections deserve first-class rows because a project may eventually have dashboard-only plus Linear, or a migrated GitHub destination, or a disabled connection with history.

Second, I would ship the smallest useful sync policy before provisioning anything. The v1 install flow should let the user choose:

1. Dashboard only.
2. GitHub: selected existing repo issue tracker or selected existing Project v2.
3. Linear: selected workspace/team/project.

Managed creation of a GitHub Project named "Rove" comes after the selected-destination path works. I disagree with Alex's "auto-provisioned on install" as the default because it maximizes permissions before the user has seen value. The lower-friction path is: connect, select destination, send one finding, verify it lands correctly.

Third, I would make cardinality match Rove tenancy: one backlog connection per Rove `project_id`. If a customer wants an org-wide GitHub Project, they can choose the same destination for multiple Rove projects, but Rove should not assume that. This keeps ownership and filtering honest.

Fourth, I would implement outbound sync only:

- On new finding, evaluate sync policy.
- Create an external item if it passes.
- Store the external link.
- Never sync low-severity findings automatically unless policy says so.
- Provide a manual "Send to backlog" action from the finding detail.

For GitHub, I would initially create issues or Project draft items depending on the chosen destination, but avoid view/field provisioning in the first cut. Use a stable marker in the body and store the external node IDs. For Linear, create issues in the selected team/project with labels or custom fields where available.

I agree with Alex that content should be one-way. I would make the rule harsher: after external creation, Rove does not rewrite the title/body unless the external item is still a Rove-owned draft and the user explicitly enables evidence refresh. Recurrences update Rove and add a comment only if the destination supports comments and the connection policy allows it. No silent body rewrites.

Fifth, I would add inbound status sync after outbound creation is working. For GitHub, verify webhook signatures and process only events for stored external IDs with the Rove marker. For Linear, use webhooks similarly. Map external statuses to a tiny Rove lifecycle: `new`, `triaged`, `in_progress`, `fixed`, `dismissed`. Avoid overfitting to GitHub's "Todo/In Progress/Done/Cancelled" names. Let each connection define mappings during setup, with defaults.

Sixth, I would add dashboard UI in this order:

- Project settings page: connection status, provider, destination, severity policy.
- Finding detail: external backlog link, send/resend controls, sync status.
- Findings list filters: synced / unsynced / failed sync.
- A small failed-sync queue with retry.

I agree with Alex that replacing `FindingSendToIssueButton` with a provider-aware action is right, but it should be backed by a sync record and retry behavior. Backlog integrations fail in boring ways: expired tokens, deleted fields, renamed statuses, missing permissions. The UI needs to show that plainly.

Seventh, I would define the default auto-sync policy as conservative:

- Critical: auto-sync.
- Major: auto-sync only for configured canonical flows or deploy-triggered walks.
- Minor/nit: manual only.
- Agent-readiness findings: configurable boost, default on for canonical flows.

This is not perfect, but it protects the backlog while keeping the product wedge visible. Consensus can later add confidence lanes, but v1 should not wait for it.

Eighth, I would defer generated GitHub Project views, custom fields, and org-wide board creation until after the basic loop proves useful. Those are convenience features, not the core adoption proof. When added, I would make them an explicit "Create managed Rove board" action. That action can request broader GitHub permissions with a clear reason.

Ninth, I would sequence delivery like this:

1. Data model for backlog connections and item links.
2. Provider-neutral adapter contract with outbound create/update status only.
3. GitHub selected-destination outbound sync.
4. Dashboard settings and manual send action.
5. Auto-sync policy from Supabase sink or post-finding job.
6. GitHub inbound status webhook.
7. Linear outbound and inbound.
8. Managed GitHub Project creation with fields/views.
9. Deploy/post-merge triggers.
10. Consensus and rare-find lanes.

The main trade-off: this plan is less flashy than auto-provisioning a polished Project v2 board. It gives up the "single source of truth" demo at first. In exchange, it reduces permission friction, respects team ownership boundaries, and prevents GitHub Project v2 from contaminating the whole abstraction.

Where I agree with Alex: dashboard remains canonical; external backlog is a projection; content and workflow state should not be merged bidirectionally; PR comments should not be the default surface; webhook status sync matters; Linear should be a real provider, not a later hack.

Where I disagree: one org-wide project should not be the default; auto-provisioning should not be the first install path; severity alone should not drive sync; GitHub Project v2 should not be treated as the product's system of record; and the alpha estimates are too optimistic for a reliable integration with install, webhooks, retries, permissions, field discovery, and two providers.
===CODEX-PLAN-END===
===CODEX-COMPLETE===
