# Dogfooding — Rove walking Rove

The most credible proof Rove works is Rove finding real problems in its
own dashboard. This rule documents the canonical setup so any teammate
(or agent) can repeat it.

## Why the bypass exists

Walking the authed surfaces (e.g. `/runs/<id>`, `/findings`, `/flows`)
requires a Supabase session for the walker user. There are two ways to
mint one:

1. **Canonical path** — `rove dashboard-auth-setup` calls the dashboard's
   `/api/agent-session` endpoint, which is bearer-secret-gated by
   `ROVE_AGENT_SESSION_SECRET`. Designed for the install flow on a fresh
   machine that doesn't hold the Supabase service-role key.

2. **Local-developer path** — `scripts/dogfood/mint-walker-session.mjs`
   uses the service-role key (already in your `.env.rove` /
   `.env.local`) to call `supabase.auth.admin.generateLink` +
   `verifyOtp` directly. Same end state — a real Supabase session
   persisted as `sb-<project-ref>-auth-token` cookies in
   `~/.rove/user-data-<role>` — but no Vercel secret required.

The endpoint and the bypass are equivalent in effect; the endpoint is
just the production trust-boundary. For local dogfooding from a machine
that already has the service-role key, the secret is redundant ceremony.

## End-to-end recipe

```bash
# 1. Pull the dashboard env (gets the service-role + walker user id)
cd apps/dashboard
vercel env pull /tmp/.env.rove-dash

# 2. Mint the walker session
cd ../..
set -a && source /tmp/.env.rove-dash && set +a
NEXT_PUBLIC_SUPABASE_URL=https://tceosllezmydpouvfuzf.supabase.co \
ROVE_AGENT_SESSION_USER_ID=07696891-915e-4f26-b4d2-be55cc9fc32b \
  node scripts/dogfood/mint-walker-session.mjs

# Expected: "✓ Profile saved at ~/.rove/user-data-dispatcher"
# /runs returns 200 (not a /signin bounce). The cookie is good for ~1h.

# 3. Walk a flow authed
node packages/cli/bin/rove.js run \
  --flow dashboard.find_and_delete_run \
  --persona claude_browser_agent \
  --target-url https://rove-agiterra.vercel.app \
  --auth-agent \
  --max-budget-usd 3 --timeout-seconds 600 \
  --sinks markdown,supabase
```

The `--auth-agent` flag is required for agent personas. Without it, agent
personas walk anonymously by default (per `commands/run.ts`) — even when
a profile exists at `~/.rove/user-data-dispatcher`.

## Where each thing lives

| Concern | Path |
| --- | --- |
| Bypass script | `scripts/dogfood/mint-walker-session.mjs` |
| Dogfood project config | `rove.config.ts` at repo root (`projectId: "rove-dogfood"`) |
| Dogfood flows | `examples/flows/*.flow.yaml` |
| Walker user id | `ROVE_AGENT_SESSION_USER_ID` env var (`07696891-915e-4f26-b4d2-be55cc9fc32b`) |
| Walker user record | `auth.users` row for `rove-walker@agiterra.io` |
| Profile output | `~/.rove/user-data-<role>` (Playwright persistent context dir) |
| `/api/agent-session` handler | `apps/dashboard/app/api/agent-session/route.ts` |
| `/api/agent-session/consume` handler | `apps/dashboard/app/api/agent-session/consume/route.ts` |

## Important: the profile is shared with tankloop

`~/.rove/user-data-dispatcher` is the same directory tankloop's
`rove auth-setup` writes to. Running the bypass overwrites tankloop's
saved session and vice versa. Two ways to manage that:

1. Back the directory up before swapping: `cp -r ~/.rove/user-data-dispatcher ~/.rove/user-data-dispatcher.<project>-bak`
2. Use a different role: set `PROFILE_ROLE=admin` (or any name) to write
   to `~/.rove/user-data-admin` instead. Pair with a persona whose
   category maps to that role — see `roleForPersonaCategory()` in
   `packages/cli/src/auth-state.ts`.

When in doubt, back up before switching.

## Picking a dogfood flow

The repo ships four dashboard-targeted flows in `examples/flows/`:

- **`dogfood-public-surfaces`** — public landing + the three `/preview/*`
  pages. No auth needed. Good first walk, fast feedback on the
  agent-readability rubric. Run as `claude_browser_agent` with
  `--no-auth`.
- **`dashboard-find-and-delete-run`** — authed walk against `/runs`.
  Predicted finding: `agent.affordance_gap.delete` on `/runs/[id]`
  because Rove doesn't ship "Delete this run." Confirms the per-page
  enumeration directive + the negative-space rollup are wired through.
- **`dashboard-setup-new-project`** — walks the project-onboarding wedge
  from `/` through the project switcher.
- **`eval_dashboard.install_walker`** — walks `/setup` to exercise the
  walker-install flow itself.

Per `docs/plans/affordance-gaps.md` §"Dogfood spec," the `delete-run`
flow is the canonical negative-space test. Re-run it after any change to
the proxy enumeration injection, the prompt's `affordance_gaps` section,
or the sink's `stampAffordanceGapsByStep` path.

## What to look at after a walk

```bash
# Latest dogfood run + its findings
RUN_ID=$(curl -s -H "apikey: $ROVE_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $ROVE_SUPABASE_SERVICE_ROLE_KEY" \
  "$ROVE_SUPABASE_URL/rest/v1/runs?project_id=eq.rove-dogfood&order=started_at.desc&limit=1&select=id" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")

# Findings the walker filed
curl -s -H "apikey: $ROVE_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $ROVE_SUPABASE_SERVICE_ROLE_KEY" \
  "$ROVE_SUPABASE_URL/rest/v1/findings?run_id=eq.$RUN_ID&select=severity,heuristic,title"

# In the dashboard:
#   https://rove-agiterra.vercel.app/runs/<run-id>?p=rove-dogfood
#   https://rove-agiterra.vercel.app/projects/rove-dogfood/gaps
```

The negative-space rollup at `/projects/rove-dogfood/gaps` is the most
direct view: every affordance gap the walker enumerated on Rove's own
surfaces, grouped by kind, sorted by severity. If a dogfood walk doesn't
produce any rows there, something in the per-page enumeration chain is
broken — start with `packages/cli/bin/playwright-mcp-proxy.mjs` and the
`enumerationInjectByMessageId` path.

## Why we keep doing this

Per `docs/theses/negative-space.md`: builder agents (including the ones
that ship the Rove dashboard) cannot perceive what they didn't build.
The only way to keep Rove's own dashboard from accreting the same
half-built UI the rest of the agent-shipped world is to walk it on a
cadence and let the walker tokenize the absences.

Dogfood after every meaningful UI surface change. The cost is one walk
(~5 minutes, ~$1 of Claude). The cost of skipping is the same
agent-readability gaps the thesis predicts shipping unnoticed.
