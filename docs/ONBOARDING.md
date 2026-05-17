# Onboarding — joining Rove development

You're new to the Rove codebase. This is the orientation doc — read it once, bookmark it, ship.

Audience: a developer joining the team. If you're a teammate **adding Rove to a consumer project** (not joining Rove development itself), read [`TEAM-SETUP.md`](../TEAM-SETUP.md) instead.

---

## What Rove is

Rove is an agentic UX evaluation platform for the agent-readable web. It walks any web app as **human personas** (Nielsen / WCAG / ISO rubric) and **agent personas** (`agent.*` heuristics — semantic HTML, stable selectors, a11y tree completeness, …). It files **findings**, not pass/fail assertions.

The wedge: **two-sided readiness** — is your app usable by real humans AND the AI agents that will increasingly use it on their behalf?

- Public repo at `https://github.com/agiterra/rove` (undiscoverable — no topics, no marketing).
- Dashboard at `https://rove-agiterra.vercel.app` (auto-deploys on push to main).
- Hosted Supabase project `tceosllezmydpouvfuzf` backs all data via `project_id` namespacing.

Status: early alpha (currently around `0.0.0-alpha.40.x`). The loop end-to-end works; the surface is still being built out.

---

## Access checklist

**Brian needs to grant you the following before you can do anything:**

| Resource | What | How |
|---|---|---|
| GitHub repo | Read+write on `agiterra/rove` | Brian invites you to the org or adds you as a collaborator |
| Vercel | Member of the agiterra team | Brian invites via Vercel team settings |
| Supabase | Read access to project `tceosllezmydpouvfuzf` | Brian adds you in Supabase project settings |
| `team_members` row | Required for dashboard auth | Brian runs: `insert into public.team_members (github_handle, display_name) values ('andy-handle', 'Andy');` |

**Tell Brian your GitHub handle** — that's the single piece of info he needs for the last row.

---

## First-day setup

```bash
# 1. Clone
git clone git@github.com:agiterra/rove.git
cd rove

# 2. Install Node + pnpm if you don't have them
#    Node ≥ 22 (we use Node 24 in production); pnpm via corepack:
corepack enable
corepack prepare pnpm@latest --activate

# 3. Install workspace deps
pnpm install

# 4. Verify build + typecheck pass
pnpm -r typecheck
pnpm -r build
```

If `pnpm install` fails on `@agiterra/rove-*` packages, you don't have GitHub Packages auth set up. See the "Once per machine" section in [`TEAM-SETUP.md`](../TEAM-SETUP.md) for the `gh auth refresh -s read:packages` + `~/.npmrc` dance. (You only need this if you'll also use the published CLI as a consumer; for Rove development itself you import workspace-local, not the published packages.)

### Tools you'll need

```bash
brew install vercel-cli supabase/tap/supabase gh
gh auth login
vercel login
supabase login
```

Then link the repo to its Vercel project (one-time):

```bash
cd apps/dashboard
vercel link        # pick agiterra/rove
cd ../..
```

### Pull dashboard env

```bash
cd apps/dashboard
vercel env pull .env.local
cd ../..
```

That gives you the Supabase URL, service-role key, GitHub App credentials, etc. — everything the dashboard reads at runtime.

---

## Running things locally

```bash
pnpm dashboard               # Next.js dev server on :3030
pnpm cli -- list             # Invoke the CLI (e.g. list flows for the linked project)
pnpm daemon                  # Local daemon (claims agent_jobs for the configured project)
pnpm -r build                # Build everything (cli depends on core, etc.)
pnpm -r typecheck            # tsc --noEmit across the workspace
```

Dashboard sign-in: GitHub OAuth, gated by `is_team_member()`. If Brian hasn't added you to `team_members` yet, you'll get "Not a team member" after OAuth — that's the signal.

### Dogfooding (Rove walking Rove)

Once you're in, this is the highest-bandwidth way to see how the loop works. See [`.claude/rules/dogfooding.md`](../.claude/rules/dogfooding.md) — the canonical recipe is there. TL;DR:

```bash
# Mint a walker session using the service-role key
vercel env pull /tmp/.env.rove-dash
set -a && source /tmp/.env.rove-dash && set +a
NEXT_PUBLIC_SUPABASE_URL=https://tceosllezmydpouvfuzf.supabase.co \
ROVE_AGENT_SESSION_USER_ID=07696891-915e-4f26-b4d2-be55cc9fc32b \
  node scripts/dogfood/mint-walker-session.mjs

# Walk a dogfood flow
node packages/cli/bin/rove.js run \
  --flow dogfood-public-surfaces \
  --persona claude_browser_agent \
  --target-url https://rove-agiterra.vercel.app \
  --max-budget-usd 3 --timeout-seconds 600 \
  --sinks markdown,supabase
```

---

## Repo orientation — read in this order

1. **`CLAUDE.md`** (root) — the canonical agent guide. It's auto-generated from `.agent-rules/source.md` + `.claude/rules/*.md`. **Don't edit it directly** — edit the sources and run `pnpm sync:agent-guides`. Even if you don't use Claude, read this file — it's the most current architectural overview.
2. **`docs/ROADMAP.md`** — Phase A → E arc, where we are.
3. **`docs/BACKLOG.md`** — master plan, what's open + what shipped. Newest at top.
4. **`docs/theses/negative-space.md`** — the philosophical framing for *why* Rove exists. Why builder agents can't perceive what they didn't build. Required reading.
5. **`.claude/rules/`** — repo-wide rules, organized by concern:
   - `architecture.md` — package layout, dependency direction, tenancy
   - `dashboard.md` — Next 16 conventions, server vs client, project filtering, RLS
   - `personas-and-flows.md` — how the two primitives work
   - `coding-standards.md` — file size limits, naming, exports
   - `pre-ship-check.md` — negative-space checklist to run before merging UI
   - `dogfooding.md` — walking Rove against itself
   - `release-process.md` — how to cut + publish an alpha

6. **`apps/dashboard/`** — Next.js 16 / Tailwind 4 dashboard (the part you'll see most).
7. **`packages/cli/`** — CLI + daemon. Owns walk dispatch, sinks (markdown/supabase/github-issues), proxy.
8. **`packages/core/`** — types, Zod schemas, walk prompt, persona library. Tiny on purpose.
9. **`infra/supabase/`** — migrations (timestamp-prefixed, idempotent). Apply with `supabase db push` from this directory.

---

## How Brian works (and expects you to)

Brian is a manager, not a hands-on coder. He sets direction; you implement.

**Workflow** — this is a single-developer-cadence repo:

- **Commit to main.** No PR-per-change. Branches only when sharing or for genuinely risky work.
- **Push to origin.** Every commit goes to the remote — Vercel auto-deploys on push to main.
- **Tag releases** for the CLI: `git tag v0.0.0-alpha.N`, push the tag, the publish workflow handles GitHub Packages.

**Standing rule from Brian's [global CLAUDE.md](../README.md#how-to-work-with-brian):**

> There is no wrong decision. If we break something, we fix it. "Measure twice, cut once" is for lumber — lumber can't be stretched. Code can be refactored. So: act. Don't deliberate, don't enumerate options, don't hand the choice back to me. Trust your instincts.

Translation: when you have a sensible answer, ship it. Don't ask permission for code choices, naming, library picks, refactor scope, file structure. The only things that warrant checking in: destroying others' work, external communications (Slack / email), spending money, direction changes.

**Commit message style:** `feat(area):` / `fix(area):` / `chore:` / `docs:` / `refactor:` / `test:`. Bodies should explain the why and call out follow-ups; look at the last 20 commits for the rhythm.

---

## Quality bar

Before merging anything that touches UI, run [`.claude/rules/pre-ship-check.md`](../.claude/rules/pre-ship-check.md). It's a negative-space checklist — CRUD asymmetry, async + recovery, navigation discoverability, destructive-action confirms, accessibility, agent-readability. Skipping it costs more than running it.

**File size limits** (from `coding-standards.md`):

| Type | Soft target | Default cap | Hard ceiling |
| --- | --- | --- | --- |
| Source files | 150 | 300 | 450 |
| React components | 100 | 250 | 350 |
| Test files | 200 | 400 | 600 |

Cohesive files can exceed the cap with a documented exception at the top of the file.

**Typecheck before every commit.** `pnpm -r typecheck` across the workspace catches most issues. The IDE TS server is unreliable for the cli package — trust pnpm, not the IDE.

---

## Common gotchas

- **`searchParams` + `params` are Promises in Next 16.** Always `await` them in pages. Treating them as plain objects silently returns undefined for every field.
- **`EVAL_*` vs `ROVE_*` env vars.** Canonical is `ROVE_*`. `EVAL_*` aliases exist as one-version fallbacks during the tankloop migration. New code reads `ROVE_*`; the dashboard's `lib/env.ts` has `requireEither` / `readEither` helpers.
- **Sensitive Vercel env vars come back empty in `vercel env pull`.** If you need to read a sensitive value, use the Vercel dashboard UI's "reveal" button. The runtime has the values; pull just doesn't decrypt them for local export.
- **Every data page filters by `project_id`.** The lint isn't strict enough to catch a missing `.eq("project_id", projectId)` — reviewer's responsibility. Pattern: `import { resolveProjectId } from "@/lib/project-context"; const projectId = await resolveProjectId(searchParams);`.
- **CLAUDE.md and AGENTS.md are generated.** Edit `.agent-rules/source.md` and `.claude/rules/*.md`, run `pnpm sync:agent-guides`.
- **Don't expose the service role key to client components.** Pages are server components by default in Next 16; push `"use client"` to the leaf that needs interactivity, never higher.

---

## Where to ask

- **Brian** — direction, scope decisions, "should we build this." Async-friendly; he'd rather you ship and tell him than wait for an answer.
- **`CLAUDE.md` + `.claude/rules/`** — for "how does this codebase do X." Almost certainly answered there.
- **`docs/BACKLOG.md`** — for "what's in flight." Read top to bottom; newest at top.

---

## Your first commit

Pick something from `docs/BACKLOG.md` that looks like a quick win. Land it. Don't ask first — just ship and link the commit. Brian will redirect if he wants something else.

Welcome.
