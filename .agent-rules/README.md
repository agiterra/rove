# Agent rules

`CLAUDE.md` and `AGENTS.md` at the repo root are **generated**. The single source of truth is `.agent-rules/source.md` plus the modular files under `.claude/rules/`. The generator is `scripts/sync-agent-guides.mjs`.

## Editing the agent guidelines

1. Decide whether the change belongs in the top-level orientation (`source.md`) or in a topic-specific rule file (`.claude/rules/<topic>.md`).
2. Edit the source.
3. Run `pnpm sync:agent-guides` (or `node scripts/sync-agent-guides.mjs` directly).
4. Commit the regenerated `CLAUDE.md` + `AGENTS.md` alongside the source change.

## Adding a new rule file

Drop a new `.claude/rules/<topic>.md`. Add a row in the "Where things live" table inside `.agent-rules/source.md` pointing at it. Regenerate.

## Keep it focused

Each rule file should answer ONE question. If a file starts answering three, split it. The point of the modular layout is letting Claude / Codex / etc. pull only what's relevant to the current task.
