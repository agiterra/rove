# Personas and Flows

The two primitives Rove walks with. **Get these shapes right; everything else flows from them.**

## Persona

Defined in `packages/core/src/types.ts` (`Persona`, `PersonaCategory`, `PersonaConstraints`). Built-ins live in `packages/core/src/personas/built-in.ts`.

```ts
{
  id: "claude_browser_agent",
  label: "Claude computer-use agent",
  description: "Drives via accessibility tree + screenshots. No hover.",
  category: "agent",        // ← see categories below
  expertise: "intermediate",
  icon: "🤖",
  constraints: {
    shortcuts_allowed: false,
    hovers_allowed: false,
    retries_per_step: 2,
    agent_runtime: "claude_computer_use",  // agent personas only
  },
  promptAddendum: "You are Claude operating via computer-use. You read the accessibility tree to find affordances; you do NOT scan visually. …",
  isBuiltIn: true,
}
```

### Categories

- `end-user` — public-facing user of the app
- `internal-user` — staff using an admin / dashboard tool
- `admin` — owner / configurator
- `mobile` — touch-only, no keyboard, no hover
- `accessibility` — assistive tech (screen reader, keyboard-only, low vision)
- **`agent`** — the Phase D category. Walks emit `agent.*` heuristics, not Nielsen / WCAG.

### Authoring a new persona

1. Add an entry to `BUILT_IN_PERSONAS` if it's project-agnostic and useful to everyone.
2. For project-specific personas, drop a `*.personas.yaml` in the consumer project's `flowsDir`. `rove sync` picks them up and `rove personas` lists them alongside the built-ins.
3. The YAML key is `prompt_addendum` (snake_case), NOT `promptAddendum`. The schema is `.strict()` — unknown fields error loudly with the file path + the bad key. See `examples/flows/dogfood.personas.yaml` for the canonical shape.
4. `prompt_addendum` is the most important field — it's what the agent reads as its character brief. Write it in the second person ("You are…") and be specific about constraints.
5. For agent personas, pick `agent_runtime` accurately (`claude_computer_use` / `chatgpt_operator` / `browser_use` / `playwright_codegen`). The prompt builder branches on this.
6. Never duplicate an existing persona for cosmetic reasons. If you need a variant, change the `constraints` and `prompt_addendum`, not the schema.

#### Minimal persona YAML shape

```yaml
# rove/flows/<anything>.personas.yaml
personas:
  my_persona_id:                       # snake_case, matches PERSONA_ID_PATTERN
    label: "Short display name"
    description: "One-sentence persona summary."
    category: end-user                 # end-user | internal-user | admin | mobile | accessibility | agent | custom
    expertise: novice                  # novice | intermediate | expert
    icon: "🌱"                         # optional, max 8 chars
    constraints:
      shortcuts_allowed: false
      hovers_allowed: false
      retries_per_step: 1
      native_dialog_policy: perceive_and_act
      # agent_runtime: claude_computer_use   # required only when category=agent
    prompt_addendum: |
      You are <character brief, second person, specific constraints>.
```

## Flow

A flow is the goal a real user/agent is trying to accomplish. YAML at the consumer's `flowsDir`. Minimum viable shape:

```yaml
flow_id: feature.action.dispatcher
goal: "Create a PUMPING job for an existing property at a specific date/time"
entry_route: "/admin/scheduling"

budget:
  max_steps: 30
  max_seconds: 120

steps: []   # optional — leave empty for free-roam walks

success_predicate:
  - "Submit button enables once required fields are valid"
  - "Toast confirms creation within 2s of submit"
  - "New record appears in the relevant list view"
```

### Sync semantics

- `rove sync` reads every `*.flow.yaml` and `*.personas.yaml` under `flowsDir`, hashes the contents, and upserts into the Rove store with `project_id` from `rove.config.ts`.
- Sync is idempotent. Re-running won't duplicate rows. `yaml_sha256` + `synced_from_yaml_at` are stamped so the dashboard can flag drift.
- Adding a flow YAML and merging the PR is not enough — the consuming project needs to run `rove sync` (or the daemon will pick it up on the next walk).

## Rubrics

The walk prompt switches rubric based on `persona.category`. See `packages/core/src/prompt.ts`.

- **Human personas** → Nielsen heuristics + WCAG 2.2 AA + ISO 9241-110.
- **Agent personas** → `agent.*` heuristics, ten of them:
  - `agent.semantic_html`
  - `agent.stable_selectors`
  - `agent.accessibility_tree_completeness`
  - `agent.feedback_announced`
  - `agent.no_hover_only`
  - `agent.no_visual_only_state`
  - `agent.predictable_urls`
  - `agent.titles_and_meta`
  - `agent.captcha_friendly`
  - `agent.rate_limit_signaling`

Adding a new agent heuristic = add it to the prompt rubric AND add UI in the dashboard's findings view to recognize it (it'll be filtered by the `lens=agent` chip automatically because the heuristic prefix is `agent.`).
