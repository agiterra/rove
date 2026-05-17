# Codex review — multi-walk consensus + Rove premise

**Date:** 2026-05-16. **Model:** Codex CLI (gpt-5.5, medium reasoning). **Prompt:** Adversarial review of `docs/plans/multi-walk-consensus.md` per the open questions in §4.

## 4a. Consensus design

> **Is N=3 the right ergonomic default?**

No. N=3 is intellectually tidy and commercially dangerous. The line "3-walk consensus at $3 budget per walk = $9 per consensus group" is the buried objection. For PR-time workflows, $9 is high enough that users will ration it, which means consensus becomes a special mode instead of the trust substrate. Default daemon/CI behavior should be N=2 or "adaptive": start N=2, escalate to N=3 only when the two walks disagree materially. Do not make N=1 the visible normal path if the core claim is "single-walk findings are noisy." That undercuts the product.

> **Is `content_hash` actually stable enough across independent walks to be the consensus key?**

No. The plan already proves it is not: "Same finding, different titles, same hash? No — the title diverges so the hash diverges." Title-aware hashing will dramatically undercount consensus and make the feature look worse than the product actually is. Do not jump to embeddings yet. Use a family-specific deterministic key first: `flow_id + heuristic + normalized url/route + step/page identity + coarse locator/affordance kind`, with title as display text, not identity. Option (a) `flow_id + heuristic + step_index` is too broad; it will collapse unrelated issues on the same step. Option (b) makes consensus mostly fake precision. Option (c) is too much complexity too early.

> **The per-page `affordance_gap.*` heuristic family poisons consensus harder than `nielsen-*` does. Should `affordance_gap.*` use a different aggregation rule?**

Yes. It needs its own key. The plan's phrase "files 12 gap findings" versus "files 14 gap findings" is exactly the problem: affordance gaps are inventory-like, not prose-like. Consensus should be by `url_pattern + gap_kind + expected_affordance`, not full finding hash. Otherwise the most strategically important heuristic family will look least reliable. This is not a dashboard polish issue. If negative-space is the sharp thesis, consensus must be strongest there, not weakest.

> **Is there a perversity where consensus could mask real bugs by demanding agreement?**

Yes. Default `min=2` risks burying precisely the exploratory value Rove claims to create. "A subtle UX problem only one of three Sonnet runs catches" is not necessarily noise; it may be the expensive insight. Use two lanes: "Consensus" and "Rare finds." Rare finds should be demoted, not hidden. If you hide them, you train users to treat Rove as a deterministic gate, which contradicts the premise.

## 4b. Rove premise

> **Is the "non-deterministic UI/UX testing for the agent era" framing tight?**

Partly. "Agent-readiness audit" is sharper than the full two-sided claim for buyers. The human-side rubric is useful, but "Playwright covers script-driven coverage, Applitools covers pixel diff" does not prove buyers believe they still have an unsolved human UX-testing hole. It proves there is room for a different method. The agent-readable web wedge is more ownable. The human side should be framed as supporting evidence: the same failures that block agents often expose accessibility, semantics, and workflow clarity problems for humans. Do not lead with "we replace UX research." Lead with "your app is becoming an API for agents, and it is probably illegible."

> **Is the value generated per walk enough to justify the cost?**

Not yet proven. The plan says walks "produced 4 findings each," but not whether those findings were worth fixing. Four findings at $3 is cheap if two are real PR blockers. It is expensive if three are wording quibbles and one is already known. At 50 PRs/week, $450/week is not outrageous for a serious SaaS team, but only if the output is low-noise and lands where engineers already work. Without CI/PR integration, it feels like a manual audit toy. With automatic PR comments and consensus/rareness labels, it can feel like a review bot. The ROI depends less on raw cost than on triage burden.

> **Why isn't this a feature inside Vercel, Playwright, or GitHub instead of a standalone product?**

It probably can be copied as a feature. The plan's "Nobody owns the framing" is not defensibility. Framing is an opening, not a moat. The defensibility has to be depth: persona library, finding lifecycle, project-specific flows, agent-specific heuristics, longitudinal evidence, and model/runtime comparison. If Rove is just "run an agent on preview deploy and file issues," GitHub or Vercel can ship that. If Rove becomes the system of record for agent-readiness regressions across flows, personas, and time, it has a shot. Right now, CI integration is more important to defensibility than consensus. Distribution beats elegance.

> **The two-sided framing depends on agents mattering enough to operators. What's the actual leading indicator that justifies building for this NOW rather than 12 months in?**

The leading indicator is not generic "agent traffic." It is high-value workflows being delegated: purchasing, scheduling, admin setup, support tasks, B2B operations. If customers cannot name an agent-mediated workflow they expect users or internal staff to perform, the agent side is speculative. If agent traffic stays tiny, Rove should not pivot to generic human UX testing. That market is mushier and more crowded. The backup positioning is accessibility/semantic-readiness plus AI-readiness, not broad UX QA.

> **Is the negative-space thesis strong enough to be the headline framing?**

As written, no. "Rove finds what builders couldn't see" is elegant but abstract. Buyers do not buy epistemology. They buy fewer embarrassing misses before merge. A stronger buyer-facing version is: "Catch missing user paths before they ship." Then the thesis can support it: builder agents and busy teams overbuild the happy path and miss absent affordances. Keep "negative space" as the internal doctrine or thought-leadership frame, not the first marketing line.

## 4c. Immediate sequence

> **After consensus lands, what's the right next item? My read is consensus first, then CI integration as the obvious next-after-that. Codex — disagree?**

I disagree with "consensus first" if the goal is product learning. CI integration should come first or be sliced first. The plan says CI is "Probably the biggest distribution moment in the next 4 weeks" and then deprioritizes it because it is bigger. That is backwards if Rove's biggest risk is whether teams will actually tolerate and act on the output. Consensus improves trust after people are already looking. CI/PR integration creates the habit loop. Without that, consensus is a better dashboard for a workflow users may not adopt. The compromise: ship the smallest CI path before full consensus UI. Even a GitHub Action that runs one walk and posts a markdown summary gives you distribution learning. Then consensus can solve observed noise in the place users actually encounter it.

## The biggest miss in this plan

The weakest assumption is that agreement across N walks equals confidence. The plan says consensus moves Rove from "Sonnet's opinion on this walk" to "the intersection of N walks' opinions." But if all N walks use the same model, same prompt, same browser substrate, same flow, and same target, they are not independent in the way the plan implies. They are correlated samples from the same failure modes. Consensus will reduce randomness, parser hiccups, and one-off phrasing variance. It will not prove truth. Three Sonnet runs can agree on a false positive, and three Sonnet runs can miss the same real gap. The plan needs to call this "repeatability," not "truth," and it should eventually compare across personas/runtimes, not just repeated identical walkers.

## Where Codex disagrees on Rove's premise

The wedge is real, but narrower than the document wants. "Agent-readable web" is a strong category bet. "Two-sided readiness" is strategically appealing, but skeptical buyers may hear it as "another fuzzy UX audit tool plus AI words." The agent half is the distinctive part. The human half is credible when tied to accessibility, semantics, and workflow completeness, not when positioned against all existing UX/testing practice.

Timing is the hard part. The plan says "AI agents ... will increasingly transact on user behalf." That is plausible, but not yet a budget line for most teams. Today's buyer is more likely to care about PR quality, accessibility risk, support burden, and embarrassing broken flows than abstract agent traffic. Rove should sell the immediate pain while keeping the agent-readiness wedge as the reason this category gets bigger.

The framing holds up if it becomes concrete: "Can a human, screen reader, or AI agent complete this workflow on your preview deploy?" That is legible. "Non-deterministic UI/UX testing for the agent era" is accurate but sounds like a pitch to people already convinced. The skeptical buyer needs examples, not theory: hidden hover menus, unlabeled controls, missing delete paths, stale page titles, dead-end setup flows, unannounced async failures.

So: the premise is promising, but the plan currently overestimates how much buyers will reward conceptual elegance. Rove needs distribution, proof of fix-worthy findings, and ruthless prioritization around agent/accessibility/workflow illegibility. Consensus helps, but it is not the next existential proof point.

---

## Alex's reading of this review

Codex is right on the headline sequencing call. The plan's logic was "trust then distribution." Codex's correction is "distribution forces feedback that exposes what consensus needs to solve in the first place." Without CI in the loop, consensus is a better dashboard for a workflow nobody has adopted.

Five specific things the consensus plan needs to incorporate before it ships, in priority order:

1. **Switch the default to N=2 with adaptive escalation to N=3 on disagreement.** Don't promise N=3 by default; the cost line will make users ration.
2. **Replace `content_hash`-as-consensus-key with family-specific deterministic keys.** For `change.*` and `nielsen-*` / `wcag-*` / `iso-*` use `flow_id + heuristic + normalized_route + step_index`. For `agent.affordance_gap.*` use `url_pattern + gap_kind + expected_affordance`. Title becomes display, not identity.
3. **Two lanes, not a filter.** Rename the "min consensus" filter idea to two explicit lanes: "Consensus (≥2/N)" and "Rare finds (1/N)." Demote, don't hide.
4. **Call it "repeatability" in copy, not "truth."** The same model + same prompt + same target makes the N walks correlated samples, not independent observations. The honest framing is "the agent kept agreeing with itself," which is still much better than "one walk said this once."
5. **Cross-runtime consensus is the eventual real version.** A Sonnet + Codex + browser-use trio agreeing is materially different than three Sonnets agreeing. Put it on the roadmap explicitly, even if not in v1.

On the premise itself, the most actionable correction is the framing pivot:

- Drop "non-deterministic UI/UX testing for the agent era" as a headline.
- Replace with: **"Can a human, screen reader, or AI agent complete this workflow on your preview deploy?"** — concrete, buyer-legible, lists the three personas Rove already covers, anchors the value at PR time.
- Keep "negative space" as internal doctrine. Don't bury it; just don't lead with it to a skeptical buyer.

And the sequencing: **CI integration before consensus.** The smallest version is a GitHub Action wired to PR comments that runs `rove change-review` against the preview deploy and posts a markdown summary inline. That gets us the habit loop. Consensus then earns its place by solving the noise the CI integration surfaces.

The plan doc at `docs/plans/multi-walk-consensus.md` will be updated to reflect items 1-5 above and re-sequenced behind a forthcoming `docs/plans/ci-integration.md`.
