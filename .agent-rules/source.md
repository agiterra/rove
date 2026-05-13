# Rove — Agent Guidelines

**Rove** is an agentic UX evaluation platform for the agent-readable web. It walks any web app as both **human personas** (Nielsen / WCAG / ISO rubric) and **agent personas** (`agent.*` heuristics — semantic HTML, stable selectors, a11y tree completeness, captcha friendliness, …). It files **findings**, not pass/fail assertions.

The category wedge: **two-sided readiness** — is your app usable by real humans AND the AI agents that will increasingly use it on their behalf? No one else owns this framing.

## Status: early alpha, private to Agiterra

- Repo is **public on GitHub** but undiscoverable (no topics, no marketing).
- npm packages published to **GitHub Packages** under `@agiterra/rove-*` (private/restricted).
- Tankloop is Rove customer #1 (consumes via `@agiterra/rove-cli`).
- One Supabase project (`tceosllezmydpouvfuzf`) backs all Rove projects via `project_id` namespacing.
- One Vercel project deploys the dashboard at `rove-agiterra.vercel.app`, auto-deploys on push to main.

## Critical Rules

### YAGNI

Do not add unrequested features, abstractions, or utilities. Make the requested change. Nothing more. Alpha-stage; don't pre-build for hypothetical Phase D-2 + features.

### The wedge is two-sided readiness. Don't drift.

Rove exists because there's a gap in the testing market for **non-deterministic, persona-driven UX evaluation that covers humans AND agents**. Don't:

- Build deterministic test scripting (Playwright already does that).
- Build pixel-diff visual regression (Applitools).
- Replace a human-walk feature with an agent-walk feature; keep both.
- Add features that only work for human OR agent personas. The whole point is parity.

### Where things live

| Concern | Authoritative source |
| --- | --- |
| Package layout (`@agiterra/rove-*`) | `.claude/rules/architecture.md` |
| Persona model + how to author one | `.claude/rules/personas-and-flows.md` |
| Flow YAML shape + sync semantics | `.claude/rules/personas-and-flows.md` |
| Dashboard conventions (Next 16, server vs client, project filtering) | `.claude/rules/dashboard.md` |
| File-size limits + naming + exports | `.claude/rules/coding-standards.md` |
| Release process (version bump, tag, GH Packages publish) | `.claude/rules/release-process.md` |
| Onboarding a new consuming project | `TEAM-SETUP.md` (top of repo) |
| Roadmap + what's done | `docs/ROADMAP.md` |
| Feature backlog ("what's on our list") | `docs/BACKLOG.md` |
| Adding or extending an agent rule | `.agent-rules/README.md` |

## Hosting + infra

- **Dashboard**: Next.js 16, Tailwind 4, hosted on Vercel as project `rove` linked to `agiterra/rove`. Auto-deploys on push to main. Project's vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ROVE_SUPABASE_SERVICE_ROLE_KEY` (+ legacy `EVAL_*` fallbacks during the migration window), `ROVE_GITHUB_APP_*`.
- **Database**: hosted Supabase project `tceosllezmydpouvfuzf`. Migrations live at `infra/supabase/supabase/migrations/`. Apply with `supabase db push` from `infra/supabase/`.
- **CLI + daemon**: published to GitHub Packages on tag `v*` push via `.github/workflows/publish.yml`. Consumers install via `pnpm add -D @agiterra/rove-cli` with a `.npmrc` mapping `@agiterra` to `npm.pkg.github.com`.
- **GitHub App**: shared App used by every consumer's PR-authoring wizard + future Phase 12 webhook. Install on a consumer's repo to enable.

## Commands

```bash
pnpm install                 # install workspace deps
pnpm -r build                # build all packages + dashboard
pnpm -r typecheck            # tsc --noEmit across everything
pnpm dashboard               # next dev for the dashboard on :3030
pnpm cli -- <subcommand>     # invoke the CLI (e.g. pnpm cli -- list)
pnpm daemon                  # alias for `rove daemon` against the local rove.config.ts
pnpm sync:agent-guides       # regenerate CLAUDE.md + AGENTS.md from source
```

## Conventions

- **Components**: `PascalCase.tsx` (Next App Router pages stay lowercase per Next).
- **Hooks**: `use-kebab-case.ts`.
- **Utils**: `kebab-case.ts`.
- **Commits**: `feat:` / `fix:` / `refactor:` / `docs:` / `test:` / `chore:`.
- **File size**: 200 soft / 300 default cap. See `.claude/rules/coding-standards.md`.
- **Branding**: Rove identity is the cyan-to-navy gradient (`--color-brand-cyan` / `--color-brand-navy` in `apps/dashboard/app/globals.css`). All custom UI uses this palette.
- **Generated docs**: `CLAUDE.md` and `AGENTS.md` are generated from `.agent-rules/source.md` + `.claude/rules/`. Don't edit them directly.

## GitHub workflow

- Open an issue at planning time for non-trivial work. Label with one `area:*` (`dashboard` / `cli` / `core` / `infra` / `docs`) and one `type:*` (`feature` / `bug` / `chore` / `refactor` / `docs`).
- Draft PRs early. Squash-merge.
- Tagging `v0.0.0-alpha.N` triggers the publish workflow. Bump version in every `package.json` (workspace root, `packages/core`, `packages/cli`, `apps/dashboard`) before tagging.

## External docs

- `README.md` — what Rove is, brand assets, repo layout.
- `TEAM-SETUP.md` — how a teammate adds Rove to a new project (PAT, `.npmrc`, `rove init`).
- `docs/INSTALL.md` — abbreviated install reference.
- `docs/ROADMAP.md` — status + what's next + phase plan.
- `docs/BACKLOG.md` — feature backlog. Read this when asked "what do we have for features." Add bullets here for ideas not yet started; promote to a GitHub issue when work begins.
